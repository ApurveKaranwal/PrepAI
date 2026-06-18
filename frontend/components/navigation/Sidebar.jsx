"use client";

import React from "react";
import { LayoutDashboard, Video, BarChart3, LogOut, Plus, FileText, Mic } from "lucide-react";

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, onStartPractice }) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "interviews", label: "Interviews", icon: Video },
    { id: "voice-copilot", label: "Voice Copilot", icon: Mic },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "resume-analyzer", label: "Resume Analyzer", icon: FileText },
  ];

  return (
    <aside className="w-64 border-r border-[#DFD5C6] bg-[#FCFAF7] flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
      {/* Top Section */}
      <div className="p-6 space-y-8">
        {/* Brand */}
        <div>
          <h1 className="font-serif font-semibold text-xl tracking-tight text-[#262626] flex items-center gap-1.5 select-none">
            PrepFlow <span className="text-[#C85A32]">AI</span>
          </h1>
          <p className="text-[10px] font-mono text-[#6E6359]/70 uppercase tracking-widest mt-0.5">
            Interview Workspace
          </p>
        </div>

        {/* Menu Items */}
        <nav className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-bold tracking-wide transition-all ${
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
        {/* Start Practice Action */}
        <button
          onClick={onStartPractice}
          className="w-full bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-3 px-4 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Start Practice
        </button>

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
  );
}

