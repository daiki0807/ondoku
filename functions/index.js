import { createHash } from 'node:crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore('ondoku-db');

// 間違ったIDでの試行回数の上限（接続元IPごと）。
// 学校では児童全員が同じIPからつながるので、打ち間違いで止まらないようゆるめにしている。
// それでも 6桁IDの総当たり（90万通り）は現実的に不可能になる。
const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10分
const MAX_FAILURES = 30;

const ipKeyOf = (ip) => createHash('sha256').update(ip || 'unknown').digest('hex').slice(0, 32);

// 児童ログイン:
// 匿名ログイン済みの端末から6桁IDを受け取り、実在すればその匿名ユーザーに
// studentId のカスタムクレームを付ける。Firestoreルールはこのクレームで
// 「自分の記録だけ読み書きできる」を判定する。
export const ondokuStudentLogin = onCall({ region: 'asia-northeast1' }, async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.firebase?.sign_in_provider !== 'anonymous') {
    throw new HttpsError('unauthenticated', '児童ログインは匿名ログインの端末から行ってください。');
  }

  const failureRef = db.collection('loginFailures').doc(ipKeyOf(request.rawRequest?.ip));
  const now = Date.now();

  const failureSnap = await failureRef.get();
  const failure = failureSnap.exists ? failureSnap.data() : null;
  const inWindow = failure && now - failure.windowStart < FAILURE_WINDOW_MS;
  if (inWindow && failure.count >= MAX_FAILURES) {
    throw new HttpsError('resource-exhausted', 'しばらく待ってからもう一度ためしてください。');
  }

  const recordFailure = () => db.runTransaction(async (tx) => {
    const snap = await tx.get(failureRef);
    const cur = snap.exists ? snap.data() : null;
    if (cur && now - cur.windowStart < FAILURE_WINDOW_MS) {
      tx.update(failureRef, { count: cur.count + 1 });
    } else {
      tx.set(failureRef, { windowStart: now, count: 1 });
    }
  });

  const studentId = String(request.data?.studentId ?? '');
  if (!/^\d{6}$/.test(studentId)) {
    await recordFailure();
    throw new HttpsError('not-found', '該当するIDが見つかりません。');
  }

  const studentSnap = await db.collection('students').doc(studentId).get();
  if (!studentSnap.exists) {
    await recordFailure();
    throw new HttpsError('not-found', '該当するIDが見つかりません。');
  }

  await getAuth().setCustomUserClaims(auth.uid, { studentId });

  const { name = '', classId = '', className = '' } = studentSnap.data();
  return { student: { name, classId, className } };
});
