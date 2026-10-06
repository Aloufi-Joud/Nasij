// The one Firebase connection the whole team imports: `import { db, auth } from '../firebase'`.
// The web config is not a secret (Firebase protects data with security rules, not this key),
// so it lives in the code and the security dashboard can share this file.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD4XEagBz9Juf9hTgC9Tj6Y6gwoI4MGZZA',
  authDomain: 'nasij-0.firebaseapp.com',
  projectId: 'nasij-0',
  storageBucket: 'nasij-0.firebasestorage.app',
  messagingSenderId: '994771272182',
  appId: '1:994771272182:web:e80998af908fc9b28207d7',
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// ponytail: memory-only login (logged out on app restart) until async-storage lands
// in the next Mac install, then switch to initializeAuth + getReactNativePersistence
export const auth = getAuth(app);
