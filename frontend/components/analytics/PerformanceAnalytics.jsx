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
  Activity,
  MessageSquare,
  ShieldCheck,
  Brain,
  Video
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer
} from "recharts";

const CustomAreaTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#FCFAF7] border border-[#DFD5C6] p-2.5 rounded-lg shadow-lg text-[11px]">
        <p className="font-bold text-[#6E6359]">{payload[0].payload.date}</p>
        <p className="font-serif font-extrabold text-[#262626] mt-0.5 truncate max-w-[150px]">{payload[0].payload.role}</p>
        <p className="font-mono text-[#C85A32] font-bold mt-1">Score: {payload[0].value}%</p>
      </div>
    );
  }
  return null;
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function PerformanceAnalytics({ user }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Stats states
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
        const res = await fetch(`${BACKEND_URL}/api/history`);
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

  // Format history for AreaChart (reversing to plot oldest to newest)
  const chartData = [...history]
    .reverse()
    .map((h) => ({
      date: h.date,
      scoreValue: parseFloat(h.score.replace("%", "")),
      role: h.role
    }));

  return (
    <div className="flex-1 bg-[#FAF6F0] bg-grid-overlay overflow-y-auto h-screen flex flex-col font-sans text-[#262626]">
      {/* Top Header Row */}
      <header className="border-b border-[#DFD5C6] py-3.5 px-8 flex items-center justify-between shrink-0 select-none bg-[#FCFAF7]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="relative w-80">
          <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#6E6359]/60" />
          <input
            type="text"
            placeholder="Search analytics..."
            className="w-full pl-9 pr-4 py-1.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-lg text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#C85A32] transition-colors placeholder-[#6E6359]/40"
          />
        </div>
        <div className="flex items-center gap-4 text-[#6E6359]">
          <div className="h-7 w-7 rounded-full bg-[#C85A32] text-[#FCFAF7] flex items-center justify-center text-xs font-bold uppercase shadow-sm border border-[#C85A32]/20">
            {user?.name ? user.name.slice(0, 2) : "US"}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 lg:p-8 space-y-8 max-w-5xl w-full mx-auto">
        
        {/* Title Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#DFD5C6]/40 select-none">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif font-medium tracking-tight text-[#262626]">Performance Analytics</h1>
            <p className="text-xs text-[#6E6359] font-medium">
              A comprehensive breakdown of your interview readiness and AI-driven skill assessment.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#FCFAF7] border border-[#DFD5C6] px-3 py-1.5 rounded-lg shadow-2xs">
            <Activity className="h-4 w-4 text-[#C85A32] animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-[#6E6359] uppercase tracking-wider">
              Real-time engine
            </span>
          </div>
        </div>

        {/* Analytics Summary Cards (Donut + Subscores) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Donut circle - Overall Readiness */}
          <div className="border border-[#DFD5C6] rounded-2xl p-6 shadow-sm bg-[#FCFAF7] flex flex-col items-center justify-between text-center min-h-[300px] premium-glow-card select-none">
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359]">
              Overall Readiness
            </h3>

            {/* Circular Donut Indicator */}
            <div className="relative w-36 h-36 flex items-center justify-center my-4 animate-float">
              {/* Outer ring */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#FAF6F0"
                  strokeWidth="7"
                  fill="transparent"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#C85A32"
                  strokeWidth="7.5"
                  fill="transparent"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * overallReadiness) / 100}
                  strokeLinecap="round"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              {/* Center text */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-3xl font-extrabold text-[#262626] font-mono">{overallReadiness}</span>
                <span className="px-2 py-0.5 rounded-full text-[8px] font-bold bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 font-mono uppercase tracking-wider mt-1.5">
                  {overallReadiness >= 85 ? "Expert Level" : overallReadiness >= 70 ? "Intermediate" : "Beginner"}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#6E6359] px-2 font-medium leading-relaxed">
              {overallReadiness > 0
                ? `Your interview readiness index is calculated at ${overallReadiness}% based on your dynamic feedback loops.`
                : "No readiness rating. Complete your first practice session to run an AI assessment."}
            </p>

            {/* Questions Correct Footer */}
            {totalAnswers > 0 && (
              <div className="mt-4 flex items-center justify-between border-t border-[#DFD5C6]/60 pt-3.5 px-2 w-full">
                <span className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Accuracy</span>
                <span className="text-xs font-extrabold text-[#C85A32] font-mono">
                  {correctAnswers} <span className="text-[#6E6359]/60 font-medium">/ {totalAnswers} correct</span>
                </span>
              </div>
            )}
          </div>

          {/* Subscores 2x2 grid */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 select-none">
            
            {/* Communication */}
            <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between premium-glow-card">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359] flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-[#C85A32]" />
                  Communication
                </span>
                <span className="text-sm font-extrabold text-[#262626] font-mono">{communication}/100</span>
              </div>
              <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-4 overflow-hidden border border-[#DFD5C6]/30">
                <div className="h-full bg-[#C85A32] rounded-full" style={{ width: `${communication}%` }} />
              </div>
              <p className="text-[11px] text-[#6E6359] mt-4 leading-relaxed font-medium">
                {communication >= 85 ? "Excellent clarity, structured framing, and professional conversation pacing." : "Solid delivery. Focus on pausing naturally instead of using sound fillers."}
              </p>
            </div>

            {/* Technical Knowledge */}
            <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between premium-glow-card">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359] flex items-center gap-1.5">
                  <Brain className="h-4 w-4 text-[#A6690B]" />
                  Technical Knowledge
                </span>
                <span className="text-sm font-extrabold text-[#262626] font-mono">{technical}/100</span>
              </div>
              <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-4 overflow-hidden border border-[#DFD5C6]/30">
                <div className="h-full bg-[#A6690B] rounded-full" style={{ width: `${technical}%` }} />
              </div>
              <p className="text-[11px] text-[#6E6359] mt-4 leading-relaxed font-medium">
                {technical >= 80 ? "Comprehensive codebase architecture details and strong core concept awareness." : "Good foundations. Focus on providing deeper code level specifications."}
              </p>
            </div>

            {/* Body Language */}
            <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between premium-glow-card">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359] flex items-center gap-1.5">
                  <Video className="h-4 w-4 text-[#2E5A44]" />
                  Body Language
                </span>
                <span className="text-sm font-extrabold text-[#262626] font-mono">{bodyLanguage}/100</span>
              </div>
              <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-4 overflow-hidden border border-[#DFD5C6]/30">
                <div className="h-full bg-[#2E5A44] rounded-full" style={{ width: `${bodyLanguage}%` }} />
              </div>
              <p className="text-[11px] text-[#6E6359] mt-4 leading-relaxed font-medium">
                {bodyLanguage >= 80 ? "Consistent posture and active presentation focus maintained throughout." : "Frequent gaze diversions detected. Maintain consistent focus on the screen."}
              </p>
            </div>

            {/* Confidence */}
            <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between premium-glow-card">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359] flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-[#6E6359]" />
                  Confidence
                </span>
                <span className="text-sm font-extrabold text-[#262626] font-mono">{confidence}/100</span>
              </div>
              <div className="w-full bg-[#FAF6F0] h-1.5 rounded-full mt-4 overflow-hidden border border-[#DFD5C6]/30">
                <div className="h-full bg-[#6E6359] rounded-full" style={{ width: `${confidence}%` }} />
              </div>
              <p className="text-[11px] text-[#6E6359] mt-4 leading-relaxed font-medium">
                {confidence >= 80 ? "Assertive communication and rapid technical decision explanation." : "Flow is steady, but minor hesitation patterns were detected during complex analysis."}
              </p>
            </div>

          </div>
        </section>

        {/* Historical Score Progression Chart */}
        {history.length > 0 && (
          <section className="border border-[#DFD5C6] rounded-2xl p-6 bg-[#FCFAF7] space-y-4 premium-glow-card select-none">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-serif font-semibold text-[#262626]">
                  Interview Score Progression
                </h3>
                <p className="text-[10px] text-[#6E6359] font-medium">
                  Track your overall mock session ratings sequentially over time
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold text-[#C85A32] uppercase bg-[#C85A32]/10 border border-[#C85A32]/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Score Trend
              </span>
            </div>
            
            <div className="w-full h-56 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="scoreColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C85A32" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#C85A32" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#DFD5C6" opacity={0.4} vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fill: '#6E6359', fontSize: 9, fontWeight: 600 }}
                    stroke="#DFD5C6"
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fill: '#6E6359', fontSize: 9 }}
                    stroke="#DFD5C6"
                  />
                  <RechartsTooltip content={<CustomAreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="scoreValue"
                    stroke="#C85A32"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#scoreColor)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Bottom Section: Top Improvements + Session History */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-2">
          
          {/* Left: Top Improvements */}
          <div className="space-y-4">
            <h3 className="text-base font-serif font-bold text-[#262626] select-none">Top Improvements</h3>
            
            <div className="space-y-3.5">
              {improvements.length === 0 ? (
                <div className="text-xs text-[#6E6359]/60 py-12 text-center select-none bg-[#FCFAF7] border border-[#DFD5C6] border-dashed rounded-2xl font-medium">
                  No improvements suggested yet. Complete an interview to analyze.
                </div>
              ) : (
                improvements.map((imp, idx) => {
                  const isWarning = imp.type === "warning";
                  const isLightbulb = imp.type === "lightbulb";
                  const cardBg = isWarning 
                    ? "bg-[#FCEBE6]/60 border-l-[3px] border-l-[#C85A32] border border-[#FCEBE6]" 
                    : isLightbulb 
                    ? "bg-[#FAF4EB]/60 border-l-[3px] border-l-[#A6690B] border border-[#FAF4EB]" 
                    : "bg-[#FAF6F0]/60 border-l-[3px] border-l-[#6E6359] border border-[#FAF6F0]";
                  const iconColor = isWarning 
                    ? "text-[#C85A32]" 
                    : isLightbulb 
                    ? "text-[#A6690B]" 
                    : "text-[#6E6359]";
                  
                  return (
                    <div key={idx} className={`${cardBg} p-4 rounded-r-xl flex gap-3 shadow-2xs transition-all hover:scale-[1.01] duration-150`}>
                      {isWarning && <AlertTriangle className={`h-4.5 w-4.5 ${iconColor} shrink-0 mt-0.5`} />}
                      {isLightbulb && <Lightbulb className={`h-4.5 w-4.5 ${iconColor} shrink-0 mt-0.5`} />}
                      {!isWarning && !isLightbulb && <Camera className={`h-4.5 w-4.5 ${iconColor} shrink-0 mt-0.5`} />}
                      
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-[#262626] font-serif leading-tight">
                          {imp.title}
                        </h4>
                        <p className="text-[11px] text-[#6E6359] leading-relaxed font-medium">
                          {imp.detail}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right: Session History */}
          <div className="space-y-4">
            <div className="flex items-center justify-between select-none">
              <h3 className="text-base font-serif font-bold text-[#262626]">Session History</h3>
              <button className="flex items-center gap-1.5 text-[10px] font-mono text-[#6E6359] hover:text-[#C85A32] uppercase tracking-wider font-bold cursor-pointer transition-colors">
                <Download className="h-3.5 w-3.5" />
                Export Data
              </button>
            </div>

            <div className="border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-sm bg-[#FCFAF7]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DFD5C6] bg-[#FAF6F0] text-xs text-[#262626] font-serif font-bold select-none">
                    <th className="py-3.5 px-5">Date</th>
                    <th className="py-3.5 px-5">Role</th>
                    <th className="py-3.5 px-5">Score</th>
                    <th className="py-3.5 px-5">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFD5C6]/60 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#6E6359]/70">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#DFD5C6]" />
                        Loading session history...
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-[#6E6359]/70 font-medium font-serif">
                        No session history records.
                      </td>
                    </tr>
                  ) : (
                    history.map((row, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF6F0]/40 transition-colors">
                        <td className="py-3.5 px-5 text-[#6E6359] font-mono">{row.date}</td>
                        <td className="py-3.5 px-5 font-bold text-[#262626] font-serif">{row.role}</td>
                        <td className="py-3.5 px-5 font-bold text-[#262626] font-mono">{row.score}</td>
                        <td className="py-3.5 px-5 select-none">
                          {row.trend === "up" && (
                            <span className="inline-flex items-center gap-1 text-[#2E5A44] font-bold bg-[#E8F2EC] px-2 py-0.5 rounded-full border border-[#B3D6C2] text-[10px]">
                              <TrendingUp className="h-3 w-3" /> Up
                            </span>
                          )}
                          {row.trend === "down" && (
                            <span className="inline-flex items-center gap-1 text-[#C85A32] font-bold bg-[#FCEBE6] px-2 py-0.5 rounded-full border border-[#F2C2B8] text-[10px]">
                              <TrendingDown className="h-3 w-3" /> Down
                            </span>
                          )}
                          {row.trend === "neutral" && (
                            <span className="inline-flex items-center gap-1 text-[#6E6359] font-bold bg-[#FAF6F0] px-2 py-0.5 rounded-full border border-[#DFD5C6] text-[10px]">
                              <Minus className="h-3 w-3" /> Flat
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
      <footer className="py-6 text-center text-[10px] text-[#6E6359]/60 border-t border-[#DFD5C6]/40 select-none">
        © 2026 PrepFlow AI Performance Engine. All data is processed using proprietary LLMs.
      </footer>
    </div>
  );
}
