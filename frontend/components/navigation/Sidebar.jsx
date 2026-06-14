"use client";

import React from "react";
import { LayoutDashboard, Video, BarChart3, Settings, LogOut, Plus } from "lucide-react";

export default function Sidebar({ activeTab, setActiveTab, user, onLogout, onStartPractice }) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "interviews", label: "Interviews", icon: Video },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-100 bg-white flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
      {/* Top Section */}
      <div className="p-6 space-y-8">
        {/* Brand */}
        <div>
          <h1 className="font-extrabold text-xl tracking-tight text-black flex items-center gap-1.5">
            PrepAI
          </h1>
          <p className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mt-0.5">
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
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-colors ${
                  isActive
                    ? "bg-gray-100 text-black"
                    : "text-gray-500 hover:text-black hover:bg-gray-50/50"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-[#4F46E5]" : "text-gray-400"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section */}
      <div className="p-6 space-y-6 border-t border-gray-50">
        {/* Start Practice Action */}
        <button
          onClick={onStartPractice}
          className="w-full bg-black hover:bg-gray-900 text-white py-3 px-4 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Start Practice
        </button>

        {/* Profile Card */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm">
              {user?.name ? user.name.slice(0, 2) : "US"}
            </div>
            <div className="text-left">
              <p className="text-xs font-bold text-gray-900 leading-tight">
                {user?.name || "User"}
              </p>
              <p className="text-[10px] text-gray-400 font-mono leading-none truncate max-w-[120px]">
                {user?.email || "user@example.com"}
              </p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="text-gray-400 hover:text-black transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
