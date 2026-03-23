import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';


// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAtDI6aop5nXuevsMoiTQ0-1sbg1pMTdE8",
  authDomain: "lifehack-website-e639b.firebaseapp.com",
  databaseURL: "https://lifehack-website-e639b-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "lifehack-website-e639b",
  storageBucket: "lifehack-website-e639b.firebasestorage.app",
  messagingSenderId: "922225540799",
  appId: "1:922225540799:web:85331555345d1c2ef4d00a",
  measurementId: "G-K18921TQKW"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);