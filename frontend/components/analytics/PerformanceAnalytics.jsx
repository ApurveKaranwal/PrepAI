"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  AlertTriangle,
  Lightbulb,
  Camera,
  RefreshCw,
  Search,
  Bell,
  HelpCircle
} from "lucide-react";

export default function PerformanceAnalytics({ user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Real stats states
  const [overallReadiness, setOverallReadiness] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [technical, setTechnical] = useState(0);
  const [bodyLanguage, setBodyLanguage] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [improvements, setImprovements] = useState([]);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalAnswers, setTotalAnswers] = useState(0);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("http://localhost:8001/api/history");
        if (res.ok) {
          const data = await res.json();
          if (data) {
            if (data.analytics_history) {
              setHistory(data.analytics_history);
            }
            if (data.overall_stats) {
              setOverallReadiness(data.overall_stats.overall_readiness || 0);
              setCommunication(data.overall_stats.communication || 0);
              setTechnical(data.overall_stats.technical_knowledge || 0);
              setBodyLanguage(data.overall_stats.body_language || 0);
              setConfidence(data.overall_stats.confidence || 0);
              setImprovements(data.overall_stats.improvements || []);
              setCorrectAnswers(data.overall_stats.correct_answers || 0);
              setTotalAnswers(data.overall_stats.total_answers || 0);
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
      setOverallReadiness(0);
      setCommunication(0);
      setTechnical(0);
      setBodyLanguage(0);
      setConfidence(0);
      setImprovements([]);
      setCorrectAnswers(0);
      setTotalAnswers(0);
      setLoading(false);
    }
    fetchHistory();
  }, []);

  return (
    <div className="flex-1 bg-white overflow-y-auto h-screen flex flex-col font-sans text-black">
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

      {/* Main Container */}
      <main className="flex-1 p-8 space-y-8 max-w-5xl w-full mx-auto select-none">
        
        {/* Title Block */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Performance Analytics</h1>
          <p className="text-xs text-gray-500 mt-1">
            A comprehensive breakdown of your interview readiness and AI-driven skill assessment.
          </p>
        </div>

        {/* Analytics Summary Cards (Donut + Subscores) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Donut circle - Overall Readiness */}
          <div className="border border-slate-100 rounded-xl p-6 shadow-xs bg-white flex flex-col items-center justify-between text-center min-h-[260px]">
            <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest font-semibold">
              Overall Readiness
            </span>

            {/* Circular Donut Indicator */}
            <div className="relative w-36 h-36 flex items-center justify-center my-3">
              {/* Outer ring */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#f3f4f6"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="black"
                  strokeWidth="9"
                  fill="transparent"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * overallReadiness) / 100}
                  strokeLinecap="round"
                />
              </svg>
              {/* Center text */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-black">{overallReadiness}</span>
                <span className="text-[10px] text-gray-500 font-semibold font-mono uppercase tracking-wider">
                  {overallReadiness >= 85 ? "Expert Level" : overallReadiness >= 70 ? "Intermediate" : "Beginner"}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-500 px-3 pb-2">
              {overallReadiness > 0
                ? `Your interview readiness index is calculated at ${overallReadiness}% based on your dynamic feedback loops.`
                : "No readiness rating. Complete your first practice session to run an AI assessment."}
            </p>

            {/* Questions Correct Footer */}
            {totalAnswers > 0 && (
              <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 pb-1 px-3 w-full">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest font-semibold">Questions Correct</span>
                <span className="text-sm font-extrabold text-[#4F46E5]">{correctAnswers} <span className="text-gray-400 font-medium">/ {totalAnswers}</span></span>
              </div>
            )}
          </div>

          {/* Subscores 2x2 grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Communication */}
            <div className="border border-slate-100 rounded-xl p-5 shadow-xs bg-white flex flex-col justify-between">
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-semibold">Communication</span>
                <span className="text-sm font-extrabold text-black">{communication}/100</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${communication}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                {communication >= 85 ? "Excellent clarity, structured framing, and professional conversation pacing." : "Solid delivery. Focus on pausing naturally instead of using sound fillers."}
              </p>
            </div>

            {/* Technical Knowledge */}
            <div className="border border-slate-100 rounded-xl p-5 shadow-xs bg-white flex flex-col justify-between">
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-semibold">Technical Knowledge</span>
                <span className="text-sm font-extrabold text-black">{technical}/100</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${technical}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                {technical >= 80 ? "Comprehensive codebase architecture details and strong core concept awareness." : "Good foundations. Focus on providing deeper code level specifications."}
              </p>
            </div>

            {/* Body Language */}
            <div className="border border-slate-100 rounded-xl p-5 shadow-xs bg-white flex flex-col justify-between">
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-semibold">Body Language</span>
                <span className="text-sm font-extrabold text-black">{bodyLanguage}/100</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${bodyLanguage}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                {bodyLanguage >= 80 ? "Consistent posture and active presentation focus maintained throughout." : "Frequent gaze diversions detected. Maintain consistent focus on the screen."}
              </p>
            </div>

            {/* Confidence */}
            <div className="border border-slate-100 rounded-xl p-5 shadow-xs bg-white flex flex-col justify-between">
              <div className="flex justify-between items-baseline">
                <span className="text-[10px] font-mono text-gray-400 uppercase tracking-wider font-semibold">Confidence</span>
                <span className="text-sm font-extrabold text-black">{confidence}/100</span>
              </div>
              <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${confidence}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                {confidence >= 80 ? "Assertive communication and rapid technical decision explanation." : "Flow is steady, but minor hesitation patterns were detected during complex analysis."}
              </p>
            </div>

          </div>
        </section>

        {/* Bottom Section: Top Improvements + Session History */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
          
          {/* Left: Top Improvements */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-black">Top Improvements</h2>
            
            <div className="space-y-3">
              {improvements.length === 0 ? (
                <div className="text-xs text-gray-400 py-6 text-center select-none bg-gray-50/20 border border-dashed rounded-lg">
                  No improvements suggested yet. Complete an interview to analyze.
                </div>
              ) : (
                improvements.map((imp, idx) => (
                  <div key={idx} className="ai-feedback-accent p-4 rounded-r-lg flex gap-3">
                    {imp.type === "warning" && <AlertTriangle className="h-4 w-4 text-[#4F46E5] shrink-0 mt-0.5" />}
                    {imp.type === "lightbulb" && <Lightbulb className="h-4 w-4 text-[#4F46E5] shrink-0 mt-0.5" />}
                    {imp.type === "camera" && <Camera className="h-4 w-4 text-[#4F46E5] shrink-0 mt-0.5" />}
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-gray-900 leading-none">
                        {imp.title}
                      </h4>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        {imp.detail}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Session History */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-black">Session History</h2>
              <button className="flex items-center gap-1 text-[10px] font-mono text-gray-400 hover:text-black uppercase tracking-wider font-semibold">
                <Download className="h-3.5 w-3.5" />
                Export Data
              </button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-xs bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-gray-50/50 text-[10px] font-mono text-gray-400 uppercase">
                    <th className="py-3 px-5 font-semibold">Date</th>
                    <th className="py-3 px-5 font-semibold">Role</th>
                    <th className="py-3 px-5 font-semibold">Score</th>
                    <th className="py-3 px-5 font-semibold">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-gray-300" />
                        Loading session history...
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-400">
                        No session history records.
                      </td>
                    </tr>
                  ) : (
                    history.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/20 transition-colors">
                        <td className="py-3.5 px-5 text-gray-500 font-mono">{row.date}</td>
                        <td className="py-3.5 px-5 font-bold text-gray-900">{row.role}</td>
                        <td className="py-3.5 px-5 font-bold text-gray-900 font-mono">{row.score}</td>
                        <td className="py-3.5 px-5">
                          {row.trend === "up" && (
                            <span className="inline-flex items-center gap-0.5 text-green-600 font-semibold">
                              <TrendingUp className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {row.trend === "down" && (
                            <span className="inline-flex items-center gap-0.5 text-red-600 font-semibold">
                              <TrendingDown className="h-3.5 w-3.5" />
                            </span>
                          )}
                          {row.trend === "neutral" && (
                            <span className="inline-flex items-center gap-0.5 text-gray-400 font-semibold">
                              <Minus className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </section>
      </main>

      {/* Footer info */}
      <footer className="py-6 text-center text-[10px] text-gray-400 border-t border-slate-50 select-none">
        © 2026 PrepAI Performance Engine. All data is processed using proprietary LLMs.
      </footer>
    </div>
  );
}
