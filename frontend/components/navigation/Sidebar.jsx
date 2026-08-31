"use client";

import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Video,
  BarChart3,
  LogOut,
  Plus,
  FileText,
  Mic,
  Briefcase,
  X,
  Building2,
  Search,
  Users,
  ShieldCheck
} from "lucide-react";

const CANDIDATE_MENU = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "interviews", label: "Interviews", icon: Video },
  { id: "voice-copilot", label: "Voice Copilot", icon: Mic },
  { id: "career-agent", label: "AI Career Agent", icon: Briefcase },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "resume-analyzer", label: "Resume Analyzer", icon: FileText },
];

// Each entry is a section of the recruiter portal, not a separate workspace tab.
const RECRUITER_MENU = [
  { id: "sourcing", label: "Talent Radar", icon: Search },
  { id: "requisitions", label: "Requisitions", icon: Briefcase },
  { id: "pipeline", label: "Hiring Pipeline", icon: Users },
  { id: "assessments", label: "Assessments", icon: ShieldCheck },
  { id: "organization", label: "Organization", icon: Building2 },
];

export default function Sidebar({
  activeTab,
  setActiveTab,
  user,
  organization,
  orgResolved = true,
  recruiterSection = "sourcing",
  onRecruiterSection,
  onRoleChange,
  onLogout,
  sidebarOpen,
  setSidebarOpen,
}) {
  const [roleMode, setRoleMode] = useState(() => {
    return user?.role === "recruiter" || activeTab === "recruiter-portal" ? "recruiter" : "candidate";
  });

  useEffect(() => {
    if (activeTab === "recruiter-portal") {
      setRoleMode("recruiter");
    } else if (roleMode === "recruiter" && activeTab !== "recruiter-portal") {
      setRoleMode("candidate");
    }
  }, [activeTab]);

  useEffect(() => {
    if (user?.role && (user.role === "candidate" || user.role === "recruiter")) {
      if (activeTab === "recruiter-portal" && user.role === "recruiter") {
        setRoleMode("recruiter");
      }
    }
  }, [user?.role, activeTab]);

  const inRecruiterMode = roleMode === "recruiter";
  const menuItems = inRecruiterMode ? RECRUITER_MENU : CANDIDATE_MENU;

  const closeOnMobile = () => {
    if (setSidebarOpen) setSidebarOpen(false);
  };

  const openRecruiter = (section = "sourcing") => {
    setRoleMode("recruiter");
    setActiveTab("recruiter-portal");
    if (onRecruiterSection) onRecruiterSection(section);
    closeOnMobile();
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-[#262626]/20 backdrop-blur-xs z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 w-64 z-50 border-r border-[#DFD5C6] bg-[#FCFAF7] flex flex-col justify-between h-screen transition-transform duration-300 ease-out lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      } lg:static lg:flex shrink-0 select-none`}>
        {/* Top Section */}
        <div className="p-6 space-y-6">
          {/* Brand */}
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="font-serif font-semibold text-xl tracking-tight text-[#262626] flex items-center gap-1.5 select-none">
                PrepFlow <span className="text-[#C85A32]">AI</span>
              </h1>
              <p className="text-[10px] font-mono text-[#6E6359]/70 uppercase tracking-widest mt-0.5 truncate">
                {inRecruiterMode ? "Recruiter Portal" : "Candidate Portal"}
              </p>
            </div>
            {setSidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation menu"
                className="lg:hidden p-1.5 rounded-lg border border-[#DFD5C6] text-[#6E6359] hover:bg-[#FAF6F0] cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Workspace switcher */}
          <div
            role="tablist"
            aria-label="Workspace"
            className="bg-[#FAF6F0] p-1 rounded-xl border border-[#DFD5C6] flex items-center gap-1 text-[11px] font-mono font-bold"
          >
            <button
              role="tab"
              aria-selected={!inRecruiterMode}
              onClick={() => {
                if (onRoleChange) onRoleChange("candidate");
                setRoleMode("candidate");
                setActiveTab("dashboard");
                closeOnMobile();
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32] ${
                !inRecruiterMode
                  ? "bg-[#262626] text-white shadow-3xs"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              Candidate
            </button>
            <button
              role="tab"
              aria-selected={inRecruiterMode}
              onClick={() => {
                if (onRoleChange) onRoleChange("recruiter");
                openRecruiter(organization ? "sourcing" : "organization");
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32] ${
                inRecruiterMode
                  ? "bg-[#C85A32] text-white shadow-3xs"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              <span>Recruiter</span>
              {/* Only claim the workspace exists once the server has confirmed a
                  membership. Anything else invites a founder into a portal that
                  will immediately ask them to create an organization. */}
              {orgResolved && !organization && (
                <span
                  className={`text-[9px] px-1 rounded font-mono ${
                    inRecruiterMode ? "bg-white/20 text-white" : "bg-[#DFD5C6] text-[#6E6359]"
                  }`}
                >
                  Set up
                </span>
              )}
            </button>
          </div>

          {/* Menu Items */}
          <nav className="space-y-1.5" aria-label={inRecruiterMode ? "Hiring navigation" : "Candidate navigation"}>
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = inRecruiterMode
                ? activeTab === "recruiter-portal" && recruiterSection === item.id
                : activeTab === item.id;
              return (
                <button
                  key={item.id}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => {
                    if (inRecruiterMode) {
                      openRecruiter(item.id);
                    } else {
                      setActiveTab(item.id);
                      closeOnMobile();
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32] ${
                    isActive
                      ? "bg-[#C85A32]/10 text-[#C85A32] border-r-2 border-[#C85A32]"
                      : "text-[#6E6359] hover:text-[#262626] hover:bg-[#FAF6F0]"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? "text-[#C85A32]" : "text-[#6E6359]/60"}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section */}
        <div className="p-6 space-y-4 border-t border-[#DFD5C6]/60">
          {/* Action CTA */}
          {inRecruiterMode ? (
            <button
              onClick={() => openRecruiter(organization ? "sourcing" : "organization")}
              className="w-full bg-[#262626] hover:bg-black text-[#FCFAF7] py-3 px-4 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]"
            >
              {organization ? (
                <>
                  <Search className="h-4 w-4 text-[#C85A32]" />
                  Source Talent
                </>
              ) : (
                <>
                  <Building2 className="h-4 w-4 text-[#C85A32]" />
                  Create Organization
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => {
                setActiveTab("interviews");
                closeOnMobile();
              }}
              className="w-full bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-3 px-4 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]"
            >
              <Plus className="h-4 w-4" />
              Start Interview
            </button>
          )}

          {/* Profile Card */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-8 w-8 rounded-full bg-[#C85A32] text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm shrink-0">
                {user?.name ? user.name.slice(0, 2) : "US"}
              </div>
              <div className="text-left min-w-0">
                <p className="text-xs font-bold text-[#262626] leading-tight truncate">
                  {user?.name || "User"}
                </p>
                <p className="text-[10px] text-[#6E6359] font-mono leading-none truncate max-w-[120px]">
                  {user?.email || ""}
                </p>
                {inRecruiterMode && organization?.role && (
                  <p className="text-[9px] text-[#6E6359]/80 font-mono uppercase tracking-wider mt-1">
                    {organization.role}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onLogout}
              className="text-[#6E6359]/60 hover:text-[#262626] transition-colors cursor-pointer shrink-0 p-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85A32]"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
