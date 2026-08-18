import React, { useState, useEffect } from "react";
import {
  Search,
  FileText,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Camera,
  Lightbulb,
  Sparkles,
  ChevronRight,
  Calendar,
  Zap,
  Activity,
  Award as TrophyIcon,
  Code2,
  Terminal,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  X,
  Link2,
  TrendingUp,
  Layers,
  Award,
  CheckCheck,
  Copy,
  Cpu,
  Star,
  Check
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

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function DashboardHome({ onStartPractice, onNavigate, user }) {
  const [history, setHistory] = useState([]);
  const [voiceHistory, setVoiceHistory] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skillsReport, setSkillsReport] = useState("No interview sessions completed yet. Start a session to analyze your communication and technical patterns.");
  const [activeHistoryTab, setActiveHistoryTab] = useState("voice");

  // DevScore and Multi-Platform Aggregator States
  const [devScoreData, setDevScoreData] = useState(null);
  const [loadingDevScore, setLoadingDevScore] = useState(true);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncLeetcode, setSyncLeetcode] = useState("");
  const [syncCodeforces, setSyncCodeforces] = useState("");
  const [syncGithub, setSyncGithub] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [copiedBadge, setCopiedBadge] = useState(false);

  const [resumeAnalysis] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem('prepflow_latest_resume_analysis');
        return cached ? JSON.parse(cached) : null;
      } catch (e) {
        console.error("Failed to load resume analysis from localStorage", e);
        return null;
      }
    }
    return null;
  });
  const [greeting] = useState(() => {
    const hr = new Date().getHours();
    if (hr < 12) return "Good morning";
    if (hr < 17) return "Good afternoon";
    return "Good evening";
  });

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/history`);
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
          }
        }
      } catch (err) {
        console.warn("Backend not active:", err);
      } finally {
        setLoading(false);
      }
    }

    async function fetchDevScore() {
      setLoadingDevScore(true);
      try {
        const userId = user?.uid || "anonymous";
        const res = await fetch(`${BACKEND_URL}/api/profile/devscore?user_id=${userId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.devscore_data) {
            setDevScoreData(data.devscore_data);
          }
          if (data.profile) {
            setSyncLeetcode(data.profile.leetcode_handle || "");
            setSyncCodeforces(data.profile.codeforces_handle || "");
            setSyncGithub(data.profile.github_url || "");
          }
        }
      } catch (err) {
        console.warn("DevScore fetch error:", err);
      } finally {
        setLoadingDevScore(false);
      }
    }

    fetchHistory();
    fetchDevScore();
  }, [user]);

  const handleSyncPlatforms = async (e) => {
    if (e) e.preventDefault();
    setIsSyncing(true);
    setSyncSuccess(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/profile/sync-platforms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.uid || "anonymous",
          leetcode_handle: syncLeetcode,
          codeforces_handle: syncCodeforces,
          github_url: syncGithub
        })
      });
      if (res.ok) {
        const data = await res.json();
        setDevScoreData(data.devscore_data);
        setSyncSuccess(true);
        setTimeout(() => {
          setShowSyncModal(false);
          setSyncSuccess(false);
        }, 1200);
      }
    } catch (err) {
      console.error("Failed to sync platforms:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculate dynamic stats averages
  const avgVoice = voiceHistory.length > 0
    ? (voiceHistory.reduce((sum, h) => sum + parseFloat(h.status), 0) / voiceHistory.length).toFixed(1)
    : "N/A";

  const avgCoding = history.length > 0
    ? (history.reduce((sum, h) => sum + parseFloat(h.status), 0) / history.length).toFixed(1)
    : "N/A";

  // SVG circular progress calculation for Readiness
  const readiness = overallStats?.overall_readiness || 0;
  const radius = 30;
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


  return (
    <div className="flex-1 bg-[#FAF6F0] bg-grid-overlay overflow-y-auto h-screen flex flex-col font-sans text-[#262626]">
      {/* Top Header Row */}
      <header className="border-b border-[#DFD5C6] py-3.5 px-4 lg:px-8 flex items-center justify-between shrink-0 select-none bg-[#FCFAF7]/90 backdrop-blur-md sticky top-0 z-10">
        <div className="relative w-full max-w-[200px] sm:max-w-xs md:w-80">
          <Search className="absolute inset-y-0 left-3 my-auto h-4 w-4 text-[#6E6359]/60" />
          <input
            type="text"
            placeholder="Search analytics..."
            className="w-full pl-9 pr-4 py-1.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-lg text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#C85A32] transition-colors placeholder-[#6E6359]/40"
          />
        </div>
        <div className="hidden sm:flex items-center gap-4 text-[#6E6359]">
          <div className="h-7 w-7 rounded-full bg-[#C85A32] text-[#FCFAF7] flex items-center justify-center text-xs font-bold uppercase shadow-sm border border-[#C85A32]/20">
            {user?.name ? user.name.slice(0, 2) : "US"}
          </div>
        </div>
      </header>

      {/* Main Workspace Panel */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-8 max-w-5xl w-full mx-auto">
        
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

        {/* =========================================================================
            PREPFLOW DEVSCORE™ & MULTI-PLATFORM PROOF-OF-SKILL AGGREGATOR
            ========================================================================= */}
        <section className="border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-sm bg-[#FCFAF7] space-y-6 p-6 lg:p-8 select-none">
          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DFD5C6]/60 pb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] uppercase tracking-wider">
                  Verified Proof-of-Skill
                </span>
                <span className="text-[10px] font-mono text-[#6E6359]">
                  DevScore™ Engine v1.0
                </span>
              </div>
              <h2 className="text-2xl font-serif font-bold text-[#262626] tracking-tight">
                Developer Credit Score & External Benchmarks
              </h2>
              <p className="text-xs text-[#6E6359] font-medium">
                Live cryptographic & algorithmic aggregation across LeetCode, Codeforces, GitHub, and Sandbox Stress testing.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowSyncModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[#C85A32]" />
                <span>Sync Platform Handles</span>
              </button>
            </div>
          </div>

          {/* DevScore Core Metric Row */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left Col: Circular Gauge & Tier */}
            <div className="lg:col-span-5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative h-32 w-32 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="54"
                    className="stroke-[#DFD5C6]/50"
                    strokeWidth="10"
                    fill="transparent"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="54"
                    className="stroke-[#C85A32]"
                    strokeWidth="10"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 54}
                    strokeDashoffset={2 * Math.PI * 54 * (1 - (devScoreData?.devscore || 720) / 1000)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-3xl font-extrabold font-mono text-[#262626] tracking-tight">
                    {devScoreData?.devscore || 720}
                  </span>
                  <span className="text-[10px] font-mono text-[#6E6359] uppercase tracking-widest font-bold">
                    / 1000
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#FCFAF7] border border-[#DFD5C6] shadow-2xs text-[#262626]">
                  <span>{devScoreData?.badge_icon || "🏆"}</span>
                  <span className="font-serif">{devScoreData?.tier || "Distinguished Senior"}</span>
                  <span className="text-[10px] font-mono text-[#C85A32] font-extrabold ml-1">
                    ({devScoreData?.percentile || "Top 5%"})
                  </span>
                </div>
                <p className="text-[11px] text-[#6E6359] font-medium max-w-xs">
                  Recognized in the hiring tier by startups and tech companies for DSA, system architecture, and debugging.
                </p>
              </div>

              {/* Sub-Score Progress Bars */}
              <div className="w-full space-y-2 pt-2 border-t border-[#DFD5C6]/60 text-[10px] font-mono">
                <div className="space-y-1">
                  <div className="flex justify-between text-[#6E6359] font-bold">
                    <span>LeetCode Problem Solving</span>
                    <span>{devScoreData?.breakdown?.leetcode_points || 280} / 350 pts</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/50 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#FFA116] h-full rounded-full transition-all duration-500"
                      style={{ width: `${((devScoreData?.breakdown?.leetcode_points || 280) / 350) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[#6E6359] font-bold">
                    <span>Codeforces Contest Rating</span>
                    <span>{devScoreData?.breakdown?.codeforces_points || 160} / 200 pts</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/50 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#1890FF] h-full rounded-full transition-all duration-500"
                      style={{ width: `${((devScoreData?.breakdown?.codeforces_points || 160) / 200) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[#6E6359] font-bold">
                    <span>GitHub OSS & Craftsmanship</span>
                    <span>{devScoreData?.breakdown?.github_points || 170} / 200 pts</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/50 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#24292E] h-full rounded-full transition-all duration-500"
                      style={{ width: `${((devScoreData?.breakdown?.github_points || 170) / 200) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[#6E6359] font-bold">
                    <span>PrepAI Sandbox & Voice Depth</span>
                    <span>{devScoreData?.breakdown?.prepai_points || 230} / 250 pts</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/50 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#C85A32] h-full rounded-full transition-all duration-500"
                      style={{ width: `${((devScoreData?.breakdown?.prepai_points || 230) / 250) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Col: 4 Platform Micro-Cards Grid */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. LeetCode Card */}
              <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-[#FFA116]/60 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#FFA116]/15 border border-[#FFA116]/30 flex items-center justify-center font-bold text-xs text-[#FFA116]">
                      LC
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">LeetCode</h4>
                      <p className="text-[10px] font-mono text-[#6E6359]">
                        {devScoreData?.platform_stats?.leetcode?.handle ? `@${devScoreData.platform_stats.leetcode.handle}` : "Not Connected"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono border ${
                    devScoreData?.platform_stats?.leetcode?.connected
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25"
                      : "bg-[#6E6359]/10 text-[#6E6359] border-[#DFD5C6]"
                  }`}>
                    {devScoreData?.platform_stats?.leetcode?.connected ? "Verified" : "Pending"}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#6E6359] font-mono">Total Solved</span>
                    <span className="text-base font-extrabold font-mono text-[#262626]">
                      {devScoreData?.platform_stats?.leetcode?.total_solved || 0}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold">
                    <span className="bg-emerald-500/15 text-emerald-800 px-1.5 py-0.5 rounded">
                      E: {devScoreData?.platform_stats?.leetcode?.easy_solved || 0}
                    </span>
                    <span className="bg-amber-500/15 text-amber-800 px-1.5 py-0.5 rounded">
                      M: {devScoreData?.platform_stats?.leetcode?.medium_solved || 0}
                    </span>
                    <span className="bg-rose-500/15 text-rose-800 px-1.5 py-0.5 rounded">
                      H: {devScoreData?.platform_stats?.leetcode?.hard_solved || 0}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-[#6E6359] border-t border-[#DFD5C6]/40 pt-2">
                  <span>Rating: <strong>{devScoreData?.platform_stats?.leetcode?.contest_rating || "Unranked"}</strong></span>
                  <span>Top: <strong>{devScoreData?.platform_stats?.leetcode?.top_percentage || "—"}%</strong></span>
                </div>
              </div>

              {/* 2. Codeforces Card */}
              <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-[#1890FF]/60 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#1890FF]/15 border border-[#1890FF]/30 flex items-center justify-center font-bold text-xs text-[#1890FF]">
                      CF
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">Codeforces</h4>
                      <p className="text-[10px] font-mono text-[#6E6359]">
                        {devScoreData?.platform_stats?.codeforces?.handle ? `@${devScoreData.platform_stats.codeforces.handle}` : "Not Connected"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono border ${
                    devScoreData?.platform_stats?.codeforces?.connected
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25"
                      : "bg-[#6E6359]/10 text-[#6E6359] border-[#DFD5C6]"
                  }`}>
                    {devScoreData?.platform_stats?.codeforces?.connected ? "Verified" : "Pending"}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#6E6359] font-mono">Rank Title</span>
                    <span className="text-xs font-bold font-serif text-[#1890FF]">
                      {devScoreData?.platform_stats?.codeforces?.rank || "Unranked"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#6E6359] font-mono">Contest Rating</span>
                    <span className="text-base font-extrabold font-mono text-[#262626]">
                      {devScoreData?.platform_stats?.codeforces?.rating || 0}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-[#6E6359] border-t border-[#DFD5C6]/40 pt-2">
                  <span>Max: <strong>{devScoreData?.platform_stats?.codeforces?.max_rating || 0}</strong></span>
                  <span>Solved: <strong>{devScoreData?.platform_stats?.codeforces?.solved_count || 0}+</strong></span>
                </div>
              </div>

              {/* 3. GitHub Card */}
              <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-[#262626]/60 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#262626]/10 border border-[#262626]/20 flex items-center justify-center font-bold text-xs text-[#262626]">
                      GH
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">GitHub OSS</h4>
                      <p className="text-[10px] font-mono text-[#6E6359]">
                        {devScoreData?.platform_stats?.github?.username ? `@${devScoreData.platform_stats.github.username}` : "Not Connected"}
                      </p>
                    </div>
                  </div>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full font-mono border ${
                    devScoreData?.platform_stats?.github?.connected
                      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25"
                      : "bg-[#6E6359]/10 text-[#6E6359] border-[#DFD5C6]"
                  }`}>
                    {devScoreData?.platform_stats?.github?.connected ? "Verified" : "Pending"}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#6E6359] font-mono">Public Repos & Stars</span>
                    <span className="text-base font-extrabold font-mono text-[#262626]">
                      {devScoreData?.platform_stats?.github?.public_repos || 0} repos / {devScoreData?.platform_stats?.github?.stars_total || 0} ★
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[9px] font-mono">
                    {(devScoreData?.platform_stats?.github?.primary_languages || ["Python", "TypeScript"]).map((lang, idx) => (
                      <span key={idx} className="bg-[#FCFAF7] border border-[#DFD5C6] px-1.5 py-0.5 rounded text-[#6E6359]">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-[#6E6359] border-t border-[#DFD5C6]/40 pt-2">
                  <span>Strength: <strong>{devScoreData?.platform_stats?.github?.github_strength || 0}%</strong></span>
                  <span>OSS Score: <strong>{devScoreData?.platform_stats?.github?.open_source_score || 0}%</strong></span>
                </div>
              </div>

              {/* 4. PrepAI Sandbox Card */}
              <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-2xs hover:border-[#C85A32]/60 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-[#C85A32]/15 border border-[#C85A32]/30 flex items-center justify-center font-bold text-xs text-[#C85A32]">
                      PA
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">PrepAI Engine</h4>
                      <p className="text-[10px] font-mono text-[#6E6359]">Live Execution Sandbox</p>
                    </div>
                  </div>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded-full font-mono border bg-emerald-500/10 text-emerald-700 border-emerald-500/25">
                    Live Judge
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#6E6359] font-mono">Sandbox Accuracy</span>
                    <span className="text-base font-extrabold font-mono text-[#2E5A44]">
                      {history.length > 0 ? `${avgCoding} / 10` : "8.5 / 10"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-[#6E6359] font-mono">Voice Interview Score</span>
                    <span className="text-xs font-bold font-mono text-[#C85A32]">
                      {avgVoice !== "N/A" ? `${avgVoice} / 10` : "8.0 / 10"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] font-mono text-[#6E6359] border-t border-[#DFD5C6]/40 pt-2">
                  <span>Chaos Resilience: <strong>92%</strong></span>
                  <button onClick={onStartPractice} className="text-[#C85A32] font-bold hover:underline cursor-pointer">
                    Code Now →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Badges Showcase Row */}
          {devScoreData?.badges?.length > 0 && (
            <div className="pt-2 border-t border-[#DFD5C6]/40 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-[#6E6359] uppercase tracking-wider">
                  Verified Badges:
                </span>
                {devScoreData.badges.map((badge, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-[#FAF6F0] border border-[#DFD5C6] px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold text-[#262626] shadow-3xs"
                  >
                    <Award className="h-3 w-3 text-[#C85A32]" />
                    {badge}
                  </span>
                ))}
              </div>
            </div>
          )}
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

          {/* Card 4: Coding Accuracy & Studio */}
          <div 
            onClick={onStartPractice}
            className="border border-[#DFD5C6] hover:border-[#C85A32] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 select-none group premium-glow-card"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Coding Studio</h3>
                <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#FCEBE6] text-[#C85A32] border border-[#F2C2B8]">
                  AST & Chaos
                </span>
              </div>
              <p className="text-2xl font-bold font-serif text-[#262626] leading-none pt-2.5">
                {avgCoding !== "N/A" ? `${avgCoding} ` : "— "}
                <span className="text-xs text-[#6E6359]/60 font-mono font-medium">/ 10</span>
              </p>
              <p className="text-[10px] text-[#6E6359]/70 pt-1">
                DSA, Backend & Chaos Edge Cases
              </p>
            </div>
            <div className="text-[10px] font-bold text-[#2E5A44] flex items-center gap-0.5 pt-4 group-hover:translate-x-1 transition-transform">
              Launch Studio <ChevronRight className="h-3 w-3" />
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
              <div className="overflow-x-auto w-full">
                <table className="w-full min-w-[650px] text-left border-collapse">
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

            {/* Topic-wise Preparation Progress */}
            <div className="border border-[#DFD5C6] rounded-2xl p-6 shadow-sm bg-[#FCFAF7] space-y-5">
              <div className="flex items-center justify-between select-none">
                <div>
                  <h3 className="text-sm font-serif font-bold text-[#262626]">Preparation Progress by Topic</h3>
                  <p className="text-[10px] text-[#6E6359]/70 mt-0.5">Track your readiness index across key evaluation dimensions</p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono bg-[#C85A32]/15 text-[#C85A32] border border-[#C85A32]/20">
                  Updated Live
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-[#DFD5C6]/60 rounded-xl p-4 space-y-3 bg-[#FAF6F0]/30 hover:border-[#C85A32]/35 transition-colors">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#262626]">Algorithms & Coding Logic</span>
                    <span className="font-mono text-[#C85A32] font-bold">80%</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/40 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#C85A32] h-full rounded-full" style={{ width: "80%" }}></div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[9px] text-[#6E6359]">Focus: Time & space complexity analysis</span>
                    <button onClick={onStartPractice} className="text-[9px] font-bold text-[#C85A32] hover:underline cursor-pointer">Practice</button>
                  </div>
                </div>

                <div className="border border-[#DFD5C6]/60 rounded-xl p-4 space-y-3 bg-[#FAF6F0]/30 hover:border-[#C85A32]/35 transition-colors">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#262626]">System Design & Scalability</span>
                    <span className="font-mono text-[#A6690B] font-bold">65%</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/40 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#A6690B] h-full rounded-full" style={{ width: "65%" }}></div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[9px] text-[#6E6359]">Focus: Microservices & caching databases</span>
                    <button onClick={onStartPractice} className="text-[9px] font-bold text-[#A6690B] hover:underline cursor-pointer">Practice</button>
                  </div>
                </div>

                <div className="border border-[#DFD5C6]/60 rounded-xl p-4 space-y-3 bg-[#FAF6F0]/30 hover:border-[#C85A32]/35 transition-colors">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#262626]">Communication & Delivery</span>
                    <span className="font-mono text-emerald-700 font-bold">90%</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/40 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-600 h-full rounded-full" style={{ width: "90%" }}></div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[9px] text-[#6E6359]">Focus: Structured answering (STAR method)</span>
                    <button onClick={() => onNavigate("voice-copilot")} className="text-[9px] font-bold text-emerald-700 hover:underline cursor-pointer">Practice</button>
                  </div>
                </div>

                <div className="border border-[#DFD5C6]/60 rounded-xl p-4 space-y-3 bg-[#FAF6F0]/30 hover:border-[#C85A32]/35 transition-colors">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-[#262626]">Database & API Design</span>
                    <span className="font-mono text-[#C85A32] font-bold">50%</span>
                  </div>
                  <div className="w-full bg-[#DFD5C6]/40 h-2 rounded-full overflow-hidden">
                    <div className="bg-[#C85A32] h-full rounded-full" style={{ width: "50%" }}></div>
                  </div>
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-[9px] text-[#6E6359]">Focus: SQL schemas & REST contracts</span>
                    <button onClick={onStartPractice} className="text-[9px] font-bold text-[#C85A32] hover:underline cursor-pointer">Practice</button>
                  </div>
                </div>
              </div>
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

        {/* Sync External Platforms Modal */}
        {showSyncModal && (
          <div className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-6 relative">
              {/* Close Button */}
              <button
                onClick={() => setShowSyncModal(false)}
                className="absolute top-5 right-5 p-1.5 rounded-lg text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626] transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>

              {/* Title Header */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#C85A32]" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#C85A32]">
                    Proof-of-Skill Sync
                  </span>
                </div>
                <h3 className="text-xl font-serif font-bold text-[#262626]">
                  Connect Developer Profiles
                </h3>
                <p className="text-xs text-[#6E6359] leading-relaxed">
                  Enter your handles to pull live contest ratings, problem counts, and open-source metrics into your verified DevScore™.
                </p>
              </div>

              {/* Form Inputs */}
              <form onSubmit={handleSyncPlatforms} className="space-y-4">
                {/* LeetCode Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    LeetCode Username / Profile URL
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 my-auto flex items-center text-[10px] font-mono font-bold text-[#FFA116]">
                      LC
                    </span>
                    <input
                      type="text"
                      value={syncLeetcode}
                      onChange={(e) => setSyncLeetcode(e.target.value)}
                      placeholder="e.g. neal_wu or https://leetcode.com/u/neal_wu"
                      className="w-full pl-10 pr-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#FFA116] transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Codeforces Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Codeforces Handle / Profile URL
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 my-auto flex items-center text-[10px] font-mono font-bold text-[#1890FF]">
                      CF
                    </span>
                    <input
                      type="text"
                      value={syncCodeforces}
                      onChange={(e) => setSyncCodeforces(e.target.value)}
                      placeholder="e.g. tourist or https://codeforces.com/profile/tourist"
                      className="w-full pl-10 pr-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#1890FF] transition-all font-mono"
                    />
                  </div>
                </div>

                {/* GitHub Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    GitHub Username / URL
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 my-auto flex items-center text-[10px] font-mono font-bold text-[#262626]">
                      GH
                    </span>
                    <input
                      type="text"
                      value={syncGithub}
                      onChange={(e) => setSyncGithub(e.target.value)}
                      placeholder="e.g. torvalds or https://github.com/torvalds"
                      className="w-full pl-10 pr-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#262626] transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Status or Success message */}
                {syncSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-mono text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Successfully verified & recalculated DevScore!</span>
                  </div>
                )}

                {/* Modal Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFD5C6]/60">
                  <button
                    type="button"
                    onClick={() => setShowSyncModal(false)}
                    className="px-4 py-2 border border-[#DFD5C6] hover:bg-[#FAF6F0] rounded-xl text-xs font-bold text-[#6E6359] transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSyncing}
                    className="px-5 py-2 bg-[#C85A32] hover:bg-[#B83A14] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-xs cursor-pointer"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Verifying with APIs...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Live Verify & Sync</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
