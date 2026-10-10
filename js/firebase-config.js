// ============================================================
//  Configuración de Firebase
//  1. Firebase Console → Configuración del proyecto → Tus apps → Web (</>)
//  2. Copia los valores de "firebaseConfig" y pégalos aquí.
//  (Estos valores son públicos por diseño; la seguridad está en firestore.rules)
// ============================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: "AIzaSyCJZC6MC79Y6L5c0PyD8wUYIBJ9qd4i538",
  authDomain: "halloween-submanhwa.firebaseapp.com",
  projectId: "halloween-submanhwa",
  storageBucket: "halloween-submanhwa.firebasestorage.app",
  messagingSenderId: "70432281922",
  appId: "1:70432281922:web:f6e90be97a7fa8d96f64db"

};

// Opciones del evento
export const OPCIONES = {
  // true  = los nombres bajo cada carta se actualizan en vivo (más lecturas de Firestore).
  // false = se cargan una vez al abrir la página y tras votar (ahorra cuota).
  votosEnVivo: true,
};

// Se pone en true cuando ya reemplazaste los valores de arriba.
export const configurado = !firebaseConfig.apiKey.startsWith('TU_');

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
