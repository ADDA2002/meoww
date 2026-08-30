import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, remove, onDisconnect, serverTimestamp, get, Database, connectDatabaseEmulator } from "firebase/database";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC-a_AcGt2LJ3A6O0gyKBI6wg_FfJRyP30",
  authDomain: "meoww-audio.firebaseapp.com",
  databaseURL: "https://meoww-audio-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "meoww-audio",
  storageBucket: "meoww-audio.firebasestorage.app",
  messagingSenderId: "768504750699",
  appId: "1:768504750699:web:fe655aaa0435aa1c04072e"
};

// Initialize Firebase
let db: Database | null = null;
let firebaseInitError: string | null = null;

try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
  console.log("✅ Firebase connected");
} catch (error: any) {
  console.error("❌ Firebase init failed:", error);
  firebaseInitError = error?.message || "Unknown error";
}

export { db, ref, onValue, set, push, remove, onDisconnect, serverTimestamp, get, firebaseInitError };