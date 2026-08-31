import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { apiPost, setToken, setStoredUser, clearSession, getStoredUser, errorMessage } from "./api";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const hasFirebaseConfig =
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId;

if (!hasFirebaseConfig) {
  console.warn(
    "Firebase config keys are missing in .env.local. Google sign-in will be unavailable; email and password sign-in still works."
  );
}

const app = hasFirebaseConfig ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()) : null;
const auth = app ? getAuth(app) : null;
const googleProvider = app ? new GoogleAuthProvider() : null;

function ensureFirebase() {
  if (!auth) {
    throw new Error(
      "Google sign-in is not configured on this deployment. Use your email and password, or set the Firebase keys in frontend/.env.local."
    );
  }
}

/**
 * Every backend auth response carries `{ user, session_token, expires_at }`.
 * The session token is the only thing that authenticates later requests — the
 * backend does not accept a client-supplied user id anywhere — so dropping it
 * (which the previous version did) left the app signed in visually while every
 * authenticated call came back 401. Store both, always through here.
 */
function persistSession(data) {
  if (!data?.session_token) {
    throw new Error("The server did not return a session. Please try signing in again.");
  }
  setToken(data.session_token);
  setStoredUser(data.user);
  return data.user;
}

// -----------------------------------------------------------------------------
// Email + password (backend-owned; Firebase is not involved)
// -----------------------------------------------------------------------------

export async function authSignUp(email, password, name, role = "candidate") {
  const data = await apiPost("/api/auth/signup", { email, password, name, role }, { auth: false });
  return persistSession(data);
}

export async function authSignIn(email, password) {
  const data = await apiPost("/api/auth/signin", { email, password }, { auth: false });
  return persistSession(data);
}

// -----------------------------------------------------------------------------
// Google OAuth — Firebase verifies the identity, the backend issues the session
// -----------------------------------------------------------------------------

export async function authSignInWithGoogle(role = null) {
  ensureFirebase();
  const userCredential = await signInWithPopup(auth, googleProvider);
  const fbUser = userCredential.user;

  const payload = {
    email: fbUser.email,
    name: fbUser.displayName || "Google User",
    uid: fbUser.uid,
  };
  if (role) payload.role = role;

  const data = await apiPost(
    "/api/auth/google",
    payload,
    { auth: false }
  );
  return persistSession(data);
}

export async function authSignInWithGoogleRedirect() {
  ensureFirebase();
  await signInWithRedirect(auth, googleProvider);
}

/** Called once on boot to finish a redirect-based Google sign-in. */
export async function checkRedirectResult() {
  if (!auth) return null;
  const userCredential = await getRedirectResult(auth);
  if (!userCredential?.user) return null;

  const fbUser = userCredential.user;
  const data = await apiPost(
    "/api/auth/google",
    { email: fbUser.email, name: fbUser.displayName || "Google User", uid: fbUser.uid },
    { auth: false }
  );
  return persistSession(data);
}

// -----------------------------------------------------------------------------
// Sign out
// -----------------------------------------------------------------------------

export async function authSignOut() {
  // Revoke server-side first, while the token is still in storage. The endpoint
  // is idempotent and always returns success, so a stale token is not an error.
  try {
    await apiPost("/api/auth/signout", {});
  } catch (err) {
    // A failed revoke must not trap the user in a signed-in shell. The local
    // session is cleared regardless; the token expires server-side on its own.
    console.warn("Sign-out could not reach the server:", errorMessage(err));
  }
  clearSession();
  if (auth) {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Firebase sign-out failed:", errorMessage(err));
    }
  }
}

// -----------------------------------------------------------------------------
// Session restoration
// -----------------------------------------------------------------------------

/**
 * Watches Firebase for Google sessions. Email and password users have no
 * Firebase session at all, so a null user here does not mean signed out — the
 * cached `provider === "password"` user is left alone and validated instead by
 * `GET /api/auth/me` on boot.
 */
export function authOnAuthStateChanged(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const data = await apiPost(
          "/api/auth/google",
          {
            email: user.email,
            name: user.displayName || user.email.split("@")[0],
            uid: user.uid,
          },
          { auth: false }
        );
        callback(persistSession(data));
      } catch (err) {
        console.warn("Could not restore the Google session:", errorMessage(err));
        const cachedUser = getStoredUser();
        if (cachedUser && cachedUser.email === user.email) {
          callback(cachedUser);
        } else {
          callback(null);
        }
      }
      return;
    }

    const cachedUser = getStoredUser();
    if (cachedUser?.provider === "password") {
      // Keep the backend-owned email/password session; Firebase never had one.
      return;
    }
    callback(null);
  });
}
