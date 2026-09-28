import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
    apiKey: "AIzaSyAJT9HWvbxj2sT7WDgrzzAMhe0cLxzmSfI",
    authDomain: "helpful-passage-430405-b3.firebaseapp.com",
    projectId: "helpful-passage-430405-b3",
    storageBucket: "helpful-passage-430405-b3.firebasestorage.app",
    messagingSenderId: "915619375587",
    appId: "1:915619375587:web:daacf02ecbb879ba5118d6",
    measurementId: "G-RJ36V69VTQ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app, "ondoku-db"); // Use the specific database 'ondoku-db'
export const functions = getFunctions(app, "asia-northeast1");

// 動作確認用: VITE_USE_EMULATORS=true で起動したときだけ、本番ではなく手元のエミュレータにつなぐ
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8089);
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
