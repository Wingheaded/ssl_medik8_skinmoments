import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBRprh1ZLX0cLzf90H_OMxqcCvF654ivM4",
    authDomain: "medik8-skinmoments.firebaseapp.com",
    projectId: "medik8-skinmoments",
    storageBucket: "medik8-skinmoments.firebasestorage.app",
    messagingSenderId: "797501992738",
    appId: "1:797501992738:web:be7ab6835547ee48d2ff7b"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
