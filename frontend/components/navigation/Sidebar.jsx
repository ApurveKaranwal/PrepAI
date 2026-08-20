"use client";

import React, { useState } from "react";
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

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, sidebarOpen, setSidebarOpen }) {
  const [roleMode, setRoleMode] = useState("candidate"); // 'candidate' | 'recruiter'

  const candidateMenuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "interviews", label: "Interviews", icon: Video },
    { id: "voice-copilot", label: "Voice Copilot", icon: Mic },
    { id: "career-agent", label: "AI Career Agent", icon: Briefcase },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "resume-analyzer", label: "Resume Analyzer", icon: FileText },
  ];

  const recruiterMenuItems = [
    { id: "recruiter-portal", label: "Talent Radar", icon: Search },
    { id: "career-agent", label: "Candidate Requisitions", icon: Briefcase },
    { id: "analytics", label: "Candidate Analytics", icon: BarChart3 },
  ];

  const menuItems = roleMode === "candidate" ? candidateMenuItems : recruiterMenuItems;

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
            <div>
              <h1 className="font-serif font-semibold text-xl tracking-tight text-[#262626] flex items-center gap-1.5 select-none">
                PrepFlow <span className="text-[#C85A32]">AI</span>
              </h1>
              <p className="text-[10px] font-mono text-[#6E6359]/70 uppercase tracking-widest mt-0.5">
                {roleMode === "candidate" ? "Candidate Workspace" : "Founder / Recruiter Portal"}
              </p>
            </div>
            {setSidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 rounded-lg border border-[#DFD5C6] text-[#6E6359] hover:bg-[#FAF6F0] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Role Switcher Segmented Control */}
          <div className="bg-[#FAF6F0] p-1 rounded-xl border border-[#DFD5C6] flex items-center gap-1 text-[11px] font-mono font-bold">
            <button
              onClick={() => {
                setRoleMode("candidate");
                setActiveTab("dashboard");
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center ${
                roleMode === "candidate"
                  ? "bg-[#262626] text-white shadow-3xs"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              Candidate
            </button>
            <button
              onClick={() => {
                setRoleMode("recruiter");
                setActiveTab("recruiter-portal");
              }}
              className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer text-center flex items-center justify-center gap-1 ${
                roleMode === "recruiter"
                  ? "bg-[#C85A32] text-white shadow-3xs"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              <span>Recruiter</span>
              <span className="text-[9px] px-1 py-0.2 rounded bg-white/20 text-white font-mono">Pro</span>
            </button>
          </div>

          {/* Menu Items */}
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id);
                    if (setSidebarOpen) setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
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
        <div className="p-6 space-y-6 border-t border-[#DFD5C6]/60">
          {/* Action CTA */}
          {roleMode === "candidate" ? (
            <button
              onClick={() => {
                setActiveTab("interviews");
                if (setSidebarOpen) setSidebarOpen(false);
              }}
              className="w-full bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-3 px-4 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Start Interview
            </button>
          ) : (
            <button
              onClick={() => {
                setActiveTab("recruiter-portal");
                if (setSidebarOpen) setSidebarOpen(false);
              }}
              className="w-full bg-[#262626] hover:bg-black text-[#FCFAF7] py-3 px-4 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Search className="h-4 w-4 text-[#C85A32]" />
              Source Talent
            </button>
          )}

          {/* Profile Card */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-[#C85A32] text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm">
                {user?.name ? user.name.slice(0, 2) : "US"}
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-[#262626] leading-tight">
                  {user?.name || "User"}
                </p>
                <p className="text-[10px] text-[#6E6359] font-mono leading-none truncate max-w-[120px]">
                  {user?.email || "user@example.com"}
                </p>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="text-[#6E6359]/60 hover:text-[#262626] transition-colors cursor-pointer"
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
