"use client";

import React, { useState } from "react";
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle } from "lucide-react";
import { authSignIn, authSignUp, authSignInWithGoogle, authSignInWithGoogleRedirect } from "@/lib/firebase";

export default function AuthPage({ onLoginSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!email || !password || (isSignUp && !name)) return;
    setLoading(true);
    try {
      if (isSignUp) {
        const user = await authSignUp(email, password, name);
        onLoginSuccess(user);
      } else {
        const user = await authSignIn(email, password);
        onLoginSuccess(user);
      }
    } catch (err) {
      console.error("Auth error:", err);
      const errMsg = err.message || "";
      if (err.code === "auth/configuration-not-found" || errMsg.includes("configuration-not-found")) {
        setError("Firebase Authentication is not enabled for this project. Please open Firebase Console -> Authentication -> Sign-in Method and enable both 'Email/Password' and 'Google'.");
      } else {
        setError(err.message || "An authentication error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const user = await authSignInWithGoogle();
      onLoginSuccess(user);
    } catch (err) {
      console.error("Google auth error:", err);
      const errMsg = err.message || "";
      if (err.code === "auth/configuration-not-found" || errMsg.includes("configuration-not-found")) {
        setError("Google Sign-In is not enabled. Please open Firebase Console -> Authentication -> Sign-in Method, enable 'Google', and configure your OAuth consent screen.");
      } else if (err.code === "auth/popup-blocked" || errMsg.includes("popup-blocked")) {
        setError("Popup blocked. Redirecting to Google Sign-In...");
        try {
          await authSignInWithGoogleRedirect();
        } catch (redirErr) {
          setError(redirErr.message || "Google Redirect Sign-In failed.");
        }
      } else {
        setError(err.message || "An error occurred with Google Sign-In.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-6 w-6 rounded-md bg-[#4F46E5] flex items-center justify-center text-white font-bold text-sm">P</span>
            <span className="text-xl font-bold tracking-tight text-black font-sans">PrepFlow AI</span>
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-black">
            {isSignUp ? "Create your account" : "Sign in to PrepFlow AI"}
          </h2>
          <p className="mt-2 text-sm text-gray-500">
            {isSignUp ? "Get prepared for your dream tech job" : "Welcome back. Let's practice."}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white p-8 border border-slate-100 rounded-xl shadow-sm space-y-6">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md text-red-500 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 font-mono">
                  Full Name
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-gray-400 text-sm">@</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2 font-mono">
                Email address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider font-mono">
                  Password
                </label>
                {!isSignUp && (
                  <a href="#" className="text-xs text-gray-500 hover:text-black transition-colors">
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-md border border-gray-200 bg-white py-2 pl-9 pr-10 text-sm text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-2 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white py-2 px-4 text-sm font-semibold transition-colors disabled:opacity-50 mt-6"
            >
              {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100"></div>
            </div>
            <span className="relative bg-white px-3 text-xs text-gray-400 uppercase tracking-wider font-mono">
              Or continue with
            </span>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-md border border-gray-200 bg-white py-2 px-4 text-sm font-medium text-black hover:bg-gray-50 focus:outline-none transition-colors disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
              <g transform="matrix(1, 0, 0, 1, 0, 0)">
                <path d="M21.35,11.1H12v2.7h5.38C17,14.9 15.82,16.5 14.2,17.2l2.3,1.78c2.72-2.5 4.3-6.18 4.3-10.58A10.16,10.16,0,0,0,21.35,11.1Z" fill="#4285F4" />
                <path d="M12,20.5a8.21,8.21,0,0,0,5.7-2l-2.3-1.78A5.12,5.12,0,0,1,12,17.8a5.18,5.18,0,0,1-4.9-3.6L4.72,16A8.51,8.51,0,0,0,12,20.5Z" fill="#34A853" />
                <path d="M7.1,14.2a5,5,0,0,1,0-3.2L4.72,9.22a8.53,8.53,0,0,0,0,5.56Z" fill="#FBBC05" />
                <path d="M12,6.2a4.9,4.9,0,0,1,3.48,1.38l2.6-2.6A8.47,8.47,0,0,0,12,3.5,8.51,8.51,0,0,0,4.72,8L7.1,9.8A5.18,5.18,0,0,1,12,6.2Z" fill="#EA4335" />
              </g>
            </svg>
            Continue with Google
          </button>
        </div>

        {/* Footer Link */}
        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-gray-500 hover:text-black transition-colors"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}
