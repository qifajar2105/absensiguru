import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  
  const admins = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.role === 'admin' || data.role === 'superadmin') {
      admins.push({ email: data.email, name: data.name, role: data.role });
    }
  });
  console.log(JSON.stringify(admins, null, 2));
  process.exit(0);
}
run().catch(console.error);
