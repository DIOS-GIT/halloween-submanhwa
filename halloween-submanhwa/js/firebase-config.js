// ============================================================
//  Configuración de Firebase
//  1. Firebase Console → Configuración del proyecto → Tus apps → Web (</>)
//  2. Copia los valores de "firebaseConfig" y pégalos aquí.
//  (Estos valores son públicos por diseño; la seguridad está en firestore.rules)
// ============================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const firebaseConfig = {
  apiKey: 'TU_API_KEY',
  authDomain: 'TU_PROYECTO.firebaseapp.com',
  projectId: 'TU_PROYECTO',
  storageBucket: 'TU_PROYECTO.appspot.com',
  messagingSenderId: 'TU_SENDER_ID',
  appId: 'TU_APP_ID',
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
