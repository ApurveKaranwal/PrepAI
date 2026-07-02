import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

const hasFirebaseConfig =
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId;

if (!hasFirebaseConfig) {
  console.warn(
    "Firebase config keys are missing in .env.local. Real database authentication is required. Please set up your .env.local file."
  );
}

const app = hasFirebaseConfig ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()) : null;
const auth = app ? getAuth(app) : null;
const googleProvider = app ? new GoogleAuthProvider() : null;

function ensureFirebase() {
  if (!auth) {
    throw new Error(
      "Firebase is not configured. Please define your Firebase API keys in frontend/.env.local to enable real database authentication."
    );
  }
}

// Wrapper for Email/Password Sign Up using local DB
export async function authSignUp(email, password, name) {
  const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name })
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || "Sign up failed");
  }
  const data = await res.json();
  return data.user;
}

// Wrapper for Email/Password Sign In using local DB
export async function authSignIn(email, password) {
  const res = await fetch(`${BACKEND_URL}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || "Sign in failed");
  }
  const data = await res.json();
  return data.user;
}

// Wrapper for Google OAuth Login using Firebase as client, storing locally
export async function authSignInWithGoogle() {
  ensureFirebase();
  const userCredential = await signInWithPopup(auth, googleProvider);
  const fbUser = userCredential.user;
  
  const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: fbUser.email,
      name: fbUser.displayName || "Google User",
      uid: fbUser.uid
    })
  });
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || "Google authentication failed on local database");
  }
  const data = await res.json();
  return data.user;
}

// Fallback Google Sign-In via Redirect
export async function authSignInWithGoogleRedirect() {
  ensureFirebase();
  await signInWithRedirect(auth, googleProvider);
}

// Check redirect login results on app load, syncing with local DB
export async function checkRedirectResult() {
  if (!auth) return null;
  try {
    const userCredential = await getRedirectResult(auth);
    if (userCredential && userCredential.user) {
      const fbUser = userCredential.user;
      const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fbUser.email,
          name: fbUser.displayName || "Google User",
          uid: fbUser.uid
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.user;
      }
    }
  } catch (error) {
    console.error("Redirect login result check failed:", error);
    throw error;
  }
  return null;
}

// Log out user
export async function authSignOut() {
  if (auth) {
    await signOut(auth);
  }
}

// Listen for authentication state changes to preserve session, syncing with local DB
export function authOnAuthStateChanged(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: user.displayName || user.email.split("@")[0],
            uid: user.uid
          })
        });
        if (res.ok) {
          const data = await res.json();
          callback(data.user);
        } else {
          callback(null);
        }
      } catch (err) {
        console.error("Failed to sync auth state change with local DB:", err);
        callback(null);
      }
    } else {
      // For email/password users logged in via local DB (provider === "password"),
      // Firebase auth state is null. We must check localStorage before clearing session.
      const cachedUserStr = typeof window !== "undefined" ? localStorage.getItem("prepflow_user") : null;
      if (cachedUserStr) {
        try {
          const cachedUser = JSON.parse(cachedUserStr);
          if (cachedUser && cachedUser.provider === "password") {
            // Keep the local email/password user logged in
            return;
          }
        } catch (e) {
          console.error("Error reading cached user", e);
        }
      }
      callback(null);
    }
  });
}
