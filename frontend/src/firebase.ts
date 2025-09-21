import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC1_7DviGGS_dxcqFOimTctZqL7kO5Wc8w",
  authDomain: "gorn-sa-proj.firebaseapp.com",
  projectId: "gorn-sa-proj",
  storageBucket: "gorn-sa-proj.firebasestorage.app",
  messagingSenderId: "1067546802317",
  appId: "1:1067546802317:web:9b961199fa80e01ba50ac4",
  measurementId: "G-ZF37KC7YKW"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
