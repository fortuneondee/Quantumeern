
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDEfa9vvk9ByoGxT824ma0uGRgRdYHYza8",
  authDomain: "quantumeern.firebaseapp.com",
  projectId: "quantumeern",
  storageBucket: "quantumeern.firebasestorage.app",
  messagingSenderId: "1045526093204",
  appId: "1:1045526093204:web:ae8ecee737fb31f1d40381",
  measurementId: "G-BXK89SR8V3"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
