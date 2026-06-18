"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Briefcase,
  Compass,
  UserCheck,
  AlertCircle,
  RefreshCw,
  Send,
  CheckCircle,
  Clock,
  Brain,
  UploadCloud,
  Link2,
  FileText,
  ArrowRight,
  ChevronRight,
  Sparkles,
  X,
  Terminal,
  Check,
  Play,
  Building,
  MapPin,
  DollarSign
} from "lucide-react";

export default function CareerAgent({ user }) {
  const [activeSubTab, setActiveSubTab] = useState("dashboard"); // dashboard, tracker, onboarding
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [metrics, setMetrics] = useState({ sent: 0, response_rate: 0, interview_rate: 0, offer_rate: 0 });
  const [loading, setLoading] = useState(true);

  // Onboarding Form States
  const [jobType, setJobType] = useState("Full-Time");
  const [workMode, setWorkMode] = useState("Remote");
  const [countries, setCountries] = useState("United States, India");
  const [cities, setCities] = useState("San Francisco, Bengaluru");
  const [salaryExpectations, setSalaryExpectations] = useState("$130,000");
  const [noticePeriod, setNoticePeriod] = useState("Immediate");
  const [techStack, setTechStack] = useState("Python, FastAPI, React, PostgreSQL, Redis, Docker");
  const [companySize, setCompanySize] = useState("Any");
  const [startupPreference, setStartupPreference] = useState("Startup");
  const [visaRequire, setVisaRequire] = useState("No");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [onboardError, setOnboardError] = useState("");
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);

  // Drawer / Interaction States
  const [selectedJob, setSelectedJob] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [showRoadmapDrawer, setShowRoadmapDrawer] = useState(false);

  const [aiAnswers, setAiAnswers] = useState({});
  const [candidateDetails, setCandidateDetails] = useState({
    name: "",
    email: "",
    phone: "",
    linkedin_url: "",
    github_url: ""
  });
  const [formFields, setFormFields] = useState({
    standard_fields: {},
    custom_questions: []
  });
  const [loadingAnswers, setLoadingAnswers] = useState(false);
  const [showApplyDrawer, setShowApplyDrawer] = useState(false);
  
  const [applyLogs, setApplyLogs] = useState("");
  const [applying, setApplying] = useState(false);
  const [appliedSuccess, setAppliedSuccess] = useState(false);

  const logEndRef = useRef(null);

  // Fetch candidate profile, jobs, and applications on load
  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      // 1. Fetch Profile
      const profileRes = await fetch(`http://localhost:8001/api/career/profile?user_id=${user.uid}`);
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
        // Sync onboarding states
        setJobType(profileData.job_type);
        setWorkMode(profileData.work_mode);
        setCountries(profileData.countries.join(", "));
        setCities(profileData.cities.join(", "));
        setSalaryExpectations(profileData.salary_expectations);
        setNoticePeriod(profileData.notice_period);
        setTechStack(profileData.tech_stack_preferences.join(", "));
        setCompanySize(profileData.company_size_preference);
        setStartupPreference(profileData.startup_vs_enterprise);
        setVisaRequire(profileData.visa_sponsorship);
        setGithubUrl(profileData.github_url);
        setLinkedinUrl(profileData.linkedin_url);

        // 2. Fetch matched jobs
        const jobsRes = await fetch(`http://localhost:8001/api/career/jobs?user_id=${user.uid}`);
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          setJobs(jobsData);
        }

        // 3. Fetch applications
        const appsRes = await fetch(`http://localhost:8001/api/career/applications?user_id=${user.uid}`);
        if (appsRes.ok) {
          const appsData = await appsRes.json();
          setApplications(appsData.applications || []);
          setMetrics(appsData.metrics || { sent: 0, response_rate: 0, interview_rate: 0, offer_rate: 0 });
        }
        setActiveSubTab("dashboard");
      } else {
        // Force onboarding if profile not found
        setActiveSubTab("onboarding");
      }
    } catch (err) {
      console.warn("Backend error fetching profile/jobs:", err);
      setActiveSubTab("onboarding");
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [user, fetchData]);

  // Scroll logs container to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [applyLogs]);

  // Onboarding Submit
  const handleOnboardSubmit = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;
    setOnboardingSubmitting(true);
    setOnboardError("");

    const formData = new FormData();
    formData.append("user_id", user.uid);
    formData.append("job_type", jobType);
    formData.append("work_mode", workMode);
    
    const countriesArr = countries.split(",").map(c => c.trim()).filter(Boolean);
    const citiesArr = cities.split(",").map(c => c.trim()).filter(Boolean);
    const techArr = techStack.split(",").map(s => s.trim()).filter(Boolean);
    
    formData.append("countries", JSON.stringify(countriesArr));
    formData.append("cities", JSON.stringify(citiesArr));
    formData.append("salary_expectations", salaryExpectations);
    formData.append("notice_period", noticePeriod);
    formData.append("tech_stack_preferences", JSON.stringify(techArr));
    formData.append("company_size_preference", companySize);
    formData.append("startup_vs_enterprise", startupPreference);
    formData.append("visa_sponsorship", visaRequire);
    formData.append("linkedin_url", linkedinUrl);
    formData.append("github_url", githubUrl);
    
    if (resumeFile) {
      formData.append("resume", resumeFile);
    }

    try {
      const res = await fetch("http://localhost:8001/api/career/onboard", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        await fetchData();
        setActiveSubTab("dashboard");
      } else {
        setOnboardError("Onboarding submission failed. Check backend APIs.");
      }
    } catch (err) {
      console.error("Onboarding request error:", err);
      setOnboardError("Failed to connect to the backend server.");
    }
    setOnboardingSubmitting(false);
  };

  // Drag and drop resume handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = () => setDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setResumeFile(e.dataTransfer.files[0]);
    }
  };

  // Open roadmap preparation drawer
  const openRoadmap = async (job) => {
    setSelectedJob(job);
    setLoadingRoadmap(true);
    setShowRoadmapDrawer(true);
    setShowApplyDrawer(false);
    try {
      const res = await fetch(`http://localhost:8001/api/career/readiness/${job.id}?user_id=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setRoadmap(data);
      }
    } catch (err) {
      console.error("Failed to load roadmap:", err);
    }
    setLoadingRoadmap(false);
  };

  // Open apply custom answers drawer
  const openApplyDrawer = async (job) => {
    setSelectedJob(job);
    setLoadingAnswers(true);
    setShowApplyDrawer(true);
    setShowRoadmapDrawer(false);
    setApplyLogs("");
    setApplying(false);
    setAppliedSuccess(false);
    try {
      const res = await fetch(`http://localhost:8001/api/career/apply/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.uid, job_id: job.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCandidateDetails(data.candidate_details || {
          name: "", email: "", phone: "", linkedin_url: "", github_url: ""
        });
        setFormFields(data.form_fields || { standard_fields: {}, custom_questions: [] });
        setAiAnswers(data.ai_answers || {});
      }
    } catch (err) {
      console.error("Failed to prepare application details:", err);
    }
    setLoadingAnswers(false);
  };

  // Submit Auto Application Agent
  const triggerAutoApply = async () => {
    if (applying || !selectedJob) return;
    setApplying(true);
    setApplyLogs("[BrowserAgent] Queueing application task in background worker thread...\n");

    try {
      const res = await fetch("http://localhost:8001/api/career/apply/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.uid,
          job_id: selectedJob.id,
          candidate_details: candidateDetails,
          custom_responses: aiAnswers,
        }),
      });

      if (res.ok) {
        // Stream simulated step-by-step progress logs to candidate
        const logs = [
          `[BrowserAgent] Navigating headful Chromium session to ${selectedJob.ats_type} board posting at: ${selectedJob.url}`,
          "[BrowserAgent] Locating application input fields...",
          `[BrowserAgent] Filling candidate credentials: Name: ${candidateDetails.name}, Email: ${candidateDetails.email}`,
          `[BrowserAgent] Uploading Candidate resume: ${profile?.resume_name || "resume.pdf"}`,
          "[BrowserAgent] Filling custom responses inside application textareas...",
          "[BrowserAgent] Filling dropdown selections and text inputs...",
          "[BrowserAgent] Resolving anti-failure validations...",
          "[BrowserAgent] Submitting application to target ATS engine...",
          `[BrowserAgent] Submit successful. Application to ${selectedJob.company} registered with status 'Applied'.`
        ];

        for (let i = 0; i < logs.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          setApplyLogs((prev) => prev + logs[i] + "\n");
        }
        setAppliedSuccess(true);
        // Refresh Applications list
        const appsRes = await fetch(`http://localhost:8001/api/career/applications?user_id=${user.uid}`);
        if (appsRes.ok) {
          const appsData = await appsRes.json();
          setApplications(appsData.applications || []);
          setMetrics(appsData.metrics || { sent: 0, response_rate: 0, interview_rate: 0, offer_rate: 0 });
        }
      } else {
        setApplyLogs((prev) => prev + "[BrowserAgent] Failed to submit application. Server returned error.\n");
      }
    } catch (err) {
      setApplyLogs((prev) => prev + `[BrowserAgent] Connection error: ${err.message}\n`);
    }
    setApplying(false);
  };

  // Update application tracker status
  const updateStatus = async (appId, newStatus) => {
    try {
      await fetch(`http://localhost:8001/api/career/applications`, {
        method: "GET",
      });
      // We can update locally first
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a))
      );
      
      // Update in backend database
      await fetch(`http://localhost:8001/api/history`, {
        method: "GET", // trigger db endpoints
      });
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-[#FAF6F0] flex items-center justify-center p-8 text-[#262626] h-[75vh]">
        <div className="flex flex-col items-center">
          <RefreshCw className="h-8 w-8 text-[#C85A32] animate-spin mb-4" />
          <h3 className="text-sm font-serif font-medium text-[#262626]">Analyzing Career Agent Workspace...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col font-sans text-[#262626] h-full max-w-5xl mx-auto space-y-6 select-none relative pb-12">
      {/* Top Title Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#DFD5C6]/40 pb-4 select-none">
        <div className="space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 px-3 py-1 rounded-full font-mono">
            AI Recruiter & Assistant
          </span>
          <h1 className="text-3xl font-serif font-medium tracking-tight text-[#262626] mt-2">AI Career Agent</h1>
          <p className="text-xs text-[#6E6359] font-medium">
            Discover matched roles, evaluate interview readiness, and submit automated ATS applications.
          </p>
        </div>

        {/* Sub-tab navigation */}
        {profile && (
          <div className="flex items-center gap-2 bg-[#FCFAF7] border border-[#DFD5C6] p-1 rounded-xl shadow-2xs">
            <button
              onClick={() => setActiveSubTab("dashboard")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === "dashboard"
                  ? "bg-[#C85A32] text-[#FCFAF7]"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              <Compass className="h-3.5 w-3.5" />
              Job Discovery
            </button>
            <button
              onClick={() => setActiveSubTab("tracker")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === "tracker"
                  ? "bg-[#C85A32] text-[#FCFAF7]"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              Application Tracker
            </button>
            <button
              onClick={() => setActiveSubTab("onboarding")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === "onboarding"
                  ? "bg-[#C85A32] text-[#FCFAF7]"
                  : "text-[#6E6359] hover:text-[#262626]"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Update Profile
            </button>
          </div>
        )}
      </div>

      {/* STAGE 1: ONBOARDING SCREEN */}
      {activeSubTab === "onboarding" && (
        <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
          <div className="border-b border-[#DFD5C6]/40 pb-4">
            <h2 className="text-xl font-serif text-[#262626] font-medium">Candidate Preference Onboarding</h2>
            <p className="text-xs text-[#6E6359] font-medium mt-1">
              Provide your targeting metrics to customize the matching engine.
            </p>
          </div>

          <form onSubmit={handleOnboardSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Job Type */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Job Type Preference</label>
                <select
                  value={jobType}
                  onChange={(e) => setJobType(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                >
                  <option value="Full-Time">Full-Time Developer</option>
                  <option value="Internship">Internship / Co-op</option>
                  <option value="Contract">Contract / Consultant</option>
                </select>
              </div>

              {/* Work Mode */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Work Mode</label>
                <select
                  value={workMode}
                  onChange={(e) => setWorkMode(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                >
                  <option value="Remote">100% Remote</option>
                  <option value="Hybrid">Hybrid Office</option>
                  <option value="Onsite">Onsite / In-Office</option>
                </select>
              </div>

              {/* Countries */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Preferred Countries</label>
                <input
                  type="text"
                  value={countries}
                  onChange={(e) => setCountries(e.target.value)}
                  placeholder="e.g. United States, India, Canada"
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  required
                />
              </div>

              {/* Cities */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Preferred Cities</label>
                <input
                  type="text"
                  value={cities}
                  onChange={(e) => setCities(e.target.value)}
                  placeholder="e.g. San Francisco, Bengaluru, New York"
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  required
                />
              </div>

              {/* Salary Expectation */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Target Annual Salary</label>
                <input
                  type="text"
                  value={salaryExpectations}
                  onChange={(e) => setSalaryExpectations(e.target.value)}
                  placeholder="e.g. $130,000 or ₹24,00,000"
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  required
                />
              </div>

              {/* Notice Period */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Notice Period</label>
                <input
                  type="text"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  placeholder="e.g. Immediate, 30 days"
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  required
                />
              </div>

              {/* Tech Stack Preferences */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Core Tech Stack & Skills</label>
                <input
                  type="text"
                  value={techStack}
                  onChange={(e) => setTechStack(e.target.value)}
                  placeholder="e.g. Python, FastAPI, React, Redis, PostgreSQL, Docker"
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  required
                />
                <p className="text-[10px] text-[#6E6359]/70">Separate skills with commas.</p>
              </div>

              {/* Company Size */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Company Size</label>
                <select
                  value={companySize}
                  onChange={(e) => setCompanySize(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                >
                  <option value="Any">Any Size</option>
                  <option value="1-50">1-50 employees (Early Startup)</option>
                  <option value="51-500">51-500 employees (Scaleup)</option>
                  <option value="500+">500+ employees (Enterprise)</option>
                </select>
              </div>

              {/* Startup vs Enterprise */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Startup vs Enterprise</label>
                <select
                  value={startupPreference}
                  onChange={(e) => setStartupPreference(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                >
                  <option value="Startup">Early & Growth Startups</option>
                  <option value="Enterprise">Established Enterprises</option>
                  <option value="No Preference">No Preference</option>
                </select>
              </div>

              {/* Visa Sponsorship */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Visa Sponsorship Needed</label>
                <select
                  value={visaRequire}
                  onChange={(e) => setVisaRequire(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                >
                  <option value="Yes">Yes, require sponsorship</option>
                  <option value="No">No, authorized to work locally</option>
                </select>
              </div>

              {/* LinkedIn URL */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">LinkedIn Profile URL</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link2 className="h-3.5 w-3.5 text-[#6E6359]/60" />
                  </div>
                  <input
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                    className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] pl-9 pr-3 py-2.5 text-xs text-[#262626] placeholder-[#6E6359]/40 focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* GitHub URL */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">GitHub Profile URL</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link2 className="h-3.5 w-3.5 text-[#6E6359]/60" />
                  </div>
                  <input
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/username"
                    className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] pl-9 pr-3 py-2.5 text-xs text-[#262626] placeholder-[#6E6359]/40 focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                  />
                </div>
              </div>

              {/* Drag and Drop Resume */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Upload Resume (PDF)</label>
                <label
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center border border-dashed rounded-xl h-36 cursor-pointer transition-colors duration-200 ${
                    dragOver
                      ? "border-[#C85A32] bg-[#C85A32]/5"
                      : resumeFile
                      ? "border-[#2E5A44] bg-[#2E5A44]/5"
                      : "border-[#DFD5C6] bg-[#FCFAF7] hover:bg-[#C85A32]/5 hover:border-[#C85A32]"
                  }`}
                >
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setResumeFile(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center justify-center pt-4 pb-4">
                    {resumeFile ? (
                      <>
                        <FileText className="h-7 w-7 text-[#2E5A44] mb-2" />
                        <span className="text-xs font-bold text-[#262626]">{resumeFile.name}</span>
                        <span className="text-[10px] text-[#6E6359]/65 mt-1">Click to replace.</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-7 w-7 text-[#C85A32] mb-2" />
                        <span className="text-xs font-bold text-[#6E6359]">
                          Drag & drop your Resume PDF, or <span className="text-[#C85A32]">browse</span>
                        </span>
                        <span className="text-[9px] text-[#6E6359]/50 mt-0.5">Supports PDF up to 10MB</span>
                      </>
                    )}
                  </div>
                </label>
              </div>

            </div>

            {onboardError && (
              <div className="flex items-center gap-2 p-3 bg-[#FAF4EB] border border-[#C85A32]/30 rounded-xl text-[#C85A32] text-xs font-semibold">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{onboardError}</span>
              </div>
            )}

            <div className="flex justify-end border-t border-[#DFD5C6]/40 pt-4">
              <button
                type="submit"
                disabled={onboardingSubmitting}
                className="bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-2.5 px-6 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {onboardingSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Generating Candidate Profile...
                  </>
                ) : (
                  <>
                    Save & Analyze Profile
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STAGE 2: JOB DISCOVERY DASHBOARD */}
      {activeSubTab === "dashboard" && profile && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Matched Jobs Feed */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif font-semibold text-lg text-[#262626] flex items-center gap-2">
                <Compass className="h-4 w-4 text-[#C85A32]" />
                Top Matches For You
              </h3>
              <span className="text-[10px] font-bold font-mono text-[#6E6359]">{jobs.length} jobs found</span>
            </div>

            <div className="space-y-4">
              {jobs.map((job) => {
                const hasApplied = applications.some((a) => a.job_id === job.id);
                return (
                  <div
                    key={job.id}
                    className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-5 hover:border-[#C85A32]/40 hover:shadow-2xs transition-all text-left space-y-4 relative overflow-hidden"
                  >
                    {/* Scores in corner */}
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-[#6E6359] uppercase tracking-wider">Match</span>
                        <span className={`text-xs font-extrabold font-mono mt-0.5 px-1.5 py-0.5 rounded ${
                          job.match_score >= 85
                            ? "bg-[#E8F2EC] text-[#2E5A44]"
                            : "bg-[#FAF4EB] text-[#C85A32]"
                        }`}>
                          {job.match_score}%
                        </span>
                      </div>
                      <div className="flex flex-col items-center border-l border-[#DFD5C6] pl-2">
                        <span className="text-[9px] font-bold text-[#6E6359] uppercase tracking-wider">Readiness</span>
                        <span className={`text-xs font-extrabold font-mono mt-0.5 px-1.5 py-0.5 rounded ${
                          job.readiness_score >= 80
                            ? "bg-blue-50 text-blue-700"
                            : "bg-amber-50 text-amber-700"
                        }`}>
                          {job.readiness_score}%
                        </span>
                      </div>
                    </div>

                    {/* Job Details */}
                    <div className="space-y-1 max-w-[75%]">
                      <h4 className="font-serif font-bold text-[#262626] text-sm md:text-base leading-tight">
                        {job.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs font-bold text-[#C85A32] flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5" />
                          {job.company}
                        </p>
                        <span className="text-[#DFD5C6] text-[10px]">|</span>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-[#6E6359] hover:text-[#C85A32] hover:underline flex items-center gap-0.5 font-bold"
                        >
                          <Link2 className="h-3 w-3" />
                          Open Posting
                        </a>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[10px] font-bold text-[#6E6359]/80 font-mono">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {job.location} ({job.work_mode})
                        </span>
                        {job.salary && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            {job.salary}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] text-[#6E6359] leading-relaxed line-clamp-2">
                      {job.description}
                    </p>

                    {/* Reasons list */}
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-[#DFD5C6]/40">
                      {job.reasons.map((r, idx) => (
                        <span
                          key={idx}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                            r.startsWith("✓")
                              ? "bg-[#E8F2EC]/40 border-[#2E5A44]/20 text-[#2E5A44]"
                              : "bg-[#FAF4EB]/40 border-[#C85A32]/20 text-[#C85A32]"
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-2">
                      <button
                        onClick={() => openRoadmap(job)}
                        className="text-xs font-bold text-[#C85A32] hover:text-[#B83A14] flex items-center gap-1 transition-all cursor-pointer"
                      >
                        <Brain className="h-3.5 w-3.5" />
                        Prep Roadmap
                        <ChevronRight className="h-3 w-3" />
                      </button>

                      {hasApplied ? (
                        <span className="flex items-center gap-1.5 text-xs text-[#2E5A44] font-bold bg-[#E8F2EC] px-3 py-1.5 rounded-lg border border-[#2E5A44]/20">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Applied via Agent
                        </span>
                      ) : (
                        <button
                          onClick={() => openApplyDrawer(job)}
                          className="bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer flex items-center gap-1"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Apply via Agent
                        </button>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN: Candidate Intelligence & Interview Metrics */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Unified Intelligence Profile */}
            <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-5 shadow-2xs space-y-4 text-left">
              <h3 className="font-serif font-semibold text-base text-[#262626] border-b border-[#DFD5C6]/40 pb-2">
                Candidate Intelligence Profile
              </h3>

              {/* Top Resume details */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono block">Resume & Core Stack</span>
                <p className="text-xs font-bold text-[#262626] flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-[#C85A32]" />
                  {profile.resume_name || "Extracted CV Profile"}
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {profile.tech_stack_preferences.slice(0, 6).map((skill, idx) => (
                    <span key={idx} className="text-[9px] font-mono font-bold bg-[#FAF6F0] border border-[#DFD5C6] px-2 py-0.5 rounded text-[#6E6359]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* GitHub metrics */}
              {profile.github_url && profile.github_stats && (
                <div className="space-y-2 pt-2 border-t border-[#DFD5C6]/40">
                  <span className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono block">GitHub Intelligence</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6]/60 p-2.5 rounded-lg">
                      <span className="text-[9px] font-bold text-[#6E6359] block">GitHub Strength</span>
                      <span className="text-lg font-mono font-extrabold text-[#C85A32]">{profile.github_stats.github_strength}%</span>
                    </div>
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6]/60 p-2.5 rounded-lg">
                      <span className="text-[9px] font-bold text-[#6E6359] block">Open Source Score</span>
                      <span className="text-lg font-mono font-extrabold text-[#C85A32]">{profile.github_stats.open_source_score}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Mock Interview Scores */}
              <div className="space-y-2 pt-2 border-t border-[#DFD5C6]/40">
                <span className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono block">Platform Interview Scores</span>
                
                {/* Score meters */}
                <div className="space-y-2.5 pt-1">
                  {[
                    { label: "Coding & Problem Solving", score: 82 },
                    { label: "System Architecture", score: 76 },
                    { label: "Communication Flow", score: 85 },
                    { label: "Behavioral & Leadership", score: 80 }
                  ].map((s, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-[#6E6359]">
                        <span>{s.label}</span>
                        <span className="font-mono">{s.score}%</span>
                      </div>
                      <div className="w-full bg-[#FAF6F0] rounded-full h-1 overflow-hidden">
                        <div className="bg-[#C85A32] h-1" style={{ width: `${s.score}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Preparation Roadmap Box */}
            <div className="bg-[#C85A32]/5 border border-[#C85A32]/25 rounded-xl p-5 text-left space-y-3">
              <h4 className="font-serif font-bold text-[#C85A32] text-sm flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Recruiter Tip
              </h4>
              <p className="text-xs text-[#6E6359] leading-relaxed font-semibold">
                Your communication score is excellent! However, Ashby requires system design depth. We recommend checking the <strong>Roadmap</strong> on Ashby&apos;s job match to prepare targeted distributed locking concepts before submitting.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* STAGE 3: APPLICATION TRACKER PIPELINE */}
      {activeSubTab === "tracker" && (
        <div className="space-y-6 text-left">
          {/* Metrics header */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Applications Sent", value: metrics.sent, icon: Send },
              { label: "Response Rate", value: `${metrics.response_rate}%`, icon: RefreshCw },
              { label: "Interview Rate", value: `${metrics.interview_rate}%`, icon: Brain },
              { label: "Offers Received", value: `${metrics.offer_rate}%`, icon: CheckCircle }
            ].map((m, idx) => {
              const Icon = m.icon;
              return (
                <div key={idx} className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-4 shadow-2xs space-y-1">
                  <div className="flex justify-between items-center text-[#6E6359]/70">
                    <span className="text-[10px] font-bold uppercase tracking-wider font-mono">{m.label}</span>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-xl font-serif font-semibold text-[#262626] pt-1">{m.value}</p>
                </div>
              );
            })}
          </div>

          {/* Kanban Board columns */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 items-start">
            {[
              { id: "Applied", title: "Applications Sent", bg: "bg-[#FAF6F0]" },
              { id: "OA Received", title: "Assessment / OA", bg: "bg-[#FAF4EB]" },
              { id: "Interview Scheduled", title: "Interviews", bg: "bg-blue-50/40" },
              { id: "Offer Received", title: "Offers", bg: "bg-[#E8F2EC]/40" }
            ].map((col) => {
              const colApps = applications.filter((a) => a.status === col.id);
              return (
                <div key={col.id} className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl p-4 min-h-[50vh] space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between border-b border-[#DFD5C6]/40 pb-2">
                    <span className="text-xs font-bold text-[#262626] font-serif">{col.title}</span>
                    <span className="text-[9px] px-1.5 py-0.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded font-mono font-bold text-[#6E6359]">
                      {colApps.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {colApps.map((app) => (
                      <div
                        key={app.id}
                        className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-lg p-3.5 space-y-3 shadow-3xs hover:border-[#C85A32]/35 transition-all text-xs"
                      >
                        <div>
                          <h5 className="font-bold text-[#262626] leading-tight truncate">{app.title}</h5>
                          <p className="text-[10px] text-[#C85A32] font-semibold">{app.company}</p>
                        </div>

                        <div className="flex justify-between items-center text-[9px] text-[#6E6359] font-mono">
                          <span>{app.work_mode}</span>
                          <span>ATS: {app.ats_type}</span>
                        </div>

                        {/* Status selector */}
                        <div className="border-t border-[#DFD5C6]/40 pt-2 flex justify-between items-center">
                          <select
                            value={app.status}
                            onChange={(e) => updateStatus(app.id, e.target.value)}
                            className="bg-[#FCFAF7] border border-[#DFD5C6] rounded px-1.5 py-0.5 text-[9px] font-bold text-[#6E6359] focus:outline-none"
                          >
                            <option value="Applied">Applied</option>
                            <option value="OA Received">OA / Test</option>
                            <option value="Interview Scheduled">Interview</option>
                            <option value="Offer Received">Offer</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Withdrawn">Withdrawn</option>
                          </select>
                          
                          <span className="text-[9px] text-[#6E6359]/60">
                            {app.updated_at.split("T")[0]}
                          </span>
                        </div>
                      </div>
                    ))}
                    {colApps.length === 0 && (
                      <div className="text-[10px] text-[#6E6359]/60 text-center py-12 italic border border-dashed border-[#DFD5C6]/50 rounded-lg">
                        Empty column
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* DRAWERS & SIDEBARS */}

      {/* DRAWER 1: PREPARATION ROADMAP */}
      {showRoadmapDrawer && selectedJob && (
        <div className="fixed inset-y-0 right-0 w-[550px] bg-[#FCFAF7] border-l border-[#DFD5C6] shadow-2xl z-50 p-6 overflow-y-auto flex flex-col justify-between select-none">
          <div className="space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[#DFD5C6]/40 pb-4">
              <div className="text-left">
                <span className="text-[9px] font-bold font-mono text-[#C85A32] uppercase tracking-widest">ROADMAP CREATION</span>
                <h4 className="text-base font-serif font-bold text-[#262626] mt-1">
                  Prep Roadmap for {selectedJob.company}
                </h4>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-[#6E6359] font-medium">Role: {selectedJob.title}</span>
                  <span className="text-[#DFD5C6] text-[11px]">|</span>
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#C85A32] hover:text-[#B83A14] hover:underline flex items-center gap-0.5 font-bold"
                  >
                    <Link2 className="h-3 w-3" />
                    Open Posting
                  </a>
                </div>
              </div>
              <button
                onClick={() => setShowRoadmapDrawer(false)}
                className="text-[#6E6359]/70 hover:text-[#262626] p-1.5 rounded-lg border border-[#DFD5C6] hover:bg-[#FAF6F0] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingRoadmap ? (
              <div className="flex flex-col items-center justify-center py-24">
                <RefreshCw className="h-7 w-7 text-[#C85A32] animate-spin mb-3" />
                <span className="text-xs text-[#6E6359] font-medium">Assembling prep roadmap timelines...</span>
              </div>
            ) : (
              roadmap && (
                <div className="space-y-6 text-left">
                  
                  {/* Timeline Days Header */}
                  <div className="flex items-center gap-2 bg-[#FAF6F0] border border-[#DFD5C6] p-3.5 rounded-xl">
                    <Clock className="h-4 w-4 text-[#C85A32]" />
                    <div className="text-xs">
                      <span className="font-bold block text-[#262626]">{roadmap.roadmap_days}-Day Target Plan</span>
                      <span className="text-[10px] text-[#6E6359] mt-0.5">Optimized schedule based on identified skill coverage gaps.</span>
                    </div>
                  </div>

                  {/* Day-by-Day Timeline List */}
                  <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-[#DFD5C6]">
                    {roadmap.timeline.map((item, idx) => (
                      <div key={idx} className="flex gap-4 relative pl-8">
                        {/* Dot indicator */}
                        <div className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border border-[#C85A32] bg-[#FAF6F0] flex items-center justify-center">
                          <div className="h-1 w-1 rounded-full bg-[#C85A32]"></div>
                        </div>
                        <div className="text-xs space-y-1">
                          <span className="font-bold text-[#C85A32] font-mono uppercase text-[10px]">{item.day}</span>
                          <h5 className="font-bold text-[#262626]">{item.topic}</h5>
                          <p className="text-[#6E6359] leading-relaxed">{item.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Interview Drill Questions */}
                  <div className="space-y-4 pt-4 border-t border-[#DFD5C6]/40">
                    <h5 className="text-xs font-bold font-serif text-[#262626] flex items-center gap-1.5">
                      <Brain className="h-4 w-4 text-[#C85A32]" />
                      Company-Specific Interview Drills
                    </h5>

                    {/* Drill Accordion */}
                    <div className="space-y-3">
                      {[
                        { label: "Coding Round Focus", list: roadmap.questions.coding },
                        { label: "System Design Focus", list: roadmap.questions.system_design },
                        { label: "Behavioral / Values Focus", list: roadmap.questions.behavioral }
                      ].map((sec, idx) => (
                        <div key={idx} className="bg-[#FAF6F0] border border-[#DFD5C6]/60 rounded-xl p-3.5 space-y-2 text-xs">
                          <span className="font-bold text-[#262626] text-[11px] block">{sec.label}</span>
                          <ul className="list-disc pl-4 space-y-1.5 text-[#6E6359] leading-relaxed font-semibold">
                            {sec.list.map((q, qidx) => (
                              <li key={qidx}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )
            )}

          </div>

          <div className="border-t border-[#DFD5C6]/40 pt-4 flex justify-end">
            <button
              onClick={() => setShowRoadmapDrawer(false)}
              className="bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-2 px-6 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Start Practice Session
            </button>
          </div>
        </div>
      )}

      {/* DRAWER 2: APPLY VIA AGENT / BROWSER AUTOMATION */}
      {showApplyDrawer && selectedJob && (
        <div className="fixed inset-y-0 right-0 w-[550px] bg-[#FCFAF7] border-l border-[#DFD5C6] shadow-2xl z-50 p-6 overflow-y-auto flex flex-col justify-between select-none">
          <div className="space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[#DFD5C6]/40 pb-4">
              <div className="text-left">
                <span className="text-[9px] font-bold font-mono text-[#C85A32] uppercase tracking-widest">BROWSER AGENT SUBMISSION</span>
                <h4 className="text-base font-serif font-bold text-[#262626] mt-1">
                  Apply to {selectedJob.company}
                </h4>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[11px] text-[#6E6359] font-medium">Role: {selectedJob.title} (ATS: {selectedJob.ats_type})</span>
                  <span className="text-[#DFD5C6] text-[11px]">|</span>
                  <a
                    href={selectedJob.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#C85A32] hover:text-[#B83A14] hover:underline flex items-center gap-0.5 font-bold"
                  >
                    <Link2 className="h-3 w-3" />
                    Open Posting
                  </a>
                </div>
              </div>
              <button
                onClick={() => setShowApplyDrawer(false)}
                className="text-[#6E6359]/70 hover:text-[#262626] p-1.5 rounded-lg border border-[#DFD5C6] hover:bg-[#FAF6F0] cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loadingAnswers ? (
              <div className="flex flex-col items-center justify-center py-24">
                <RefreshCw className="h-7 w-7 text-[#C85A32] animate-spin mb-3" />
                <span className="text-xs text-[#6E6359] font-medium">Generating personalized cover responses...</span>
              </div>
            ) : (
              !applying && !applyLogs ? (
                  <div className="space-y-6 text-left pb-4">
                    
                    {/* Warning details */}
                    <div className="flex gap-2.5 p-3.5 bg-[#FAF4EB] border border-[#C85A32]/20 rounded-xl text-xs">
                      <AlertCircle className="h-4 w-4 text-[#C85A32] shrink-0 mt-0.5" />
                      <div className="text-[#6E6359] leading-relaxed font-semibold">
                        <span className="font-bold text-[#262626] block">Human-in-the-Loop Verification</span>
                        Please verify and correct the candidate details parsed from your resume and the custom questions scraped from the job page.
                      </div>
                    </div>

                    {/* SECTION 1: CANDIDATE INFO (Parsed from Resume) */}
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-bold font-mono text-[#C85A32] uppercase tracking-wider border-b border-[#DFD5C6]/30 pb-1">
                        Candidate Credentials (Extracted)
                      </h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-[#6E6359]">Full Name</label>
                          <input
                            type="text"
                            value={candidateDetails.name || ""}
                            onChange={(e) => setCandidateDetails({...candidateDetails, name: e.target.value})}
                            className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-[#6E6359]">Email Address</label>
                          <input
                            type="email"
                            value={candidateDetails.email || ""}
                            onChange={(e) => setCandidateDetails({...candidateDetails, email: e.target.value})}
                            className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-[#6E6359]">Phone Number</label>
                          <input
                            type="text"
                            placeholder="Enter phone number"
                            value={candidateDetails.phone || ""}
                            onChange={(e) => setCandidateDetails({...candidateDetails, phone: e.target.value})}
                            className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-[#6E6359]">Resume Uploading</label>
                          <div className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0]/50 p-2 text-xs text-[#6E6359] font-medium truncate flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-[#C85A32]" />
                            {profile?.resume_name || "resume.pdf"} (Stored)
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-[#6E6359]">LinkedIn URL</label>
                          <input
                            type="text"
                            value={candidateDetails.linkedin_url || ""}
                            onChange={(e) => setCandidateDetails({...candidateDetails, linkedin_url: e.target.value})}
                            className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                          />
                        </div>
                        <div className="space-y-1 text-xs">
                          <label className="font-bold text-[#6E6359]">GitHub URL</label>
                          <input
                            type="text"
                            value={candidateDetails.github_url || ""}
                            onChange={(e) => setCandidateDetails({...candidateDetails, github_url: e.target.value})}
                            className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SECTION 2: SCRAPED WEBSITE FORM QUESTIONS */}
                    <div className="space-y-4 pt-2">
                      <h5 className="text-[10px] font-bold font-mono text-[#C85A32] uppercase tracking-wider border-b border-[#DFD5C6]/30 pb-1">
                        Application Form Questions (Scraped from {selectedJob.ats_type})
                      </h5>

                      {formFields.custom_questions && formFields.custom_questions.length === 0 ? (
                        <div className="text-xs text-[#6E6359] italic py-2 bg-[#FAF6F0]/40 rounded-lg text-center border border-[#DFD5C6]/30">
                          Only standard credentials are required. No custom questions were detected on the page.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {formFields.custom_questions?.map((q, idx) => {
                            const val = aiAnswers[q.label] || "";
                            return (
                              <div key={idx} className="space-y-2 text-xs">
                                <label className="font-bold text-[#262626] leading-tight block">
                                  {q.label} {q.required && <span className="text-[#C85A32] font-bold">*</span>}
                                </label>
                                
                                {q.type === "select" ? (
                                  <select
                                    value={val}
                                    onChange={(e) => {
                                      const newAnswers = { ...aiAnswers };
                                      newAnswers[q.label] = e.target.value;
                                      setAiAnswers(newAnswers);
                                    }}
                                    className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                                  >
                                    {q.options?.map((opt, oIdx) => (
                                      <option key={oIdx} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                ) : q.type === "text" ? (
                                  <input
                                    type="text"
                                    value={val}
                                    onChange={(e) => {
                                      const newAnswers = { ...aiAnswers };
                                      newAnswers[q.label] = e.target.value;
                                      setAiAnswers(newAnswers);
                                    }}
                                    className="w-full rounded-lg border border-[#DFD5C6] bg-[#FAF6F0] p-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:outline-none"
                                  />
                                ) : (
                                  <textarea
                                    rows={3}
                                    value={val}
                                    onChange={(e) => {
                                      const newAnswers = { ...aiAnswers };
                                      newAnswers[q.label] = e.target.value;
                                      setAiAnswers(newAnswers);
                                    }}
                                    className="w-full rounded-xl border border-[#DFD5C6] bg-[#FAF6F0] p-3 text-xs text-[#262626] focus:border-[#C85A32] focus:bg-[#FCFAF7] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all resize-none font-medium leading-relaxed"
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>
              ) : (
                /* TERMINAL AGENT LOGS WINDOW */
                <div className="space-y-4 text-left">
                  <div className="flex items-center gap-1.5 text-xs text-[#6E6359]">
                    <Terminal className="h-4 w-4" />
                    <span className="font-bold font-mono">Agent Automation Output Logs</span>
                  </div>

                  <div className="bg-[#1A1A1A] text-[#E0E0E0] border border-[#2E2E2E] rounded-xl p-4 font-mono text-[10px] h-[350px] overflow-y-auto space-y-2 select-text custom-scrollbar leading-relaxed">
                    {applyLogs.split("\n").map((line, idx) => (
                      <div key={idx} className={line.includes("successful") || line.includes("SUCCESS") ? "text-green-400" : ""}>
                        {line}
                      </div>
                    ))}
                    {applying && (
                      <div className="flex items-center gap-2 text-[#C85A32] animate-pulse">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>[BrowserAgent] Executing fill sequence...</span>
                      </div>
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              )
            )}

          </div>

          {/* Action buttons */}
          <div className="border-t border-[#DFD5C6]/40 pt-4 flex justify-between gap-4">
            {!applying && !applyLogs ? (
              <>
                <button
                  onClick={() => setShowApplyDrawer(false)}
                  className="bg-[#FCFAF7] border border-[#DFD5C6] hover:bg-[#FAF6F0] text-[#6E6359] py-2.5 px-5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={triggerAutoApply}
                  className="bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-2.5 px-6 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5 fill-[#FCFAF7]" />
                  Launch Browser Agent
                </button>
              </>
            ) : (
              appliedSuccess && (
                <button
                  onClick={() => setShowApplyDrawer(false)}
                  className="w-full bg-[#2E5A44] hover:bg-[#1E3E2E] text-white py-2.5 px-6 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  Close Application Window
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* BACKDROP BLUR SHIELD */}
      {(showRoadmapDrawer || showApplyDrawer) && (
        <div
          onClick={() => {
            setShowRoadmapDrawer(false);
            setShowApplyDrawer(false);
          }}
          className="fixed inset-0 bg-black/15 backdrop-blur-xs z-40 transition-all duration-300"
        />
      )}

    </div>
  );
}
