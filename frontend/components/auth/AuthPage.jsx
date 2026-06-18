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
        setError("Firebase Authentication is not enabled. Please enable Email/Password and Google providers in the Firebase Console.");
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
        setError("Google Sign-In is not enabled. Please enable Google provider in the Firebase Console.");
      } else if (err.code === "auth/popup-blocked" || errMsg.includes("popup-blocked")) {
        setError("Popup blocked. Redirecting to Google...");
        try {
          await authSignInWithGoogleRedirect();
        } catch (redirErr) {
          setError(redirErr.message || "Google Redirect failed.");
        }
      } else {
        setError(err.message || "An error occurred with Google Sign-In.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAF6F0] bg-grid-overlay px-4 py-12 text-[#262626] font-sans selection:bg-[#C85A32]/10 selection:text-[#C85A32]">
      <div className="w-full max-w-md space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        
        {/* Minimal Header */}
        <div className="flex flex-col items-center justify-center text-center space-y-3">
          <span className="text-xl font-serif font-bold tracking-tight text-[#262626] select-none">
            PrepFlow <span className="text-[#C85A32]">AI</span>
          </span>
          <div className="space-y-1">
            <h2 className="text-2xl font-serif font-medium tracking-tight text-[#262626]">
              {isSignUp ? "Create your account" : "Sign in to PrepFlow AI"}
            </h2>
            <p className="text-xs text-[#6E6359] font-medium">
              {isSignUp ? "Get prepared for your dream tech job." : "Welcome back. Let's practice."}
            </p>
          </div>
        </div>

        {/* Unified Card */}
        <div className="bg-[#FCFAF7] p-8 border border-[#DFD5C6] rounded-2xl shadow-xs space-y-6">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 bg-[#FAF4EB] border border-[#C85A32]/20 rounded-xl text-[#C85A32] text-xs">
              <AlertCircle className="h-4.5 w-4.5 shrink-0 text-[#C85A32] mt-0.5" />
              <span className="font-semibold leading-relaxed">{error}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isSignUp && (
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FAF6F0] py-2 px-3.5 text-sm text-[#262626] placeholder-[#6E6359]/35 focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all duration-200"
                  placeholder="Jane Doe"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">
                Email address
              </label>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Mail className="h-4 w-4 text-[#6E6359]/45 group-focus-within:text-[#C85A32] transition-colors" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FAF6F0] py-2.5 pl-9.5 pr-3.5 text-sm text-[#262626] placeholder-[#6E6359]/35 focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all duration-200"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">
                  Password
                </label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); alert("Password reset link has been simulated."); }}
                    className="text-[11px] text-[#6E6359] hover:text-[#C85A32] transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative group">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-4 w-4 text-[#6E6359]/45 group-focus-within:text-[#C85A32] transition-colors" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FAF6F0] py-2.5 pl-9.5 pr-10 text-sm text-[#262626] placeholder-[#6E6359]/35 focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all duration-200"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#6E6359]/50 hover:text-[#262626]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-1.5 rounded-xl bg-[#C85A32] hover:bg-[#B83A14] active:scale-[0.99] text-[#FCFAF7] py-2.5 px-4 text-sm font-bold transition-all disabled:opacity-50 mt-6 cursor-pointer shadow-sm"
            >
              {loading ? "Processing..." : isSignUp ? "Create Account" : "Sign In"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#DFD5C6]"></div>
            </div>
            <span className="relative bg-[#FCFAF7] px-3.5 text-[9px] text-[#6E6359]/55 uppercase tracking-wider font-mono">
              Or continue with
            </span>
          </div>

          {/* Google Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] py-2.5 px-4 text-sm font-bold text-[#262626] hover:bg-[#FAF6F0] transition-colors disabled:opacity-50 cursor-pointer shadow-2xs active:scale-[0.99]"
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

        {/* Toggle link */}
        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-xs text-[#6E6359] hover:text-[#C85A32] font-semibold transition-colors cursor-pointer"
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>

      </div>
    </div>
  );
}
