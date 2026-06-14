"use client";

import React, { useState, useEffect } from "react";
import AuthPage from "@/components/auth/AuthPage";
import Sidebar from "@/components/navigation/Sidebar";
import DashboardHome from "@/components/dashboard/DashboardHome";
import InterviewPrep from "@/components/interview/InterviewPrep";
import PerformanceAnalytics from "@/components/analytics/PerformanceAnalytics";
import { Award, BarChart3, RotateCcw, LogOut } from "lucide-react";
import { checkRedirectResult, authSignOut, authOnAuthStateChanged } from "@/lib/firebase";

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [interviewEnded, setInterviewEnded] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Check redirects and listen to auth state changes for session persistence
  useEffect(() => {
    // 1. Load from local cache instantly to prevent flashing login page
    const cachedUser = localStorage.getItem("prepflow_user");
    if (cachedUser) {
      try {
        const parsedUser = JSON.parse(cachedUser);
        setTimeout(() => {
          setUser(parsedUser);
          setAuthLoading(false);
        }, 0);
      } catch (e) {
        console.error("Failed to parse cached user:", e);
      }
    }

    let unsubscribe = () => {};

    async function initializeAuth() {
      try {
        // 2. Check if returning from a Google Redirect
        const loggedInUser = await checkRedirectResult();
        if (loggedInUser) {
          localStorage.setItem("prepflow_user", JSON.stringify(loggedInUser));
          setUser(loggedInUser);
          setInterviewEnded(false);
          setActiveTab("dashboard");
          setAuthLoading(false);
          return;
        }
      } catch (err) {
        console.error("Failed to login via Google Redirect result:", err);
      }

      // 3. Listen to active persisted session changes
      unsubscribe = authOnAuthStateChanged((currentUser: any) => {
        if (currentUser) {
          localStorage.setItem("prepflow_user", JSON.stringify(currentUser));
          setUser(currentUser);
        } else {
          localStorage.removeItem("prepflow_user");
          setUser(null);
        }
        setAuthLoading(false);
      });
    }

    initializeAuth();

    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (userData: any) => {
    localStorage.setItem("prepflow_user", JSON.stringify(userData));
    setUser(userData);
    setInterviewEnded(false);
    setActiveTab("dashboard");
  };

  const handleEndInterview = () => {
    setInterviewEnded(true);
    setActiveTab("analytics"); // Redirect to analytics upon ending mock interview!
  };

  const handleRestart = () => {
    setInterviewEnded(false);
    setActiveTab("interviews");
  };

  const handleLogout = async () => {
    try {
      await authSignOut();
      localStorage.removeItem("prepflow_user");
      setUser(null);
      setInterviewEnded(false);
      setActiveTab("dashboard");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const handleStartPractice = () => {
    setInterviewEnded(false);
    setActiveTab("interviews");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans text-black select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-md bg-[#4F46E5] flex items-center justify-center text-white font-bold text-sm animate-pulse">P</div>
          <span className="text-xs font-semibold tracking-wider text-gray-400 font-mono animate-pulse uppercase">
            Loading Workspace...
          </span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Render Left Sidebar + Active Workspace View
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white text-black font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onStartPractice={handleStartPractice}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {activeTab === "dashboard" && (
          <DashboardHome onStartPractice={handleStartPractice} user={user} />
        )}
        {activeTab === "interviews" && (
          <InterviewPrep user={user} onEndInterview={handleEndInterview} />
        )}
        {activeTab === "analytics" && (
          <PerformanceAnalytics user={user} />
        )}
        {activeTab === "settings" && (
          <div className="flex-1 p-8 bg-white flex flex-col justify-center items-center select-none text-center">
            <h2 className="text-lg font-bold text-gray-900">Workspace Settings</h2>
            <p className="text-xs text-gray-500 mt-1">Configure your mock session configurations.</p>
          </div>
        )}
      </div>
    </div>
  );
}
