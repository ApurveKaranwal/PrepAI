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
  Check,
  Edit3,
  Trash2
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

export default function DashboardHome({ onNavigate, user }) {
  const [voiceHistory, setVoiceHistory] = useState([]);
  const [overallStats, setOverallStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [skillsReport, setSkillsReport] = useState("No interview sessions completed yet. Start a session to analyze your communication and technical patterns.");

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
            
            {voiceHistory.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 select-none">
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
            <div className="w-full h-56 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
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
            PREPFLOW DEVSCORE™ & EXTERNAL BENCHMARK MATRIX
            ========================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-0 border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-sm bg-[#FCFAF7] select-none premium-glow-card">
          
          {/* LEFT PANEL (5 cols): Editorial DevScore Overview */}
          <div className="lg:col-span-5 p-6 lg:p-8 flex flex-col justify-between space-y-6 border-b lg:border-b-0 lg:border-r border-[#DFD5C6]">
            
            {/* Header & Category Badge */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 bg-[#C85A32]/10 border border-[#C85A32]/25 px-2.5 py-1 rounded-full text-[10px] font-bold text-[#C85A32] font-mono uppercase tracking-wider">
                  <ShieldCheck className="h-3 w-3" />
                  Proof-of-Skill Rating
                </div>
                <button
                  onClick={() => setShowSyncModal(true)}
                  className="text-[11px] font-mono font-bold text-[#C85A32] hover:text-[#B83A14] flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Sync Handles</span>
                </button>
              </div>

              <h2 className="font-serif text-2xl font-semibold leading-tight text-[#262626]">
                Engineering DevScore™
              </h2>
              <p className="text-xs text-[#6E6359] leading-relaxed font-medium">
                Cryptographic skill rating aggregated across external competitive programming platforms, open-source repositories, and verified sandbox stress tests.
              </p>
            </div>

            {/* Score Display & Gauge Row */}
            <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-[#6E6359] uppercase tracking-wider block">
                  Unified Rating
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold font-mono text-[#262626] tracking-tight">
                    {devScoreData?.devscore || 0}
                  </span>
                  <span className="text-xs font-mono text-[#6E6359] font-bold">
                    / 1000
                  </span>
                </div>
                <div className="inline-flex items-center gap-1.5 pt-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C85A32]" />
                  <span className="text-xs font-serif font-bold text-[#262626]">
                    {devScoreData?.tier || "Apprentice"}
                  </span>
                  <span className="text-[10px] font-mono text-[#6E6359]">
                    • {devScoreData?.percentile || "Baseline"}
                  </span>
                </div>
              </div>

              <div className="relative h-20 w-20 flex items-center justify-center shrink-0">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    className="stroke-[#DFD5C6]/50"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    className="stroke-[#C85A32]"
                    strokeWidth="6"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - (devScoreData?.devscore || 0) / 1000)}
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute text-[11px] font-mono font-bold text-[#C85A32]">
                  {Math.round(((devScoreData?.devscore || 0) / 1000) * 100)}%
                </span>
              </div>
            </div>

            {/* Score Breakdown Table */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-mono font-bold text-[#6E6359] uppercase tracking-wider block">
                Rating Breakdown
              </span>
              <div className="space-y-2 text-[11px] font-mono">
                <div className="flex justify-between items-center py-1 border-b border-[#DFD5C6]/40">
                  <span className="text-[#6E6359]">LeetCode DSA</span>
                  <span className="font-bold text-[#262626]">{devScoreData?.breakdown?.leetcode_points ?? 0} / 350 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#DFD5C6]/40">
                  <span className="text-[#6E6359]">Codeforces Contest</span>
                  <span className="font-bold text-[#262626]">{devScoreData?.breakdown?.codeforces_points ?? 0} / 200 pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-[#DFD5C6]/40">
                  <span className="text-[#6E6359]">GitHub Open Source</span>
                  <span className="font-bold text-[#262626]">{devScoreData?.breakdown?.github_points ?? 0} / 200 pts</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-[#6E6359]">PrepAI Live Sandbox</span>
                  <span className="font-bold text-[#C85A32]">{devScoreData?.breakdown?.prepai_points ?? 0} / 250 pts</span>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT PANEL (7 cols): Clean Platform Verification List */}
          <div className="lg:col-span-7 p-6 lg:p-8 bg-[#FAF6F0]/40 flex flex-col justify-between space-y-6">
            
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#DFD5C6]/60 pb-3">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359]">
                  Platform Verification Matrix
                </span>
                <span className="text-[10px] text-[#C85A32] font-semibold font-mono">
                  Live Sync
                </span>
              </div>

              {/* Matrix List (4 unified rows with prominent highlighted metric chips) */}
              <div className="space-y-3">
                {/* 1. LeetCode Row */}
                <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs transition-all hover:border-[#DFD5C6]">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#FAF6F0] border border-[#DFD5C6] flex items-center justify-center text-[#D97706] shrink-0 mt-0.5 sm:mt-0">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#262626]">LeetCode</span>
                        {devScoreData?.platform_stats?.leetcode?.handle && (
                          <span className="text-[10px] font-mono text-[#6E6359] font-bold">@{devScoreData.platform_stats.leetcode.handle}</span>
                        )}
                      </div>
                      
                      {devScoreData?.platform_stats?.leetcode?.connected ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                            <strong className="text-[#D97706]">{devScoreData.platform_stats.leetcode.total_solved}</strong> Solved
                          </span>
                          <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                            Easy: {devScoreData.platform_stats.leetcode.easy_solved}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-amber-800 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                            Med: {devScoreData.platform_stats.leetcode.medium_solved}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-rose-800 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded">
                            Hard: {devScoreData.platform_stats.leetcode.hard_solved}
                          </span>
                          {devScoreData.platform_stats.leetcode.contest_rating && (
                            <span className="font-mono text-[10px] text-[#6E6359] font-medium ml-1">
                              Rating: <strong className="text-[#262626] font-bold">{devScoreData.platform_stats.leetcode.contest_rating}</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-[#D97706] bg-[#D97706]/10 border border-[#D97706]/20 px-2 py-0.5 rounded-md">
                            +350 pts potential
                          </span>
                          <span className="text-[11px] text-[#6E6359] font-medium">
                            Verify algorithmic problem solving counts & contest rank
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {devScoreData?.platform_stats?.leetcode?.connected ? (
                      <>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-800 border border-emerald-500/25 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Verified</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSyncLeetcode(devScoreData?.platform_stats?.leetcode?.handle || "");
                            setShowSyncModal(true);
                          }}
                          className="px-2.5 py-1 bg-[#FAF6F0] hover:bg-[#262626] hover:text-white border border-[#DFD5C6] hover:border-[#262626] rounded-lg text-[11px] font-mono font-bold text-[#6E6359] transition-all cursor-pointer shadow-3xs flex items-center gap-1.5"
                          title="Replace or update connected LeetCode account"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Replace</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowSyncModal(true)}
                        className="px-3 py-1 bg-[#FAF6F0] hover:bg-[#262626] hover:text-white border border-[#DFD5C6] rounded-lg text-xs font-mono font-bold text-[#262626] transition-all cursor-pointer shadow-3xs flex items-center gap-1"
                      >
                        <span>+ Connect</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Codeforces Row */}
                <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs transition-all hover:border-[#DFD5C6]">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#FAF6F0] border border-[#DFD5C6] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 7.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-3 0V9a1.5 1.5 0 0 1 1.5-1.5z" fill="#FFA116"/>
                        <path d="M12 3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-3 0v-15A1.5 1.5 0 0 1 12 3z" fill="#2563EB"/>
                        <path d="M19.5 12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-3 0v-6a1.5 1.5 0 0 1 1.5-1.5z" fill="#EF4444"/>
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#262626]">Codeforces</span>
                        {devScoreData?.platform_stats?.codeforces?.handle && (
                          <span className="text-[10px] font-mono text-[#6E6359] font-bold">@{devScoreData.platform_stats.codeforces.handle}</span>
                        )}
                      </div>

                      {devScoreData?.platform_stats?.codeforces?.connected ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#2563EB] bg-[#2563EB]/10 border border-[#2563EB]/25 px-2 py-0.5 rounded-md">
                            {devScoreData.platform_stats.codeforces.rank}
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                            Rating: <strong className="text-[#2563EB]">{devScoreData.platform_stats.codeforces.rating}</strong>
                          </span>
                          <span className="font-mono text-[10px] text-[#6E6359]">
                            Max: <strong className="text-[#262626]">{devScoreData.platform_stats.codeforces.max_rating}</strong>
                          </span>
                          {devScoreData.platform_stats.codeforces.solved_count && (
                            <span className="font-mono text-[10px] text-[#6E6359]">
                              Solved: <strong className="text-[#262626]">{devScoreData.platform_stats.codeforces.solved_count}+</strong>
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-[#2563EB] bg-[#2563EB]/10 border border-[#2563EB]/20 px-2 py-0.5 rounded-md">
                            +200 pts potential
                          </span>
                          <span className="text-[11px] text-[#6E6359] font-medium">
                            Verify competitive contest rank and international rating
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {devScoreData?.platform_stats?.codeforces?.connected ? (
                      <>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-800 border border-emerald-500/25 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Verified</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSyncCodeforces(devScoreData?.platform_stats?.codeforces?.handle || "");
                            setShowSyncModal(true);
                          }}
                          className="px-2.5 py-1 bg-[#FAF6F0] hover:bg-[#262626] hover:text-white border border-[#DFD5C6] hover:border-[#262626] rounded-lg text-[11px] font-mono font-bold text-[#6E6359] transition-all cursor-pointer shadow-3xs flex items-center gap-1.5"
                          title="Replace or update connected Codeforces account"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Replace</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowSyncModal(true)}
                        className="px-3 py-1 bg-[#FAF6F0] hover:bg-[#262626] hover:text-white border border-[#DFD5C6] rounded-lg text-xs font-mono font-bold text-[#262626] transition-all cursor-pointer shadow-3xs flex items-center gap-1"
                      >
                        <span>+ Connect</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. GitHub Row */}
                <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs transition-all hover:border-[#DFD5C6]">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#FAF6F0] border border-[#DFD5C6] flex items-center justify-center text-[#262626] shrink-0 mt-0.5 sm:mt-0">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                      </svg>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#262626]">GitHub Open Source</span>
                        {devScoreData?.platform_stats?.github?.username && (
                          <span className="text-[10px] font-mono text-[#6E6359] font-bold">@{devScoreData.platform_stats.github.username}</span>
                        )}
                      </div>

                      {devScoreData?.platform_stats?.github?.connected ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                            <strong className="text-[#C85A32]">{devScoreData.platform_stats.github.public_repos}</strong> Repositories
                          </span>
                          <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                            <strong className="text-[#D97706]">{devScoreData.platform_stats.github.stars_total}</strong> Stars
                          </span>
                          {(devScoreData.platform_stats.github.primary_languages || []).map((lang, idx) => (
                            <span key={idx} className="px-1.5 py-0.5 rounded bg-[#FAF6F0] border border-[#DFD5C6] font-mono text-[9px] font-bold text-[#262626]">
                              {lang}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono font-bold text-[#334155] bg-[#334155]/10 border border-[#334155]/20 px-2 py-0.5 rounded-md">
                            +200 pts potential
                          </span>
                          <span className="text-[11px] text-[#6E6359] font-medium">
                            Index repository craftsmanship, commit consistency, and stars
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {devScoreData?.platform_stats?.github?.connected ? (
                      <>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-800 border border-emerald-500/25 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          <span>Verified</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSyncGithub(devScoreData?.platform_stats?.github?.username || "");
                            setShowSyncModal(true);
                          }}
                          className="px-2.5 py-1 bg-[#FAF6F0] hover:bg-[#262626] hover:text-white border border-[#DFD5C6] hover:border-[#262626] rounded-lg text-[11px] font-mono font-bold text-[#6E6359] transition-all cursor-pointer shadow-3xs flex items-center gap-1.5"
                          title="Replace or update connected GitHub account"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Replace</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setShowSyncModal(true)}
                        className="px-3 py-1 bg-[#FAF6F0] hover:bg-[#262626] hover:text-white border border-[#DFD5C6] rounded-lg text-xs font-mono font-bold text-[#262626] transition-all cursor-pointer shadow-3xs flex items-center gap-1"
                      >
                        <span>+ Connect</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. PrepAI Live Sandbox Row */}
                <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-3xs transition-all hover:border-[#DFD5C6]">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-[#FAF6F0] border border-[#DFD5C6] flex items-center justify-center text-[#C85A32] shrink-0 mt-0.5 sm:mt-0">
                      <Terminal className="h-4 w-4" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#262626]">PrepAI Interview Engine</span>
                        <span className="text-[9px] font-mono font-bold px-2 py-0.2 rounded-md bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/25">
                          AI Grilling
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                          {avgVoice !== "N/A" ? `${avgVoice} / 10` : "8.0 / 10"} Voice Depth
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center">
                    <button
                      onClick={() => onNavigate("interviews")}
                      className="px-3 py-1 bg-[#C85A32]/10 hover:bg-[#C85A32] text-[#C85A32] hover:text-white border border-[#C85A32]/30 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer shadow-3xs flex items-center gap-1.5"
                    >
                      <span>Start Interview</span>
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Badges */}
            {devScoreData?.badges?.length > 0 && (
              <div className="pt-2 border-t border-[#DFD5C6]/60 flex items-center gap-2 flex-wrap">
                <span className="text-[9px] font-mono font-bold text-[#6E6359] uppercase tracking-wider">
                  Badges:
                </span>
                {devScoreData.badges.map((badge, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 bg-[#FCFAF7] border border-[#DFD5C6] px-2 py-0.5 rounded text-[9px] font-mono font-bold text-[#262626]"
                  >
                    <Award className="h-3 w-3 text-[#C85A32]" />
                    {badge}
                  </span>
                ))}
              </div>
            )}

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

          {/* Card 4: Interviews */}
          <div 
            onClick={() => onNavigate("interviews")}
            className="border border-[#DFD5C6] hover:border-[#C85A32] rounded-2xl p-5 shadow-sm bg-[#FCFAF7] flex flex-col justify-between cursor-pointer transition-all hover:-translate-y-0.5 select-none group premium-glow-card"
          >
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">Interviews</h3>
                <span className="px-1.5 py-0.5 rounded-md text-[8px] font-bold bg-[#FCEBE6] text-[#C85A32] border border-[#F2C2B8]">
                  AI Grilling
                </span>
              </div>
              <p className="text-2xl font-bold font-serif text-[#262626] leading-none pt-2.5">
                {avgVoice !== "N/A" ? `${avgVoice} ` : "— "}
                <span className="text-xs text-[#6E6359]/60 font-mono font-medium">/ 10</span>
              </p>
              <p className="text-[10px] text-[#6E6359]/70 pt-1">
                Technical & Behavioral Mock Interviews
              </p>
            </div>
            <div className="text-[10px] font-bold text-[#2E5A44] flex items-center gap-0.5 pt-4 group-hover:translate-x-1 transition-transform">
              Start Interview <ChevronRight className="h-3 w-3" />
            </div>
          </div>

        </section>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Main Left: Double-Tabbed Performance History */}
          <div className="lg:col-span-2 space-y-4">
            
            <div className="flex items-center justify-between border-b border-[#DFD5C6] pb-2 select-none">
              <h2 className="text-base font-serif font-bold text-[#262626]">Performance History</h2>
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
                    ) : voiceHistory.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[#6E6359]/70 font-medium font-serif">
                          No interview sessions finished yet. Start one to view metrics!
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
                    <button onClick={() => onNavigate("interviews")} className="text-[9px] font-bold text-[#C85A32] hover:underline cursor-pointer">Practice</button>
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
                    <button onClick={() => onNavigate("interviews")} className="text-[9px] font-bold text-[#A6690B] hover:underline cursor-pointer">Practice</button>
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
                    <button onClick={() => onNavigate("interviews")} className="text-[9px] font-bold text-[#C85A32] hover:underline cursor-pointer">Practice</button>
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
                  onClick={() => onNavigate("interviews")}
                  className="w-full bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  Start Interview
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
                    Proof-of-Skill Accounts
                  </span>
                </div>
                <h3 className="text-xl font-serif font-bold text-[#262626]">
                  Connect & Replace Profiles
                </h3>
                <p className="text-xs text-[#6E6359] leading-relaxed">
                  Enter new handles to replace existing accounts or link new ones. Live APIs will re-verify metrics and recalculate your unified DevScore™.
                </p>
              </div>

              {/* Form Inputs */}
              <form onSubmit={handleSyncPlatforms} className="space-y-4">
                {/* LeetCode Input */}
                <div className="space-y-1.5 p-3 rounded-xl bg-[#FAF6F0]/60 border border-[#DFD5C6]/70">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold font-mono text-[#262626] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#D97706]" />
                      LeetCode Account
                    </label>
                    {devScoreData?.platform_stats?.leetcode?.handle && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#6E6359] bg-[#FAF6F0] border border-[#DFD5C6] px-1.5 py-0.5 rounded">
                          Linked: <strong>@{devScoreData.platform_stats.leetcode.handle}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSyncLeetcode("")}
                          className="text-[10px] font-mono font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-0.5"
                          title="Unlink and clear this account"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          <span>Unlink</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 my-auto flex items-center text-[#D97706]">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 1.271 1.818l4.277 4.193.039.038c2.248 2.165 5.852 2.133 8.063-.074l2.396-2.392c.54-.54.54-1.414.003-1.955a1.378 1.378 0 0 0-1.951-.003l-2.396 2.392a3.021 3.021 0 0 1-4.205.038l-.02-.019-4.276-4.193c-.652-.64-.972-1.469-.948-2.263a2.68 2.68 0 0 1 .066-.523 2.545 2.545 0 0 1 .619-1.164L9.13 8.114c1.058-1.134 3.204-1.27 4.43-.278l3.501 2.831c.593.48 1.461.387 1.94-.207a1.384 1.384 0 0 0-.207-1.943l-3.5-2.831c-.8-.647-1.766-1.045-2.774-1.202l2.015-2.158A1.384 1.384 0 0 0 13.483 0zm-2.866 12.815a1.38 1.38 0 0 0-1.38 1.382 1.38 1.38 0 0 0 1.38 1.382H20.79a1.38 1.38 0 0 0 1.38-1.382 1.38 1.38 0 0 0-1.38-1.382z"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={syncLeetcode}
                      onChange={(e) => setSyncLeetcode(e.target.value)}
                      placeholder="Enter new LeetCode handle to replace (e.g. neal_wu)"
                      className="w-full pl-10 pr-3 py-2 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#D97706] transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Codeforces Input */}
                <div className="space-y-1.5 p-3 rounded-xl bg-[#FAF6F0]/60 border border-[#DFD5C6]/70">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold font-mono text-[#262626] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#2563EB]" />
                      Codeforces Account
                    </label>
                    {devScoreData?.platform_stats?.codeforces?.handle && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#6E6359] bg-[#FAF6F0] border border-[#DFD5C6] px-1.5 py-0.5 rounded">
                          Linked: <strong>@{devScoreData.platform_stats.codeforces.handle}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSyncCodeforces("")}
                          className="text-[10px] font-mono font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-0.5"
                          title="Unlink and clear this account"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          <span>Unlink</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 my-auto flex items-center">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 7.5a1.5 1.5 0 0 1 1.5 1.5v10.5a1.5 1.5 0 0 1-3 0V9a1.5 1.5 0 0 1 1.5-1.5z" fill="#FFA116"/>
                        <path d="M12 3a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-3 0v-15A1.5 1.5 0 0 1 12 3z" fill="#2563EB"/>
                        <path d="M19.5 12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-3 0v-6a1.5 1.5 0 0 1 1.5-1.5z" fill="#EF4444"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={syncCodeforces}
                      onChange={(e) => setSyncCodeforces(e.target.value)}
                      placeholder="Enter new Codeforces handle to replace (e.g. tourist)"
                      className="w-full pl-10 pr-3 py-2 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#2563EB] transition-all font-mono"
                    />
                  </div>
                </div>

                {/* GitHub Input */}
                <div className="space-y-1.5 p-3 rounded-xl bg-[#FAF6F0]/60 border border-[#DFD5C6]/70">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold font-mono text-[#262626] flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#262626]" />
                      GitHub Account
                    </label>
                    {devScoreData?.platform_stats?.github?.username && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-[#6E6359] bg-[#FAF6F0] border border-[#DFD5C6] px-1.5 py-0.5 rounded">
                          Linked: <strong>@{devScoreData.platform_stats.github.username}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => setSyncGithub("")}
                          className="text-[10px] font-mono font-bold text-rose-600 hover:text-rose-800 hover:underline cursor-pointer flex items-center gap-0.5"
                          title="Unlink and clear this account"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                          <span>Unlink</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 my-auto flex items-center text-[#1E293B]">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                      </svg>
                    </div>
                    <input
                      type="text"
                      value={syncGithub}
                      onChange={(e) => setSyncGithub(e.target.value)}
                      placeholder="Enter new GitHub username to replace (e.g. torvalds)"
                      className="w-full pl-10 pr-3 py-2 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#334155] transition-all font-mono"
                    />
                  </div>
                </div>

                {/* Status or Success message */}
                {syncSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-mono text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Successfully updated & recalculated DevScore!</span>
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
                        <span>Verifying & Recalculating...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Save & Recalculate DevScore</span>
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
