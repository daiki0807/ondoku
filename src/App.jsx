import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, PenTool, Save, RotateCcw, Settings, X, Edit2, LogOut, LogIn } from 'lucide-react';
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc } from "firebase/firestore";

// Firebase Config (Replace with your actual config)
// See src/firebase.js for instruction but importing directly here to keep it simple for now if the user prefers copy-pasting the config directly into App.jsx or updating src/firebase.js
import { db, auth, googleProvider } from './firebase';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // 初期カラム設定
  const initialColumns = [
    { id: 'eval1', title: '点・丸', subtitle: '気をつける', type: 'select' },
    { id: 'eval2', title: '気持ち', subtitle: 'こめる', type: 'select' },
    { id: 'eval3', title: '九九', subtitle: 'カード', type: 'select' },
  ];

  // ステート管理
  const [columns, setColumns] = useState(initialColumns);
  const [entries, setEntries] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 合言葉の確認（セッションストレージから復元）
  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('ondoku_auth');
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  // 認証状態の監視
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.email === 'd.a0807derude@gmail.com') {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // データ同期 (Firestore)
  useEffect(() => {
    if (!user) {
      setEntries([]);
      setColumns(initialColumns);
      return;
    }

    // カラム設定の同期
    const columnsRef = doc(db, `users/${user.uid}/settings/columns`);
    const unsubscribeColumns = onSnapshot(columnsRef, (doc) => {
      if (doc.exists()) {
        setColumns(doc.data().data);
      } else {
        // 初期データをセット
        setDoc(columnsRef, { data: initialColumns });
      }
    });

    // エントリーの同期
    const entriesRef = collection(db, `users/${user.uid}/entries`);
    const unsubscribeEntries = onSnapshot(entriesRef, (snapshot) => {
      const entriesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // 日付順（新しい順）にソート
      entriesData.sort((a, b) => new Date(b.id) - new Date(a.id));
      setEntries(entriesData);
    });

    return () => {
      unsubscribeColumns();
      unsubscribeEntries();
    };
  }, [user]);

  // 合言葉の処理
  const handlePasscodeSubmit = (e) => {
    e.preventDefault();
    if (passcode === '天王寺小学校') {
      setIsAuthenticated(true);
      sessionStorage.setItem('ondoku_auth', 'true');
    } else {
      alert('合言葉が違います');
      setPasscode('');
    }
  };


  // ログイン関数
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed", error);
      alert("ログインに失敗しました。");
    }
  };

  // ログアウト関数
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  // 新しい行を追加
  const addEntry = async () => {
    if (!user) return;
    const newId = Date.now().toString(); // IDを文字列にする（Firestore用）
    const newEntry = {
      date: new Date().toISOString().split('T')[0],
      page: '',
      parentSign: false,
      teacherSign: false,
    };

    // 各カラムの初期値を設定
    columns.forEach(col => {
      if (col.type === 'number') {
        newEntry[col.id] = col.options?.min || 1;
      } else if (col.type === 'text') {
        newEntry[col.id] = '';
      } else {
        newEntry[col.id] = '〇';
      }
    });

    try {
      await setDoc(doc(db, `users/${user.uid}/entries`, newId), newEntry);
    } catch (e) {
      console.error("Error adding document: ", e);
      alert("データの保存に失敗しました");
    }
  };

  // 行の削除
  const deleteEntry = async (id) => {
    if (!user) return;
    if (confirm('この行を削除してもよろしいですか？')) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/entries`, id));
      } catch (e) {
        console.error("Error deleting document: ", e);
        alert("データの削除に失敗しました");
      }
    }
  };

  // データの更新
  const updateEntry = async (id, field, value) => {
    if (!user) return;
    try {
      const entryRef = doc(db, `users/${user.uid}/entries`, id);
      await updateDoc(entryRef, { [field]: value });
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  // サインの切り替え
  const toggleSign = async (id, field, currentValue) => {
    if (!user) return;
    try {
      const entryRef = doc(db, `users/${user.uid}/entries`, id);
      await updateDoc(entryRef, { [field]: !currentValue });
    } catch (e) {
      console.error("Error updating sign: ", e);
    }
  };

  // リセット機能（全削除）
  const resetData = async () => {
    if (!user) return;
    if (confirm('全てのデータをリセットしますか？この操作は取り消せません。')) {
      const batch = []; // Firestore batch delete logic would go here, doing one by one for simplicity
      // 注意: 大量のデータがある場合はバッチ処理が必要ですが、ここでは簡易的にループで削除
      entries.forEach(async (entry) => {
        await deleteDoc(doc(db, `users/${user.uid}/entries`, entry.id));
      });
    }
  };

  // カラム追加
  const addColumn = async () => {
    if (!user) return;
    const newId = `eval_${Date.now()}`;
    const newColumn = {
      id: newId,
      title: '新規項目',
      subtitle: '',
      type: 'select'
    };
    const updatedColumns = [...columns, newColumn];

    try {
      await setDoc(doc(db, `users/${user.uid}/settings/columns`), { data: updatedColumns });
    } catch (e) {
      console.error("Error adding column: ", e);
      alert("設定の保存に失敗しました");
    }
  };

  // カラム削除
  const deleteColumn = async (id) => {
    if (!user) return;
    if (columns.length <= 1) {
      alert('少なくとも1つの項目が必要です。');
      return;
    }
    if (confirm('この項目を削除しますか？過去のデータからもこの項目の記録が見えなくなります。')) {
      const updatedColumns = columns.filter(col => col.id !== id);
      try {
        await setDoc(doc(db, `users/${user.uid}/settings/columns`), { data: updatedColumns });
      } catch (e) {
        console.error("Error deleting column: ", e);
        alert("設定の保存に失敗しました");
      }
    }
  };

  // カラム更新
  const updateColumnLocal = (id, field, value) => {
    // UI反映用にローカルステートを即座に更新（オプティミスティックUI）
    // 実際の保存はSettingsModalの「完了」時、または個別の保存ボタンで行うのが理想だが、
    // ここでは簡易的に即時保存する形にする

    const updatedColumns = columns.map(col => {
      if (col.id === id) {
        if (field.startsWith('options.')) {
          const optionKey = field.split('.')[1];
          return {
            ...col,
            options: {
              ...col.options,
              [optionKey]: value
            }
          };
        }
        return { ...col, [field]: value };
      }
      return col;
    });

    setColumns(updatedColumns); // ローカル更新

    // Firestore更新
    if (user) {
      setDoc(doc(db, `users/${user.uid}/settings/columns`), { data: updatedColumns })
        .catch(e => console.error("Error saving columns: ", e));
    }
  };


  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">読み込み中...</div>;
  }

  // 合言葉の入力画面
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full">
              <PenTool className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-6">クラスの合言葉を入力してね</h1>

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg"
              placeholder="合言葉"
              autoFocus
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-sm"
            >
              すすむ
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div className="bg-blue-100 p-4 rounded-full">
              <PenTool className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">デジタル音読・計算カード</h1>
          <p className="text-slate-500 mb-8">Googleアカウントでログインして、<br />日々の学習記録をクラウドに保存しましょう。</p>

          <button
            onClick={handleLogin}
            className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-sm"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Googleでログイン
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden relative">

        {/* ヘッダー */}
        <header className={`${isAdmin ? 'bg-indigo-700' : 'bg-blue-600'} text-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors`}>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PenTool className="w-6 h-6" />
              {isAdmin ? 'デジタル音読・計算カード（管理者）' : 'デジタル音読・計算カード'}
            </h1>
            <p className={`${isAdmin ? 'text-indigo-200' : 'text-blue-100'} text-sm mt-1`}>
              {isAdmin ? '管理者モードでログイン中' : '日々の努力を記録しよう'}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={addEntry}
              className={`bg-white ${isAdmin ? 'text-indigo-700' : 'text-blue-600'} hover:bg-opacity-90 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-sm`}
            >
              <Plus className="w-4 h-4" />
              記録を追加
            </button>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className={`${isAdmin ? 'bg-indigo-800 hover:bg-indigo-900' : 'bg-blue-700 hover:bg-blue-800'} text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors`}
              title="設定（項目の編集）"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={resetData}
              className={`${isAdmin ? 'bg-indigo-800 hover:bg-indigo-900' : 'bg-blue-700 hover:bg-blue-800'} text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors`}
              title="データをリセット"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <div className={`h-6 w-px ${isAdmin ? 'bg-indigo-400' : 'bg-blue-400'} mx-1`}></div>
            <button
              onClick={handleLogout}
              className={`${isAdmin ? 'bg-indigo-900 hover:bg-black' : 'bg-blue-800 hover:bg-blue-900'} text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors`}
              title="ログアウト"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ユーザー情報バー（簡易表示） */}
        <div className="bg-blue-50 px-6 py-2 border-b border-blue-100 flex justify-between items-center text-xs text-blue-800">
          <span>ログイン中: {user.displayName}</span>
          <span className="text-blue-400">データは自動的にクラウドに保存されます</span>
        </div>

        {/* スクロールヒント（モバイルのみ） */}
        <div className="md:hidden bg-yellow-50 text-yellow-700 px-4 py-2 text-xs text-center border-b border-yellow-100">
          ← 横にスクロールして入力してください →
        </div>

        {/* テーブルエリア */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                <th className="py-4 px-4 text-left w-32 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">日付</th>
                <th className="py-4 px-2 w-48">読んだページ</th>

                {columns.map((col) => (
                  <th key={col.id} className="py-4 px-2 w-28">
                    {col.title}<br />
                    <span className="text-xs font-normal text-slate-400">{col.subtitle}</span>
                  </th>
                ))}

                <th className="py-4 px-2 w-24">保護者</th>
                <th className="py-4 px-2 w-24">先生</th>
                <th className="py-4 px-2 w-16">削除</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 5} className="py-12 text-center text-slate-400">
                    データがありません。「記録を追加」ボタンを押してください。
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors group">
                    {/* 日付（固定列） */}
                    <td className="p-3 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <input
                        type="date"
                        value={entry.date}
                        onChange={(e) => updateEntry(entry.id, 'date', e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      />
                    </td>

                    {/* ページ（範囲選択） */}
                    <td className="p-3">
                      <PageInput
                        value={entry.page}
                        onChange={(val) => updateEntry(entry.id, 'page', val)}
                      />
                    </td>

                    {/* 動的評価カラム */}
                    {columns.map((col) => (
                      <td key={col.id} className="p-3">
                        <DynamicInput
                          type={col.type}
                          options={col.options}
                          value={entry[col.id]}
                          onChange={(val) => updateEntry(entry.id, col.id, val)}
                        />
                      </td>
                    ))}

                    {/* 保護者サイン */}
                    <td className="p-3 text-center">
                      <SignButton
                        signed={entry.parentSign}
                        onClick={() => toggleSign(entry.id, 'parentSign', entry.parentSign)}
                        color="text-red-500 border-red-500"
                        bgSigned="bg-red-50"
                        label="済"
                      />
                    </td>

                    {/* 先生サイン */}
                    <td className="p-3 text-center">
                      <SignButton
                        signed={entry.teacherSign}
                        onClick={() => toggleSign(entry.id, 'teacherSign', entry.teacherSign)}
                        color="text-indigo-600 border-indigo-600"
                        bgSigned="bg-indigo-50"
                        label="確認"
                      />
                    </td>

                    {/* 削除ボタン */}
                    <td className="p-3 text-center">
                      <button
                        onClick={() => deleteEntry(entry.id)}
                        className="text-slate-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 text-center text-xs text-slate-500">
          このデータはクラウドに自動保存されます。
        </div>

        {/* 設定モーダル */}
        {isSettingsOpen && (
          <SettingsModal
            columns={columns}
            onClose={() => setIsSettingsOpen(false)}
            onUpdate={updateColumnLocal}
            onAdd={addColumn}
            onDelete={deleteColumn}
          />
        )}
      </div>
    </div>
  );
}

// ページ範囲選択コンポーネント
const PageInput = ({ value, onChange }) => {
  // P.12-15 or P.12 or 12-15 or 12 etc... から start, end をパース
  const parsePage = (val) => {
    if (!val) return { start: '', end: '' };
    // "P." を削除
    const cleanVal = val.replace(/^P\./i, '').trim();
    if (cleanVal.includes('-')) {
      const [s, e] = cleanVal.split('-');
      return { start: parseInt(s) || '', end: parseInt(e) || '' };
    }
    return { start: parseInt(cleanVal) || '', end: parseInt(cleanVal) || '' };
  };

  const { start, end } = parsePage(value);
  const pages = Array.from({ length: 200 }, (_, i) => i + 1);

  const handleStartChange = (newStart) => {
    const s = parseInt(newStart);
    let e = end ? parseInt(end) : s;
    if (e < s) e = s; // 終了ページが開始ページより小さい場合は合わせる

    updateValue(s, e);
  };

  const handleEndChange = (newEnd) => {
    const e = parseInt(newEnd);
    let s = start ? parseInt(start) : e;
    if (s > e) s = e; // 開始ページが終了ページより大きい場合は合わせる

    updateValue(s, e);
  };

  const updateValue = (s, e) => {
    if (!s && !e) {
      onChange('');
      return;
    }
    if (s === e) {
      onChange(`P.${s}`);
    } else {
      onChange(`P.${s}-${e}`);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={start}
        onChange={(e) => handleStartChange(e.target.value)}
        className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm appearance-none bg-white"
      >
        <option value="">-</option>
        {pages.map(p => (
          <option key={`start-${p}`} value={p}>{p}</option>
        ))}
      </select>
      <span className="text-slate-400">~</span>
      <select
        value={end}
        onChange={(e) => handleEndChange(e.target.value)}
        className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm appearance-none bg-white"
      >
        <option value="">-</option>
        {pages.map(p => (
          <option key={`end-${p}`} value={p}>{p}</option>
        ))}
      </select>
    </div>
  );
};

// 動的入力コンポーネント
const DynamicInput = ({ type, options, value, onChange }) => {
  // 初期値がundefinedの場合のフォールバック
  const safeValue = value ?? '';

  if (type === 'number') {
    const min = Number(options?.min) || 1;
    const max = Number(options?.max) || 5;
    const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);

    return (
      <select
        value={safeValue}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-center text-lg appearance-none cursor-pointer bg-white text-slate-700"
      >
        {range.map(num => (
          <option key={num} value={num}>{num}</option>
        ))}
      </select>
    );
  }

  if (type === 'text') {
    return (
      <input
        type="text"
        value={safeValue}
        maxLength={20}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
        placeholder="20文字以内"
      />
    );
  }

  // デフォルト: 選択式（◎〇△）
  return (
    <EvaluationSelect
      value={safeValue || '〇'}
      onChange={onChange}
    />
  );
};

// 設定モーダルコンポーネント
const SettingsModal = ({ columns, onClose, onUpdate, onAdd, onDelete }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-500" />
            評価項目の設定
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-slate-500 mb-4">
            評価項目の名前、入力タイプなどを編集できます。
          </p>

          <div className="space-y-4">
            {columns.map((col) => (
              <div key={col.id} className="bg-slate-50 p-3 rounded-lg border border-slate-200 group">
                <div className="flex gap-2 mb-2 items-start">
                  <div className="flex-1 space-y-2">
                    {/* 名前とサブタイトル */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 block mb-1">項目名</label>
                        <input
                          type="text"
                          value={col.title}
                          onChange={(e) => onUpdate(col.id, 'title', e.target.value)}
                          className="w-full p-2 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 block mb-1">サブタイトル</label>
                        <input
                          type="text"
                          value={col.subtitle}
                          onChange={(e) => onUpdate(col.id, 'subtitle', e.target.value)}
                          className="w-full p-2 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* 入力タイプ設定 */}
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">入力タイプ</label>
                      <div className="flex gap-2 text-sm">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`type-${col.id}`}
                            checked={col.type === 'select' || !col.type}
                            onChange={() => onUpdate(col.id, 'type', 'select')}
                          />
                          <span>記号 (◎〇△)</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`type-${col.id}`}
                            checked={col.type === 'number'}
                            onChange={() => onUpdate(col.id, 'type', 'number')}
                          />
                          <span>数字</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`type-${col.id}`}
                            checked={col.type === 'text'}
                            onChange={() => onUpdate(col.id, 'type', 'text')}
                          />
                          <span>テキスト</span>
                        </label>
                      </div>
                    </div>

                    {/* 数字タイプの場合のオプション */}
                    {col.type === 'number' && (
                      <div className="flex gap-2 items-center bg-white p-2 border border-slate-200 rounded mt-2">
                        <span className="text-xs text-slate-500">範囲:</span>
                        <input
                          type="number"
                          value={col.options?.min || 1}
                          onChange={(e) => onUpdate(col.id, 'options.min', parseInt(e.target.value))}
                          className="w-16 p-1 text-sm border rounded text-center"
                        />
                        <span className="text-slate-400">〜</span>
                        <input
                          type="number"
                          value={col.options?.max || 5}
                          onChange={(e) => onUpdate(col.id, 'options.max', parseInt(e.target.value))}
                          className="w-16 p-1 text-sm border rounded text-center"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => onDelete(col.id)}
                    className="text-xs text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded transition-colors"
                    title="この項目を削除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={onAdd}
            className="w-full mt-4 py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-bold"
          >
            <Plus className="w-4 h-4" />
            新しい項目を追加
          </button>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-sm"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
};

// 評価選択用コンポーネント（既存）
const EvaluationSelect = ({ value, onChange }) => {
  const getStyle = (val) => {
    switch (val) {
      case '◎': return 'text-blue-600 font-bold bg-blue-50 border-blue-200';
      case '〇': return 'text-green-600 font-medium bg-green-50 border-green-200';
      case '△': return 'text-orange-500 bg-orange-50 border-orange-200';
      default: return 'text-slate-400 border-slate-200';
    }
  };

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full p-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-center text-lg appearance-none cursor-pointer ${getStyle(value)}`}
    >
      <option value="◎">◎</option>
      <option value="〇">〇</option>
      <option value="△">△</option>
    </select>
  );
};

// サインボタンコンポーネント
const SignButton = ({ signed, onClick, color, bgSigned, label }) => {
  if (signed) {
    return (
      <button
        onClick={onClick}
        className={`w-12 h-12 rounded-full border-2 ${color} ${bgSigned} flex items-center justify-center mx-auto transition-all transform hover:scale-105 active:scale-95 shadow-sm`}
        title="クリックして取り消し"
      >
        <span className="font-bold text-sm">{label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="w-12 h-8 rounded-md bg-slate-200 text-slate-500 text-xs hover:bg-slate-300 transition-colors"
    >
      承認
    </button>
  );
};
