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

const authScreen = document.getElementById("auth-screen");
const app = document.getElementById("app");
const msg = document.getElementById("auth-msg");

authScreen.style.display = "grid";
app.style.display = "none";

/* AUTH STATE */
auth.onAuthStateChanged(user => {
  if (user) {
    authScreen.style.display = "none";
    app.style.display = "block";
    msg.textContent = "";
  } else {
    app.style.display = "none";
    authScreen.style.display = "grid";
  }
});

/* LOGIN */
document.getElementById("btn-login").onclick = () => {
  auth.signInWithEmailAndPassword(
    document.getElementById("auth-email").value,
                                  document.getElementById("auth-password").value
  ).catch(e => msg.textContent = e.message);
};

/* REGISTER */
document.getElementById("btn-register").onclick = () => {
  if (auth.currentUser) {
    msg.textContent = "Sei già autenticato.";
    return;
  }

  auth.createUserWithEmailAndPassword(
    document.getElementById("auth-email").value,
                                      document.getElementById("auth-password").value
  ).catch(e => msg.textContent = e.message);
};

/* LOGOUT */
document.getElementById("btn-logout").onclick = () => {
  auth.signOut();
};
