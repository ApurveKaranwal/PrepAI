import React, { useState, useEffect } from "react";
import {
  Search,
  FileText,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Camera,
  Lightbulb,
  TrendingUp,
  Sparkles,
  ChevronRight,
  Award,
  Mic,
  Calendar,
  Zap,
  Activity,
  Award as TrophyIcon
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip
} from "recharts";

export default function DashboardHome({ onStartPractice, onNavigate, user }) {
  const [history, setHistory] = useState([]);
  const [voiceHistory, setVoiceHistory] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skillsReport, setSkillsReport] = useState("No interview sessions completed yet. Start a session to analyze your communication and technical patterns.");
  const [activeHistoryTab, setActiveHistoryTab] = useState("voice");
  const [resumeAnalysis, setResumeAnalysis] = useState(null);
  const [greeting, setGreeting] = useState("Welcome back");

  useEffect(() => {
    // Dynamic greeting based on time of day
    const hr = new Date().getHours();
    if (hr < 12) setGreeting("Good morning");
    else if (hr < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

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
            if (data.voice_history) {
              setVoiceHistory(data.voice_history);
            }
            if (data.overall_stats) {
              setOverallStats(data.overall_stats);
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
      
      setHistory([]);
      setVoiceHistory([]);
      setOverallStats(null);
      setSkillsReport("No interview sessions completed yet. Start a session to analyze your communication and technical patterns.");
      setLoading(false);
    }
    fetchHistory();
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('prepflow_latest_resume_analysis');
      if (cached) {
        setResumeAnalysis(JSON.parse(cached));
      }
    } catch (e) {
      console.error("Failed to load resume analysis from localStorage", e);
    }
  }, []);

  // Calculate dynamic stats averages
  const avgVoice = voiceHistory.length > 0
    ? (voiceHistory.reduce((sum, h) => sum + parseFloat(h.status), 0) / voiceHistory.length).toFixed(1)
    : "N/A";

  const avgCoding = history.length > 0
    ? (history.reduce((sum, h) => sum + parseFloat(h.status), 0) / history.length).toFixed(1)
    : "N/A";

  // SVG circular progress calculation for Readiness
  const readiness = overallStats?.overall_readiness || 0;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (readiness / 100) * circumference;

  // Format matrix data for RadarChart
  const competencyData = [
    { subject: "Tech Knowledge", score: overallStats?.technical_knowledge || 70, fullMark: 100 },
    { subject: "Communication", score: overallStats?.communication || 75, fullMark: 100 },
    { subject: "Problem Solving", score: overallStats?.problem_solving || 70, fullMark: 100 },
    { subject: "System Design", score: overallStats?.system_design || 70, fullMark: 100 },
    { subject: "Behavioral", score: overallStats?.ownership || 70, fullMark: 100 },
  ];

  // Custom tooltips for Recharts
  const CustomRadarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#FCFAF7] border border-[#DFD5C6] p-2 rounded-md shadow-lg text-[11px]">
          <p className="font-serif font-bold text-[#262626]">{payload[0].name}</p>
          <p className="font-mono text-[#C85A32] font-extrabold mt-0.5">{payload[0].value}%</p>
        </div>
      );
    }
    return null;
  };

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

      {/* Main Workspace Panel */}
      <main className="flex-1 p-6 lg:p-8 space-y-8 max-w-5xl w-full mx-auto">
        
        {/* Top Greeting Block */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-[#DFD5C6]/40 select-none">
          <div className="space-y-1">
            <h1 className="text-3xl font-serif font-medium tracking-tight text-[#262626]">
              {greeting}, <span className="text-[#C85A32] font-semibold">{user?.name || "Ready Prep Flow"}</span>
            </h1>
            <p className="text-xs text-[#6E6359] font-medium">
              Monitor your active competency assessments, speak freely with AI voice guides, and optimize your ATS scoring.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-[#FCFAF7] border border-[#DFD5C6] px-3.5 py-1.5 rounded-lg shadow-2xs">
            <Activity className="h-4 w-4 text-[#C85A32] animate-pulse" />
            <span className="text-[10px] font-mono font-bold text-[#6E6359] uppercase tracking-wider">
              System Active
            </span>
          </div>
        </div>

        {/* Editorial Split-Screen Banner */}
        <section className="grid grid-cols-1 lg:grid-cols-5 gap-6 border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-sm bg-[#FCFAF7] premium-glow-card">
          {/* Left Block: Editorial Summary */}
          <div className="lg:col-span-3 p-6 lg:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-[#C85A32]/10 border border-[#C85A32]/25 px-2.5 py-1 rounded-full text-[10px] font-bold text-[#C85A32] font-mono uppercase tracking-wider">
                <Sparkles className="h-3 w-3 animate-spin duration-3000" />
                AI Skills Profile Report
              </div>
              <h2 className="font-serif text-2xl font-semibold leading-tight text-[#262626]">
                Performance Insight Summary
              </h2>
              <p className="text-xs text-[#6E6359] leading-relaxed font-medium">
                {skillsReport}
              </p>
            </div>
            
            {(history.length > 0 || voiceHistory.length > 0) && (
              <div className="flex flex-wrap gap-2 pt-2 select-none">
                {history.slice(0, 1).map((h, idx) => (
                  <div key={idx} className="bg-[#FAF6F0] border border-[#DFD5C6] px-3 py-1.5 rounded-lg text-[10px] font-mono text-[#6E6359] font-medium flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#C85A32]" />
                    Latest Coding: {h.session}
                  </div>
                ))}
                {voiceHistory.slice(0, 1).map((h, idx) => (
                  <div key={idx} className="bg-[#FAF6F0] border border-[#DFD5C6] px-3 py-1.5 rounded-lg text-[10px] font-mono text-[#C85A32] font-medium flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#A6690B]" />
                    Latest Voice: {h.session}
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Right Block: Recharts RadarChart Visual */}
          <div className="lg:col-span-2 p-6 bg-[#FAF6F0]/50 border-t lg:border-t-0 lg:border-l border-[#DFD5C6] flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-full flex items-center justify-between mb-4 px-2 select-none">
              <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359]">
                Competency Matrix
              </h3>
              <span className="text-[10px] text-[#C85A32] font-semibold flex items-center gap-1">
                <TrophyIcon className="h-3 w-3" />
                Dynamic
              </span>
            </div>
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={competencyData}>
                  <PolarGrid stroke="#DFD5C6" />
                  <PolarAngleAxis 
                    dataKey="subject" 
                    tick={{ fill: "#6E6359", fontSize: 9, fontWeight: 700 }}
                  />
                  <PolarRadiusAxis 
                    angle={30} 
                    domain={[0, 100]} 
                    tick={{ fill: "#6E6359", fontSize: 8 }}
                    tickCount={3}
                  />
                  <Radar 
                    name="Competency" 
                    dataKey="score" 
                    stroke="#C85A32" 
                    fill="#C85A32" 
                    fillOpacity={0.2} 
                    strokeWidth={2}
                  />
                  <RechartsTooltip content={<CustomRadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Premium Stat Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          
          {/* Card 1: Blended Readiness Circle */}
          <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex items-center justify-between select-none premium-glow-card transition-all hover:-translate-y-0.5">
            <div className="space-y-1.5">
              <h3 className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Readiness</h3>
              <p className="text-lg font-bold font-serif text-[#262626] leading-tight">Blended Score</p>
              <p className="text-[10px] text-[#6E6359]/70">Logic and speech output</p>
            </div>
            <div className="relative h-18 w-18 flex items-center justify-center shrink-0 animate-float">
              <svg className="absolute transform -rotate-90 w-full h-full">
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  className="stroke-[#DFD5C6]/40"
                  strokeWidth="6"
                  fill="transparent"
                />
                <circle
                  cx="36"
                  cy="36"
                  r={radius}
                  className="stroke-[#C85A32]"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </svg>
              <div className="flex flex-col items-center justify-center">
                <span className="text-sm font-extrabold font-mono text-[#262626]">
                  {readiness}%
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Voice Copilot */}
          <div 
            onClick={() => onNavigate("voice-copilot")}
            className="border border-[#DFD5C6] hover:border-[#C85A32] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 select-none group premium-glow-card"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Voice Copilot</h3>
                <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#FAF4EB] text-[#A6690B] border border-[#F2E0C9]">
                  Speech
                </span>
              </div>
              <p className="text-2xl font-bold font-serif text-[#262626] leading-none pt-2.5">
                {avgVoice !== "N/A" ? `${avgVoice} ` : "— "}
                <span className="text-xs text-[#6E6359]/60 font-mono font-medium">/ 10</span>
              </p>
              <p className="text-[10px] text-[#6E6359]/70 pt-1">
                {voiceHistory.length} speaking practices
              </p>
            </div>
            <div className="text-[10px] font-bold text-[#C85A32] flex items-center gap-0.5 pt-4 group-hover:translate-x-1 transition-transform">
              Practice speaking <ChevronRight className="h-3 w-3" />
            </div>
          </div>

          {/* Card 3: Resume ATS Strength */}
          <div 
            onClick={() => onNavigate("resume-analyzer")}
            className="border border-[#DFD5C6] hover:border-[#C85A32] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 select-none group premium-glow-card"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Resume Score</h3>
                <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#E8F2EC] text-[#2E5A44] border border-[#B3D6C2]">
                  ATS
                </span>
              </div>
              <p className="text-2xl font-bold font-serif text-[#262626] leading-none pt-2.5">
                {resumeAnalysis ? `${resumeAnalysis.analysis.ats_score}%` : "—"}
              </p>
              <p className="text-[10px] text-[#6E6359]/70 pt-1 truncate max-w-full">
                {resumeAnalysis ? `Match for ${resumeAnalysis.jobRole}` : "No scanned resume PDF"}
              </p>
            </div>
            <div className="text-[10px] font-bold text-[#A6690B] flex items-center gap-0.5 pt-4 group-hover:translate-x-1 transition-transform">
              {resumeAnalysis ? "Review details" : "Scan resume"} <ChevronRight className="h-3 w-3" />
            </div>
          </div>

          {/* Card 4: Coding Accuracy */}
          <div 
            onClick={onStartPractice}
            className="border border-[#DFD5C6] hover:border-[#C85A32] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 select-none group premium-glow-card"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Coding Averages</h3>
                <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#FCEBE6] text-[#C85A32] border border-[#F2C2B8]">
                  Logic
                </span>
              </div>
              <p className="text-2xl font-bold font-serif text-[#262626] leading-none pt-2.5">
                {avgCoding !== "N/A" ? `${avgCoding} ` : "— "}
                <span className="text-xs text-[#6E6359]/60 font-mono font-medium">/ 10</span>
              </p>
              <p className="text-[10px] text-[#6E6359]/70 pt-1">
                {history.length} coding sessions
              </p>
            </div>
            <div className="text-[10px] font-bold text-[#2E5A44] flex items-center gap-0.5 pt-4 group-hover:translate-x-1 transition-transform">
              Practice coding <ChevronRight className="h-3 w-3" />
            </div>
          </div>

        </section>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Main Left: Double-Tabbed Performance History */}
          <div className="lg:col-span-2 space-y-4">
            
            <div className="flex items-center justify-between border-b border-[#DFD5C6] pb-2 select-none">
              <h2 className="text-base font-serif font-bold text-[#262626]">Performance History</h2>
              
              {/* Tab Selector */}
              <div className="flex gap-1 bg-[#FAF6F0] p-1 border border-[#DFD5C6] rounded-xl shadow-2xs">
                <button
                  onClick={() => setActiveHistoryTab("voice")}
                  className={`px-3.5 py-1.5 text-[10px] font-bold tracking-wide rounded-lg transition-all cursor-pointer ${
                    activeHistoryTab === "voice"
                      ? "bg-[#C85A32] text-[#FCFAF7] shadow-sm"
                      : "text-[#6E6359] hover:text-[#262626]"
                  }`}
                >
                  Voice Copilot
                </button>
                <button
                  onClick={() => setActiveHistoryTab("coding")}
                  className={`px-3.5 py-1.5 text-[10px] font-bold tracking-wide rounded-lg transition-all cursor-pointer ${
                    activeHistoryTab === "coding"
                      ? "bg-[#C85A32] text-[#FCFAF7] shadow-sm"
                      : "text-[#6E6359] hover:text-[#262626]"
                  }`}
                >
                  Coding Sessions
                </button>
              </div>
            </div>
            
            {/* History Table Container */}
            <div className="border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-sm bg-[#FCFAF7]">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#DFD5C6] bg-[#FAF6F0] text-[10px] font-mono text-[#6E6359] uppercase select-none">
                    <th className="py-3.5 px-5 font-semibold">Session Name</th>
                    <th className="py-3.5 px-5 font-semibold">Date Completed</th>
                    <th className="py-3.5 px-5 font-semibold">Overall Score</th>
                    <th className="py-3.5 px-5 font-semibold">Duration</th>
                    <th className="py-3.5 px-5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DFD5C6]/60 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-[#6E6359]/70">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-[#C85A32]" />
                        Syncing workspace stats...
                      </td>
                    </tr>
                  ) : activeHistoryTab === "voice" ? (
                    // Voice History Rows
                    voiceHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[#6E6359]/70 font-medium font-serif">
                          No Voice Copilot sessions finished yet. Start one to view metrics!
                        </td>
                      </tr>
                    ) : (
                      voiceHistory.map((row) => (
                        <tr key={row.id} className="hover:bg-[#FAF6F0]/40 transition-colors">
                          <td className="py-4 px-5 font-serif font-bold text-[#262626]">
                            {row.session}
                          </td>
                          <td className="py-4 px-5 text-[#6E6359] font-medium flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-[#6E6359]/55" />
                            {row.date}
                          </td>
                          <td className="py-4 px-5">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F2EC] text-[#2E5A44] border border-[#B3D6C2]">
                              {row.status}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-[#6E6359] font-mono">{row.duration}</td>
                          <td className="py-4 px-5 text-right">
                            <button
                              onClick={() => onNavigate("analytics")}
                              className="border border-[#DFD5C6] hover:border-[#C85A32] bg-[#FCFAF7] text-[#6E6359] hover:text-[#C85A32] hover:bg-[#C85A32]/5 py-1 px-3 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer"
                            >
                              Review Analytics
                            </button>
                          </td>
                        </tr>
                      ))
                    )
                  ) : (
                    // Coding History Rows
                    history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[#6E6359]/70 font-medium font-serif">
                          No coding practice sessions finished yet.
                        </td>
                      </tr>
                    ) : (
                      history.map((row) => (
                        <tr key={row.id} className="hover:bg-[#FAF6F0]/40 transition-colors">
                          <td className="py-4 px-5 font-serif font-bold text-[#262626]">
                            {row.session}
                          </td>
                          <td className="py-4 px-5 text-[#6E6359] font-medium flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-[#6E6359]/55" />
                            {row.date}
                          </td>
                          <td className="py-4 px-5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              parseFloat(row.status) >= 8.0
                                ? "bg-[#E8F2EC] text-[#2E5A44] border border-[#B3D6C2]"
                                : "bg-[#FAF4EB] text-[#A6690B] border border-[#F2E0C9]"
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="py-4 px-5 text-[#6E6359] font-mono">{row.duration}</td>
                          <td className="py-4 px-5 text-right">
                            <button
                              onClick={onStartPractice}
                              className="border border-[#DFD5C6] hover:border-[#C85A32] bg-[#FCFAF7] text-[#6E6359] hover:text-[#C85A32] hover:bg-[#C85A32]/5 py-1 px-3 rounded-lg text-[10px] font-bold transition-all shadow-2xs cursor-pointer"
                            >
                              Review Recording
                            </button>
                          </td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>

          </div>

          {/* Right Column: Widgets */}
          <div className="space-y-6">
            
            {/* Widget 1: Resume & GitHub Status */}
            <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] space-y-4 premium-glow-card">
              <div className="flex items-center gap-3 select-none">
                <div className="h-10 w-10 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl flex items-center justify-center text-[#6E6359] shadow-2xs">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#262626] font-serif">Resume & GitHub</h3>
                  <p className="text-[10px] text-[#6E6359]/70 mt-0.5">
                    {resumeAnalysis ? `ATS Score: ${resumeAnalysis.analysis.ats_score}%` : "No resume connected"}
                  </p>
                </div>
              </div>
              
              <p className="text-xs text-[#6E6359] leading-relaxed font-medium">
                {resumeAnalysis 
                  ? `Active resume: "${resumeAnalysis.fileName}" analyzed on ${resumeAnalysis.date || 'recently'}.` 
                  : "Connect a repository or upload your resume (PDF) to customize active practice prompts."}
              </p>
              
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => onNavigate("resume-analyzer")}
                  className="w-full border border-[#DFD5C6] hover:border-[#C85A32] bg-[#FCFAF7] text-[#6E6359] hover:text-[#C85A32] py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  Manage Resume
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={onStartPractice}
                  className="w-full bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  Quick Prep Session
                  <Zap className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Widget 2: AI Focus Areas & Checklist */}
            {overallStats?.improvements && overallStats.improvements.length > 0 && (
              <div className="border border-[#DFD5C6] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] space-y-4">
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359] select-none">
                  Recommended Focus Areas
                </h3>
                <div className="space-y-3.5 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                  {overallStats.improvements.map((imp, idx) => {
                    let Icon = Lightbulb;
                    let colorClass = "bg-[#FAF6F0] text-[#6E6359] border-[#DFD5C6] border-l-[3px] border-l-[#6E6359]";
                    if (imp.type === "warning") {
                      Icon = AlertCircle;
                      colorClass = "bg-[#FAF4EB] text-[#A6690B] border-[#F2E0C9] border-l-[3px] border-l-[#A6690B]";
                    } else if (imp.type === "camera") {
                      Icon = Camera;
                      colorClass = "bg-[#FCEBE6] text-[#C85A32] border-[#F2C2B8] border-l-[3px] border-l-[#C85A32]";
                    }
                    
                    return (
                      <div key={idx} className={`border rounded-lg p-3 space-y-1.5 transition-all hover:scale-[1.01] ${colorClass}`}>
                        <div className="flex items-center gap-2 text-xs font-bold font-serif">
                          <Icon className="h-3.5 w-3.5" />
                          {imp.title}
                        </div>
                        <p className="text-[10px] leading-relaxed opacity-90 font-medium">
                          {imp.detail}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

        </div>
      </main>
    </div>
  );
}
