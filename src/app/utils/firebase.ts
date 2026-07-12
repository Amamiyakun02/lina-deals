import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAHGCQwEM73lJFZ73alAP9K1JPFJbVUc5E",
  authDomain: "aimer-project1.firebaseapp.com",
  projectId: "aimer-project1",
  storageBucket: "aimer-project1.firebasestorage.app",
  messagingSenderId: "543573501985",
  appId: "1:543573501985:web:7cc4800648b7258c92db60",
  measurementId: "G-XC0E3YDMQJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});
