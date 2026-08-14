import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, CheckCircle, PenTool, Save, RotateCcw, Settings, X, Edit2, LogOut, Users, UserPlus, ChevronLeft, Eye } from 'lucide-react';
import { signInAnonymously, signOut, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { collection, doc, onSnapshot, setDoc, deleteDoc, updateDoc, getDoc, getDocs, serverTimestamp } from "firebase/firestore";

// Firebase Config
import { db, auth, googleProvider } from './firebase';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Login states
  const [loginMode, setLoginMode] = useState('student'); // 'student' or 'teacher'
  const [studentIdInput, setStudentIdInput] = useState('');
  
  // App states
  const [student, setStudent] = useState(null); // { id: '123456', name: '山田' }
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  
  // Dashboard states
  const [studentsList, setStudentsList] = useState([]);
  const [newStudentName, setNewStudentName] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [adminsList, setAdminsList] = useState([]);

  // Class states
  const [classesList, setClassesList] = useState([]);
  const [newClassName, setNewClassName] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');

  // Edit Student states
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editStudentName, setEditStudentName] = useState('');
  const [editStudentClassId, setEditStudentClassId] = useState('');

  // Filter state
  const [filterClassId, setFilterClassId] = useState('all');

  // Bulk select state
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());

  // Class Detail View states
  const [viewingClass, setViewingClass] = useState(null); // { id, name }
  const [viewDate, setViewDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewDateEnd, setViewDateEnd] = useState(new Date().toISOString().split('T')[0]);
  const [classEntries, setClassEntries] = useState({}); // { studentId: { studentName, entries: [...] } }

  // Preview states
  const [previewStudent, setPreviewStudent] = useState(null); // { id, name }
  const [previewEntries, setPreviewEntries] = useState([]);

  // Data states
  const initialColumns = [
    { id: 'eval1', title: '点・丸', subtitle: '気をつける', type: 'select' },
    { id: 'eval2', title: '気持ち', subtitle: 'こめる', type: 'select' },
    { id: 'eval3', title: '九九', subtitle: 'カード', type: 'select' },
  ];
  const [columns, setColumns] = useState(initialColumns);
  const [entries, setEntries] = useState([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- Initial Auth & Local Storage Check ---
  useEffect(() => {
    const checkLocalStudent = async (currentUser) => {
      const savedId = localStorage.getItem('studentId');
      if (savedId) {
        try {
          const docRef = doc(db, 'students', savedId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            setStudent({ id: savedId, ...snap.data() });
            // entries の読み書きには Firebase Auth が必要なので匿名サインイン
            if (!currentUser) {
              try {
                await signInAnonymously(auth);
              } catch (e) {
                console.error("Anonymous sign-in failed:", e);
              }
            }
          } else {
            localStorage.removeItem('studentId');
          }
        } catch (e) {
          console.error("Error fetching local student:", e);
        }
      }
      setLoading(false);
    };

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser && currentUser.email) {
        // Logged in with Google -> Admin Check
        setAdminUser(currentUser);
        if (currentUser.email === 'd.a0807derude@gmail.com') {
          setIsAdmin(true);
          setIsMaster(true);
        } else {
          const adminDoc = await getDoc(doc(db, 'admins', currentUser.email));
          if (adminDoc.exists()) {
            setIsAdmin(true);
            setIsMaster(false);
          } else {
            alert("管理者権限がありません。");
            await signOut(auth);
            setIsAdmin(false);
            setIsMaster(false);
            setAdminUser(null);
          }
        }
      } else {
        setAdminUser(null);
        setIsAdmin(false);
        setIsMaster(false);
      }

      if (!currentUser || !currentUser.email) {
        checkLocalStudent(currentUser);
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- Fetch Admin Dashboard Data ---
  useEffect(() => {
    if (!isAdmin) return;

    // Fetch students list
    const fetchStudents = async () => {
      const unsubscribeStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
        const studentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        studentsData.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          if (aTime !== bTime) return aTime - bTime;
          return (a.importOrder ?? 0) - (b.importOrder ?? 0);
        });
        setStudentsList(studentsData);
      });
      return unsubscribeStudents;
    };

    // Fetch admins list (Master only)
    const fetchAdmins = async () => {
      if (!isMaster) return () => {};
      const unsubscribeAdmins = onSnapshot(collection(db, 'admins'), (snapshot) => {
        const adminsData = snapshot.docs.map(doc => ({ id: doc.id, email: doc.id, ...doc.data() }));
        setAdminsList(adminsData);
      });
      return unsubscribeAdmins;
    };

    // Fetch classes list
    const fetchClasses = async () => {
      const unsubscribeClasses = onSnapshot(collection(db, 'classes'), (snapshot) => {
        const classesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        classesData.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
        setClassesList(classesData);
        // Pre-select the first class if none is selected (functional form to avoid stale closure)
        if (classesData.length > 0) {
          setSelectedClassId(prev => prev || classesData[0].id);
        }
      });
      return unsubscribeClasses;
    };

    let unsubStudents = () => {};
    let unsubAdmins = () => {};
    let unsubClasses = () => {};

    fetchStudents().then(unsub => unsubStudents = unsub);
    fetchAdmins().then(unsub => unsubAdmins = unsub);
    fetchClasses().then(unsub => unsubClasses = unsub);

    return () => {
      unsubStudents();
      unsubAdmins();
      unsubClasses();
    };
  }, [isAdmin, isMaster]);

  // --- Fetch Class Detail Data ---
  useEffect(() => {
    if (!isAdmin || !viewingClass) return;

    const classStudents = studentsList.filter(s => s.classId === viewingClass.id);

    // 期間が逆転している場合は入れ替えて評価
    const startDate = viewDate <= viewDateEnd ? viewDate : viewDateEnd;
    const endDate = viewDate <= viewDateEnd ? viewDateEnd : viewDate;

    const unsubscribers = [];
    const initialEntriesMap = {};

    classStudents.forEach(s => {
      initialEntriesMap[s.id] = { studentName: s.name, entries: [] };

      const entriesRef = collection(db, `users/${s.id}/entries`);
      const unsub = onSnapshot(entriesRef, (snapshot) => {
        const allEntries = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const matched = allEntries
          .filter(e => e.date && e.date >= startDate && e.date <= endDate)
          .sort((a, b) => a.date.localeCompare(b.date));
        setClassEntries(prev => ({
          ...prev,
          [s.id]: { studentName: s.name, entries: matched }
        }));
      });
      unsubscribers.push(unsub);
    });

    setClassEntries(() => initialEntriesMap);

    return () => unsubscribers.forEach(u => u());
  }, [isAdmin, viewingClass, studentsList, viewDate, viewDateEnd]);

  // --- Teacher Sign Toggle (from class detail) ---
  const handleTeacherSignToggle = async (studentId, entryId, currentVal) => {
    try {
      const entryRef = doc(db, `users/${studentId}/entries`, entryId);
      await updateDoc(entryRef, { teacherSign: !currentVal });
    } catch (e) {
      console.error("Teacher sign toggle failed", e);
      alert("更新に失敗しました。");
    }
  };

  // --- Bulk Teacher Sign (confirm all submitted but unconfirmed within range) ---
  const handleBulkTeacherSign = async () => {
    if (!viewingClass) return;
    const classStudents = studentsList.filter(s => s.classId === viewingClass.id);
    // 期間内の未確認エントリーを全件収集
    const targets = [];
    classStudents.forEach(s => {
      const entries = classEntries[s.id]?.entries || [];
      entries.forEach(entry => {
        if (entry && !entry.teacherSign) {
          targets.push({ studentId: s.id, entry });
        }
      });
    });
    if (targets.length === 0) {
      alert('確認待ちの提出はありません。');
      return;
    }
    if (!confirm(`期間内の未確認 ${targets.length} 件を一括で「先生確認」にしますか？`)) return;
    try {
      await Promise.all(
        targets.map(t =>
          updateDoc(doc(db, `users/${t.studentId}/entries`, t.entry.id), { teacherSign: true })
        )
      );
    } catch (e) {
      console.error("Bulk teacher sign failed", e);
      alert('一括確認に失敗しました。');
    }
  };

  // --- 朝8時の自動「先生確認」---------------------------------------------
  // 先生がアプリを開いたとき、その日まだ自動確認していなければ、
  // 当日・前日（月曜の場合は金曜まで遡って土日を含む）の未確認提出を
  // 自動で「先生確認済み」にする。1日1回だけ実行（localStorageで制御）。
  const AUTO_CONFIRM_HOUR = 8; // この時刻（ローカル時間）を過ぎたら自動確認
  const autoConfirmRunningRef = useRef(false);

  // 自動確認の対象期間を計算（既存の date フィールドと同じ UTC 日付基準）
  const getAutoConfirmRange = (now = new Date()) => {
    const todayStr = now.toISOString().split('T')[0];
    const base = new Date(todayStr + 'T00:00:00Z');
    const day = base.getUTCDay(); // 0:日 1:月 ... 6:土
    const start = new Date(base);
    // 月曜は土日を挟むので金曜まで遡る（金・土・日・月）。それ以外は前日のみ。
    start.setUTCDate(base.getUTCDate() - (day === 1 ? 3 : 1));
    return { startStr: start.toISOString().split('T')[0], endStr: todayStr };
  };

  useEffect(() => {
    if (!isAdmin || studentsList.length === 0) return;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // まだ朝8時を過ぎていない場合は実行しない
    if (now.getHours() < AUTO_CONFIRM_HOUR) return;
    // その日すでに自動確認済みなら実行しない
    if (localStorage.getItem('lastAutoConfirmDate') === todayStr) return;
    // 二重実行ガード
    if (autoConfirmRunningRef.current) return;
    autoConfirmRunningRef.current = true;

    const runAutoConfirm = async () => {
      const { startStr, endStr } = getAutoConfirmRange(now);
      try {
        let confirmedCount = 0;
        for (const s of studentsList) {
          const snap = await getDocs(collection(db, `users/${s.id}/entries`));
          const targets = snap.docs.filter(d => {
            const e = d.data();
            return e.date && e.date >= startStr && e.date <= endStr && !e.teacherSign;
          });
          await Promise.all(
            targets.map(d =>
              updateDoc(doc(db, `users/${s.id}/entries`, d.id), { teacherSign: true })
            )
          );
          confirmedCount += targets.length;
        }
        // 実行済みフラグを保存（成功時のみ）
        localStorage.setItem('lastAutoConfirmDate', todayStr);
        if (confirmedCount > 0) {
          console.log(`[自動確認] ${startStr}〜${endStr} の未確認 ${confirmedCount} 件を先生確認済みにしました。`);
        }
      } catch (e) {
        console.error("自動確認に失敗しました", e);
        // 失敗時はフラグを立てないので、次回開いたときに再試行される
        autoConfirmRunningRef.current = false;
      }
    };

    runAutoConfirm();
  }, [isAdmin, studentsList]);

  // --- Fetch Preview Student Entries ---
  useEffect(() => {
    if (!previewStudent) return;
    setPreviewEntries([]); // 別の児童に切り替えた時に前のデータが残らないようリセット
    const entriesRef = collection(db, `users/${previewStudent.id}/entries`);
    const unsub = onSnapshot(entriesRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      data.sort((a, b) => Number(b.id) - Number(a.id));
      setPreviewEntries(data);
    });
    return () => unsub();
  }, [previewStudent]);

  // --- Fetch Global Columns ---
  useEffect(() => {
    const columnsRef = doc(db, 'config', 'columns');
    const unsubscribeColumns = onSnapshot(columnsRef, (docSnap) => {
      if (docSnap.exists()) {
        setColumns(docSnap.data().data);
      } else {
        setDoc(columnsRef, { data: initialColumns });
      }
    });
    return () => unsubscribeColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fetch Student Data ---
  useEffect(() => {
    if (isAdmin || !student) return;

    const entriesRef = collection(db, `users/${student.id}/entries`);
    const unsubscribeEntries = onSnapshot(entriesRef, (snapshot) => {
      const entriesData = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
      // 日付順（新しい順）にソート
      entriesData.sort((a, b) => Number(b.id) - Number(a.id));
      setEntries(entriesData);
    });

    return () => {
      unsubscribeEntries();
    };
  }, [student, isAdmin]);

  // --- Handlers ---

  const handleStudentLogin = async (e) => {
    e.preventDefault();
    if (!studentIdInput || studentIdInput.length !== 6) {
      alert("6桁のIDを入力してください。");
      return;
    }
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'students', studentIdInput));
      if (snap.exists()) {
        const data = snap.data();
        setStudent({ id: studentIdInput, ...data });
        localStorage.setItem('studentId', studentIdInput);
        if (!user) {
          await signInAnonymously(auth);
        }
      } else {
        alert("該当するIDが見つかりません。先生に確認してください。");
      }
    } catch (error) {
      console.error(error);
      alert("ログインに失敗しました。");
    }
    setLoading(false);
  };

  const handleTeacherLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Teacher Login Failed", error);
      alert("ログイン画面への移動に失敗しました。");
    }
  };

  // ログアウト関数
  const handleLogout = async () => {
    if (confirm('ログアウトしますか？')) {
      try {
        await signOut(auth);
        localStorage.removeItem('studentId');
        setStudent(null);
        setStudentIdInput('');
        setIsAdmin(false);
        setIsMaster(false);
        setAdminUser(null);
      } catch (error) {
        console.error("Logout failed", error);
      }
    }
  };

  // --- Admin Handlers ---
  const handleAddClass = async (e) => {
    e.preventDefault();
    if (!newClassName.trim()) return;

    setLoading(true);
    try {
      await setDoc(doc(collection(db, 'classes')), {
        name: newClassName.trim(),
        createdAt: serverTimestamp(),
        createdBy: adminUser.email
      });
      setNewClassName('');
      alert(`クラス「${newClassName.trim()}」を作成しました。`);
    } catch (error) {
      console.error(error);
      alert("クラスの作成に失敗しました。");
    }
    setLoading(false);
  };

  const handleDeleteClass = async (id, name) => {
    if (confirm(`本当にクラス「${name}」を削除しますか？\nすでにこのクラスに所属している児童からはクラス情報が消えない場合があります。`)) {
      try {
        await deleteDoc(doc(db, 'classes', id));
      } catch (error) {
        console.error(error);
        alert("クラスの削除に失敗しました。");
      }
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newStudentName.trim() || !selectedClassId) {
      alert("名前を入力し、所属クラスを選択してください。クラスがない場合は先にクラスを作成してください。");
      return;
    }

    setLoading(true);
    try {
      // Generate unique 6-digit ID
      let newIdStr;
      let isUnique = false;
      while (!isUnique) {
        newIdStr = Math.floor(100000 + Math.random() * 900000).toString();
        const checkSnap = await getDoc(doc(db, 'students', newIdStr));
        if (!checkSnap.exists()) {
          isUnique = true;
        }
      }

      const classData = classesList.find(c => c.id === selectedClassId);

      await setDoc(doc(db, 'students', newIdStr), {
        name: newStudentName.trim(),
        classId: selectedClassId,
        className: classData ? classData.name : '',
        createdAt: serverTimestamp(),
        createdBy: adminUser.email
      });
      setNewStudentName('');
      alert(`児童を登録しました。\nID: ${newIdStr}\n名前: ${newStudentName.trim()}\nクラス: ${classData?.name || ''}`);
    } catch (error) {
      console.error("Add student failed", error);
      alert("登録に失敗しました。");
    }
    setLoading(false);
  };

  const handleBulkDelete = async () => {
    if (selectedStudentIds.size === 0) return;
    const names = studentsList
      .filter(s => selectedStudentIds.has(s.id))
      .map(s => s.name)
      .join('、');
    if (!confirm(`以下の児童 ${selectedStudentIds.size}名 を削除しますか？\n${names}`)) return;
    try {
      await Promise.all([...selectedStudentIds].map(id => deleteDoc(doc(db, 'students', id))));
      setSelectedStudentIds(new Set());
    } catch (err) {
      console.error(err);
      alert('削除に失敗しました。');
    }
  };

  const handleCsvExport = () => {
    const filtered = filterClassId === 'all'
      ? studentsList
      : filterClassId === 'none'
        ? studentsList.filter(s => !s.classId)
        : studentsList.filter(s => s.classId === filterClassId);

    const bom = '\uFEFF';
    const header = 'ID,クラス名,名前\n';
    const rows = filtered.map(s => `${s.id},${s.className || ''},${s.name}`).join('\n');
    const blob = new Blob([bom + header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '児童一覧.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const text = await file.text();
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const firstCols = lines[0]?.split(',').map(c => c.replace(/^\uFEFF/, '').trim());

    // ヘッダー行の判定と列インデックスの決定
    let nameIdx = 0;
    let classIdx = 1;
    let dataLines = lines;

    const isHeader = firstCols?.[0]?.toLowerCase() === 'id'
      || firstCols?.[0] === '名前'
      || firstCols?.[0]?.toLowerCase() === 'name';

    if (isHeader) {
      dataLines = lines.slice(1);
      // 列名から動的にインデックスを取得
      const idxOf = (col) => firstCols.findIndex(c => c === col);
      const nameIdxFound = idxOf('名前');
      const classIdxFound = idxOf('クラス名');
      if (nameIdxFound !== -1) nameIdx = nameIdxFound;
      if (classIdxFound !== -1) classIdx = classIdxFound;
    }

    if (dataLines.length === 0) {
      alert('CSVにデータがありません。');
      return;
    }

    setLoading(true);
    let successCount = 0;
    const errors = [];

    for (const [lineIndex, line] of dataLines.entries()) {
      const parts = line.split(',');
      const name = parts[nameIdx]?.trim();
      const className = parts[classIdx]?.trim();

      if (!name || !className) {
        errors.push(`「${line}」: 名前またはクラス名が空です`);
        continue;
      }

      const classData = classesList.find(c => c.name === className);
      if (!classData) {
        errors.push(`「${name}」: クラス「${className}」が見つかりません`);
        continue;
      }

      try {
        let newIdStr;
        let isUnique = false;
        while (!isUnique) {
          newIdStr = Math.floor(100000 + Math.random() * 900000).toString();
          const checkSnap = await getDoc(doc(db, 'students', newIdStr));
          if (!checkSnap.exists()) isUnique = true;
        }
        await setDoc(doc(db, 'students', newIdStr), {
          name,
          classId: classData.id,
          className: classData.name,
          createdAt: serverTimestamp(),
          createdBy: adminUser.email,
          importOrder: lineIndex
        });
        successCount++;
      } catch (err) {
        console.error(err);
        errors.push(`「${name}」: 登録に失敗しました`);
      }
    }

    setLoading(false);
    let message = `登録完了: ${successCount}名`;
    if (errors.length > 0) {
      message += `\n\nスキップ (${errors.length}件):\n` + errors.join('\n');
    }
    alert(message);
  };

  const startEditStudent = (student) => {
    setEditingStudentId(student.id);
    setEditStudentName(student.name);
    setEditStudentClassId(student.classId || '');
  };

  const cancelEditStudent = () => {
    setEditingStudentId(null);
  };

  const handleUpdateStudent = async (id) => {
    if (!editStudentName.trim() || !editStudentClassId) {
      alert("名前を入力し、所属クラスを選択してください。");
      return;
    }
    try {
      const classData = classesList.find(c => c.id === editStudentClassId);
      await updateDoc(doc(db, 'students', id), {
        name: editStudentName.trim(),
        classId: editStudentClassId,
        className: classData ? classData.name : ''
      });
      setEditingStudentId(null);
    } catch (error) {
      console.error("Update student failed", error);
      alert("更新に失敗しました。");
    }
  };

  const handleDeleteStudent = async (id, name) => {
    if (confirm(`本当に ${name} さん (ID: ${id}) の登録を削除してよろしいですか？\n※学習記録のデータは削除されません。`)) {
      try {
        await deleteDoc(doc(db, 'students', id));
      } catch (error) {
        console.error("Delete student failed", error);
        alert("削除に失敗しました。");
      }
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminEmail.trim() || !newAdminEmail.includes('@')) {
      alert("有効なメールアドレスを入力してください。");
      return;
    }
    try {
      await setDoc(doc(db, 'admins', newAdminEmail.trim()), {
        addedAt: serverTimestamp(),
        addedBy: adminUser.email
      });
      setNewAdminEmail('');
      alert(`管理者として追加しました: ${newAdminEmail}`);
    } catch (error) {
      console.error("Add admin failed", error);
      alert("追加に失敗しました。");
    }
  };

  const handleDeleteAdmin = async (email) => {
    if (confirm(`${email} の管理者権限を削除しますか？`)) {
      try {
        await deleteDoc(doc(db, 'admins', email));
      } catch (error) {
        console.error("Delete admin failed", error);
        alert("削除に失敗しました。");
      }
    }
  };

  // --- Student Data Handlers ---
  const addEntry = async () => {
    if (!student) return;
    const today = new Date().toISOString().split('T')[0];

    // 同じ日付の記録がすでにある場合は拒否（1日1回まで）
    if (entries.some(e => e.date === today)) {
      alert('今日の記録はすでに追加されています。1日に1回までです。');
      return;
    }

    const newId = Date.now().toString();
    const newEntry = {
      date: today,
      page: '',
      parentSign: false,
      teacherSign: false,
    };

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
      await setDoc(doc(db, `users/${student.id}/entries`, newId), newEntry);
    } catch (e) {
      console.error("Error adding document: ", e);
      alert("データの保存に失敗しました");
    }
  };

  const deleteEntry = async (id) => {
    if (!student) return;
    if (confirm('この行を削除してもよろしいですか？')) {
      try {
        await deleteDoc(doc(db, `users/${student.id}/entries`, id));
      } catch (e) {
        console.error("Error deleting document: ", e);
      }
    }
  };

  const updateEntry = async (id, field, value) => {
    if (!student) return;

    // 日付変更時、別の記録と日付が重複しないかチェック
    if (field === 'date') {
      const duplicate = entries.some(e => e.id !== id && e.date === value);
      if (duplicate) {
        alert('その日付の記録はすでにあります。同じ日に複数の記録は登録できません。');
        return;
      }
    }

    try {
      const entryRef = doc(db, `users/${student.id}/entries`, id);
      await updateDoc(entryRef, { [field]: value });
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  const toggleSign = async (id, field, currentValue) => {
    if (!student) return;
    try {
      const entryRef = doc(db, `users/${student.id}/entries`, id);
      await updateDoc(entryRef, { [field]: !currentValue });
    } catch (e) {
      console.error("Error updating sign: ", e);
    }
  };

  const resetData = async () => {
    if (!student) return;
    if (confirm('全てのデータをリセットしますか？この操作は取り消せません。')) {
      try {
        await Promise.all(
          entries.map(entry => deleteDoc(doc(db, `users/${student.id}/entries`, entry.id)))
        );
      } catch (e) {
        console.error("Error resetting data:", e);
        alert("リセットに失敗しました。");
      }
    }
  };

  const saveColumns = async (updatedColumns) => {
    try {
      await setDoc(doc(db, 'config', 'columns'), { data: updatedColumns });
    } catch (err) {
      console.error("Error saving columns:", err);
      alert("項目の保存に失敗しました。権限を確認してください。");
      throw err;
    }
  };


  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">読み込み中...</div>;
  }

  // --- ログインしていない場合 ---
  if (!user && !student && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full relative">
          {/* Mode Switcher */}
          <div className="flex justify-center mb-8 gap-4 border-b border-slate-200 pb-4">
            <button
              onClick={() => setLoginMode('student')}
              className={`pb-2 px-2 border-b-2 transition-colors font-bold ${loginMode === 'student' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              児童ログイン
            </button>
            <button
              onClick={() => setLoginMode('teacher')}
              className={`pb-2 px-2 border-b-2 transition-colors font-bold ${loginMode === 'teacher' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
            >
              先生ログイン
            </button>
          </div>

          {loginMode === 'student' && (
            <div className="text-center animate-in fade-in zoom-in duration-300">
              <div className="flex justify-center mb-6">
                <div className="bg-blue-100 p-4 rounded-full">
                  <span className="text-3xl">👦</span>
                </div>
              </div>
              <h1 className="text-xl font-bold text-slate-800 mb-6">じぶんのIDをいれてね</h1>
              <form onSubmit={handleStudentLogin} className="space-y-4">
                <input
                  type="text"
                  maxLength={6}
                  value={studentIdInput}
                  onChange={(e) => setStudentIdInput(e.target.value)}
                  className="w-full p-4 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 text-center text-3xl tracking-[0.5em] font-mono"
                  placeholder="------"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors shadow-sm text-lg mt-2"
                >
                  すすむ
                </button>
              </form>
              <p className="mt-4 text-xs text-slate-400">
                ※IDは先生にきいてね。数字6桁です。
              </p>
            </div>
          )}

          {loginMode === 'teacher' && (
            <div className="text-center animate-in fade-in zoom-in duration-300">
              <div className="flex justify-center mb-6">
                <div className="bg-indigo-100 p-4 rounded-full">
                  <Users className="w-10 h-10 text-indigo-600" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-slate-800 mb-6">管理者ログイン</h1>
              <button
                onClick={handleTeacherLogin}
                className="w-full bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg transition-colors shadow-sm flex items-center justify-center gap-3"
              >
                Googleでログイン
              </button>
              <p className="mt-4 text-xs text-slate-400">
                ※許可されたアカウントでのみログイン可能です。
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- 管理者画面 ---
  if (isAdmin) {

    // --- クラス詳細ページ ---
    if (viewingClass) {
      const classStudents = studentsList.filter(s => s.classId === viewingClass.id);
      const isRangeMode = viewDate !== viewDateEnd;

      // 全エントリーをフラット化して集計
      const allRangeEntries = [];
      classStudents.forEach(s => {
        const entries = classEntries[s.id]?.entries || [];
        entries.forEach(e => allRangeEntries.push({ student: s, entry: e }));
      });

      const submittedCount = allRangeEntries.length;
      const submittedStudentCount = classStudents.filter(s => (classEntries[s.id]?.entries || []).length > 0).length;
      const confirmedCount = allRangeEntries.filter(r => r.entry.teacherSign).length;
      const parentSignedCount = allRangeEntries.filter(r => r.entry.parentSign).length;
      const unconfirmedSubmittedCount = allRangeEntries.filter(r => !r.entry.teacherSign).length;

      // 表示用の行リストを構築（期間内に提出のある児童は提出ごとに1行、未提出児童は1行のみ）
      const tableRows = [];
      classStudents.forEach(s => {
        const entries = classEntries[s.id]?.entries || [];
        if (entries.length === 0) {
          tableRows.push({ student: s, entry: null, key: s.id });
        } else {
          entries.forEach(e => {
            tableRows.push({ student: s, entry: e, key: `${s.id}_${e.id}` });
          });
        }
      });

      return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
          <header className="bg-indigo-700 text-white p-4 flex justify-between items-center shadow-md">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewingClass(null)}
                className="bg-indigo-800 hover:bg-indigo-900 p-2 rounded-lg transition-colors"
                title="ダッシュボードに戻る"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold">{viewingClass.name}</h1>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span>{adminUser?.email}</span>
              <button
                onClick={handleLogout}
                className="bg-indigo-800 hover:bg-indigo-900 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
              >
                <LogOut className="w-4 h-4" /> ログアウト
              </button>
            </div>
          </header>

          <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

            {/* 日付選択 & サマリー */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm font-medium text-slate-600">期間:</label>
                  <input
                    type="date"
                    value={viewDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setViewDate(v);
                      if (v > viewDateEnd) setViewDateEnd(v);
                    }}
                    className="p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                  <span className="text-slate-400">〜</span>
                  <input
                    type="date"
                    value={viewDateEnd}
                    min={viewDate}
                    onChange={(e) => setViewDateEnd(e.target.value)}
                    className="p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                  />
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setViewDate(today);
                      setViewDateEnd(today);
                    }}
                    className="text-xs bg-indigo-100 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-200 transition-colors font-medium"
                  >
                    今日
                  </button>
                  <button
                    onClick={() => {
                      // 過去の土日を含む直近7日間
                      const today = new Date();
                      const start = new Date(today);
                      start.setDate(today.getDate() - 6);
                      setViewDate(start.toISOString().split('T')[0]);
                      setViewDateEnd(today.toISOString().split('T')[0]);
                    }}
                    className="text-xs bg-slate-100 text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors font-medium"
                  >
                    過去7日間
                  </button>
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-700">
                      {isRangeMode ? submittedCount : submittedStudentCount}
                      <span className="text-sm font-normal text-slate-400">
                        {isRangeMode ? '件' : `/${classStudents.length}`}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{isRangeMode ? '提出件数' : '提出済み'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-500">{parentSignedCount}</div>
                    <div className="text-xs text-slate-500">保護者確認</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{confirmedCount}</div>
                    <div className="text-xs text-slate-500">先生確認済</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 児童一覧テーブル */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* 一括確認ボタン */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <span className="text-sm text-slate-500">
                  {unconfirmedSubmittedCount > 0
                    ? `確認待ち: ${unconfirmedSubmittedCount}件`
                    : submittedCount > 0 ? 'すべて確認済みです' : '提出なし'}
                </span>
                <button
                  onClick={handleBulkTeacherSign}
                  disabled={unconfirmedSubmittedCount === 0}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    unconfirmedSubmittedCount > 0
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm hover:shadow-md active:scale-95'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  一括で先生確認
                  {unconfirmedSubmittedCount > 0 && (
                    <span className="bg-white text-indigo-600 text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                      {unconfirmedSubmittedCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[760px]">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-semibold">児童名</th>
                      {isRangeMode && <th className="p-4 font-semibold">提出日</th>}
                      <th className="p-4 font-semibold">提出状況</th>
                      <th className="p-4 font-semibold">読んだページ</th>
                      <th className="p-4 font-semibold text-center">保護者</th>
                      <th className="p-4 font-semibold text-center">先生確認</th>
                      <th className="p-4 font-semibold text-center">カード</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classStudents.length === 0 ? (
                      <tr>
                        <td colSpan={isRangeMode ? 7 : 6} className="p-8 text-center text-slate-400">このクラスには児童が登録されていません。</td>
                      </tr>
                    ) : (
                      tableRows.map(({ student: s, entry, key }) => {
                        const hasEntry = !!entry;
                        return (
                          <tr key={key} className={`transition-colors ${hasEntry ? 'hover:bg-blue-50/30' : 'bg-slate-50/50 hover:bg-slate-100/50'}`}>
                            <td className="p-4">
                              <div className="font-medium text-slate-800">{s.name}</div>
                              <div className="text-xs text-slate-400 font-mono">{s.id.substring(0,3)}-{s.id.substring(3,6)}</div>
                            </td>
                            {isRangeMode && (
                              <td className="p-4 text-slate-600 whitespace-nowrap">
                                {hasEntry ? entry.date : <span className="text-slate-300">—</span>}
                              </td>
                            )}
                            <td className="p-4">
                              {hasEntry ? (
                                <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                  <CheckCircle className="w-3.5 h-3.5" /> 提出済み
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-400 text-xs font-bold px-2.5 py-1 rounded-full">
                                  未提出
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-slate-600">
                              {hasEntry ? (entry.page || '-') : '-'}
                            </td>
                            <td className="p-4 text-center">
                              {hasEntry && entry.parentSign ? (
                                <span className="inline-flex items-center gap-1 text-red-500 font-bold text-xs">
                                  <CheckCircle className="w-4 h-4" /> 済
                                </span>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {hasEntry ? (
                                <button
                                  onClick={() => handleTeacherSignToggle(s.id, entry.id, entry.teacherSign)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    entry.teacherSign
                                      ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
                                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                                  }`}
                                >
                                  {entry.teacherSign ? '✓ 確認済' : '確認する'}
                                </button>
                              ) : (
                                <span className="text-slate-300 text-xs">—</span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => setPreviewStudent({ id: s.id, name: s.name })}
                                className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors"
                                title="音読カードを見る"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </main>

          {previewStudent && (
            <StudentCardPreviewModal
              student={previewStudent}
              entries={previewEntries}
              columns={columns}
              onClose={() => setPreviewStudent(null)}
            />
          )}
        </div>
      );
    }

    // --- 管理者ダッシュボード（メイン） ---
    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
        <header className="bg-indigo-700 text-white p-4 flex justify-between items-center shadow-md">
          <div className="flex items-center gap-2">
            <Settings className="w-6 h-6" />
            <h1 className="text-xl font-bold">管理者ダッシュボード</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span>{adminUser?.email}</span>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="bg-indigo-800 hover:bg-indigo-900 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            >
              <Settings className="w-4 h-4" /> 項目設定
            </button>
            <button
              onClick={handleLogout}
              className="bg-indigo-800 hover:bg-indigo-900 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
            >
              <LogOut className="w-4 h-4" /> ログアウト
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">

          {/* クラス一覧カード */}
          {classesList.length > 0 && (
            <div>
              <h2 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-600" /> クラスの提出状況を確認
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {classesList.map(c => {
                  const count = studentsList.filter(s => s.classId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setViewingClass(c)}
                      className="bg-white border border-slate-200 rounded-xl p-5 text-left hover:border-indigo-400 hover:shadow-md transition-all group"
                    >
                      <div className="text-lg font-bold text-indigo-700 group-hover:text-indigo-800">{c.name}</div>
                      <div className="text-xs text-slate-400 mt-1">{count}名の児童</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* クラス管理セクション（マスターのみ） */}
          {isMaster && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                <h2 className="font-bold flex items-center gap-2 text-indigo-900">
                  <Settings className="w-5 h-5 text-indigo-600" /> クラスの管理
                </h2>
                <p className="text-xs text-indigo-600 mt-1">
                  新しいクラスを作成します。
                </p>
              </div>
              
              <div className="p-6 border-b border-slate-100">
                <form onSubmit={handleAddClass} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 font-medium mb-1 block">新規クラス名</label>
                    <input
                      type="text"
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="例: 1年A組"
                    />
                  </div>
                  <button
                     type="submit"
                     disabled={!newClassName.trim() || loading}
                     className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors"
                  >
                     作成する
                  </button>
                </form>
              </div>

              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[300px]">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-semibold">クラス名</th>
                      <th className="p-4 font-semibold">作成日時</th>
                      <th className="p-4 font-semibold w-24 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {classesList.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="p-6 text-center text-slate-400">作成されたクラスはありません。</td>
                      </tr>
                    ) : (
                      classesList.map(c => (
                        <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-bold text-slate-700">{c.name}</td>
                          <td className="p-4 text-slate-500">
                            {c.createdAt ? new Date(c.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                          </td>
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleDeleteClass(c.id, c.name)}
                              className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                              title="削除"
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
            </div>
          )}

          {/* 児童管理セクション */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-4 border-b border-slate-200">
              <h2 className="font-bold flex items-center gap-2 text-indigo-900">
                <Users className="w-5 h-5" /> 児童の管理
              </h2>
            </div>
            
            <div className="p-6 border-b border-slate-100">
              <form onSubmit={handleAddStudent} className="flex gap-2 items-end flex-wrap md:flex-nowrap">
                <div className="w-full md:w-1/3">
                  <label className="text-xs text-slate-500 font-medium mb-1 block">所属クラス</label>
                  <select
                    value={selectedClassId}
                    onChange={(e) => setSelectedClassId(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    required
                  >
                    <option value="" disabled>クラスを選択</option>
                    {classesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 w-full md:w-auto mt-2 md:mt-0">
                  <label className="text-xs text-slate-500 font-medium mb-1 block">新規児童の名前</label>
                  <input
                    type="text"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="例: 山田 太郎"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newStudentName.trim() || !selectedClassId || loading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors w-full md:w-auto mt-2 md:mt-0"
                >
                  登録する
                </button>
              </form>
            </div>

            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-500 font-medium mb-2">CSV一括登録</p>
              <p className="text-xs text-slate-400 mb-3">形式: <code className="bg-slate-200 px-1 rounded">名前,クラス名</code>（1行1名、ヘッダー行は自動スキップ）。クラス名が一致しない行はスキップされます。</p>
              <button
                type="button"
                onClick={() => {
                  const bom = '\uFEFF';
                  const content = bom + '名前,クラス名\n山田太郎,1年1組\n佐藤花子,1年2組\n鈴木一郎,2年1組';
                  const blob = new Blob([content], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = '児童一括登録_ひな形.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-semibold transition-colors mb-2"
              >
                ひな形をダウンロード
              </button>
              <br />
              <label className={`inline-flex items-center gap-2 cursor-pointer bg-white border border-indigo-400 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                <UserPlus className="w-4 h-4" />
                CSVファイルを選択して一括登録
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleCsvImport}
                  disabled={loading}
                />
              </label>
            </div>

            {/* フィルターバー */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">クラスで絞り込み:</span>
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
              >
                <option value="all">すべてのクラス ({studentsList.length}名)</option>
                {classesList.map(c => {
                  const count = studentsList.filter(s => s.classId === c.id).length;
                  return <option key={c.id} value={c.id}>{c.name} ({count}名)</option>;
                })}
                <option value="none">クラス未設定</option>
              </select>
              <div className="ml-auto flex items-center gap-2">
                {selectedStudentIds.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="w-4 h-4" />
                    {selectedStudentIds.size}名を削除
                  </button>
                )}
                <button
                  onClick={handleCsvExport}
                  className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
                >
                  CSVダウンロード
                </button>
              </div>
            </div>

            <div className="p-0 overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[600px]">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="p-4 w-10">
                      {(() => {
                        const filtered = filterClassId === 'all'
                          ? studentsList
                          : filterClassId === 'none'
                            ? studentsList.filter(s => !s.classId)
                            : studentsList.filter(s => s.classId === filterClassId);
                        const allSelected = filtered.length > 0 && filtered.every(s => selectedStudentIds.has(s.id));
                        return (
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => {
                              if (allSelected) {
                                setSelectedStudentIds(prev => {
                                  const next = new Set(prev);
                                  filtered.forEach(s => next.delete(s.id));
                                  return next;
                                });
                              } else {
                                setSelectedStudentIds(prev => {
                                  const next = new Set(prev);
                                  filtered.forEach(s => next.add(s.id));
                                  return next;
                                });
                              }
                            }}
                            className="w-4 h-4 cursor-pointer accent-indigo-600"
                          />
                        );
                      })()}
                    </th>
                    <th className="p-4 font-semibold">6桁ID</th>
                    <th className="p-4 font-semibold">クラス</th>
                    <th className="p-4 font-semibold">名前</th>
                    <th className="p-4 font-semibold">登録日時</th>
                    <th className="p-4 font-semibold w-24 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const filtered = filterClassId === 'all'
                      ? studentsList
                      : filterClassId === 'none'
                        ? studentsList.filter(s => !s.classId)
                        : studentsList.filter(s => s.classId === filterClassId);
                    if (filtered.length === 0) return (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-slate-400">該当する児童はいません。</td>
                      </tr>
                    );
                    return filtered.map(s => (
                      <tr key={s.id} className={`transition-colors ${selectedStudentIds.has(s.id) ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.has(s.id)}
                            onChange={() => {
                              setSelectedStudentIds(prev => {
                                const next = new Set(prev);
                                next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 cursor-pointer accent-indigo-600"
                          />
                        </td>
                        {editingStudentId === s.id ? (
                          <>
                            <td className="p-4 font-mono font-bold text-lg text-indigo-700 tracking-wider">
                              {s.id.substring(0,3)}-{s.id.substring(3,6)}
                            </td>
                            <td className="p-4">
                              <select
                                value={editStudentClassId}
                                onChange={(e) => setEditStudentClassId(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                              >
                                <option value="" disabled>クラスを選択</option>
                                {classesList.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="p-4">
                              <input
                                type="text"
                                value={editStudentName}
                                onChange={(e) => setEditStudentName(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                placeholder="名前"
                              />
                            </td>
                            <td className="p-4 text-slate-500">
                              {s.createdAt ? new Date(s.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => handleUpdateStudent(s.id)}
                                  className="text-white bg-indigo-600 hover:bg-indigo-700 p-2 rounded-lg transition-colors"
                                  title="保存"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEditStudent}
                                  className="text-slate-500 bg-slate-200 hover:bg-slate-300 p-2 rounded-lg transition-colors"
                                  title="キャンセル"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-4 font-mono font-bold text-lg text-indigo-700 tracking-wider">
                              {s.id.substring(0,3)}-{s.id.substring(3,6)}
                            </td>
                            <td className="p-4 font-medium text-slate-600">
                              {s.className || '-'}
                            </td>
                            <td className="p-4 font-medium text-slate-700">{s.name}</td>
                            <td className="p-4 text-slate-500">
                              {s.createdAt ? new Date(s.createdAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  onClick={() => setPreviewStudent({ id: s.id, name: s.name })}
                                  className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors"
                                  title="音読カードを見る"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => startEditStudent(s)}
                                  className="text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors"
                                  title="編集"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteStudent(s.id, s.name)}
                                  className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                                  title="削除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* 管理者設定セクション（マスターのみ） */}
          {isMaster && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="bg-indigo-50 p-4 border-b border-indigo-100">
                <h2 className="font-bold flex items-center gap-2 text-indigo-900">
                  <UserPlus className="w-5 h-5 text-indigo-600" /> 他の先生（管理者）の追加
                </h2>
                <p className="text-xs text-indigo-600 mt-1">
                  マスター管理者 ({adminUser?.email}) のみ表示される設定です（他の先生はヘッダーの「項目設定」から音読項目を編集できます）。
                </p>
              </div>
              
              <div className="p-6 border-b border-slate-100">
                <form onSubmit={handleAddAdmin} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-xs text-slate-500 font-medium mb-1 block">Googleアカウント（メールアドレス）</label>
                    <input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="teacher@example.com"
                    />
                  </div>
                  <button
                     type="submit"
                     disabled={!newAdminEmail.trim()}
                     className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-colors"
                  >
                     追加する
                  </button>
                </form>
              </div>

              <div className="p-0 overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[500px]">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-semibold">メールアドレス</th>
                      <th className="p-4 font-semibold">追加日時</th>
                      <th className="p-4 font-semibold w-24 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adminsList.map(a => (
                      <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-medium text-slate-700">{a.email}</td>
                        <td className="p-4 text-slate-500">
                          {a.addedAt ? new Date(a.addedAt.toDate()).toLocaleDateString('ja-JP') : '-'}
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleDeleteAdmin(a.email)}
                            className="text-slate-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {isSettingsOpen && (
          <SettingsModal
            columns={columns}
            onClose={() => setIsSettingsOpen(false)}
            onSave={saveColumns}
          />
        )}

        {previewStudent && (
          <StudentCardPreviewModal
            student={previewStudent}
            entries={previewEntries}
            columns={columns}
            onClose={() => setPreviewStudent(null)}
          />
        )}
      </div>
    );
  }

  // --- 児童画面 ---
  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden relative">

        {/* ヘッダー */}
        <header className="bg-blue-600 text-white p-6 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PenTool className="w-6 h-6" />
              デジタル音読・計算カード
            </h1>
            <p className="text-blue-100 text-sm mt-1">
              日々の努力を記録しよう
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={addEntry}
              className="bg-white text-blue-600 hover:bg-opacity-90 px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              記録を追加
            </button>
            <button
              onClick={resetData}
              className="bg-blue-700 hover:bg-blue-800 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors"
              title="データをリセット"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <div className="h-6 w-px bg-blue-400 mx-1"></div>
            <button
              onClick={handleLogout}
              className="bg-blue-800 hover:bg-blue-900 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1 transition-colors"
              title="ログアウト"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ユーザー情報バー */}
        <div className="bg-blue-50 px-6 py-2 border-b border-blue-100 flex justify-between items-center text-xs text-blue-800">
          <span className="font-bold">
            ログイン中: {student?.name} さん (ID: {student?.id})
          </span>
          <span className="text-blue-400 hidden md:inline">データは自動的にクラウドに保存されます</span>
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
                    <td className="p-3 sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <input
                        type="date"
                        value={entry.date}
                        onChange={(e) => updateEntry(entry.id, 'date', e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
                      />
                    </td>
                    <td className="p-3">
                      <PageInput
                        value={entry.page}
                        onChange={(val) => updateEntry(entry.id, 'page', val)}
                      />
                    </td>
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
                    <td className="p-3 text-center">
                      <SignButton
                        signed={entry.parentSign}
                        onClick={() => toggleSign(entry.id, 'parentSign', entry.parentSign)}
                        color="text-red-500 border-red-500"
                        bgSigned="bg-red-50"
                        label="済"
                      />
                    </td>
                    <td className="p-3 text-center">
                      <SignButton
                        signed={entry.teacherSign}
                        readOnly
                        color="text-indigo-600 border-indigo-600"
                        bgSigned="bg-indigo-50"
                        label="確認"
                      />
                    </td>
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
const SettingsModal = ({ columns, onClose, onSave }) => {
  const [localColumns, setLocalColumns] = React.useState(columns);
  const [saving, setSaving] = React.useState(false);

  const handleUpdate = (id, field, value) => {
    setLocalColumns(prev => prev.map(col => {
      if (col.id !== id) return col;
      if (field.startsWith('options.')) {
        const optionKey = field.split('.')[1];
        return { ...col, options: { ...col.options, [optionKey]: value } };
      }
      return { ...col, [field]: value };
    }));
  };

  const handleAdd = () => {
    const newId = `eval_${Date.now()}`;
    setLocalColumns(prev => [...prev, { id: newId, title: '新規項目', subtitle: '', type: 'select' }]);
  };

  const handleDelete = (id) => {
    if (localColumns.length <= 1) {
      alert('少なくとも1つの項目が必要です。');
      return;
    }
    if (confirm('この項目を削除しますか？')) {
      setLocalColumns(prev => prev.filter(col => col.id !== id));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localColumns);
      onClose();
    } catch {
      setSaving(false);
    }
  };

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
            評価項目の名前、入力タイプなどを編集し「保存」を押してください。
          </p>

          <div className="space-y-4">
            {localColumns.map((col) => (
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
                          onChange={(e) => handleUpdate(col.id, 'title', e.target.value)}
                          className="w-full p-2 text-sm border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs text-slate-400 block mb-1">サブタイトル</label>
                        <input
                          type="text"
                          value={col.subtitle}
                          onChange={(e) => handleUpdate(col.id, 'subtitle', e.target.value)}
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
                            onChange={() => handleUpdate(col.id, 'type', 'select')}
                          />
                          <span>記号 (◎〇△)</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`type-${col.id}`}
                            checked={col.type === 'number'}
                            onChange={() => handleUpdate(col.id, 'type', 'number')}
                          />
                          <span>数字</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            name={`type-${col.id}`}
                            checked={col.type === 'text'}
                            onChange={() => handleUpdate(col.id, 'type', 'text')}
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
                          onChange={(e) => handleUpdate(col.id, 'options.min', parseInt(e.target.value))}
                          className="w-16 p-1 text-sm border rounded text-center"
                        />
                        <span className="text-slate-400">〜</span>
                        <input
                          type="number"
                          value={col.options?.max || 5}
                          onChange={(e) => handleUpdate(col.id, 'options.max', parseInt(e.target.value))}
                          className="w-16 p-1 text-sm border rounded text-center"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleDelete(col.id)}
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
            onClick={handleAdd}
            className="w-full mt-4 py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-bold"
          >
            <Plus className="w-4 h-4" />
            新しい項目を追加
          </button>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 hover:text-slate-700 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors font-bold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存'}
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

// 音読カードプレビューモーダル（管理者用）
const StudentCardPreviewModal = ({ student, entries, columns, onClose }) => {
  const getEvalStyle = (val) => {
    switch (val) {
      case '◎': return 'text-blue-600 font-bold';
      case '〇': return 'text-green-600 font-medium';
      case '△': return 'text-orange-500';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5" />
            <span className="font-bold text-lg">{student.name} さんの音読カード</span>
            <span className="text-blue-200 text-sm font-mono">({student.id.substring(0,3)}-{student.id.substring(3,6)})</span>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="overflow-auto flex-1">
          {entries.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              まだ記録がありません。
            </div>
          ) : (
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold">日付</th>
                  <th className="py-3 px-4 font-semibold">読んだページ</th>
                  {columns.map(col => (
                    <th key={col.id} className="py-3 px-4 font-semibold text-center">
                      {col.title}<br />
                      <span className="text-xs font-normal text-slate-400">{col.subtitle}</span>
                    </th>
                  ))}
                  <th className="py-3 px-4 font-semibold text-center">保護者</th>
                  <th className="py-3 px-4 font-semibold text-center">先生</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-blue-50/30 transition-colors">
                    <td className="py-3 px-4 text-slate-700 font-medium whitespace-nowrap">{entry.date}</td>
                    <td className="py-3 px-4 text-center text-slate-600">{entry.page || '-'}</td>
                    {columns.map(col => (
                      <td key={col.id} className="py-3 px-4 text-center">
                        <span className={`text-lg ${getEvalStyle(entry[col.id])}`}>
                          {entry[col.id] ?? '-'}
                        </span>
                      </td>
                    ))}
                    <td className="py-3 px-4 text-center">
                      {entry.parentSign
                        ? <span className="text-red-500 font-bold text-xs">✓ 済</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {entry.teacherSign
                        ? <span className="text-indigo-600 font-bold text-xs">✓ 確認</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center flex-shrink-0">
          <span className="text-xs text-slate-400">{entries.length}件の記録</span>
          <button
            onClick={onClose}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-bold"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

// サインボタンコンポーネント
const SignButton = ({ signed, onClick, color, bgSigned, label, readOnly = false }) => {
  if (signed) {
    if (readOnly) {
      return (
        <div
          className={`w-12 h-12 rounded-full border-2 ${color} ${bgSigned} flex items-center justify-center mx-auto shadow-sm`}
          title="先生による確認済み"
        >
          <span className="font-bold text-sm">{label}</span>
        </div>
      );
    }
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

  if (readOnly) {
    return (
      <div className="w-12 h-8 rounded-md bg-slate-100 text-slate-300 text-xs flex items-center justify-center mx-auto">
        未確認
      </div>
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
