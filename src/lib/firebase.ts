import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "academic-hub-zgtt6",
  appId: "1:513506346004:web:33cfd930b8ea0ed64bd301",
  apiKey: "AIzaSyAHECLdN5vXTovbn6UTR0jbD5Rq9QsqPSg",
  authDomain: "academic-hub-zgtt6.firebaseapp.com",
  storageBucket: "academic-hub-zgtt6.firebasestorage.app",
  messagingSenderId: "513506346004"
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
