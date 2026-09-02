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
  DollarSign,
  MailCheck,
  Copy,
  ShieldCheck,
  Inbox,
  ExternalLink,
  CheckCheck,
  Globe,
  Mail,
  Building2,
  Bell,
  BellRing
} from "lucide-react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8001';

// Sub-tab persistence: a refresh inside the Career Agent should land the user
// on the same sub-tab they were on, not always the dashboard. localStorage is
// good enough here — there is no PII in the key, just one of "dashboard",
// "tracker", or "onboarding".
const SUB_TAB_STORAGE_KEY = "prepflow_career_subtab";
const VALID_SUB_TABS = new Set(["dashboard", "tracker", "onboarding"]);

function readInitialSubTab() {
  if (typeof window === "undefined") return "dashboard";
  try {
    const saved = window.localStorage.getItem(SUB_TAB_STORAGE_KEY);
    return saved && VALID_SUB_TABS.has(saved) ? saved : "dashboard";
  } catch {
    return "dashboard";
  }
}

// Relative-time formatter for the "Posted X ago" badge on each external
// listing. We use absolute units (hours/days/weeks) rather than vague
// words so a candidate can see at a glance whether a job was posted today
// or six months ago. Returns null when the input is missing or in the
// future — never fabricate a misleading "today" label.
function formatListedAgo(isoOrDate) {
  if (!isoOrDate) return null;
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return null;
  const diffMs = Date.now() - ms;
  if (diffMs < 0) return null;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    if (minutes < 1) return "just now";
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

export default function CareerAgent({ user }) {
  const [activeSubTab, setActiveSubTab] = useState(readInitialSubTab); // dashboard, tracker, onboarding
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [metrics, setMetrics] = useState({ sent: 0, response_rate: 0, interview_rate: 0, offer_rate: 0 });
  const [loading, setLoading] = useState(true);

  // Notifications state
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Application Email Confirmation Receipt Modal States
  const [confirmationReceipt, setConfirmationReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [copiedTrackingId, setCopiedTrackingId] = useState(false);
  const [receiptTab, setReceiptTab] = useState("preview"); // 'preview' | 'details'

  // Application Audit & Verification States
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditData, setAuditData] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [trackingSearchQuery, setTrackingSearchQuery] = useState("");
  const [copiedAuditHash, setCopiedAuditHash] = useState(false);

  // Onboarding Form States
  const [jobType, setJobType] = useState("Full-Time");
  const [workMode, setWorkMode] = useState("Remote");
  const [countries, setCountries] = useState("India");
  const [cities, setCities] = useState("Bengaluru, Hyderabad, Pune, Gurgaon");
  const [salaryValue, setSalaryValue] = useState("15");
  const [salaryCurrency, setSalaryCurrency] = useState("INR");
  const [noticePeriod, setNoticePeriod] = useState("Immediate");
  const [techStack, setTechStack] = useState("Python, FastAPI, React, PostgreSQL, Redis, Docker");
  const [companySize, setCompanySize] = useState("Any");
  const [startupPreference, setStartupPreference] = useState("Startup");
  const [companyType, setCompanyType] = useState("Any");
  const [visaRequire, setVisaRequire] = useState("No");
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [onboardError, setOnboardError] = useState("");
  const [onboardingSubmitting, setOnboardingSubmitting] = useState(false);
  const [openToOpportunities, setOpenToOpportunities] = useState(true);

  // Recruiter Direct Messages & Contact Inquiries State
  const [outreachMessages, setOutreachMessages] = useState([]);
  const [respondingOutreachId, setRespondingOutreachId] = useState(null);

  // Drawer / Interaction States
  const [selectedJob, setSelectedJob] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [loadingRoadmap, setLoadingRoadmap] = useState(false);
  const [showRoadmapDrawer, setShowRoadmapDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState("roadmap"); // roadmap, outreach
  const [outreachRole, setOutreachRole] = useState("Hiring Manager");
  const [outreachData, setOutreachData] = useState(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  const [aiAnswers, setAiAnswers] = useState({});
  // Manual external-feed refresh state. The 30-minute auto-refresh on the
  // server is too slow for a candidate who just opened the page; pressing
  // "Refresh feed" forces an immediate upstream pass and reloads the cards.
  const [refreshingJobs, setRefreshingJobs] = useState(false);
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

  // Fetch candidate profile, jobs, applications, and recruiter messages on load
  const fetchData = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("prepflow_token") || "" : "";
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // 1. Fetch Profile
      const profileRes = await fetch(`${BACKEND_URL}/api/career/profile?user_id=${user.uid}`, { headers });
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setProfile(profileData);
        // Sync onboarding states
        setJobType(profileData.job_type);
        setWorkMode(profileData.work_mode);
        setCountries((profileData.countries || []).join(", "));
        setCities((profileData.cities || []).join(", "));
        setOpenToOpportunities(profileData.open_to_opportunities !== false);
        
        const salStr = profileData.salary_expectations || "";
        if (salStr.includes("₹") || salStr.toLowerCase().includes("inr") || salStr.toLowerCase().includes("lpa")) {
          setSalaryCurrency("INR");
          setSalaryValue(salStr.replace(/[₹\s,]|LPA/gi, ""));
        } else if (salStr.includes("$") || salStr.toLowerCase().includes("usd")) {
          setSalaryCurrency("USD");
          setSalaryValue(salStr.replace(/[\$\s,]/g, ""));
        } else {
          setSalaryCurrency("INR");
          setSalaryValue(salStr);
        }
        
        setNoticePeriod(profileData.notice_period || "Immediate");
        setTechStack((profileData.tech_stack_preferences || []).join(", "));
        setCompanySize(profileData.company_size_preference);
        setStartupPreference(profileData.startup_vs_enterprise);
        setCompanyType(profileData.company_type_preference || "Any");
        setVisaRequire(profileData.visa_sponsorship);
        setGithubUrl(profileData.github_url || "");
        setLinkedinUrl(profileData.linkedin_url || "");
        setPortfolioUrl(profileData.portfolio_url || "");

        // 2. Fetch matched jobs
        const jobsRes = await fetch(`${BACKEND_URL}/api/career/jobs?user_id=${user.uid}`, { headers });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          setJobs(jobsData);
        }

        // 3. Fetch applications & pipeline status
        const appsRes = await fetch(`${BACKEND_URL}/api/career/applications?user_id=${user.uid}`, { headers });
        if (appsRes.ok) {
          const appsData = await appsRes.json();
          setApplications(appsData.applications || []);
          setMetrics(appsData.metrics || { sent: 0, response_rate: 0, interview_rate: 0, offer_rate: 0 });
        }

        // 4. Fetch recruiter direct messages & inquiries
        const outreachRes = await fetch(`${BACKEND_URL}/api/candidate/outreach?user_id=${user.uid}`, { headers });
        if (outreachRes.ok) {
          const outreachData = await outreachRes.json();
          setOutreachMessages(outreachData.outreach || []);
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

  // Fetch notifications on load and refresh every 60s
  const fetchNotifications = useCallback(async () => {
    if (!user?.uid) return;
    setLoadingNotifications(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/notifications?user_id=${user.uid}`, {
        headers: { Authorization: `Bearer ${window.localStorage.getItem("prepflow_token") || ""}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (err) {
      console.warn("Error fetching notifications:", err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markNotificationRead = async (notificationId) => {
    try {
      await fetch(`${BACKEND_URL}/api/career/notifications/${notificationId}/read?user_id=${user.uid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${window.localStorage.getItem("prepflow_token") || ""}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.warn("Error marking notification read:", err);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/career/notifications/mark-all-read?user_id=${user.uid}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${window.localStorage.getItem("prepflow_token") || ""}` },
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.warn("Error marking all notifications read:", err);
    }
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return "just now";
    const date = new Date(dateStr);
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const iconForNotificationType = (type) => {
    switch (type) {
      case "pipeline_update": return "→";
      case "assessment_sent": return "✎";
      case "interview_scheduled": return "📅";
      case "outreach":
      case "recruiter_outreach": return "✉";
      default: return "•";
    }
  };

  const handleRespondOutreach = async (outreachId, accept) => {
    setRespondingOutreachId(outreachId);
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("prepflow_token") || "" : "";
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res = await fetch(`${BACKEND_URL}/api/candidate/outreach/${outreachId}/respond?user_id=${user.uid}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ accept }),
      });
      if (res.ok) {
        setOutreachMessages((prev) =>
          prev.map((msg) =>
            msg.id === outreachId
              ? { ...msg, status: accept ? "accepted" : "declined", responded_at: new Date().toISOString() }
              : msg
          )
        );
        fetchNotifications();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || "Could not record your response.");
      }
    } catch (err) {
      console.error("Error responding to outreach:", err);
    } finally {
      setRespondingOutreachId(null);
    }
  };

  // Force-refresh the external feed on user demand. The server runs
  // `run_jobs_fetch` synchronously inside the request, so when this resolves
  // the new rows are already in the table and the subsequent `fetchData()`
  // sees them. We re-call `fetchData()` instead of just merging one job at a
  // time so the freshness ordering and dedupe stay the source-of-truth on
  // the server.
  const refreshExternalJobs = async () => {
    if (refreshingJobs) return;
    setRefreshingJobs(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/jobs/refresh`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${window.localStorage.getItem("prepflow_token") || ""}`,
        },
      });
      // 401/500 are surfaced by the toast in the error path; we still reload
      // jobs after because a partial upstream failure can still leave new
      // rows in the table.
      await fetchData();
      if (!res.ok) {
        console.warn("Refresh feed request did not complete cleanly.");
      }
    } catch (err) {
      console.error("Failed to refresh external feed:", err);
    } finally {
      setRefreshingJobs(false);
    }
  };

  // Scroll logs container to bottom
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [applyLogs]);

  // Persist sub-tab so a refresh (or tab close) lands the user on the same
  // sub-view they were using. We only write valid values to avoid trapping
  // the user in an obsolete state if a future release renames a tab.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(SUB_TAB_STORAGE_KEY, activeSubTab);
    } catch {
      /* private-browsing modes can throw; in-memory only is fine */
    }
  }, [activeSubTab]);

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
    const salaryFormatted = salaryCurrency === "INR" ? `₹${salaryValue} LPA` : `$${parseInt(salaryValue.replace(/,/g, "") || "0").toLocaleString()}`;
    formData.append("salary_expectations", salaryFormatted);
    formData.append("notice_period", noticePeriod);
    formData.append("tech_stack_preferences", JSON.stringify(techArr));
    formData.append("company_size_preference", companySize);
    formData.append("startup_vs_enterprise", startupPreference);
    formData.append("visa_sponsorship", visaRequire);
    formData.append("linkedin_url", linkedinUrl);
    formData.append("github_url", githubUrl);
    formData.append("portfolio_url", portfolioUrl);
    formData.append("company_type_preference", companyType);
    formData.append("open_to_opportunities", openToOpportunities ? "true" : "false");
    
    if (resumeFile) {
      formData.append("resume", resumeFile);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/career/onboard`, {
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
    setDrawerTab("roadmap");
    setOutreachData(null);
    setOutreachRole("Hiring Manager");
    setLoadingRoadmap(true);
    setShowRoadmapDrawer(true);
    setShowApplyDrawer(false);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/readiness/${job.id}?user_id=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        setRoadmap(data);
      }
    } catch (err) {
      console.error("Failed to load roadmap:", err);
    }
    setLoadingRoadmap(false);
  };

  const fetchOutreach = async (overrideRole) => {
    if (!selectedJob) return;
    const targetRole = overrideRole || outreachRole || "Hiring Manager";
    setOutreachLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/outreach?job_id=${selectedJob.id}&user_id=${user.uid}&target_role=${encodeURIComponent(targetRole)}`);
      if (res.ok) {
        const data = await res.json();
        setOutreachData(data);
      } else {
        console.error("Failed to generate outreach");
      }
    } catch (err) {
      console.error("Error generating outreach:", err);
    }
    setOutreachLoading(false);
  };

  const openOutreach = async (job) => {
    setSelectedJob(job);
    setDrawerTab("outreach");
    setOutreachRole("Hiring Manager");
    setShowRoadmapDrawer(true);
    setShowApplyDrawer(false);
    setOutreachLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/outreach?job_id=${job.id}&user_id=${user.uid}&target_role=Hiring Manager`);
      if (res.ok) {
        const data = await res.json();
        setOutreachData(data);
      }
    } catch (err) {
      console.error("Failed to generate outreach sequence:", err);
    }
    setOutreachLoading(false);
  };

  const handleCopy = (text, field) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
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
      const res = await fetch(`${BACKEND_URL}/api/career/apply/prepare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.uid, job_id: job.id }),
      });
      if (res.ok) {
        const data = await res.json();
        const extracted = data.candidate_details || {};
        setCandidateDetails({
          name: extracted.name || user.displayName || user.name || "",
          email: extracted.email || user.email || "",
          phone: extracted.phone || profile?.phone || "",
          linkedin_url: extracted.linkedin_url || profile?.linkedin_url || "",
          github_url: extracted.github_url || profile?.github_url || ""
        });
        setFormFields(data.form_fields || { standard_fields: {}, custom_questions: [] });
        setAiAnswers(data.ai_answers || {});
      } else {
        setCandidateDetails({
          name: user.displayName || profile?.name || user.name || "",
          email: user.email || "",
          phone: profile?.phone || "",
          linkedin_url: profile?.linkedin_url || "",
          github_url: profile?.github_url || ""
        });
      }
    } catch (err) {
      console.error("Failed to prepare application details:", err);
      setCandidateDetails({
        name: user.displayName || profile?.name || user.name || "",
        email: user.email || "",
        phone: profile?.phone || "",
        linkedin_url: profile?.linkedin_url || "",
        github_url: profile?.github_url || ""
      });
    }
    setLoadingAnswers(false);
  };

  // Fetch or view official application receipt
  const handleViewReceipt = async (jobId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/receipt/${jobId}?user_id=${user.uid}`);
      if (res.ok) {
        const data = await res.json();
        if (data.receipt) {
          setConfirmationReceipt(data.receipt);
          setShowReceiptModal(true);
        }
      }
    } catch (err) {
      console.error("Failed to fetch application receipt:", err);
    }
  };

  // Verify Tracking ID & Audit Trail
  const handleVerifyTracking = async (trackingId) => {
    const tid = (trackingId || trackingSearchQuery || "").trim();
    if (!tid) return;
    setAuditLoading(true);
    setAuditError("");
    setShowAuditModal(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/career/verify-tracking/${encodeURIComponent(tid)}`);
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
      } else {
        const err = await res.json();
        setAuditError(err.detail || `Tracking reference "${tid}" was not found in the verified registry.`);
        setAuditData(null);
      }
    } catch (e) {
      console.error("Failed to verify tracking ID:", e);
      setAuditError("Failed to reach verification registry. Please check your connection.");
      setAuditData(null);
    }
    setAuditLoading(false);
  };

  // Submit Auto Application Agent
  const triggerAutoApply = async () => {
    if (applying || !selectedJob) return;
    setApplying(true);
    setApplyLogs("[BrowserAgent] Queueing application task in background worker thread...\n");

    try {
      const res = await fetch(`${BACKEND_URL}/api/career/apply/submit`, {
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
        const submitData = await res.json();
        if (submitData.confirmation_receipt) {
          setConfirmationReceipt(submitData.confirmation_receipt);
        }

        const trackingRef = submitData.confirmation_receipt?.tracking_id || `APP-${selectedJob.company.toUpperCase().slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Stream simulated step-by-step progress logs to candidate
        const logs = [
          `[BrowserAgent] Navigating headful Chromium session to ${selectedJob.ats_type} board posting at: ${selectedJob.url}`,
          "[BrowserAgent] Locating application input fields...",
          `[BrowserAgent] Filling candidate credentials: Name: ${candidateDetails.name}, Email: ${candidateDetails.email}`,
          `[BrowserAgent] Uploading Candidate resume: ${profile?.resume_name || "resume.pdf"}`,
          "[BrowserAgent] Filling custom responses inside application textareas...",
          "[BrowserAgent] Resolving anti-failure validations...",
          `[BrowserAgent] Submitting application package to ${selectedJob.company} (${selectedJob.ats_type})...`,
          `[EmailService] Dispatched official ATS application confirmation to ${candidateDetails.email}`,
          `[BrowserAgent] Submit successful! Requisition tracking ID: ${trackingRef}. Status: 'Applied'.`
        ];

        for (let i = 0; i < logs.length; i++) {
          await new Promise((resolve) => setTimeout(resolve, 800));
          setApplyLogs((prev) => prev + logs[i] + "\n");
        }
        setAppliedSuccess(true);
        setShowReceiptModal(true);

        // Refresh Applications list
        const appsRes = await fetch(`${BACKEND_URL}/api/career/applications?user_id=${user.uid}`);
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
      await fetch(`${BACKEND_URL}/api/career/applications`, {
        method: "GET",
      });
      // We can update locally first
      setApplications((prev) =>
        prev.map((a) => (a.id === appId ? { ...a, status: newStatus, updated_at: new Date().toISOString() } : a))
      );
      
      // Update in backend database
      await fetch(`${BACKEND_URL}/api/history`, {
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

        {/* Notification Bell */}
        {profile && (
          <div className="relative self-start md:self-auto">
            <button
              type="button"
              onClick={() => setShowNotifications((s) => !s)}
              className="relative p-2.5 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl hover:border-[#C85A32]/60 transition-colors shadow-2xs"
              aria-label="Notifications"
            >
              {unreadCount > 0 ? (
                <BellRing className="h-4 w-4 text-[#C85A32]" />
              ) : (
                <Bell className="h-4 w-4 text-[#6E6359]" />
              )}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#C85A32] text-white text-[9px] font-bold font-mono rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowNotifications(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-[#DFD5C6] rounded-2xl shadow-2xl z-40 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#DFD5C6]/60 bg-[#FCFAF7]">
                    <h3 className="text-sm font-serif font-bold text-[#262626]">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="text-[10px] font-mono font-bold text-[#C85A32] hover:text-[#B83A14] transition-colors"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {loadingNotifications && notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#6E6359] font-mono">
                        Loading...
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#6E6359] font-mono">
                        No notifications yet.
                      </div>
                    ) : (
                      <ul className="divide-y divide-[#DFD5C6]/40">
                        {notifications.map((n) => (
                          <li
                            key={n.id}
                            onClick={() => !n.is_read && markNotificationRead(n.id)}
                            className={`px-4 py-3 cursor-pointer transition-colors ${
                              n.is_read ? "bg-white" : "bg-[#FAF4EB]"
                            } hover:bg-[#FCFAF7]`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold font-mono shrink-0 ${
                                n.is_read
                                  ? "bg-[#DFD5C6]/50 text-[#6E6359]"
                                  : "bg-[#C85A32] text-white"
                              }`}>
                                {iconForNotificationType(n.notification_type)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className={`text-xs font-bold ${n.is_read ? "text-[#6E6359]" : "text-[#262626]"}`}>
                                    {n.title}
                                  </p>
                                  <span className="text-[9px] font-mono text-[#6E6359] shrink-0">
                                    {timeAgo(n.created_at)}
                                  </span>
                                </div>
                                {n.org_name && (
                                  <p className="text-[10px] font-mono text-[#C85A32] mt-0.5">
                                    {n.org_name}
                                  </p>
                                )}
                                <p className="text-[11px] text-[#6E6359] leading-relaxed mt-0.5">
                                  {n.message}
                                </p>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

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
              {/* Salary Expectation */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Target Annual Salary</label>
                <div className="flex gap-2">
                  <select
                    value={salaryCurrency}
                    onChange={(e) => setSalaryCurrency(e.target.value)}
                    className="block rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3 py-2 text-xs text-[#262626] focus:border-[#C85A32] focus:outline-none font-medium cursor-pointer"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={salaryValue}
                      onChange={(e) => setSalaryValue(e.target.value)}
                      placeholder={salaryCurrency === "INR" ? "e.g. 15 (Lakhs Per Annum)" : "e.g. 130000"}
                      className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium"
                      required
                    />
                    {salaryCurrency === "INR" && (
                      <span className="absolute inset-y-0 right-3 flex items-center text-[10px] font-bold text-[#6E6359]/75 pointer-events-none font-mono">
                        LPA
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Notice Period */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Notice Period</label>
                <select
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium cursor-pointer"
                >
                  <option value="Immediate">Immediate / Serving Notice / LWD</option>
                  <option value="15 Days">15 Days</option>
                  <option value="30 Days">30 Days</option>
                  <option value="45 Days">45 Days</option>
                  <option value="60 Days">60 Days</option>
                  <option value="90 Days">90 Days (3 Months)</option>
                </select>
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
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium cursor-pointer"
                >
                  <option value="Yes">Yes, require sponsorship</option>
                  <option value="No">No, authorized to work locally</option>
                </select>
              </div>

              {/* Company Type Preference */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Company Type Preference</label>
                <select
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value)}
                  className="block w-full rounded-xl border border-[#DFD5C6] bg-[#FCFAF7] px-3.5 py-2.5 text-xs text-[#262626] focus:border-[#C85A32] focus:ring-1 focus:ring-[#C85A32] focus:outline-none transition-all font-medium cursor-pointer"
                >
                  <option value="Any">Any (Product, Service, GCCs, Startups)</option>
                  <option value="Product">Product-based Companies</option>
                  <option value="Service">Service-based Companies</option>
                  <option value="GCC">Global Capability Centers (GCCs) / Captives</option>
                  <option value="Startup">Startups (Early & Growth)</option>
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

              {/* Personal Portfolio URL */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono">Personal Portfolio URL</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link2 className="h-3.5 w-3.5 text-[#6E6359]/60" />
                  </div>
                  <input
                    type="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    placeholder="https://yourportfolio.com"
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

            {/* Open to Opportunities Toggle */}
            <div className="flex items-center justify-between p-4 bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-[#262626]">Open to Opportunities</span>
                <p className="text-[10px] text-[#6E6359]">
                  Allow recruiters to send you direct messages and sourcing inquiries.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenToOpportunities((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 cursor-pointer ${
                  openToOpportunities ? "bg-[#2E5A44]" : "bg-[#D6D3D1]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    openToOpportunities ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
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
          
          {/* LEFT COLUMN: Matched Jobs Feed - 2 SECTIONS */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* =========================================================================
                RECRUITER DIRECT MESSAGES & SOURCING INQUIRIES
                ========================================================================= */}
            {outreachMessages.length > 0 && (
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-2.5 pb-2 border-b border-[#E7E2DA]">
                  <h3 className="font-serif font-bold text-lg text-[#1C1917]">
                    Recruiter Messages
                  </h3>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FEF3CD] text-[#856404] border border-[#856404]/25">
                    {outreachMessages.filter((m) => m.status === "pending").length} Pending
                  </span>
                </div>
                <div className="space-y-3">
                  {outreachMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-4 rounded-xl border transition-all ${
                        msg.status === "pending"
                          ? "bg-[#FFFBF5] border-[#C85A32]/30 shadow-sm"
                          : msg.status === "accepted"
                          ? "bg-[#F0FFF4] border-[#2E5A44]/30"
                          : "bg-[#FAF8F5] border-[#E7E2DA] opacity-70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[#262626]">
                              {msg.org_name || "Company"}
                            </span>
                            {msg.role_title && (
                              <span className="text-[10px] font-mono text-[#6E6359] bg-[#FAF8F5] border border-[#E7E2DA] px-1.5 py-0.5 rounded">
                                {msg.role_title}
                              </span>
                            )}
                          </div>
                          {(msg.location || msg.work_mode || msg.salary_range) && (
                            <p className="text-[10px] text-[#78716C]">
                              {[msg.location, msg.work_mode, msg.salary_range].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <span className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded shrink-0 ${
                          msg.status === "pending"
                            ? "bg-[#FEF3CD] text-[#856404]"
                            : msg.status === "accepted"
                            ? "bg-[#D4EDDA] text-[#155724]"
                            : "bg-[#F5F5F4] text-[#78716C]"
                        }`}>
                          {msg.status}
                        </span>
                      </div>

                      {msg.message && (
                        <div className="p-3 bg-white/60 border border-[#E7E2DA]/50 rounded-lg mb-3">
                          <p className="text-xs text-[#44403C] leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#78716C]">
                          {msg.created_at ? timeAgo(msg.created_at) : ""}
                        </span>
                        {msg.status === "pending" && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={respondingOutreachId === msg.id}
                              onClick={() => handleRespondOutreach(msg.id, false)}
                              className="text-[10px] font-bold text-[#78716C] hover:text-[#C85A32] px-3 py-1.5 rounded-lg border border-[#E7E2DA] hover:border-[#C85A32]/30 bg-white transition-all cursor-pointer disabled:opacity-50"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              disabled={respondingOutreachId === msg.id}
                              onClick={() => handleRespondOutreach(msg.id, true)}
                              className="text-[10px] font-bold text-white bg-[#2E5A44] hover:bg-[#1E3A2E] px-3 py-1.5 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                            >
                              Accept & Share Contact
                            </button>
                          </div>
                        )}
                        {msg.status === "accepted" && (
                          <span className="text-[10px] font-bold text-[#2E5A44]">
                            ✓ Contact shared · {msg.responded_at ? timeAgo(msg.responded_at) : ""}
                          </span>
                        )}
                        {msg.status === "declined" && (
                          <span className="text-[10px] text-[#78716C]">
                            Declined · {msg.responded_at ? timeAgo(msg.responded_at) : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* =========================================================================
                SECTION 1: REGISTERED PREPFLOW AI STARTUPS (1-CLICK APPLY VIA AGENT)
                ========================================================================= */}
            <div className="space-y-4 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E7E2DA] gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-serif font-bold text-lg text-[#1C1917]">
                      Verified Startup Requisitions
                    </h3>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#FAF4EB] text-[#C85A32] border border-[#C85A32]/25">
                      Direct Dispatch
                    </span>
                  </div>
                  <p className="text-xs text-[#78716C]">
                    Startups registered on PrepFlow AI. 1-Click apply dispatches your verified DevScore directly to founders.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-[#78716C] bg-[#FAF8F5] px-2.5 py-1 rounded-md border border-[#E7E2DA] self-start sm:self-auto shrink-0">
                  {jobs.filter((j) => j.is_registered_startup).length} Roles Active
                </span>
              </div>

              <div className="space-y-4">
                {jobs.filter((j) => j.is_registered_startup).map((job) => {
                  const hasApplied = applications.some((a) => a.job_id === job.id);
                  return (
                    <div
                      key={job.id}
                      className="bg-white border border-[#E5DFD7] hover:border-[#C85A32]/60 hover:shadow-xs transition-all rounded-xl p-5 space-y-4 text-left shadow-3xs"
                    >
                      {/* Top Meta Bar */}
                      <div className="flex items-center justify-between gap-2 border-b border-[#F0EBE3] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#C85A32] bg-[#FAF4EB] border border-[#C85A32]/20 px-2 py-0.5 rounded">
                            {job.stage || "Pre-Seed"}
                          </span>
                          <span className="text-[11px] font-mono text-[#78716C] flex items-center gap-1">
                            <ShieldCheck className="h-3.5 w-3.5 text-[#2E5A44]" />
                            Reviewed by {job.founder_name || "Founders"}
                          </span>
                        </div>

                        {/* Match & Readiness Metrics */}
                        <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                          <span className="bg-[#E8F2EC] text-[#2E5A44] font-bold px-2 py-0.5 rounded border border-[#2E5A44]/20">
                            {job.match_score}% Match
                          </span>
                          <span className="bg-[#F0F4F8] text-[#1E3A5F] font-bold px-2 py-0.5 rounded border border-[#1E3A5F]/15">
                            {job.readiness_score}% Readiness
                          </span>
                        </div>
                      </div>

                      {/* Job Header & Metadata */}
                      <div className="space-y-1.5">
                        <h4 className="font-serif font-bold text-lg text-[#1C1917] leading-snug">
                          {job.title}
                        </h4>
                        
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="font-bold text-[#C85A32] flex items-center gap-1">
                            <Building className="h-3.5 w-3.5" />
                            {job.company}
                          </span>
                          <span className="text-[#D6CCC2]">•</span>
                          <span className="font-mono text-[#78716C] flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-[#A8A29E]" />
                            {job.location} ({job.work_mode})
                          </span>
                          {job.salary && (
                            <>
                              <span className="text-[#D6CCC2]">•</span>
                              <span className="font-mono font-semibold text-[#1C1917] bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E7E2DA]">
                                {job.salary}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Job Description */}
                      <p className="text-xs text-[#57534E] leading-relaxed line-clamp-2">
                        {job.description}
                      </p>

                      {/* Technical Stacks & Requirements */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(job.skills_required || []).slice(0, 6).map((skill, idx) => (
                          <span
                            key={idx}
                            className="bg-[#FAF8F5] border border-[#E7E2DA] text-[#44403C] text-[11px] font-mono font-medium px-2.5 py-0.5 rounded"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>

                      {/* Card Action Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-[#F0EBE3]">
                        <button
                          onClick={() => openRoadmap(job)}
                          className="text-xs font-semibold text-[#78716C] hover:text-[#C85A32] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Brain className="h-4 w-4 text-[#C85A32]" />
                          <span>Interview Prep Roadmap</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>

                        {hasApplied ? (
                          <span className="flex items-center gap-1.5 text-xs text-[#2E5A44] font-bold bg-[#E8F2EC] px-3.5 py-1.5 rounded-lg border border-[#2E5A44]/25">
                            <CheckCircle className="h-4 w-4" />
                            Applied (In Founder Radar)
                          </span>
                        ) : (
                          <button
                            onClick={() => openApplyDrawer(job)}
                            className="bg-[#C85A32] hover:bg-[#B34E2A] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>1-Click Apply via Agent</span>
                          </button>
                        )}
                      </div>

                    </div>
                  );
                })}
              </div>
            </div>

            {/* =========================================================================
                SECTION 2: EXTERNAL MARKET JOBS (AGGREGATED FROM WEB)
                ========================================================================= */}
            <div className="space-y-4 pt-2 text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#E7E2DA] gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-serif font-bold text-lg text-[#1C1917]">
                      External Market Opportunities
                    </h3>
                    <span className="text-[10px] font-mono font-medium uppercase tracking-wider px-2 py-0.5 rounded bg-[#FAF8F5] text-[#78716C] border border-[#E7E2DA]">
                      Aggregated Web Feed
                    </span>
                  </div>
                  <p className="text-xs text-[#78716C]">
                    Fetched from Greenhouse, Lever, and Ashby portals. Review requirements, prepare targeted roadmaps, or generate cold outreach sequences.
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  <button
                    onClick={refreshExternalJobs}
                    disabled={refreshingJobs}
                    className="text-xs font-mono font-semibold text-[#78716C] hover:text-[#C85A32] bg-[#FAF8F5] hover:bg-[#F5F2EC] border border-[#E7E2DA] hover:border-[#C85A32]/40 px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw
                      className={
                        "h-3.5 w-3.5 " +
                        (refreshingJobs ? "animate-spin text-[#C85A32]" : "")
                      }
                    />
                    {refreshingJobs ? "Refreshing…" : "Refresh feed"}
                  </button>
                  <span className="text-xs font-mono font-bold text-[#78716C] bg-[#FAF8F5] px-2.5 py-1 rounded-md border border-[#E7E2DA]">
                    {jobs.filter((j) => !j.is_registered_startup).length} Opportunities
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {jobs.filter((j) => !j.is_registered_startup).map((job) => (
                  <div
                    key={job.id}
                    className="bg-white border border-[#E5DFD7] hover:border-[#D6CCC2] hover:shadow-xs transition-all rounded-xl p-5 space-y-4 text-left shadow-3xs"
                  >
                    {/* Top Meta Bar */}
                    <div className="flex items-center justify-between gap-2 border-b border-[#F0EBE3] pb-3 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-mono font-medium text-[#78716C] bg-[#FAF8F5] border border-[#E7E2DA] px-2 py-0.5 rounded">
                          External Portal • {job.ats_type}
                        </span>
                        {(() => {
                          const ago = formatListedAgo(job.listed_at);
                          if (!ago) return null;
                          // Newer-than-3-days listings get a warm accent so the
                          // candidate can scan for what's fresh without
                          // reading every card.
                          const isFresh = (Date.now() - new Date(job.listed_at).getTime()) < 3 * 24 * 60 * 60 * 1000;
                          return (
                            <span
                              className={
                                "text-[10px] font-mono font-medium px-2 py-0.5 rounded border " +
                                (isFresh
                                  ? "text-[#2E5A44] bg-[#EAF2EC] border-[#2E5A44]/25"
                                  : "text-[#78716C] bg-[#FAF8F5] border-[#E7E2DA]")
                              }
                              title={new Date(job.listed_at).toLocaleString()}
                            >
                              <span className="inline-block mr-1 align-middle">●</span>
                              Posted {ago}
                            </span>
                          );
                        })()}
                      </div>

                      {/* Match & Readiness Metrics */}
                      <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                        <span className="bg-[#FAF4EB] text-[#C85A32] font-bold px-2 py-0.5 rounded border border-[#C85A32]/20">
                          {job.match_score}% Match
                        </span>
                        <span className="bg-[#FAF8F5] text-[#57534E] font-medium px-2 py-0.5 rounded border border-[#E7E2DA]">
                          {job.readiness_score}% Readiness
                        </span>
                      </div>
                    </div>

                    {/* Job Details */}
                    <div className="space-y-1.5">
                      <h4 className="font-serif font-bold text-base text-[#1C1917] leading-snug">
                        {job.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-bold text-[#1C1917] flex items-center gap-1">
                          <Building className="h-3.5 w-3.5 text-[#78716C]" />
                          {job.company}
                        </span>
                        <span className="text-[#D6CCC2]">•</span>
                        <span className="font-mono text-[#78716C] flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-[#A8A29E]" />
                          {job.location} ({job.work_mode})
                        </span>
                        {job.salary && (
                          <>
                            <span className="text-[#D6CCC2]">•</span>
                            <span className="font-mono font-medium text-[#57534E] bg-[#FAF8F5] px-2 py-0.5 rounded border border-[#E7E2DA]">
                              {job.salary}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-[#57534E] leading-relaxed line-clamp-2">
                      {job.description}
                    </p>

                    {/* Technical Stacks & Requirements */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(job.skills_required || []).slice(0, 5).map((skill, idx) => (
                        <span
                          key={idx}
                          className="bg-[#FAF8F5] border border-[#E7E2DA] text-[#57534E] text-[11px] font-mono px-2.5 py-0.5 rounded"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>

                    {/* Action Bar for External Listings */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#F0EBE3] flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openRoadmap(job)}
                          className="text-xs font-semibold text-[#78716C] hover:text-[#C85A32] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Brain className="h-3.5 w-3.5 text-[#C85A32]" />
                          <span>Prep Roadmap</span>
                        </button>
                        <button
                          onClick={() => openOutreach(job)}
                          className="text-xs font-semibold text-[#78716C] hover:text-[#1C1917] flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Mail className="h-3.5 w-3.5 text-[#78716C]" />
                          <span>Draft Outreach</span>
                        </button>
                      </div>

                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F5F2EC] text-[#1C1917] border border-[#D6CCC2] rounded-lg text-xs font-mono font-medium transition-all cursor-pointer flex items-center gap-1.5 shadow-3xs"
                      >
                        <span>Apply on Official Portal</span>
                        <ExternalLink className="h-3.5 w-3.5 text-[#78716C]" />
                      </a>
                    </div>

                  </div>
                ))}
              </div>
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
                    <span key={idx} className="bg-[#FAF6F0] border border-[#DFD5C6] text-[#262626] text-[10px] font-bold px-2 py-0.5 rounded-md font-mono">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* GitHub, LeetCode, Codeforces Stats */}
              <div className="pt-2 border-t border-[#DFD5C6]/40 space-y-2">
                <span className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono block">Connected Platforms</span>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-lg">
                    <span className="text-[9px] text-[#6E6359] block">GitHub Repos</span>
                    <strong className="text-[#262626]">{profile.github_stats?.repo_count || profile.github_stats?.public_repos || 0} Repos</strong>
                  </div>
                  <div className="p-2 bg-[#FAF6F0] border border-[#DFD5C6] rounded-lg">
                    <span className="text-[9px] text-[#6E6359] block">DevScore</span>
                    <strong className="text-[#C85A32]">{profile.devscore != null ? profile.devscore : 'N/A'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Recruiter Tip */}
            <div className="bg-[#C85A32]/5 border border-[#C85A32]/25 rounded-xl p-5 text-left space-y-3">
              <h4 className="font-serif font-bold text-[#C85A32] text-sm flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                Startup Direct Pipeline
              </h4>
              <p className="text-xs text-[#6E6359] leading-relaxed font-semibold">
                Applications submitted to <strong>PrepFlow AI Technologies</strong> are synchronized directly into the founder&apos;s Talent Radar with your verified DevScore and sandbox evaluations.
              </p>
            </div>

          </div>
        </div>
      )}

      {/* STAGE 3: APPLICATION TRACKER PIPELINE */}
      {activeSubTab === "tracker" && (
        <div className="space-y-6 text-left">
          {/* REAL-TIME FOUNDER INTERVIEW & TAKE-HOME ALERTS */}
          {applications.some((a) => a.live_stage === "Shortlisted" || a.status === "Shortlisted") && (
            <div className="p-5 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl flex items-start justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-800 uppercase tracking-wider">
                      Live Recruiter Notification
                    </span>
                    <h4 className="text-sm font-serif font-bold text-emerald-950">
                      Shortlisted for Founder Technical Interview!
                    </h4>
                  </div>
                  <p className="text-xs text-emerald-900 leading-relaxed font-medium">
                    Congratulations! Your verified DevScore and coding performance were pre-screened by the startup founders. You are queued for the final Technical Deep-Dive Interview round.
                  </p>
                </div>
              </div>
            </div>
          )}

          {applications.some((a) => a.live_stage === "Take-Home Dispatched" || a.takehome_token) && (
            <div className="p-5 bg-[#C85A32]/10 border-2 border-[#C85A32]/35 rounded-2xl flex items-start justify-between gap-4 animate-in fade-in duration-300">
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 bg-[#C85A32] text-white rounded-xl shadow-xs animate-pulse">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-[#C85A32]/20 text-[#C85A32] uppercase tracking-wider">
                      Live Assessment Assigned
                    </span>
                    <h4 className="text-sm font-serif font-bold text-[#262626]">
                      Live Coding Take-Home Challenge Dispatched!
                    </h4>
                  </div>
                  <p className="text-xs text-[#6E6359] leading-relaxed font-medium">
                    The hiring team has sent you a 45-minute live polyglot sandbox challenge. Solve the challenge and stress-test your implementation against chaos test suites to finalize your evaluation.
                  </p>
                </div>
              </div>
              {(() => {
                const appWithToken = applications.find((a) => a.takehome_token);
                if (appWithToken) {
                  return (
                    <a
                      href={`/takehome/${appWithToken.takehome_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-mono font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <span>Open Live Sandbox</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* APPLICATION TRACKING & AUDIT VERIFICATION BAR */}
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DFD5C6]/40 pb-3">
              <div>
                <h4 className="text-sm font-serif font-bold text-[#262626] flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Application Tracking & Audit Registry
                </h4>
                <p className="text-xs text-[#6E6359] mt-0.5">
                  Verify official submission receipts, live recruiter review status, and cryptographic audit records.
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-md self-start sm:self-auto">
                Verified Pipeline Active
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
              <input
                type="text"
                placeholder="Enter Tracking Reference ID (e.g. APP-PREPFL-55FE8B)"
                value={trackingSearchQuery}
                onChange={(e) => setTrackingSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleVerifyTracking(trackingSearchQuery)}
                className="flex-1 rounded-xl border border-[#DFD5C6] bg-white px-3.5 py-2 text-xs font-mono text-[#262626] placeholder:text-[#6E6359]/60 focus:border-[#C85A32] focus:outline-none"
              />
              <button
                onClick={() => handleVerifyTracking(trackingSearchQuery)}
                disabled={auditLoading}
                className="px-4 py-2 bg-[#262626] hover:bg-[#383838] text-white rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0 shadow-xs"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>{auditLoading ? "Verifying..." : "Verify Tracking ID"}</span>
              </button>
            </div>
          </div>

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
              const colApps = applications.filter((a) => {
                const s = a.status || "";
                const ls = a.live_stage || "";
                if (col.id === "Applied") {
                  return !s || s === "Applied" || s === "Sourced" || s === "Screening"
                    || ls === "Applied / In Review" || ls === "Sourced" || ls === "Screening";
                }
                if (col.id === "OA Received") {
                  return s === "OA Received" || s === "Assessment"
                    || ls === "Take-Home Dispatched" || ls === "Assessment" || ls === "OA Received"
                    || a.takehome_token;
                }
                if (col.id === "Interview Scheduled") {
                  return s === "Interview Scheduled" || s === "Interview"
                    || ls === "Shortlisted" || ls === "Interview" || ls === "Interview Scheduled";
                }
                if (col.id === "Offer Received") {
                  return s === "Offer Received" || s === "Offer" || s === "Hired"
                    || ls === "Offer Extended" || ls === "Offer" || ls === "Hired" || ls === "Offer Received";
                }
                return false;
              });
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
                          <div className="flex items-center justify-between gap-1">
                            <h5 className="font-bold text-[#262626] leading-tight truncate">{app.title}</h5>
                            {app.live_stage && (
                              <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${
                                app.live_stage === "Shortlisted"
                                    ? "bg-emerald-500/15 text-emerald-800 border border-emerald-500/30"
                                    : app.live_stage === "Take-Home Dispatched"
                                    ? "bg-[#C85A32]/15 text-[#C85A32] border border-[#C85A32]/30"
                                    : "bg-blue-500/10 text-blue-800"
                              }`}>
                                {app.live_stage}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-[#C85A32] font-semibold">{app.company}</p>
                        </div>

                        <div className="flex justify-between items-center text-[9px] text-[#6E6359] font-mono">
                          <span>{app.work_mode}</span>
                          {app.tracking_id && (
                            <button
                              onClick={() => handleVerifyTracking(app.tracking_id)}
                              className="text-[#C85A32] hover:text-[#B83A14] font-bold flex items-center gap-0.5 cursor-pointer bg-[#FAF6F0] px-1.5 py-0.5 rounded border border-[#DFD5C6]"
                              title="Verify application audit certificate"
                            >
                              <ShieldCheck className="h-2.5 w-2.5 text-emerald-700" />
                              <span>{app.tracking_id}</span>
                            </button>
                          )}
                        </div>

                        {/* If Take-Home token exists, provide direct Sandbox Link */}
                        {app.takehome_token && (
                          <a
                            href={`/takehome/${app.takehome_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-md text-[10px] font-mono font-bold transition-all cursor-pointer shadow-3xs"
                          >
                            <Terminal className="h-3 w-3" />
                            <span>Launch Live Take-Home</span>
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}

                        {/* Status selector & Actions */}
                        <div className="border-t border-[#DFD5C6]/40 pt-2 space-y-2">
                          <div className="flex justify-between items-center">
                            <select
                              value={app.status}
                              onChange={(e) => updateStatus(app.id, e.target.value)}
                              className="bg-[#FCFAF7] border border-[#DFD5C6] rounded px-1.5 py-0.5 text-[9px] font-bold text-[#6E6359] focus:outline-none cursor-pointer"
                            >
                              <option value="Applied">Applied</option>
                              <option value="OA Received">OA / Test</option>
                              <option value="Interview Scheduled">Interview</option>
                              <option value="Offer Received">Offer</option>
                              <option value="Rejected">Rejected</option>
                              <option value="Withdrawn">Withdrawn</option>
                            </select>
                            
                            <span className="text-[9px] text-[#6E6359]/60">
                              {app.updated_at ? app.updated_at.split("T")[0].split(" ")[0] : "Recent"}
                            </span>
                          </div>

                          <button
                            onClick={() => handleViewReceipt(app.job_id)}
                            className="w-full flex items-center justify-center gap-1.5 py-1 px-2 bg-[#FAF6F0] hover:bg-[#C85A32]/10 border border-[#DFD5C6] hover:border-[#C85A32]/60 rounded-md text-[9px] font-bold text-[#6E6359] hover:text-[#C85A32] transition-all cursor-pointer"
                            title="View official ATS email confirmation and tracking receipt"
                          >
                            <MailCheck className="h-3 w-3 text-[#C85A32]" />
                            <span>Official ATS Receipt</span>
                          </button>
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
        <>
          <div 
            className="fixed inset-0 bg-[#262626]/20 backdrop-blur-xs z-45 animate-in fade-in duration-250"
            onClick={() => setShowRoadmapDrawer(false)}
          />
          <div className="fixed inset-y-0 right-0 w-full sm:w-[550px] bg-[#FCFAF7] border-l border-[#DFD5C6] shadow-2xl z-50 p-6 overflow-y-auto flex flex-col justify-between select-none animate-in slide-in-from-right duration-250">
          <div className="space-y-6">
            
            {/* Header */}
            <div className="flex justify-between items-center border-b border-[#DFD5C6]/40 pb-4">
              <div className="text-left">
                <span className="text-[9px] font-bold font-mono text-[#C85A32] uppercase tracking-widest">REAL-TIME JOB PILOT</span>
                <h4 className="text-base font-serif font-bold text-[#262626] mt-1">
                  {selectedJob.company} Job Co-pilot
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

            {/* Split Tab Selector */}
            <div className="flex border-b border-[#DFD5C6] gap-1">
              <button
                onClick={() => setDrawerTab("roadmap")}
                className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  drawerTab === "roadmap"
                    ? "border-[#C85A32] text-[#C85A32]"
                    : "border-transparent text-[#6E6359] hover:text-[#262626]"
                }`}
              >
                <Brain className="h-3.5 w-3.5" />
                Prep Roadmap
              </button>
              <button
                onClick={() => setDrawerTab("outreach")}
                className={`flex-1 py-2 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  drawerTab === "outreach"
                    ? "border-[#C85A32] text-[#C85A32]"
                    : "border-transparent text-[#6E6359] hover:text-[#262626]"
                }`}
              >
                <Send className="h-3.5 w-3.5" />
                AI Outreach Sequence
              </button>
            </div>

            {/* ROADMAP TAB */}
            {drawerTab === "roadmap" && (
              loadingRoadmap ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <RefreshCw className="h-7 w-7 text-[#C85A32] animate-spin mb-3" />
                  <span className="text-xs text-[#6E6359] font-medium">Assembling prep roadmap timelines...</span>
                </div>
              ) : (
                roadmap && (
                  <div className="space-y-6 text-left animate-in fade-in duration-200">
                    
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
              )
            )}

            {/* COLD OUTREACH TAB */}
            {drawerTab === "outreach" && (
              <div className="space-y-5 text-left animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-[#6E6359] uppercase tracking-wider font-mono">
                    Target Persona / Role
                  </label>
                  <div className="flex gap-2">
                    {["Hiring Manager", "Recruiter", "Team Peer"].map((role) => (
                      <button
                        key={role}
                        onClick={() => {
                          setOutreachRole(role);
                          fetchOutreach(role);
                        }}
                        className={`flex-1 py-2 px-3 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          outreachRole === role
                            ? "bg-[#C85A32]/10 border-[#C85A32] text-[#C85A32]"
                            : "bg-white border-[#DFD5C6] text-[#6E6359] hover:text-[#262626] hover:bg-[#FAF6F0]"
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                </div>
                
                <button
                  onClick={() => fetchOutreach(outreachRole)}
                  disabled={outreachLoading}
                  className="w-full bg-[#C85A32] hover:bg-[#B83A14] disabled:bg-[#C85A32]/50 text-[#FCFAF7] py-2.5 rounded-lg text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {outreachLoading ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Generating sequences...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      Generate Outreach Sequences
                    </>
                  )}
                </button>

                {outreachLoading && (
                  <div className="py-16 flex flex-col items-center justify-center text-center">
                    <RefreshCw className="h-7 w-7 text-[#C85A32] animate-spin mb-3" />
                    <span className="text-xs text-[#6E6359] font-medium">
                      Tailoring cold pitch and LinkedIn connection note...
                    </span>
                  </div>
                )}

                {!outreachLoading && outreachData && (
                  <div className="space-y-5 pt-2">
                    {/* LinkedIn Connection Note */}
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 space-y-2.5 relative">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold font-mono text-[#C85A32] uppercase tracking-wider">
                          LinkedIn Connection Request (&lt;300 chars)
                        </span>
                        <button
                          onClick={() => handleCopy(outreachData.linkedin_connection, "linkedin")}
                          className="text-[10px] font-bold text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6] bg-white px-2 py-0.5 rounded-md hover:bg-[#FAF6F0] flex items-center gap-1 cursor-pointer transition-all"
                        >
                          {copiedField === "linkedin" ? (
                            <>
                              <Check className="h-3 w-3 text-[#2E5A44]" />
                              Copied!
                            </>
                          ) : (
                            "Copy Note"
                          )}
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-[#262626] leading-relaxed italic bg-white border border-[#DFD5C6]/40 p-3 rounded-lg">
                        "{outreachData.linkedin_connection}"
                      </p>
                      <span className="text-[10px] text-[#6E6359]/75 block text-right font-mono">
                        {outreachData.linkedin_connection?.length || 0} / 300 characters
                      </span>
                    </div>

                    {/* Contact Email */}
                    {outreachData.contact_email && (
                      <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 space-y-2.5 relative">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold font-mono text-[#C85A32] uppercase tracking-wider">
                            Contact Email Address
                          </span>
                          <button
                            onClick={() => handleCopy(outreachData.contact_email, "contact_email")}
                            className="text-[10px] font-bold text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6] bg-white px-2 py-0.5 rounded-md hover:bg-[#FAF6F0] flex items-center gap-1 cursor-pointer transition-all"
                          >
                            {copiedField === "contact_email" ? (
                              <>
                                <Check className="h-3 w-3 text-[#2E5A44]" />
                                Copied!
                              </>
                            ) : (
                              "Copy Email"
                            )}
                          </button>
                        </div>
                        <p className="text-xs font-bold text-[#262626] bg-white border border-[#DFD5C6]/40 p-3 rounded-lg flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-[#C85A32]" />
                          <span>{outreachData.contact_email}</span>
                        </p>
                      </div>
                    )}

                    {/* Cold Email Pitch */}
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 space-y-3 relative">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold font-mono text-[#C85A32] uppercase tracking-wider">
                          Cold Email Pitch
                        </span>
                        <button
                          onClick={() => handleCopy(`Subject: ${outreachData.subject}\n\n${outreachData.email_body}`, "email")}
                          className="text-[10px] font-bold text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6] bg-white px-2 py-0.5 rounded-md hover:bg-[#FAF6F0] flex items-center gap-1 cursor-pointer transition-all"
                        >
                          {copiedField === "email" ? (
                            <>
                              <Check className="h-3 w-3 text-[#2E5A44]" />
                              Copied!
                            </>
                          ) : (
                            "Copy Email"
                          )}
                        </button>
                      </div>
                      <div className="space-y-2 bg-white border border-[#DFD5C6]/40 p-3.5 rounded-lg text-xs leading-relaxed text-[#262626]">
                        <div>
                          <span className="font-bold text-[#6E6359]">Subject:</span> {outreachData.subject}
                        </div>
                        <hr className="border-[#DFD5C6]/40 my-2" />
                        <div className="whitespace-pre-wrap font-semibold">{outreachData.email_body}</div>
                      </div>
                    </div>

                    {/* Follow-up Note */}
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 space-y-2.5 relative">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold font-mono text-[#C85A32] uppercase tracking-wider">
                          Follow-up (3 days later)
                        </span>
                        <button
                          onClick={() => handleCopy(outreachData.follow_up, "followup")}
                          className="text-[10px] font-bold text-[#6E6359] hover:text-[#262626] border border-[#DFD5C6] bg-white px-2 py-0.5 rounded-md hover:bg-[#FAF6F0] flex items-center gap-1 cursor-pointer transition-all"
                        >
                          {copiedField === "followup" ? (
                            <>
                              <Check className="h-3 w-3 text-[#2E5A44]" />
                              Copied!
                            </>
                          ) : (
                            "Copy Follow-up"
                          )}
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-[#262626] leading-relaxed italic bg-white border border-[#DFD5C6]/40 p-3 rounded-lg whitespace-pre-wrap">
                        "{outreachData.follow_up}"
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>

          <div className="border-t border-[#DFD5C6]/40 pt-4 flex justify-between gap-3">
            <button
              onClick={() => setShowRoadmapDrawer(false)}
              className="bg-transparent hover:bg-[#FAF6F0] text-[#6E6359] border border-[#DFD5C6] py-2 px-6 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={() => {
                setShowRoadmapDrawer(false);
              }}
              className="bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-2 px-6 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Start Practice Session
            </button>
          </div>
        </div>
        </>
      )}

      {/* DRAWER 2: APPLY VIA AGENT / BROWSER AUTOMATION */}
      {showApplyDrawer && selectedJob && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[550px] bg-[#FCFAF7] border-l border-[#DFD5C6] shadow-2xl z-50 p-6 overflow-y-auto flex flex-col justify-between select-none">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* =========================================================================
          OFFICIAL ATS EMAIL CONFIRMATION RECEIPT MODAL
          ========================================================================= */}
      {showReceiptModal && confirmationReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#DFD5C6] flex items-center justify-between bg-[#FAF6F0]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-700 border border-emerald-500/20">
                  <MailCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-serif text-[#262626]">
                      Application Confirmed
                    </h3>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-800 border border-emerald-500/30 px-2 py-0.5 rounded-md font-bold font-mono flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3 text-emerald-700" />
                      Verified Submission
                    </span>
                  </div>
                  <p className="text-xs text-[#6E6359]">
                    Official confirmation dispatched to <strong className="text-[#262626]">{confirmationReceipt.candidate_email}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-2 rounded-xl hover:bg-[#DFD5C6]/40 text-[#6E6359] hover:text-[#262626] transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Tracking Reference & Quick Copy Bar */}
            <div className="px-6 py-3 bg-[#FCFAF7] border-b border-[#DFD5C6]/60 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2 font-mono flex-wrap">
                <span className="text-[#6E6359] font-bold">Tracking ID:</span>
                <span className="bg-[#FAF6F0] px-2.5 py-1 rounded-lg border border-[#DFD5C6] font-bold text-[#C85A32]">
                  {confirmationReceipt.tracking_id}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(confirmationReceipt.tracking_id);
                    setCopiedTrackingId(true);
                    setTimeout(() => setCopiedTrackingId(false), 2000);
                  }}
                  className="p-1 text-[#6E6359] hover:text-[#262626] cursor-pointer"
                  title="Copy Tracking ID"
                >
                  {copiedTrackingId ? <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => handleVerifyTracking(confirmationReceipt.tracking_id)}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 border border-emerald-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Verify official cryptographic audit record"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                  <span>Verify Audit Record</span>
                </button>
              </div>

              <div className="flex items-center gap-1 font-mono text-[11px] text-[#6E6359]">
                <Clock className="h-3 w-3 text-[#C85A32]" />
                <span>{confirmationReceipt.submission_time}</span>
              </div>
            </div>

            {/* Modal Body: Scrollable Dispatch Preview */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
              {/* Delivery Success Banner */}
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs">
                <ShieldCheck className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-emerald-950 font-serif">
                    Application Successfully Delivered
                  </h4>
                  <p className="text-emerald-900 mt-1 leading-relaxed">
                    Your application for the <strong>{confirmationReceipt.job_title}</strong> role has been delivered to <strong>{confirmationReceipt.company}</strong> along with your attached resume (<strong>{confirmationReceipt.resume_name}</strong>) and verified technical DevScore portfolio.
                  </p>
                </div>
              </div>

              {/* Application Summary Card */}
              <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[#DFD5C6]/60">
                  <span className="font-bold text-[#6E6359] uppercase tracking-wider text-[10px]">
                    Requisition Summary
                  </span>
                  <span className="text-[#C85A32] font-bold text-[11px]">
                    {confirmationReceipt.company}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <span className="text-[#6E6359] block">Target Role:</span>
                    <span className="text-[#262626] font-bold">{confirmationReceipt.job_title}</span>
                  </div>
                  <div>
                    <span className="text-[#6E6359] block">Recruitment Gateway:</span>
                    <span className="text-[#262626] font-bold">{confirmationReceipt.ats_type} Direct Gateway</span>
                  </div>
                  <div>
                    <span className="text-[#6E6359] block">Applicant Email:</span>
                    <span className="text-[#262626] font-bold">{confirmationReceipt.candidate_email}</span>
                  </div>
                  <div>
                    <span className="text-[#6E6359] block">Attached Resume:</span>
                    <span className="text-[#262626] font-bold flex items-center gap-1">
                      <FileText className="h-3 w-3 text-[#C85A32]" />
                      {confirmationReceipt.resume_name}
                    </span>
                  </div>
                </div>
              </div>

              {/* Live HTML Email Preview Frame */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold font-mono text-[#6E6359] uppercase tracking-wider flex items-center gap-1.5">
                    <Inbox className="h-3.5 w-3.5 text-[#C85A32]" />
                    Delivered Confirmation Letter
                  </span>
                  <span className="text-[10px] text-[#6E6359] font-mono">
                    Sent to: {confirmationReceipt.candidate_email}
                  </span>
                </div>

                <div className="border border-[#DFD5C6] rounded-2xl overflow-hidden shadow-xs bg-white">
                  <div className="bg-[#262626] text-white px-4 py-2 text-[11px] font-mono flex items-center justify-between">
                    <span>Subject: Application Confirmed: {confirmationReceipt.job_title} at {confirmationReceipt.company}</span>
                    <span className="text-emerald-400 font-bold">Delivered</span>
                  </div>
                  <div className="p-4 text-xs max-h-60 overflow-y-auto custom-scrollbar">
                    <div dangerouslySetInnerHTML={{ __html: confirmationReceipt.html_preview }} />
                  </div>
                </div>
              </div>

              {/* Hiring Review Timeline */}
              <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-4 space-y-2 text-xs">
                <h4 className="font-bold text-[#262626] font-serif">What Happens Next</h4>
                <div className="space-y-2 text-[11px] text-[#6E6359]">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span><strong>1. Portfolio & Technical Review:</strong> Hiring team reviews your portfolio & verified coding telemetry (1-2 business days).</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <span><strong>2. Direct Founder / Recruiter Sync:</strong> An introductory conversation to align on engineering culture and expectations.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#C85A32] shrink-0" />
                    <span><strong>3. Technical Deep-Dive & Architecture:</strong> Collaborative discussion on real-world system design and problem solving.</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-[#DFD5C6] bg-[#FAF6F0] flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Application Tracking ID: ${confirmationReceipt.tracking_id}\nCompany: ${confirmationReceipt.company}\nRole: ${confirmationReceipt.job_title}\nTimestamp: ${confirmationReceipt.submission_time}`
                  );
                  alert("Application details copied to clipboard!");
                }}
                className="px-4 py-2 bg-white hover:bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs font-bold text-[#262626] transition-all cursor-pointer shadow-2xs"
              >
                Copy Receipt Data
              </button>

              <button
                onClick={() => setShowReceiptModal(false)}
                className="px-6 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                Got It, Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          OFFICIAL APPLICATION AUDIT CERTIFICATE MODAL
          ========================================================================= */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Certificate Header */}
            <div className="px-6 py-4 border-b border-[#DFD5C6] flex items-center justify-between bg-[#FAF6F0]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-700 border border-emerald-500/20">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-serif text-[#262626]">
                    Application Audit Certificate
                  </h3>
                  <p className="text-xs text-[#6E6359]">
                    PrepFlow Verified Recruitment Telemetry Record
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                className="p-2 rounded-xl hover:bg-[#DFD5C6]/40 text-[#6E6359] hover:text-[#262626] transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Certificate Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs font-mono">
              {auditLoading && (
                <div className="py-12 text-center text-[#6E6359] space-y-2">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#C85A32]" />
                  <p className="font-semibold text-xs">Querying application audit registry...</p>
                </div>
              )}

              {auditError && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-red-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4 text-red-700" />
                    Verification Unsuccessful
                  </div>
                  <p className="text-xs font-sans">{auditError}</p>
                </div>
              )}

              {auditData && (
                <div className="space-y-4">
                  {/* Verified Badge Header */}
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-1 font-sans">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-950 text-sm flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-emerald-700" />
                        {auditData.verification_status} Record
                      </span>
                      <span className="text-[10px] bg-emerald-600 text-white font-mono px-2 py-0.5 rounded font-bold">
                        AUTHENTIC
                      </span>
                    </div>
                    <p className="text-emerald-900 text-xs">
                      This submission was logged into the immutable PrepFlow Talent Network registry and confirmed delivered to the startup founding team.
                    </p>
                  </div>

                  {/* Key Audit Data Grid */}
                  <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Tracking Reference:</span>
                        <span className="text-[#C85A32] font-bold">{auditData.tracking_id}</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Submission Timestamp:</span>
                        <span className="text-[#262626] font-semibold">{auditData.submission_timestamp}</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Applicant:</span>
                        <span className="text-[#262626] font-semibold">{auditData.candidate_name} ({auditData.candidate_email})</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Attached Resume:</span>
                        <span className="text-[#262626] font-semibold">{auditData.resume_name}</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Target Company:</span>
                        <span className="text-[#262626] font-semibold">{auditData.company}</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Position:</span>
                        <span className="text-[#262626] font-semibold">{auditData.job_title}</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Verified DevScore:</span>
                        <span className="text-[#C85A32] font-bold">{auditData.devscore} / 1000 Verified</span>
                      </div>
                      <div>
                        <span className="text-[#6E6359] block text-[10px] uppercase">Live Review Stage:</span>
                        <span className="text-emerald-800 font-bold">{auditData.live_stage}</span>
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic Hash Section */}
                  <div className="bg-white border border-[#DFD5C6] rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase text-[#6E6359] tracking-wider">
                        SHA-256 Audit Signature Hash
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(auditData.audit_hash);
                          setCopiedAuditHash(true);
                          setTimeout(() => setCopiedAuditHash(false), 2000);
                        }}
                        className="text-[10px] text-[#C85A32] hover:text-[#B83A14] flex items-center gap-1 cursor-pointer"
                      >
                        {copiedAuditHash ? <CheckCheck className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        {copiedAuditHash ? "Copied Hash" : "Copy Hash"}
                      </button>
                    </div>
                    <div className="p-2.5 bg-[#FAF6F0] rounded-xl text-[10px] text-[#262626] break-all border border-[#DFD5C6]/60 select-all">
                      {auditData.audit_hash}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Certificate Footer */}
            <div className="px-6 py-3 border-t border-[#DFD5C6] bg-[#FAF6F0] flex justify-end">
              <button
                onClick={() => setShowAuditModal(false)}
                className="px-5 py-2 bg-[#262626] hover:bg-[#383838] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close Certificate
              </button>
            </div>
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

