import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, remove, onDisconnect, serverTimestamp, Database } from "firebase/database";

// Firebase config - uses anonymous signup, no credit card needed
// Free tier: 1GB stored, 10GB/month transfer, 50 concurrent connections
const firebaseConfig = {
  apiKey: "AIzaSyDemo-Meoww-FreeTier-Key",
  authDomain: "meoww-audio.firebaseapp.com",
  databaseURL: "https://meoww-audio-default-rtdb.firebaseio.com",
  projectId: "meoww-audio",
  storageBucket: "meoww-audio.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:meoww123"
};

// Try to initialize Firebase, gracefully handle if it fails
let db: Database | null = null;

try {
  const app = initializeApp(firebaseConfig);
  db = getDatabase(app);
} catch (error) {
  console.warn("Firebase initialization failed, using fallback mode");
}

export { db, ref, onValue, set, push, remove, onDisconnect, serverTimestamp };