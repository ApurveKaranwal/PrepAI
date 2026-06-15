"use client";

import React, { useState, useEffect } from "react";
import { Search, Bell, HelpCircle, FileText, ArrowRight, ExternalLink, RefreshCw } from "lucide-react";

export default function DashboardHome({ onStartPractice, user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [skillsReport, setSkillsReport] = useState("No interview sessions completed yet. Start a session to analyze your communication and technical patterns.");

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("http://localhost:8001/api/history");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            if (data.dashboard_history) {
              setHistory(data.dashboard_history);
            }
            if (data.skills_report) {
              setSkillsReport(data.skills_report);
            }
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn("Backend not active:", err);
      }
      
      // No fallback dummy data — show empty state
      setHistory([]);
      setSkillsReport("No interview sessions completed yet. Start a session to analyze your communication and technical patterns.");
      setLoading(false);
    }
    fetchHistory();
  }, []);

  return (
    <div className="flex-1 bg-white overflow-y-auto h-screen flex flex-col">
      {/* Top Header Row */}
      <header className="border-b border-slate-100 py-3.5 px-8 flex items-center justify-between shrink-0 select-none bg-white">
        <div className="relative w-80">
          <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search analytics..."
            className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-transparent rounded-lg text-xs text-black focus:outline-none focus:bg-white focus:border-gray-200 transition-colors"
          />
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <button className="hover:text-black transition-colors">
            <Bell className="h-4.5 w-4.5" />
          </button>
          <button className="hover:text-black transition-colors">
            <HelpCircle className="h-4.5 w-4.5" />
          </button>
          <div className="h-7 w-7 rounded-full bg-[#4F46E5] text-white flex items-center justify-center text-xs font-bold uppercase shadow-sm">
            {user?.name ? user.name.slice(0, 2) : "US"}
          </div>
        </div>
      </header>

      {/* Workspace Panel */}
      <main className="flex-1 p-8 space-y-8 max-w-5xl w-full mx-auto">
        
        {/* Banner: AI Skills Profile Report */}
        <section className="border border-slate-100 rounded-xl p-6 shadow-xs bg-white space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-900 font-mono uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-[#4F46E5]"></span>
            AI Skills Profile Report
          </div>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            {skillsReport}
          </p>
          {history.length > 0 && (
            <div className="flex gap-2 pt-1">
              {history.slice(0, 3).map((h, idx) => (
                <span key={idx} className="bg-gray-50 border border-gray-100 px-3 py-1 rounded-full text-[10px] font-mono text-gray-500">
                  {h.session} ({h.date})
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Left: Performance History */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-base font-bold text-black select-none">Performance History</h2>
            
            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-gray-50/50 text-[10px] font-mono text-gray-400 uppercase select-none">
                    <th className="py-3 px-5 font-semibold">Session</th>
                    <th className="py-3 px-5 font-semibold">Date</th>
                    <th className="py-3 px-5 font-semibold">Status</th>
                    <th className="py-3 px-5 font-semibold">Duration</th>
                    <th className="py-3 px-5 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gray-300" />
                        Loading history...
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-400">
                        No history available. Start a practice session!
                      </td>
                    </tr>
                  ) : (
                    history.map((row) => (
                      <tr key={row.id} className="hover:bg-gray-50/20 transition-colors">
                        <td className="py-3.5 px-5 font-bold text-gray-900">{row.session}</td>
                        <td className="py-3.5 px-5 text-gray-500">{row.date}</td>
                        <td className="py-3.5 px-5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            parseFloat(row.status) >= 8.0
                              ? "bg-green-50 text-green-700 border border-green-100"
                              : "bg-yellow-50 text-yellow-700 border border-yellow-100"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-gray-500 font-mono">{row.duration}</td>
                        <td className="py-3.5 px-5">
                          <button
                            onClick={onStartPractice}
                            className="border border-slate-100 hover:border-gray-300 bg-white text-gray-700 hover:text-black py-1 px-3 rounded-md text-[10px] font-semibold transition-colors shadow-2xs"
                          >
                            Review Recording
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Column: Widgets */}
          <div className="space-y-6 select-none">
            
            {/* Widget 1: Resume & GitHub */}
            <div className="border border-slate-100 rounded-xl p-5 shadow-xs bg-white space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center text-slate-700">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
                    <path d="M9 18c-4.51 2-5-2-7-2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-gray-900">Resume & GitHub</h3>
                  <p className="text-[10px] text-gray-400 mt-0.5">Ingested repository code</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Improve your stats by uploading an updated resume or connecting a repository.
              </p>
              <button
                onClick={onStartPractice}
                className="w-full border border-gray-200 hover:border-black bg-white text-black hover:bg-gray-50/50 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1"
              >
                Quick Prep
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Widget 2: Booking Mock */}
            <div className="bg-black text-white rounded-xl p-5 shadow-xs relative overflow-hidden space-y-4">
              <div className="space-y-1 z-10 relative">
                <h3 className="text-sm font-bold tracking-tight">Ready for the real thing?</h3>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Complete a live mock interview with an industry expert from Vercel or Notion.
                </p>
              </div>
              
              <button className="w-full bg-white hover:bg-gray-100 text-black py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1 z-10 relative shadow-sm">
                Book Live Mock
                <ExternalLink className="h-3.5 w-3.5" />
              </button>

              {/* Back decoration */}
              <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-zinc-800 rounded-full opacity-30 blur-lg"></div>
            </div>

          </div>

        </div>
      </main>
    </div>
  );
}
