"use client";

import React, { useState, useEffect } from "react";
import AuthPage from "@/components/auth/AuthPage";
import Sidebar from "@/components/navigation/Sidebar";
import DashboardHome from "@/components/dashboard/DashboardHome";
import InterviewPrep from "@/components/interview/InterviewPrep";
import PerformanceAnalytics from "@/components/analytics/PerformanceAnalytics";
import ResumeAnalyzer from "@/components/resume/ResumeAnalyzer";
import VoiceCopilot from "@/components/interview/VoiceCopilot";
import CareerAgent from "@/components/career/CareerAgent";
import { checkRedirectResult, authSignOut, authOnAuthStateChanged } from "@/lib/firebase";

interface UserProfile {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  name?: string | null;
}

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<string>("dashboard");
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
          setActiveTab("dashboard");
          setAuthLoading(false);
          return;
        }
      } catch (err) {
        console.error("Failed to login via Google Redirect result:", err);
      }

      // 3. Listen to active persisted session changes
      unsubscribe = authOnAuthStateChanged((currentUser: UserProfile | null) => {
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

  const handleLoginSuccess = (userData: UserProfile) => {
    localStorage.setItem("prepflow_user", JSON.stringify(userData));
    setUser(userData);
    setActiveTab("dashboard");
  };

  const handleEndInterview = () => {
    setActiveTab("analytics"); // Redirect to analytics upon ending mock interview!
  };

  const handleLogout = async () => {
    try {
      await authSignOut();
      localStorage.removeItem("prepflow_user");
      setUser(null);
      setActiveTab("dashboard");
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const handleStartPractice = () => {
    setActiveTab("interviews");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex flex-col items-center justify-center font-sans text-[#262626] select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-md bg-[#C85A32] flex items-center justify-center text-[#FCFAF7] font-bold text-sm animate-pulse">P</div>
          <span className="text-xs font-semibold tracking-wider text-[#6E6359] font-mono animate-pulse uppercase">
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
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAF6F0] text-[#262626] font-sans">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        onStartPractice={handleStartPractice}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF6F0]">
        {activeTab === "dashboard" && (
          <DashboardHome 
            onStartPractice={handleStartPractice} 
            onNavigate={(tab: string) => setActiveTab(tab)} 
            user={user} 
          />
        )}
        {activeTab === "interviews" && (
          <InterviewPrep onEndInterview={handleEndInterview} />
        )}
        {activeTab === "voice-copilot" && (
          <VoiceCopilot />
        )}
        {activeTab === "career-agent" && (
          <div className="flex-1 overflow-y-auto bg-[#FAF6F0] p-6">
            <CareerAgent user={user} />
          </div>
        )}
        {activeTab === "analytics" && (
          <PerformanceAnalytics user={user} />
        )}
        {activeTab === "resume-analyzer" && (
          <div className="flex-1 overflow-y-auto bg-[#FAF6F0] p-6">
            <ResumeAnalyzer />
          </div>
        )}
      </div>
    </div>
  );
}
