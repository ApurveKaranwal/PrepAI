"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  Users,
  Briefcase,
  Send,
  Plus,
  CheckCircle2,
  ChevronRight,
  Building2,
  X,
  Copy,
  Check,
  RefreshCw,
  Cpu,
  Rocket,
  Edit3,
  Download,
  FileText,
  AlertCircle,
} from "lucide-react";
import { apiPost, apiGet, errorMessage } from "@/lib/api";
import RequisitionsPanel from "./RequisitionsPanel";
import PipelineBoard from "./PipelineBoard";
import OrgSettings from "./OrgSettings";
import AssessmentsTracker from "./AssessmentsTracker";
import TalentSearch from "./TalentSearch";
import { useRecruiterData } from "./useRecruiterData";
import { useToasts, ToastStack } from "./ui";

export default function RecruiterPortal({ user, organization, orgResolved, onOrganizationChange, section, onSectionChange, onNavigate }) {
  // Kept in the public component contract for the shell; organization
  // resolution and navigation are owned by the parent/sidebar.
  void orgResolved;
  void onNavigate;
  // Data layer — all from useRecruiterData for consistency across tabs
  const data = useRecruiterData({ organization, onOrganizationChange });
  const { organization: orgData, hasOrg, isAdmin, isOwner, org, profile, jobs, pipeline, assessments, outreach } = data;

  // Toast system shared by all panels
  const toast = useToasts();

  // Tab state
  const [activeTab, setActiveTab] = useState(section || "sourcing"); // 'sourcing' | 'requisitions' | 'pipeline' | 'assessments' | 'organization'

  // The sidebar owns the persisted section. Keep the portal in sync when the
  // user changes sections from either navigation surface.
  useEffect(() => {
    if (section && section !== activeTab) setActiveTab(section);
  }, [section, activeTab]);

  const selectSection = (nextSection) => {
    setActiveTab(nextSection);
    onSectionChange?.(nextSection);
  };
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  // Keep the legacy sourcing cards and the extracted panels functional while
  // accounts migrate to the shared TalentSearch component.
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStack, setSelectedStack] = useState("All");
  const [selectedMinScore, setSelectedMinScore] = useState(0);
  const [selectedTier, setSelectedTier] = useState("All");
  const [selectedCandidateDossier, setSelectedCandidateDossier] = useState(null);
  const [selectedAssessmentInspect, setSelectedAssessmentInspect] = useState(null);
  const [showCreateJobModal, setShowCreateJobModal] = useState(false);
  const [newJob, setNewJob] = useState({
    company_name: "",
    role_title: "",
    work_mode: "Remote",
    location: "",
    salary_range: "",
    min_devscore: 0,
    required_skills: "",
    experience_level: "Mid-Level",
    description: "",
  });
  const [showTakehomeModal, setShowTakehomeModal] = useState(false);
  const [takehomeCandidate, setTakehomeCandidate] = useState(null);
  const [takehomeTrack, setTakehomeTrack] = useState("two-sum-sorted");
  const [takehomeDifficulty, setTakehomeDifficulty] = useState("Medium");
  const [generatedAssessment, setGeneratedAssessment] = useState(null);
  const [showResumeText, setShowResumeText] = useState(false);

  const handleDownloadResume = async (candidate) => {
    try {
      const data = await apiGet(`/api/recruiter/candidate-resume/${candidate.id}`);
      const content = data?.resume_text || `${data?.candidate_name || candidate.name || "Candidate"}\n${data?.candidate_email || candidate.email || ""}`;
      const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(data?.candidate_name || candidate.name || "Candidate").replace(/\s+/g, "_")}_Resume.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (!err?.isAuthError) toast.error(errorMessage(err, "Could not download the résumé."));
    }
  };

  useEffect(() => {
    // TalentSearch owns the visible sourcing query. Keep this compatibility
    // query only while that tab is active; otherwise every recruiter tab
    // change causes a second candidates request and can surface duplicate
    // error toasts unrelated to the screen the user is using.
    if (!hasOrg || activeTab !== "sourcing") {
      setCandidates([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          query: searchQuery,
          min_devscore: String(selectedMinScore),
          primary_stack: selectedStack,
          tier: selectedTier,
        });
        const result = await apiGet(`/api/recruiter/candidates?${query}`);
        if (!cancelled) setCandidates(result?.candidates || []);
      } catch (err) {
        if (!cancelled && !err?.isAuthError) toast.error(errorMessage(err, "Could not load candidates."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
    // toast is intentionally omitted: useToasts returns a new view object when
    // a toast is added, and including it would re-run a failed request forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, hasOrg, searchQuery, selectedStack, selectedMinScore, selectedTier]);

  // Startup Profile State — kept for backward compat with the onboarding flow
  const [startupProfile, setStartupProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showEditStartupModal, setShowEditStartupModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");

  const [startupForm, setStartupForm] = useState({
    company_name: "",
    founder_name: user?.displayName || user?.name || "",
    founder_role: "Founder & CTO",
    tagline: "",
    stage: "Seed",
    website_url: "",
    industry: "",
    location: "Remote",
    team_size: "1-10",
    primary_tech_stack: "",
    about: ""
  });

  // Fetch Startup Profile on mount & user change
  const fetchStartupProfile = async () => {
    setLoadingProfile(true);
    setProfileError("");
    try {
      const data = await apiGet("/api/recruiter/startup-profile");
      if (data?.profile) {
        setStartupProfile(data.profile);
        setStartupForm({
          company_name: data.profile.company_name || "",
          founder_name: data.profile.founder_name || user?.displayName || user?.name || "",
          founder_role: data.profile.founder_role || "Founder & CTO",
          tagline: data.profile.tagline || "",
          stage: data.profile.stage || "Seed",
          website_url: data.profile.website_url || "",
          industry: data.profile.industry || "AI & DevTools",
          location: data.profile.location || "Remote",
          team_size: data.profile.team_size || "1-10",
          primary_tech_stack: Array.isArray(data.profile.primary_tech_stack)
            ? data.profile.primary_tech_stack.join(", ")
            : (data.profile.primary_tech_stack || ""),
          about: data.profile.about || ""
        });
        setNewJob((prev) => ({ ...prev, company_name: data.profile.company_name }));
      } else {
        setStartupProfile(null);
      }
    } catch (err) {
      // A 401 here is the apiFetch 401 handler kicking the user out — don't
      // clobber that with a registration form.
      if (err?.isAuthError) return;
      setStartupProfile(null);
    } finally {
      setLoadingProfile(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchStartupProfile();
    } else {
      setLoadingProfile(false);
    }
    const safetyTimer = setTimeout(() => {
      setLoadingProfile(false);
    }, 2000);
    return () => clearTimeout(safetyTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSaveStartupProfile = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!startupForm.company_name.trim()) {
      setProfileError("Startup / company name is required.");
      return;
    }
    setSavingProfile(true);
    setProfileError("");
    try {
      const techArray = typeof startupForm.primary_tech_stack === "string"
        ? startupForm.primary_tech_stack.split(",").map((s) => s.trim()).filter(Boolean)
        : startupForm.primary_tech_stack;

      // The user_id is resolved server-side from the bearer token; never send
      // one from the client. Org/role also come from the token.
      const payload = {
        company_name: startupForm.company_name.trim(),
        founder_name: startupForm.founder_name.trim(),
        founder_role: startupForm.founder_role.trim(),
        tagline: startupForm.tagline.trim(),
        stage: startupForm.stage,
        website_url: startupForm.website_url.trim(),
        industry: startupForm.industry,
        location: startupForm.location.trim(),
        team_size: startupForm.team_size,
        primary_tech_stack: techArray,
        about: startupForm.about.trim()
      };

      const data = await apiPost("/api/recruiter/startup-profile", payload);
      if (data?.profile) {
        setStartupProfile(data.profile);
        setShowEditStartupModal(false);
        setNewJob((prev) => ({ ...prev, company_name: data.profile.company_name }));
        if (data.organization && onOrganizationChange) {
          onOrganizationChange(data.organization);
        }
      } else {
        setProfileError("The server accepted the request but returned no profile. Please refresh and try again.");
      }
    } catch (err) {
      if (err?.isAuthError) return;
      setProfileError(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const effectiveProfile = startupProfile || profile?.profile || (organization?.id ? { company_name: organization.name, stage: "Seed", website_url: organization.website_url } : null);

  if (loadingProfile && !hasOrg && !organization?.id && !effectiveProfile) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 bg-[#FAF6F0] min-h-[60vh]">
        <div className="text-center space-y-3 bg-[#FCFAF7] border border-[#DFD5C6] p-8 rounded-2xl shadow-sm">
          <RefreshCw className="h-7 w-7 animate-spin text-[#C85A32] mx-auto" />
          <p className="text-xs font-mono font-bold text-[#262626]">Synchronizing Startup Intelligence...</p>
          <p className="text-[11px] font-mono text-[#6E6359]">Verifying founder credentials & company requisitions</p>
        </div>
      </div>
    );
  }

  if (!effectiveProfile && !hasOrg && !organization?.id) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#FAF6F0] p-4 sm:p-6 lg:p-10 flex items-center justify-center min-h-screen">
        <div className="max-w-3xl w-full bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl shadow-xl p-6 sm:p-10 space-y-8 animate-in fade-in duration-300">
          {/* Header */}
          <div className="space-y-3 text-center sm:text-left border-b border-[#DFD5C6]/60 pb-6">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <span className="text-[10px] font-bold font-mono px-3 py-1 rounded-full bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="h-3 w-3" />
                Startup Onboarding Required
              </span>
              <span className="text-[10px] font-mono text-[#6E6359]">
                1-Minute Setup
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#262626] tracking-tight">
              Register Your Startup to Unlock Talent Radar & Assessments
            </h1>
            <p className="text-xs sm:text-sm text-[#6E6359] leading-relaxed max-w-2xl">
              PrepFlow Recruiter Intelligence requires a verified startup profile to curate pre-vetted engineers with cryptographic DevScores and dispatch live algorithmic take-home tests.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveStartupProfile} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Startup / Company Name <span className="text-[#C85A32]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Your Startup Name"
                  value={startupForm.company_name}
                  onChange={(e) => setStartupForm({ ...startupForm, company_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Funding & Growth Stage <span className="text-[#C85A32]">*</span>
                </label>
                <select
                  value={startupForm.stage}
                  onChange={(e) => setStartupForm({ ...startupForm, stage: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                >
                  <option value="Pre-Seed">Pre-Seed / Ideation</option>
                  <option value="Seed">Seed Stage ($1M - $4M)</option>
                  <option value="Series A">Series A ($5M - $18M)</option>
                  <option value="Series B+">Series B+ ($20M+)</option>
                  <option value="Bootstrapped">Bootstrapped & Profitable</option>
                  <option value="Enterprise / Growth">Growth / Unicorn</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Founder / Hiring Lead Name <span className="text-[#C85A32]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex Rivera"
                  value={startupForm.founder_name}
                  onChange={(e) => setStartupForm({ ...startupForm, founder_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Founder Title / Role
                </label>
                <input
                  type="text"
                  placeholder="e.g. CTO & Co-Founder / Head of Engineering"
                  value={startupForm.founder_role}
                  onChange={(e) => setStartupForm({ ...startupForm, founder_role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Company Mission / Elevator Pitch
                </label>
                <input
                  type="text"
                  placeholder="e.g. Next-generation distributed stream processing & real-time analytics engine"
                  value={startupForm.tagline}
                  onChange={(e) => setStartupForm({ ...startupForm, tagline: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Industry Domain
                </label>
                <select
                  value={startupForm.industry}
                  onChange={(e) => setStartupForm({ ...startupForm, industry: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                >
                  <option value="AI & Machine Learning">AI & Machine Learning</option>
                  <option value="DevTools & Cloud Infrastructure">DevTools & Cloud Infrastructure</option>
                  <option value="Fintech & Quantitative Systems">Fintech & Quantitative Systems</option>
                  <option value="Cybersecurity & Defense">Cybersecurity & Defense</option>
                  <option value="Enterprise SaaS & B2B">Enterprise SaaS & B2B</option>
                  <option value="Web3 & Distributed Systems">Web3 & Distributed Systems</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  HQ Location & Work Model
                </label>
                <input
                  type="text"
                  placeholder="e.g. San Francisco, CA • Remote-First"
                  value={startupForm.location}
                  onChange={(e) => setStartupForm({ ...startupForm, location: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Official Website URL
                </label>
                <input
                  type="url"
                  placeholder="https://your-startup-domain.com"
                  value={startupForm.website_url}
                  onChange={(e) => setStartupForm({ ...startupForm, website_url: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Team Size (Employees)
                </label>
                <select
                  value={startupForm.team_size}
                  onChange={(e) => setStartupForm({ ...startupForm, team_size: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                >
                  <option value="1-10">1-10 Employees (Founding Core)</option>
                  <option value="11-50">11-50 Employees (Early Growth)</option>
                  <option value="51-200">51-200 Employees (Scaling)</option>
                  <option value="200+">200+ Employees (Late Stage)</option>
                </select>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  Primary Tech Stacks Hired (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Go, Rust, Python, React, PostgreSQL, Kubernetes"
                  value={startupForm.primary_tech_stack}
                  onChange={(e) => setStartupForm({ ...startupForm, primary_tech_stack: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <label className="block text-xs font-bold font-mono text-[#262626]">
                  About Engineering Culture & Team
                </label>
                <textarea
                  rows={3}
                  placeholder="Tell candidates about your technical challenges, high autonomy culture, and what makes your startup special..."
                  value={startupForm.about}
                  onChange={(e) => setStartupForm({ ...startupForm, about: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DFD5C6]/60">
              {profileError && (
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FEF2F2] border border-[#B91C1C]/30 text-[#B91C1C] text-[11px] font-mono">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{profileError}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={savingProfile}
                className="px-6 py-2.5 bg-[#C85A32] hover:bg-[#B83A14] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
              >
                {savingProfile ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Registering Startup Profile...</span>
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    <span>Register Startup & Launch Talent Radar →</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#FAF6F0] p-4 sm:p-6 lg:p-8 space-y-6">
      {/* =========================================================================
          HERO BANNER & KPI METRIC SUMMARY
          ========================================================================= */}
      <section className="border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-sm bg-[#FCFAF7] p-6 sm:p-8 space-y-6 select-none premium-glow-card">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#DFD5C6]/60 pb-6">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] uppercase tracking-wider">
                {effectiveProfile?.stage || "Seed"} Stage
              </span>
              <span className="text-[10px] font-mono text-[#6E6359]">
                {effectiveProfile?.industry || "AI & Tech"} • {effectiveProfile?.location || "Remote"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-[#262626] tracking-tight">
                {effectiveProfile?.company_name || organization?.name || "My Startup"}
              </h1>
              <button
                onClick={() => {
                  setProfileError("");
                  setShowEditStartupModal(true);
                }}
                className="px-2.5 py-1 hover:bg-[#FAF6F0] text-[#6E6359] hover:text-[#C85A32] border border-[#DFD5C6] rounded-lg text-xs font-mono transition-colors cursor-pointer flex items-center gap-1.5"
                title="Edit Startup Profile"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span className="text-[11px] font-bold">Edit Startup</span>
              </button>
            </div>
            <p className="text-xs text-[#6E6359] font-medium max-w-2xl leading-relaxed">
              {effectiveProfile?.tagline || `Founded by ${effectiveProfile?.founder_name || 'Founder'} (${effectiveProfile?.founder_role || 'CTO'}). Verified talent sourcing radar.`}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setShowCreateJobModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="h-4 w-4 text-[#C85A32]" />
              <span>Post Engineering Role</span>
            </button>
          </div>
        </div>

        {/* 4 High-Level Recruiter Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6E6359]">
              Live Candidates in Pool
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-[#262626]">
                {candidates.length}
              </span>
              <span className="text-[10px] font-mono text-[#2E5A44] font-bold">Registered</span>
            </div>
          </div>

          <div className="bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6E6359]">
              Average DevScore™
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-[#C85A32]">
                {candidates.length > 0 ? Math.round(candidates.reduce((acc, c) => acc + c.devscore, 0) / candidates.length) : 0}
              </span>
              <span className="text-[10px] font-mono text-[#6E6359] font-bold">/ 1000</span>
            </div>
          </div>

          <div className="bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6E6359]">
              Open Requisitions
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-[#262626]">
                {jobs.items.length}
              </span>
              <span className="text-[10px] font-mono text-[#6E6359] font-bold">Active</span>
            </div>
          </div>

          <div className="bg-[#FAF6F0]/80 border border-[#DFD5C6] rounded-xl p-4 space-y-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6E6359]">
              Take-Homes Dispatched
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black font-mono text-[#2563EB]">
                {assessments.items.length}
              </span>
              <span className="text-[10px] font-mono text-[#6E6359] font-bold">Assessments</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SUB-TAB NAVIGATION BAR
          ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-[#DFD5C6] pb-2 select-none overflow-x-auto">
        <button
          onClick={() => selectSection("sourcing")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "sourcing"
              ? "bg-[#262626] text-white shadow-2xs"
              : "bg-[#FCFAF7] text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6]"
          }`}
        >
          <Search className="h-3.5 w-3.5" />
          <span>Talent Sourcing Radar</span>
        </button>

        <button
          onClick={() => selectSection("requisitions")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "requisitions"
              ? "bg-[#262626] text-white shadow-2xs"
              : "bg-[#FCFAF7] text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6]"
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
            <span>Engineering Requisitions ({jobs.items.length})</span>
        </button>

        <button
          onClick={() => selectSection("pipeline")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "pipeline"
              ? "bg-[#262626] text-white shadow-2xs"
              : "bg-[#FCFAF7] text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6]"
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Pipeline & Shortlists ({pipeline.items.length})</span>
        </button>

        <button
          onClick={() => selectSection("assessments")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "assessments"
              ? "bg-[#262626] text-white shadow-2xs"
              : "bg-[#FCFAF7] text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6]"
          }`}
        >
          <Cpu className="h-3.5 w-3.5" />
          <span>Live Assessments Tracker ({assessments.items.length})</span>
        </button>

        <button
          onClick={() => selectSection("organization")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === "organization"
              ? "bg-[#262626] text-white shadow-2xs"
              : "bg-[#FCFAF7] text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6]"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span>Organisation</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: TALENT SOURCING RADAR (REAL DATABASE USERS)
          ========================================================================= */}
      {activeTab === "sourcing" && (
        <TalentSearch
          enabled={hasOrg}
          jobs={jobs}
          pipeline={pipeline}
          outreach={outreach}
          assessments={assessments}
          toast={toast}
        />
      )}

      {/* Retained temporarily for backwards-compatible modal markup; the
          shared TalentSearch above is the only active sourcing experience. */}
      {activeTab === "__legacy-sourcing-disabled" && (
        <div className="space-y-5 select-none">
          {/* Sourcing Filters Bar */}
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-4 sm:p-5 shadow-3xs space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Search input */}
              <div className="sm:col-span-6 relative">
                <Search className="absolute inset-y-0 left-3.5 my-auto h-4 w-4 text-[#6E6359]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search live candidates by name, email, stack (e.g. Python, Go, React)..."
                  className="w-full pl-10 pr-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:bg-[#FCFAF7] focus:border-[#C85A32] font-mono transition-all"
                />
              </div>

              {/* Tech Stack filter */}
              <div className="sm:col-span-3">
                <select
                  value={selectedStack}
                  onChange={(e) => setSelectedStack(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                >
                  <option value="All">All Tech Stacks</option>
                  <option value="Python">Python</option>
                  <option value="TypeScript">TypeScript / React</option>
                  <option value="Go">Go / Golang</option>
                  <option value="Rust">Rust</option>
                  <option value="C++">C++ Systems</option>
                  <option value="Distributed Systems">Distributed Systems</option>
                </select>
              </div>

              {/* Min DevScore Filter */}
              <div className="sm:col-span-3">
                <select
                  value={selectedMinScore}
                  onChange={(e) => setSelectedMinScore(parseInt(e.target.value))}
                  className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                >
                  <option value="0">Any DevScore™</option>
                  <option value="600">DevScore ≥ 600 (Proficient)</option>
                  <option value="750">DevScore ≥ 750 (Senior+)</option>
                  <option value="900">DevScore ≥ 900 (Titan Staff)</option>
                </select>
              </div>
            </div>

            {/* Quick Filter Badges */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
              <span className="text-[#6E6359] font-bold uppercase tracking-wider text-[10px]">
                Seniority Tier:
              </span>
              {["All", "Titan / Elite Staff", "Distinguished Senior", "Proficient Mid-Level", "Active Candidate"].map((tierName) => (
                <button
                  key={tierName}
                  onClick={() => setSelectedTier(tierName)}
                  className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    selectedTier === tierName
                      ? "bg-[#C85A32]/10 border-[#C85A32]/30 text-[#C85A32] font-bold"
                      : "bg-[#FAF6F0] border-[#DFD5C6] text-[#6E6359] hover:text-[#262626]"
                  }`}
                >
                  {tierName}
                </button>
              ))}
            </div>
          </div>

          {/* Candidate Cards Grid */}
          {loading ? (
            <div className="p-12 text-center text-xs font-mono text-[#6E6359] bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl">
              Querying live database candidates & telemetry...
            </div>
          ) : candidates.length === 0 ? (
            <div className="p-12 text-center space-y-2 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl">
              <p className="font-serif font-bold text-[#262626]">No candidates match the selected filters</p>
              <p className="text-xs text-[#6E6359] font-mono">Try resetting the minimum DevScore threshold or stack criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {candidates.map((cand) => (
                <div
                  key={cand.id}
                  className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 flex flex-col justify-between space-y-5 shadow-3xs hover:border-[#C85A32]/50 transition-all group"
                >
                  {/* Top Row: Info & DevScore Badge */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-serif text-lg font-bold text-[#262626] group-hover:text-[#C85A32] transition-colors">
                          {cand.name}
                        </h3>
                        {cand.applied && (
                          <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded-full bg-[#C85A32]/15 border border-[#C85A32]/35 text-[#C85A32] animate-pulse">
                            🔥 Applied
                          </span>
                        )}
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#FAF6F0] border border-[#DFD5C6] text-[#6E6359]">
                          {cand.experience_years} yrs exp
                        </span>
                      </div>
                      <p className="text-xs text-[#6E6359] font-medium leading-relaxed">
                        {cand.headline}
                      </p>
                      <p className="text-[11px] text-[#6E6359]/80 font-mono">
                        {cand.location} • <strong className="text-[#262626]">{cand.expected_salary}</strong>
                      </p>
                      {cand.email && (
                        <p className="text-[10px] font-mono text-[#6E6359]/70">
                          {cand.email}
                        </p>
                      )}
                    </div>

                    {/* DevScore Circular Dial */}
                    <div className="flex flex-col items-center shrink-0 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl px-3 py-2 text-center min-w-[85px]">
                      <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">
                        DevScore™
                      </span>
                      <span className="text-xl font-black font-mono text-[#C85A32]">
                        {cand.devscore}
                      </span>
                      <span className="text-[9px] font-mono font-bold text-[#2E5A44]">
                        {cand.percentile}
                      </span>
                    </div>
                  </div>

                  {/* High-Contrast Multi-Platform Chips */}
                  <div className="space-y-2 pt-2 border-t border-[#DFD5C6]/60">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cand.platform_stats?.leetcode?.total_solved > 0 && (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                          <strong className="text-[#D97706]">{cand.platform_stats.leetcode.total_solved}</strong> LeetCode
                        </span>
                      )}
                      {cand.platform_stats?.codeforces?.rating > 0 && (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
                          <strong className="text-[#2563EB]">{cand.platform_stats.codeforces.rating}</strong> CF Rating
                        </span>
                      )}
                      {cand.platform_stats?.github?.public_repos > 0 && (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded-md">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#334155]" />
                          <strong className="text-[#262626]">{cand.platform_stats.github.public_repos}</strong> Repos
                        </span>
                      )}
                      {cand.platform_stats?.prepai?.chaos_resilience && (
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-xs text-[#2E5A44] bg-[#2E5A44]/10 border border-[#2E5A44]/25 px-2 py-0.5 rounded-md">
                          {Math.round(cand.platform_stats.prepai.chaos_resilience * 100)}% Chaos Resilience
                        </span>
                      )}
                    </div>

                    {/* Primary Stacks */}
                    <div className="flex items-center gap-1 flex-wrap pt-1">
                      {(cand.primary_stack || []).map((stk, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded text-[10px] font-mono font-semibold text-[#262626]"
                        >
                          {stk}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="flex items-center justify-between gap-2 pt-3 border-t border-[#DFD5C6]/60">
                    <button
                      onClick={() => setSelectedCandidateDossier(cand)}
                      className="text-xs font-mono font-bold text-[#6E6359] hover:text-[#262626] cursor-pointer flex items-center gap-1"
                    >
                      <span>View Dossier</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownloadResume(cand)}
                        title="Download Candidate Resume"
                        className="p-1.5 bg-[#FAF6F0] hover:bg-[#FAF4EB] text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6] rounded-xl text-xs font-mono transition-all cursor-pointer shadow-3xs flex items-center gap-1"
                      >
                        <Download className="h-3.5 w-3.5 text-[#C85A32]" />
                        <span className="hidden sm:inline font-bold">Resume</span>
                      </button>
                      <button
                        onClick={async () => {
                          const result = await pipeline.add({ candidateId: cand.id, jobId: 0, stage: "Sourced" });
                          if (result.ok) toast.success(`${cand.name} added to pipeline.`);
                          else toast.error(result.message);
                        }}
                        className="px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#FAF4EB] text-[#262626] border border-[#DFD5C6] rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-3xs"
                      >
                        Shortlist
                      </button>
                      <button
                        onClick={() => {
                          setTakehomeCandidate(cand);
                          setShowTakehomeModal(true);
                        }}
                        className="px-3.5 py-1.5 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-3xs flex items-center gap-1.5"
                      >
                        <Send className="h-3 w-3" />
                        <span>Send Take-Home</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: ENGINEERING REQUISITIONS
          ========================================================================= */}
      {activeTab === "requisitions" && (
        <RequisitionsPanel
          organization={orgData || organization}
          profile={profile}
          jobs={jobs}
          isAdmin={isAdmin}
          toast={toast}
        />
      )}

      {/* =========================================================================
          TAB 3: PIPELINE & SHORTLISTS
          ========================================================================= */}
      {activeTab === "pipeline" && (
        <PipelineBoard
          jobs={jobs}
          pipeline={pipeline}
          outreach={outreach}
          assessments={assessments}
          toast={toast}
        />
      )}

      {/* OLD: Pipeline tab replaced by PipelineBoard component
      {activeTab === "pipeline" && (
        <div className="space-y-5 select-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#262626]">
                Pipeline & Shortlisted Candidates
              </h2>
              <p className="text-xs text-[#6E6359] font-medium">
                Candidates pre-screened by algorithmic DevScores and queued for founder technical interviews.
              </p>
            </div>
            <button
              onClick={fetchMetadata}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#FAF4EB] border border-[#DFD5C6] rounded-xl text-xs font-mono font-bold text-[#6E6359] transition-all cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Pipeline</span>
            </button>
          </div>

          {shortlists.length === 0 ? (
            <div className="p-12 text-center space-y-2 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl">
              <p className="font-serif font-bold text-[#262626]">No candidates shortlisted yet</p>
              <p className="text-xs text-[#6E6359] font-mono">Explore the Talent Sourcing Radar and click "Shortlist" to add candidates.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shortlists.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-5 space-y-3 shadow-3xs flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-serif font-bold text-sm text-[#262626]">
                        {item.candidate_name}
                      </h4>
                      <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[#2E5A44]">
                        {item.stage}
                      </span>
                    </div>
                    <p className="text-[11px] font-mono text-[#6E6359]">
                      Candidate ID: {item.candidate_id} • {item.notes || "Shortlisted via Radar"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const candObj = candidates.find((c) => c.id === item.candidate_id);
                        if (candObj) setSelectedCandidateDossier(candObj);
                      }}
                      className="px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#FAF4EB] border border-[#DFD5C6] rounded-xl text-xs font-mono font-bold text-[#262626] transition-all cursor-pointer"
                    >
                      Dossier
                    </button>
                    <button
                      onClick={() => handleDeleteShortlist(item.id)}
                      title="Remove from Pipeline"
                      className="p-1.5 hover:bg-rose-500/10 text-[#6E6359] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      */}
      {/* =========================================================================
          TAB 4: LIVE TAKE-HOME ASSESSMENTS TRACKER
          ========================================================================= */}
      {activeTab === "assessments" && (
        <AssessmentsTracker
          assessments={assessments}
          onInspect={setSelectedAssessmentInspect}
          toast={toast}
        />
      )}

      {/* OLD: Assessment tracker inline implementation - now extracted to component
      {activeTab === "assessments" && (
        <div className="space-y-5 select-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#262626]">
                Live Take-Home Assessments Tracker
              </h2>
              <p className="text-xs text-[#6E6359] font-medium">
                Real-time tracking of candidate take-home invitations, algorithmic test executions, and chaos stress test scores.
              </p>
            </div>
      {activeTab === "assessments" && (
        <div className="space-y-5 select-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#262626]">
                Live Take-Home Assessments Tracker
              </h2>
              <p className="text-xs text-[#6E6359] font-medium">
                Real-time tracking of candidate take-home invitations, algorithmic test executions, and chaos stress test scores.
              </p>
            </div>
            <button
              onClick={fetchMetadata}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#FAF4EB] border border-[#DFD5C6] rounded-xl text-xs font-mono font-bold text-[#6E6359] transition-all cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Status</span>
            </button>
          </div>

          {assessments.length === 0 ? (
            <div className="p-12 text-center space-y-2 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl">
              <p className="font-serif font-bold text-[#262626]">No take-home assessments dispatched yet</p>
              <p className="text-xs text-[#6E6359] font-mono">Go to the Talent Sourcing Radar and click "Send Take-Home" on any candidate.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {assessments.map((assm) => (
                <div
                  key={assm.id || assm.token}
                  className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 space-y-4 shadow-3xs flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] uppercase tracking-wider">
                        {assm.difficulty} • 45m
                      </span>
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        assm.status === "Completed"
                          ? "bg-emerald-500/10 text-emerald-800 border border-emerald-500/30"
                          : "bg-amber-500/10 text-amber-800 border border-amber-500/30"
                      }`}>
                        {assm.status}
                      </span>
                    </div>

                    <h3 className="font-serif text-lg font-bold text-[#262626]">
                      {assm.candidate_name}
                    </h3>
                    <p className="text-xs font-mono font-bold text-[#6E6359]">
                      {assm.role_title}
                    </p>
                    <p className="text-[11px] text-[#262626] font-mono bg-[#FAF6F0] p-2.5 rounded-lg border border-[#DFD5C6]">
                      Challenge: <strong>{assm.problem_title}</strong>
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-[#DFD5C6]/60">
                    {assm.status === "Completed" ? (
                      <div className="grid grid-cols-2 gap-2 bg-[#FAF6F0] p-2.5 rounded-xl border border-[#DFD5C6] text-center font-mono">
                        <div>
                          <span className="text-[9px] uppercase text-[#6E6359]">Score</span>
                          <p className="text-base font-black text-[#C85A32]">{assm.score} / 1000</p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase text-[#6E6359]">Chaos Resilience</span>
                          <p className="text-base font-black text-[#2E5A44]">{assm.chaos_resilience}%</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#6E6359]">Test Link:</span>
                        <a
                          href={`/takehome/${assm.token}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-[#C85A32] hover:underline flex items-center gap-1"
                        >
                          <span>Open Live Sandbox</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] font-mono text-[#6E6359]">
                        Token: {assm.token.slice(0, 10)}...
                      </span>
                      <div className="flex items-center gap-1.5">
                        {assm.status === "Completed" && (
                          <button
                            onClick={() => setSelectedAssessmentInspect(assm)}
                            className="px-2.5 py-1 bg-[#262626] hover:bg-black text-white rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <FileCode2 className="h-3 w-3" />
                            <span>Inspect Code</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAssessment(assm.id)}
                          title="Delete Assessment Record"
                          className="p-1 hover:bg-rose-500/10 text-[#6E6359] hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      */}

      {/* =========================================================================
          TAB 5: ORGANISATION (settings, team, company profile)
          ========================================================================= */}
      {activeTab === "organization" && (
        <OrgSettings
          user={user}
          organization={orgData || organization}
          org={org}
          profile={profile}
          isAdmin={isAdmin}
          isOwner={isOwner}
          toast={toast}
          onCreated={() => {
            setActiveTab("sourcing");
          }}
        />
      )}

      {/* =========================================================================
          MODAL: CANDIDATE DOSSIER DEEP-DIVE
          ========================================================================= */}
      {selectedCandidateDossier && (
        <div className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setSelectedCandidateDossier(null);
                setShowResumeText(false);
              }}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Dossier Header */}
            <div className="space-y-2 border-b border-[#DFD5C6]/60 pb-5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#C85A32] bg-[#C85A32]/10 border border-[#C85A32]/25 px-2.5 py-0.5 rounded-full">
                  Verified Candidate Intelligence
                </span>
                {selectedCandidateDossier.applied && (
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-800 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    Applied Candidate
                  </span>
                )}
                <span className="text-[10px] font-mono text-[#6E6359]">
                  DevScore™ Dossier #{selectedCandidateDossier.id}
                </span>
              </div>
              <h3 className="text-2xl font-serif font-bold text-[#262626]">
                {selectedCandidateDossier.name}
              </h3>
              <p className="text-xs text-[#6E6359] font-medium leading-relaxed">
                {selectedCandidateDossier.headline} • {selectedCandidateDossier.location}
              </p>
              {selectedCandidateDossier.email && (
                <p className="text-xs font-mono font-bold text-[#262626]">
                  Contact: <a href={`mailto:${selectedCandidateDossier.email}`} className="text-[#C85A32] hover:underline">{selectedCandidateDossier.email}</a>
                </p>
              )}
            </div>

            {/* DevScore Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 text-center">
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">DevScore</span>
                <p className="text-xl font-black font-mono text-[#C85A32]">{selectedCandidateDossier.devscore}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">Tier</span>
                <p className="text-xs font-serif font-bold text-[#262626]">{selectedCandidateDossier.tier}</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">Chaos Resilience</span>
                <p className="text-xl font-black font-mono text-[#2E5A44]">
                  {Math.round((selectedCandidateDossier.platform_stats?.prepai?.chaos_resilience || 0.9) * 100)}%
                </p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">Voice Depth</span>
                <p className="text-xl font-black font-mono text-[#262626]">
                  {selectedCandidateDossier.platform_stats?.prepai?.voice_rating || 8.5}/10
                </p>
              </div>
            </div>

            {/* Resume & Portfolio Bar */}
            <div className="p-4 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[#C85A32]" />
                  <span className="text-xs font-mono font-bold text-[#262626]">
                    {selectedCandidateDossier.resume_name || "Resume.pdf"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedCandidateDossier.resume_text && (
                    <button
                      onClick={() => setShowResumeText(!showResumeText)}
                      className="px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#FAF4EB] border border-[#DFD5C6] rounded-lg text-xs font-mono font-bold text-[#6E6359] hover:text-[#262626] transition-all cursor-pointer"
                    >
                      {showResumeText ? "Hide Resume" : "Inspect Text"}
                    </button>
                  )}
                  <button
                    onClick={() => handleDownloadResume(selectedCandidateDossier)}
                    className="px-3.5 py-1.5 bg-[#262626] hover:bg-black text-white rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-3xs"
                  >
                    <Download className="h-3.5 w-3.5 text-[#C85A32]" />
                    <span>Download Resume</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Resume Text Preview */}
              {showResumeText && selectedCandidateDossier.resume_text && (
                <div className="pt-2 border-t border-[#DFD5C6]/60 space-y-1">
                  <span className="text-[10px] font-mono font-bold text-[#6E6359] uppercase tracking-wider">
                    Parsed Resume Content
                  </span>
                  <div className="p-3 bg-[#FCFAF7] border border-[#DFD5C6] rounded-lg max-h-48 overflow-y-auto text-[11px] font-mono text-[#262626] whitespace-pre-wrap leading-relaxed">
                    {selectedCandidateDossier.resume_text}
                  </div>
                </div>
              )}
            </div>

            {/* Candidate Summary */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6E6359]">
                Architectural Craftsmanship Summary
              </span>
              <p className="text-xs text-[#262626] bg-[#FAF6F0] border border-[#DFD5C6] p-3.5 rounded-xl leading-relaxed font-medium">
                {selectedCandidateDossier.summary}
              </p>
            </div>

            {/* Sub-Score Breakdown Table */}
            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#6E6359]">
                DevScore Breakdown
              </span>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-[#DFD5C6]/40">
                  <span>LeetCode DSA (Algorithm Speed)</span>
                  <strong className="text-[#262626]">{selectedCandidateDossier.breakdown?.leetcode_points} / 350 pts</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-[#DFD5C6]/40">
                  <span>Codeforces Contest Rating</span>
                  <strong className="text-[#262626]">{selectedCandidateDossier.breakdown?.codeforces_points} / 200 pts</strong>
                </div>
                <div className="flex justify-between py-1 border-b border-[#DFD5C6]/40">
                  <span>GitHub OSS Repository Craft</span>
                  <strong className="text-[#262626]">{selectedCandidateDossier.breakdown?.github_points} / 200 pts</strong>
                </div>
                <div className="flex justify-between py-1">
                  <span>PrepAI Live Sandbox & Voice Depth</span>
                  <strong className="text-[#C85A32]">{selectedCandidateDossier.breakdown?.prepai_points} / 250 pts</strong>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFD5C6]/60">
              <button
                onClick={() => {
                  setSelectedCandidateDossier(null);
                  setShowResumeText(false);
                }}
                className="px-4 py-2 border border-[#DFD5C6] hover:bg-[#FAF6F0] rounded-xl text-xs font-bold text-[#6E6359] transition-all cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setTakehomeCandidate(selectedCandidateDossier);
                  setSelectedCandidateDossier(null);
                  setShowResumeText(false);
                  setShowTakehomeModal(true);
                }}
                className="px-5 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send 1-Click Take-Home</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: INSPECT SUBMITTED CODE & TELEMETRY
          ========================================================================= */}
      {selectedAssessmentInspect && (
        <div className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedAssessmentInspect(null)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1 border-b border-[#DFD5C6]/60 pb-4">
              <span className="text-[10px] font-mono font-bold text-[#C85A32] uppercase tracking-wider">
                Cryptographically Verified Submission
              </span>
              <h3 className="text-2xl font-serif font-bold text-[#262626]">
                {selectedAssessmentInspect.candidate_name} • {selectedAssessmentInspect.problem_title}
              </h3>
              <p className="text-xs font-mono text-[#6E6359]">
                Role: {selectedAssessmentInspect.role_title} • Score: <strong className="text-[#C85A32]">{selectedAssessmentInspect.score} / 1000</strong> • Chaos Resilience: <strong className="text-[#2E5A44]">{selectedAssessmentInspect.chaos_resilience}%</strong>
              </p>
            </div>

            {/* Submitted Code Block */}
            <div className="space-y-2">
              <span className="text-xs font-mono font-bold uppercase text-[#6E6359]">
                Submitted Source Code ({selectedAssessmentInspect.test_results?.language || "python"})
              </span>
              <pre className="p-4 bg-[#262626] text-white rounded-xl text-xs font-mono overflow-x-auto leading-relaxed max-h-72">
                {selectedAssessmentInspect.test_results?.submitted_code || "# No source code recorded"}
              </pre>
            </div>

            {/* Chaos Test Case Breakdown */}
            {selectedAssessmentInspect.test_results?.chaos_stress && (
              <div className="space-y-2">
                <span className="text-xs font-mono font-bold uppercase text-[#6E6359]">
                  Adversarial Chaos Stress Test Logs
                </span>
                <div className="p-3 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs font-mono space-y-1">
                  <p className="text-[#262626]">
                    Chaos Tests Passed: <strong>{selectedAssessmentInspect.test_results?.chaos_passed} / {selectedAssessmentInspect.test_results?.chaos_total}</strong>
                  </p>
                  <p className="text-[#6E6359] text-[11px]">
                    Standard Test Cases: {selectedAssessmentInspect.test_results?.tests_passed} / {selectedAssessmentInspect.test_results?.total_tests} passed.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-[#DFD5C6]/60">
              <button
                onClick={() => setSelectedAssessmentInspect(null)}
                className="px-5 py-2 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: CREATE REQUISITION
          ========================================================================= */}
      {showCreateJobModal && (
        <div className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setShowCreateJobModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-serif font-bold text-[#262626]">
                Post Engineering Requisition
              </h3>
              <p className="text-xs text-[#6E6359]">
                Set algorithmic DevScore thresholds and required technologies for instant AI sourcing.
              </p>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-bold font-mono text-[#262626]">Role Title</label>
                <input
                  type="text"
                  required
                  value={newJob.role_title}
                  onChange={(e) => setNewJob({ ...newJob, role_title: e.target.value })}
                  placeholder="e.g. Senior Backend / Distributed Systems Engineer"
                  className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">Company Name</label>
                  <input
                    type="text"
                    required
                    value={newJob.company_name}
                    onChange={(e) => setNewJob({ ...newJob, company_name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">Salary Range</label>
                  <input
                    type="text"
                    value={newJob.salary_range}
                    onChange={(e) => setNewJob({ ...newJob, salary_range: e.target.value })}
                    placeholder="e.g. $140k - $185k"
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">Min DevScore™</label>
                  <input
                    type="number"
                    value={newJob.min_devscore}
                    onChange={(e) => setNewJob({ ...newJob, min_devscore: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">Seniority Tier</label>
                  <select
                    value={newJob.experience_level}
                    onChange={(e) => setNewJob({ ...newJob, experience_level: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                  >
                    <option value="Senior">Senior (5+ yrs)</option>
                    <option value="Titan Staff">Titan Staff (8+ yrs)</option>
                    <option value="Mid-Level">Mid-Level (3-5 yrs)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold font-mono text-[#262626]">Required Stacks (comma separated)</label>
                <input
                  type="text"
                  value={newJob.required_skills}
                  onChange={(e) => setNewJob({ ...newJob, required_skills: e.target.value })}
                  placeholder="e.g. Go, Rust, Distributed Systems, Kafka"
                  className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-bold font-mono text-[#262626]">Description</label>
                <textarea
                  rows={3}
                  value={newJob.description}
                  onChange={(e) => setNewJob({ ...newJob, description: e.target.value })}
                  className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFD5C6]/60">
                <button
                  type="button"
                  onClick={() => setShowCreateJobModal(false)}
                  className="px-4 py-2 border border-[#DFD5C6] hover:bg-[#FAF6F0] rounded-xl text-xs font-bold text-[#6E6359] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  Publish Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: TAKE-HOME ASSESSMENT DISPATCHER
          ========================================================================= */}
      {showTakehomeModal && takehomeCandidate && (
        <div className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 relative">
            <button
              onClick={() => {
                setShowTakehomeModal(false);
                setGeneratedAssessment(null);
              }}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1">
              <h3 className="text-xl font-serif font-bold text-[#262626]">
                Dispatch Live AI Take-Home Assessment
              </h3>
              <p className="text-xs text-[#6E6359]">
                Send a 45-minute live polyglot sandbox assessment to <strong>{takehomeCandidate.name}</strong>.
              </p>
            </div>

            {!generatedAssessment ? (
              <form onSubmit={handleDispatchTakehome} className="space-y-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">Assessment Challenge Track</label>
                  <select
                    value={takehomeTrack}
                    onChange={(e) => setTakehomeTrack(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                  >
                    <option value="two-sum-sorted">Two Sum (Sorted & Memory-Optimized)</option>
                    <option value="trapping-rain-water">Trapping Rain Water (Two-Pointer Linear)</option>
                    <option value="lru-cache-ttl">Concurrent LRU Cache with TTL & Eviction</option>
                    <option value="rate-limiter">Token Bucket Distributed Rate Limiter</option>
                    <option value="graph-chaos">Network Routing under Adversarial Partitions</option>
                    <option value="stream-median">Streaming Median Tracker with Sliding Window</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold font-mono text-[#262626]">Difficulty</label>
                    <select
                      value={takehomeDifficulty}
                      onChange={(e) => setTakehomeDifficulty(e.target.value)}
                      className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                    >
                      <option value="Medium">Medium (Startup Core)</option>
                      <option value="Hard">Hard (Staff / Principal)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold font-mono text-[#262626]">Time Limit</label>
                    <div className="px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono">
                      45 Minutes
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DFD5C6]/60">
                  <button
                    type="button"
                    onClick={() => setShowTakehomeModal(false)}
                    className="px-4 py-2 border border-[#DFD5C6] hover:bg-[#FAF6F0] rounded-xl text-xs font-bold text-[#6E6359] transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDispatching}
                    className="px-5 py-2 bg-[#C85A32] hover:bg-[#B83A14] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {isDispatching ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Generating Assessment...</span>
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        <span>Generate Assessment</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2 text-xs font-mono">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Assessment Link Generated Successfully!</span>
                  </div>
                  <p className="text-[11px] text-emerald-900 leading-relaxed">
                    Challenge: <strong>{generatedAssessment.problem_title}</strong>
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold font-mono text-[#262626]">Candidate Test URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={typeof window !== "undefined" ? `${window.location.origin}${generatedAssessment.invite_url}` : generatedAssessment.invite_url}
                      className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono select-all"
                    />
                    <button
                      onClick={() => copyToClipboard(typeof window !== "undefined" ? `${window.location.origin}${generatedAssessment.invite_url}` : generatedAssessment.invite_url)}
                      className="px-3.5 py-2 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{copiedLink ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#DFD5C6]/60 flex justify-end">
                  <button
                    onClick={() => {
                      setShowTakehomeModal(false);
                      setGeneratedAssessment(null);
                    }}
                    className="px-5 py-2 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL: EDIT STARTUP PROFILE
          ========================================================================= */}
      {showEditStartupModal && (
        <div className="fixed inset-0 bg-[#262626]/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowEditStartupModal(false)}
              className="absolute top-5 right-5 p-1.5 rounded-lg text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626] transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="space-y-1.5 border-b border-[#DFD5C6]/60 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold font-mono px-2.5 py-0.5 rounded-full bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Startup Profile Settings
                </span>
              </div>
              <h3 className="font-serif text-xl font-bold text-[#262626]">
                Edit Startup & Company Profile
              </h3>
              <p className="text-xs text-[#6E6359] font-medium">
                Update your venture branding, funding stage, hiring tech stacks, and team culture.
              </p>
            </div>

            <form onSubmit={handleSaveStartupProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Startup / Company Name <span className="text-[#C85A32]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={startupForm.company_name}
                    onChange={(e) => setStartupForm({ ...startupForm, company_name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Funding Stage
                  </label>
                  <select
                    value={startupForm.stage}
                    onChange={(e) => setStartupForm({ ...startupForm, stage: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                  >
                    <option value="Pre-Seed">Pre-Seed</option>
                    <option value="Seed">Seed Stage</option>
                    <option value="Series A">Series A</option>
                    <option value="Series B+">Series B+</option>
                    <option value="Bootstrapped">Bootstrapped</option>
                    <option value="Enterprise / Growth">Enterprise / Growth</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Founder / Lead Name
                  </label>
                  <input
                    type="text"
                    required
                    value={startupForm.founder_name}
                    onChange={(e) => setStartupForm({ ...startupForm, founder_name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Founder Role / Title
                  </label>
                  <input
                    type="text"
                    value={startupForm.founder_role}
                    onChange={(e) => setStartupForm({ ...startupForm, founder_role: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Tagline / Mission
                  </label>
                  <input
                    type="text"
                    value={startupForm.tagline}
                    onChange={(e) => setStartupForm({ ...startupForm, tagline: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Industry Domain
                  </label>
                  <select
                    value={startupForm.industry}
                    onChange={(e) => setStartupForm({ ...startupForm, industry: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                  >
                    <option value="AI & Machine Learning">AI & Machine Learning</option>
                    <option value="DevTools & Cloud Infrastructure">DevTools & Cloud Infrastructure</option>
                    <option value="Fintech & Quantitative Systems">Fintech & Quantitative Systems</option>
                    <option value="Cybersecurity & Defense">Cybersecurity & Defense</option>
                    <option value="Enterprise SaaS & B2B">Enterprise SaaS & B2B</option>
                    <option value="Web3 & Distributed Systems">Web3 & Distributed Systems</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    HQ Location & Work Model
                  </label>
                  <input
                    type="text"
                    value={startupForm.location}
                    onChange={(e) => setStartupForm({ ...startupForm, location: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Official Website URL
                  </label>
                  <input
                    type="url"
                    value={startupForm.website_url}
                    onChange={(e) => setStartupForm({ ...startupForm, website_url: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Team Size
                  </label>
                  <select
                    value={startupForm.team_size}
                    onChange={(e) => setStartupForm({ ...startupForm, team_size: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] cursor-pointer"
                  >
                    <option value="1-10">1-10 Employees</option>
                    <option value="11-50">11-50 Employees</option>
                    <option value="51-200">51-200 Employees</option>
                    <option value="200+">200+ Employees</option>
                  </select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    Primary Tech Stacks Hired (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={startupForm.primary_tech_stack}
                    onChange={(e) => setStartupForm({ ...startupForm, primary_tech_stack: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32]"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-xs font-bold font-mono text-[#262626]">
                    About Engineering Culture
                  </label>
                  <textarea
                    rows={3}
                    value={startupForm.about}
                    onChange={(e) => setStartupForm({ ...startupForm, about: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs text-[#262626] font-mono focus:outline-none focus:border-[#C85A32] resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#DFD5C6]/60">
                <button
                  type="button"
                  onClick={() => setShowEditStartupModal(false)}
                  className="px-4 py-2 border border-[#DFD5C6] hover:bg-[#FAF6F0] rounded-xl text-xs font-bold text-[#6E6359] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2 bg-[#C85A32] hover:bg-[#B83A14] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {savingProfile ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Save Company Profile</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastStack toasts={toast.toasts} onDismiss={toast.dismiss} />
    </div>
  );
}
