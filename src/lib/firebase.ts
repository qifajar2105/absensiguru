import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA3XVAZo_vxALSHlbJgRWEl5UDe8LidaCw",
  authDomain: "absensi-guru-133d8.firebaseapp.com",
  projectId: "absensi-guru-133d8",
  storageBucket: "absensi-guru-133d8.firebasestorage.app",
  messagingSenderId: "515627034437",
  appId: "1:515627034437:web:9ce106a6ca0878173d802c",
  measurementId: "G-PT2ZLT00LY"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence
enableMultiTabIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('The current browser does not support all of the features required to enable persistence');
  }
});
