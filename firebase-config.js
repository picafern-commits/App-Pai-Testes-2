/*
  Brinka Web — Firebase opcional

  A app funciona já em modo localStorage.
  Para sincronizar entre PC e iPhone:
  1. Cria projeto Firebase
  2. Ativa Firestore Database
  3. Cola aqui a configuração da tua app web
  4. Muda BRINKA_FIREBASE_ENABLED para true
*/

window.BRINKA_FIREBASE_ENABLED = false;

window.BRINKA_FIREBASE_CONFIG = {
  apiKey: "COLOCA_AQUI",
  authDomain: "COLOCA_AQUI.firebaseapp.com",
  projectId: "COLOCA_AQUI",
  storageBucket: "COLOCA_AQUI.appspot.com",
  messagingSenderId: "COLOCA_AQUI",
  appId: "COLOCA_AQUI"
};
