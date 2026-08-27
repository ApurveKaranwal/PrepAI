"use client";
// v1.0.1 - Responsive UI Stable
import React, { useState, useEffect, useCallback } from "react";
import { Menu } from "lucide-react";
import AuthPage from "@/components/auth/AuthPage";
import Sidebar from "@/components/navigation/Sidebar";
import DashboardHome from "@/components/dashboard/DashboardHome";
import InterviewPrep from "@/components/interview/InterviewPrep";
import PerformanceAnalytics from "@/components/analytics/PerformanceAnalytics";
import ResumeAnalyzer from "@/components/resume/ResumeAnalyzer";
import VoiceCopilot from "@/components/interview/VoiceCopilot";
import CareerAgent from "@/components/career/CareerAgent";
import RecruiterPortal from "@/components/recruiter/RecruiterPortal";
import { checkRedirectResult, authSignOut, authOnAuthStateChanged } from "@/lib/firebase";
import {
  apiGet,
  getToken,
  getStoredUser,
  setStoredUser,
  clearSession,
  onUnauthorized,
  errorMessage,
} from "@/lib/api";

interface UserProfile {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  name?: string | null;
  provider?: string | null;
}

export interface Organization {
  id: number;
  name: string;
  slug: string;
  role: string;
}

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [orgResolved, setOrgResolved] = useState<boolean>(false);
  // Restored from localStorage so a refresh drops the user back on the same
  // workspace they were on, not the dashboard. Falls back to "dashboard" the
  // first time the app loads. We deliberately keep the key scoped to this
  // product and not tied to a user id: the available tabs are the same for
  // every account, so there is no privacy concern with one shared key.
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "dashboard";
    try {
      return window.localStorage.getItem("prepflow_active_tab") || "dashboard";
    } catch {
      return "dashboard";
    }
  });
  const [recruiterSection, setRecruiterSection] = useState<string>(() => {
    if (typeof window === "undefined") return "sourcing";
    try {
      return window.localStorage.getItem("prepflow_recruiter_section") || "sourcing";
    } catch {
      return "sourcing";
    }
  });

  // Mirror active tab to localStorage so a refresh (or reopening a tab) lands
  // the user back on the workspace they were on, not the dashboard.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("prepflow_active_tab", activeTab);
    } catch {
      /* private-browsing modes can throw; fall back to in-memory only */
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("prepflow_recruiter_section", recruiterSection);
    } catch {
      /* ignore */
    }
  }, [recruiterSection]);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  /**
   * `GET /api/auth/me` is the only way to learn which organization the stored
   * token belongs to — org membership is deliberately not client state, because
   * it decides what recruiter data the caller may read. It doubles as the
   * token validity check on boot: a dead token 401s here, `apiFetch` clears the
   * session, and the `onUnauthorized` subscriber below drops us to sign-in.
   */
  const refreshIdentity = useCallback(async () => {
    if (!getToken()) {
      setOrganization(null);
      setOrgResolved(true);
      return;
    }
    try {
      const data = await apiGet("/api/auth/me");
      if (data?.user) {
        setUser((prev) => {
          const merged = { ...(prev || {}), ...data.user };
          setStoredUser(merged);
          return merged;
        });
      }
      setOrganization(data?.organization || null);
    } catch (err) {
      // A 401 already cleared the session; anything else (server down) should
      // not eject a signed-in user, so the org simply stays unresolved.
      console.warn("Could not confirm your session:", errorMessage(err));
    } finally {
      setOrgResolved(true);
    }
  }, []);

  // Drop to the sign-in screen the moment any request reports an expired token.
  useEffect(() => {
    const unsubscribe = onUnauthorized(() => {
      setUser(null);
      setOrganization(null);
      setOrgResolved(true);
      setActiveTab("dashboard");
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Check redirects and listen to auth state changes for session persistence
  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;

    // 1. Paint from the local cache immediately so a valid session does not
    //    flash the login page. Only trust it when a token is present too — a
    //    cached user without a token cannot make a single authenticated call.
    const cachedUser = getStoredUser();
    if (cachedUser && getToken()) {
      setUser(cachedUser);
      setAuthLoading(false);
    } else if (cachedUser) {
      clearSession();
    }

    async function initializeAuth() {
      try {
        // 2. Finish a Google sign-in that used the redirect flow.
        const loggedInUser = await checkRedirectResult();
        if (loggedInUser && !cancelled) {
          setUser(loggedInUser);
          setActiveTab("dashboard");
          setAuthLoading(false);
          await refreshIdentity();
          return;
        }
      } catch (err) {
        console.error("Google redirect sign-in failed:", errorMessage(err));
      }

      if (cancelled) return;

      // 3. Validate whatever session we have against the server.
      await refreshIdentity();
      if (cancelled) return;

      // 4. Keep following Firebase for Google sessions.
      unsubscribe = authOnAuthStateChanged((currentUser: UserProfile | null) => {
        if (cancelled) return;
        if (currentUser) {
          setUser(currentUser);
          refreshIdentity();
        } else {
          clearSession();
          setUser(null);
          setOrganization(null);
        }
        setAuthLoading(false);
      });

      // Firebase never reports for email/password users — and is absent
      // entirely when unconfigured — so the loading gate is released here
      // rather than waiting on a callback that may never arrive.
      setAuthLoading(false);
    }

    initializeAuth();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshIdentity]);

  const handleLoginSuccess = (userData: UserProfile) => {
    setStoredUser(userData);
    setUser(userData);
    setActiveTab("dashboard");
    setOrgResolved(false);
    refreshIdentity();
  };

  const handleEndInterview = () => {
    setActiveTab("analytics"); // Redirect to analytics upon ending mock interview!
  };

  const handleLogout = async () => {
    try {
      await authSignOut();
    } catch (err) {
      console.error("Sign out error:", errorMessage(err));
    } finally {
      clearSession();
      setUser(null);
      setOrganization(null);
      setOrgResolved(true);
      setActiveTab("dashboard");
    }
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
        organization={organization}
        orgResolved={orgResolved}
        recruiterSection={recruiterSection}
        onRecruiterSection={setRecruiterSection}
        onLogout={handleLogout}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF6F0]">
        {/* Mobile Header Bar */}
        <header className="lg:hidden border-b border-[#DFD5C6] py-3.5 px-4 flex items-center justify-between shrink-0 bg-[#FCFAF7]/95 backdrop-blur-md z-30 select-none">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            className="p-1.5 rounded-lg border border-[#DFD5C6] hover:bg-[#FAF6F0] text-[#6E6359] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="font-serif font-semibold text-base tracking-tight text-[#262626]">
            PrepFlow <span className="text-[#C85A32]">AI</span>
          </span>
          <div className="h-7 w-7 rounded-full bg-[#C85A32] text-[#FCFAF7] flex items-center justify-center text-xs font-bold uppercase shadow-sm">
            {user?.name ? user.name.slice(0, 2) : "US"}
          </div>
        </header>

        {activeTab === "dashboard" && (
          <DashboardHome
            onNavigate={(tab: string) => {
              setActiveTab(tab);
              setSidebarOpen(false);
            }}
            user={user}
          />
        )}
        {activeTab === "interviews" && (
          <InterviewPrep onEndInterview={handleEndInterview} user={user} />
        )}
        {activeTab === "voice-copilot" && (
          <VoiceCopilot user={user} />
        )}
        {activeTab === "career-agent" && (
          <div className="flex-1 overflow-y-auto bg-[#FAF6F0] p-4 sm:p-6">
            <CareerAgent user={user} />
          </div>
        )}
        {activeTab === "analytics" && (
          <PerformanceAnalytics user={user} />
        )}
        {activeTab === "resume-analyzer" && (
          <div className="flex-1 overflow-y-auto bg-[#FAF6F0]">
            <ResumeAnalyzer />
          </div>
        )}
        {activeTab === "recruiter-portal" && (
          <RecruiterPortal
            user={user}
            organization={organization}
            orgResolved={orgResolved}
            onOrganizationChange={setOrganization}
            section={recruiterSection}
            onSectionChange={setRecruiterSection}
            onNavigate={(tab: string) => {
              setActiveTab(tab);
              setSidebarOpen(false);
            }}
          />
        )}
      </div>
    </div>
  );
}
