import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore('ondoku-db');

// 間違った番号での試行回数の上限。10分ごとに数え直す。
//   - 端末（匿名ユーザー）ごと: 打ち間違いが続いても止まるのはその端末だけ
//   - 接続元IPごと: 端末を作り直しての総当たりを防ぐ。学校では全員が同じIPなので、
//     クラスの打ち間違いの合計で全員が止まらないよう、端末ごとより大きくしている
// 8桁のログイン番号なら、児童100人でも1つのIPから当てるのに平均100日以上かかる。
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10分
const MAX_FAILURES_PER_DEVICE = 10;
const MAX_FAILURES_PER_IP = 60;

const hashKey = (s) => createHash('sha256').update(s || 'unknown').digest('hex').slice(0, 32);

// 接続元IP。X-Forwarded-For の左側は送る側が自由に書けるので使わず、
// Google のサーバーが最後に付け足した右端の値を使う。
const clientIpOf = (req) => {
  const xff = String(req?.headers?.['x-forwarded-for'] || '');
  const last = xff.split(',').map((s) => s.trim()).filter(Boolean).pop();
  return last || req?.socket?.remoteAddress || 'unknown';
};

// 6桁の児童IDでのログインを受け付けるか。config/login の allowLegacyId で切り替える。
// 設定がまだないときは受け付ける（ログイン番号を配り終えるまで、今の端末が入れなくならないように）。
const legacyIdAllowed = async () => {
  const snap = await db.collection('config').doc('login').get();
  return !snap.exists || snap.data().allowLegacyId !== false;
};

// 入力された番号から児童IDを探す。見つからなければ null。
//   8桁: ログイン番号（loginCodes/{番号} → studentId）
//   6桁: 児童ID。切り替えスイッチで受け付けているあいだだけ
const findStudentId = async (code) => {
  if (/^\d{8}$/.test(code)) {
    const snap = await db.collection('loginCodes').doc(code).get();
    return snap.exists ? snap.data().studentId : null;
  }
  if (/^\d{6}$/.test(code) && await legacyIdAllowed()) {
    return code;
  }
  return null;
};

// 児童ログイン:
// 匿名ログイン済みの端末から番号を受け取り、児童が実在すればその匿名ユーザーに
// studentId のカスタムクレームを付ける。Firestoreルールはこのクレームで
// 「自分の記録だけ読み書きできる」を判定する。
export const ondokuStudentLogin = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.firebase?.sign_in_provider !== 'anonymous') {
    throw new HttpsError('unauthenticated', '児童ログインは匿名ログインの端末から行ってください。');
  }

  const now = Date.now();
  const counters = [
    { ref: db.collection('loginFailures').doc('dev_' + hashKey(auth.uid)), max: MAX_FAILURES_PER_DEVICE },
    { ref: db.collection('loginFailures').doc(hashKey(clientIpOf(request.rawRequest))), max: MAX_FAILURES_PER_IP },
  ];

  const snaps = await Promise.all(counters.map((c) => c.ref.get()));
  const locked = snaps.some((snap, i) => {
    const f = snap.exists ? snap.data() : null;
    return f && now - f.windowStart < FAILURE_WINDOW_MS && f.count >= counters[i].max;
  });
  if (locked) {
    throw new HttpsError('resource-exhausted', 'しばらく待ってからもう一度ためしてください。');
  }

  const recordFailure = () => Promise.all(counters.map((c) => db.runTransaction(async (tx) => {
    const snap = await tx.get(c.ref);
    const cur = snap.exists ? snap.data() : null;
    if (cur && now - cur.windowStart < FAILURE_WINDOW_MS) {
      tx.update(c.ref, { count: cur.count + 1 });
    } else {
      tx.set(c.ref, { windowStart: now, count: 1 });
    }
  })));

  // 古い画面は { studentId } で送ってくるので、どちらでも受け取る
  const code = String(request.data?.code ?? request.data?.studentId ?? '').replace(/[^\d]/g, '');
  const studentId = await findStudentId(code);
  const studentSnap = studentId ? await db.collection('students').doc(studentId).get() : null;
  if (!studentSnap?.exists) {
    await recordFailure();
    throw new HttpsError('not-found', '該当する番号が見つかりません。');
  }

  await getAuth().setCustomUserClaims(auth.uid, { studentId });

  const { name = '', classId = '', className = '' } = studentSnap.data();
  return { studentId, student: { name, classId, className } };
});
