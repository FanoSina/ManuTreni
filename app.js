const firebaseConfig = {
  apiKey: "AIzaSyCqLfhYJLru8RVmVhOCmYWo1MDzNaOQGpQ",
  authDomain: "manutrain-aced7.firebaseapp.com",
  projectId: "manutrain-aced7",
  storageBucket: "manutrain-aced7.appspot.com",
  messagingSenderId: "1031834557198",
  appId: "1:1031834557198:web:8b40c5379d2b682423955f"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();


const $ = id => document.getElementById(id);

const authScreen = $("auth-screen");
const app = $("app");

auth.onAuthStateChanged(user => {
  if (user) {
    authScreen.classList.add("hidden");
    app.classList.remove("hidden");
  } else {
    app.classList.add("hidden");
    authScreen.classList.remove("hidden");
  }
});

$("btn-login").onclick = () =>
auth.signInWithEmailAndPassword(
  $("auth-email").value,
                                $("auth-password").value
).catch(e => $("auth-msg").textContent = e.message);

$("btn-register").onclick = () =>
auth.createUserWithEmailAndPassword(
  $("auth-email").value,
                                    $("auth-password").value
).catch(e => $("auth-msg").textContent = e.message);

$("btn-logout").onclick = () => auth.signOut();

/* Il resto (calendario, impostazioni, CRUD) è volutamente
 *   separato per il prossimo step, così lo testiamo stabile */
