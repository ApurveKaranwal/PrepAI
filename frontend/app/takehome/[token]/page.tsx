"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Code2,
  Terminal,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Layers,
  Copy,
  Check,
  RotateCcw,
  AlertCircle,
  FileCode2,
  ChevronRight,
  Cpu,
  ArrowLeft,
  Maximize,
  AlertTriangle,
  ShieldAlert,
  Lock,
  AlertOctagon
} from "lucide-react";

// Fullscreen API Helper functions
function isDocumentFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

async function requestFullscreenElement(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    const el = document.documentElement as any;
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      await el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      await el.msRequestFullscreen();
    }
    return true;
  } catch (err) {
    console.warn("Fullscreen request was rejected or failed:", err);
    return false;
  }
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8001";

const SUPPORTED_LANGUAGES = [
  { id: "python", label: "Python 3.11", ext: ".py" },
  { id: "cpp", label: "C++ (GCC 20)", ext: ".cpp" },
  { id: "java", label: "Java (OpenJDK 21)", ext: ".java" },
  { id: "go", label: "Go (1.22)", ext: ".go" },
  { id: "typescript", label: "TypeScript (5.3)", ext: ".ts" },
  { id: "javascript", label: "JavaScript (Node.js 20)", ext: ".js" }
];

// Rich Markdown / Text Formatter for Take-Home Problem Statements
function ProblemMarkdownViewer({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <div key={`cb-${index}`} className="my-3 bg-[#18181B] text-[#FCFAF7] p-3.5 rounded-xl font-mono text-xs overflow-x-auto border border-[#3F3F46]">
            <pre>{codeBlockContent.join("\n")}</pre>
          </div>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    // Headings
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={index} className="text-base font-serif font-bold text-[#262626] mt-5 mb-2 flex items-center gap-2 border-b border-[#DFD5C6]/60 pb-1.5">
          <span className="h-2 w-2 rounded-full bg-[#C85A32]" />
          {renderFormattedInline(trimmed.replace("### ", ""))}
        </h3>
      );
      return;
    }

    if (trimmed.startsWith("#### ")) {
      elements.push(
        <h4 key={index} className="text-xs font-mono font-bold uppercase tracking-wider text-[#6E6359] mt-4 mb-2">
          {renderFormattedInline(trimmed.replace("#### ", ""))}
        </h4>
      );
      return;
    }

    // Bullet points / Constraints
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      elements.push(
        <li key={index} className="ml-4 list-disc text-xs text-[#262626] leading-relaxed my-1 pl-1 marker:text-[#C85A32]">
          {renderFormattedInline(trimmed.substring(2))}
        </li>
      );
      return;
    }

    // Empty lines
    if (!trimmed) {
      elements.push(<div key={index} className="h-2" />);
      return;
    }

    // Regular paragraphs
    elements.push(
      <p key={index} className="text-xs text-[#262626] leading-relaxed font-medium">
        {renderFormattedInline(line)}
      </p>
    );
  });

  return <div className="space-y-1">{elements}</div>;
}

// Helper to render bold and inline code pills
function renderFormattedInline(content: string) {
  const parts = content.split(/(\*\*.*?\*\*|`.*?`|\$.*?\$)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-bold text-[#262626]">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1.5 py-0.5 bg-[#FAF6F0] border border-[#DFD5C6] rounded font-mono text-[11px] font-bold text-[#C85A32]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("$") && part.endsWith("$")) {
      return (
        <span key={i} className="font-mono text-xs font-bold text-[#2E5A44] bg-[#2E5A44]/10 px-1 rounded">
          {part.slice(1, -1)}
        </span>
      );
    }
    return part;
  });
}

export default function TakeHomeAssessmentPage() {
  const params = useParams();
  const router = useRouter();
  const token = params?.token as string;

  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<any>(null);
  const [problem, setProblem] = useState<any>(null);
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [timeLeft, setTimeLeft] = useState(45 * 60); // 45 minutes in seconds
  const [hasInitialized, setHasInitialized] = useState(false);

  // Proctoring & Fullscreen state
  const [sessionStarted, setSessionStarted] = useState(false);
  const [isInFullscreen, setIsInFullscreen] = useState(false);
  const [warningsCount, setWarningsCount] = useState(0);
  const [violationModalOpen, setViolationModalOpen] = useState(false);
  const [violationSecondsLeft, setViolationSecondsLeft] = useState(10);
  const [autoSubmitReason, setAutoSubmitReason] = useState<string | null>(null);

  // Execution states
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [activeConsoleTab, setActiveConsoleTab] = useState<"tests" | "stdout">("tests");
  const [copiedCode, setCopiedCode] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const violationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Synchronized state references to avoid stale closure issues in asynchronous callbacks/intervals
  const codeRef = useRef(code);
  const languageRef = useRef(language);
  const problemRef = useRef(problem);
  const submittingRef = useRef(submitting);
  const submissionResultRef = useRef(submissionResult);
  const sessionStartedRef = useRef(sessionStarted);
  const warningsCountRef = useRef(warningsCount);
  const violationModalOpenRef = useRef(violationModalOpen);

  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { problemRef.current = problem; }, [problem]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);
  useEffect(() => { submissionResultRef.current = submissionResult; }, [submissionResult]);
  useEffect(() => { sessionStartedRef.current = sessionStarted; }, [sessionStarted]);
  useEffect(() => { warningsCountRef.current = warningsCount; }, [warningsCount]);
  useEffect(() => { violationModalOpenRef.current = violationModalOpen; }, [violationModalOpen]);

  // Final Submit Assessment Function
  const handleSubmitAssessment = useCallback(async (reason: string = "manual") => {
    if (!token || submittingRef.current || submissionResultRef.current) return;
    setShowSubmitConfirm(false);
    setViolationModalOpen(false);

    if (violationTimerRef.current) {
      clearInterval(violationTimerRef.current);
      violationTimerRef.current = null;
    }

    setSubmitting(true);
    setAutoSubmitReason(reason);

    const currentCode = codeRef.current;
    const currentLang = languageRef.current;
    const currentProblem = problemRef.current;
    const warnings = warningsCountRef.current;

    try {
      const res = await fetch(`${BACKEND_URL}/api/takehome/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: currentCode,
          language: currentLang,
          entry_point: currentProblem?.entry_point || "solution",
          submission_reason: reason,
          warnings_count: warnings
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSubmissionResult(data);
        localStorage.setItem(`prepai_takehome_completed_${token}`, JSON.stringify(data));

        // Exit fullscreen smoothly if active
        if (typeof document !== "undefined" && document.fullscreenElement && document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      }
    } catch (err) {
      console.error("Error submitting assessment:", err);
    } finally {
      setSubmitting(false);
    }
  }, [token]);

  // Proctoring Violation Trigger Function (Escape / Exit Fullscreen / Tab Switch)
  const triggerProctoringViolation = useCallback(() => {
    if (submittingRef.current || submissionResultRef.current || !sessionStartedRef.current) {
      return;
    }

    // If violation modal is already active and running countdown, do not duplicate
    if (violationModalOpenRef.current) {
      return;
    }

    const currentWarnings = warningsCountRef.current;
    const newWarnings = currentWarnings + 1;
    setWarningsCount(newWarnings);
    warningsCountRef.current = newWarnings;
    localStorage.setItem(`prepai_takehome_warnings_${token}`, newWarnings.toString());

    if (newWarnings > 3) {
      // 4th violation -> Auto-submit immediately!
      setAutoSubmitReason("proctoring_violations");
      handleSubmitAssessment("proctoring_violations");
      return;
    }

    // Open warning modal and begin 10-second countdown
    setViolationModalOpen(true);
    setViolationSecondsLeft(10);

    if (violationTimerRef.current) {
      clearInterval(violationTimerRef.current);
      violationTimerRef.current = null;
    }

    let remaining = 10;
    violationTimerRef.current = setInterval(() => {
      remaining -= 1;
      setViolationSecondsLeft(remaining);

      if (remaining <= 0) {
        if (violationTimerRef.current) {
          clearInterval(violationTimerRef.current);
          violationTimerRef.current = null;
        }
        setViolationModalOpen(false);
        setAutoSubmitReason("warning_timeout");
        handleSubmitAssessment("warning_timeout");
      }
    }, 1000);
  }, [token, handleSubmitAssessment]);

  // Fetch assessment & initialize persistent state
  useEffect(() => {
    if (!token) return;

    async function fetchChallenge() {
      try {
        setLoading(true);
        const res = await fetch(`${BACKEND_URL}/api/takehome/${token}`);
        if (res.ok) {
          const data = await res.json();
          setAssessment(data.assessment);
          setProblem(data.problem);

          // Check if previously completed
          const savedCompletion = localStorage.getItem(`prepai_takehome_completed_${token}`);
          if (savedCompletion) {
            try {
              setSubmissionResult(JSON.parse(savedCompletion));
              setSessionStarted(true);
              setLoading(false);
              return;
            } catch (e) {}
          } else if (data.assessment?.status === "Completed" || data.assessment?.status?.startsWith("Disqualified") || data.assessment?.status?.startsWith("Auto-Submitted")) {
            setSubmissionResult({
              score: data.assessment.score || 0,
              chaos_resilience: data.assessment.chaos_resilience || 0,
              verdict: data.assessment.score >= 650 ? "Passed & Verified" : "Under Review",
              submission_reason: data.assessment.status
            });
            setSessionStarted(true);
            setLoading(false);
            return;
          }

          // Restore Language
          const savedLang = localStorage.getItem(`prepai_takehome_lang_${token}`) || "python";
          setLanguage(savedLang);

          // Restore Code (or use problem starter code)
          const savedCode = localStorage.getItem(`prepai_takehome_code_${token}_${savedLang}`);
          if (savedCode) {
            setCode(savedCode);
          } else {
            const starter = data.problem?.starter_code?.[savedLang] || data.problem?.starter_code?.python || "# Write your implementation here\n";
            setCode(starter);
          }

          // Restore Warnings Count
          const savedWarnings = localStorage.getItem(`prepai_takehome_warnings_${token}`);
          if (savedWarnings) {
            const count = parseInt(savedWarnings, 10);
            if (!isNaN(count)) {
              setWarningsCount(count);
              warningsCountRef.current = count;
            }
          }

          // Restore Session Started state
          const wasStarted = localStorage.getItem(`prepai_takehome_started_${token}`) === "true";
          if (wasStarted) {
            setSessionStarted(true);
            sessionStartedRef.current = true;
          }

          // Persistent Timer Initialization
          const totalMinutes = data.assessment?.time_limit_minutes || 45;
          const savedEndTime = localStorage.getItem(`prepai_takehome_endtime_${token}`);

          if (savedEndTime) {
            const targetEnd = Number(savedEndTime);
            const remaining = Math.max(0, Math.floor((targetEnd - Date.now()) / 1000));
            setTimeLeft(remaining);

            if (remaining <= 0) {
              // Time ran out while away
              setAutoSubmitReason("time_expired");
              handleSubmitAssessment("time_expired");
            }
          } else if (wasStarted) {
            const targetEnd = Date.now() + totalMinutes * 60 * 1000;
            localStorage.setItem(`prepai_takehome_endtime_${token}`, targetEnd.toString());
            setTimeLeft(totalMinutes * 60);
          } else {
            setTimeLeft(totalMinutes * 60);
          }

          setHasInitialized(true);
        }
      } catch (err) {
        console.error("Error fetching take-home assessment:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchChallenge();
  }, [token, handleSubmitAssessment]);

  // Code & Language autosave to localStorage
  useEffect(() => {
    if (!token || !hasInitialized || submissionResult) return;
    try {
      localStorage.setItem(`prepai_takehome_code_${token}_${language}`, code);
      localStorage.setItem(`prepai_takehome_lang_${token}`, language);
    } catch (e) {
      console.error("Autosave error:", e);
    }
  }, [code, language, token, hasInitialized, submissionResult]);

  // Countdown timer interval
  useEffect(() => {
    if (!sessionStarted || submissionResult || timeLeft <= 0) return;

    const timer = setInterval(() => {
      const savedEndTime = localStorage.getItem(`prepai_takehome_endtime_${token}`);
      if (savedEndTime) {
        const remaining = Math.max(0, Math.floor((Number(savedEndTime) - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining <= 0) {
          clearInterval(timer);
          setAutoSubmitReason("time_expired");
          handleSubmitAssessment("time_expired");
        }
      } else {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setAutoSubmitReason("time_expired");
            handleSubmitAssessment("time_expired");
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionStarted, submissionResult, timeLeft, token, handleSubmitAssessment]);

  // Fullscreen & Visibility Event Listeners for Proctoring
  useEffect(() => {
    if (!sessionStarted || submissionResult) return;

    const handleFullscreenChange = () => {
      const isFull = isDocumentFullscreen();
      setIsInFullscreen(isFull);
      if (!isFull && sessionStartedRef.current && !submittingRef.current && !submissionResultRef.current) {
        triggerProctoringViolation();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && sessionStartedRef.current && !submittingRef.current && !submissionResultRef.current) {
        triggerProctoringViolation();
      }
    };

    const handleWindowBlur = () => {
      if (sessionStartedRef.current && !submittingRef.current && !submissionResultRef.current) {
        triggerProctoringViolation();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [sessionStarted, submissionResult, triggerProctoringViolation]);

  // Start or Resume assessment session in Fullscreen
  const handleStartOrResumeSession = async () => {
    await requestFullscreenElement();
    setIsInFullscreen(true);
    setSessionStarted(true);
    sessionStartedRef.current = true;
    localStorage.setItem(`prepai_takehome_started_${token}`, "true");

    // Initialize timer end time if not yet set
    const existingEndTime = localStorage.getItem(`prepai_takehome_endtime_${token}`);
    if (!existingEndTime) {
      const totalMinutes = assessment?.time_limit_minutes || 45;
      const targetEnd = Date.now() + totalMinutes * 60 * 1000;
      localStorage.setItem(`prepai_takehome_endtime_${token}`, targetEnd.toString());
      setTimeLeft(totalMinutes * 60);
    }

    setViolationModalOpen(false);
    if (violationTimerRef.current) {
      clearInterval(violationTimerRef.current);
      violationTimerRef.current = null;
    }
  };

  // Return to fullscreen from warning modal within 10-second grace period
  const handleReturnToFullscreen = async () => {
    const success = await requestFullscreenElement();
    if (success || isDocumentFullscreen()) {
      setIsInFullscreen(true);
      if (violationTimerRef.current) {
        clearInterval(violationTimerRef.current);
        violationTimerRef.current = null;
      }
      setViolationModalOpen(false);
      setViolationSecondsLeft(10);
    }
  };

  // Switch starter code when language changes
  const handleLanguageChange = (newLang: string) => {
    setLanguage(newLang);
    const saved = localStorage.getItem(`prepai_takehome_code_${token}_${newLang}`);
    if (saved) {
      setCode(saved);
    } else if (problem?.starter_code?.[newLang]) {
      setCode(problem.starter_code[newLang]);
    }
  };

  // Reset to original starter code
  const handleResetCode = () => {
    if (problem?.starter_code?.[language]) {
      setCode(problem.starter_code[language]);
    }
  };

  // Copy code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Handle Tab key and Auto-Indent inside code editor
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Run Tests on Ctrl+Enter / Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleRunTests();
      return;
    }

    // Tab key inserts 4 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newCode = code.substring(0, start) + "    " + code.substring(end);
      setCode(newCode);

      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    }
  };

  // Run visible test cases
  const handleRunTests = async () => {
    if (!token || running) return;
    setRunning(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/takehome/${token}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language,
          entry_point: problem?.entry_point || "solution"
        })
      });
      if (res.ok) {
        const data = await res.json();
        setRunResult(data.result);
        if (data.result?.stdout) {
          setActiveConsoleTab("stdout");
        } else {
          setActiveConsoleTab("tests");
        }
      }
    } catch (err) {
      console.error("Error executing sandbox test run:", err);
    } finally {
      setRunning(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Calculate line numbers for editor
  const lineCount = Math.max(code.split("\n").length, 18);
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex flex-col items-center justify-center space-y-3 text-xs font-mono text-[#6E6359]">
        <RefreshCw className="h-6 w-6 text-[#C85A32] animate-spin" />
        <span>Initializing cryptographically isolated sandbox assessment session...</span>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex flex-col items-center justify-center p-6 space-y-4 text-center">
        <AlertCircle className="h-10 w-10 text-[#C85A32]" />
        <h1 className="font-serif text-2xl font-bold text-[#262626]">Assessment Session Not Found</h1>
        <p className="text-xs text-[#6E6359] font-mono max-w-md">
          This invitation token may have expired or is invalid. Please contact the hiring team for a new benchmark link.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#262626] flex flex-col font-sans select-none relative">
      {/* =========================================================================
          TOP HEADER BAR WITH CANDIDATE, ROLE, PROCTORING STATUS, TIMER & SUBMIT
          ========================================================================= */}
      <header className="border-b border-[#DFD5C6] bg-[#FCFAF7] px-6 py-3 flex items-center justify-between shadow-2xs z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-serif font-black text-lg tracking-tight text-[#262626]">
              PrepFlow <span className="text-[#C85A32]">Take-Home</span>
            </span>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#2E5A44]/10 text-[#2E5A44] border border-[#2E5A44]/20 uppercase">
              Production Benchmark
            </span>
          </div>

          <span className="h-4 w-px bg-[#DFD5C6]" />

          <div className="hidden md:flex items-center gap-2 text-xs font-mono text-[#6E6359]">
            <span>Candidate:</span>
            <strong className="text-[#262626] font-bold">{assessment.candidate_name}</strong>
            <span className="text-[#6E6359]/60">•</span>
            <span>{assessment.role_title}</span>
          </div>
        </div>

        {/* Proctoring Warnings Indicator, Timer & Submit Button */}
        <div className="flex items-center gap-3">
          {sessionStarted && !submissionResult && (
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
              warningsCount > 0
                ? "bg-amber-500/10 border-amber-500/30 text-amber-800"
                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-800"
            }`}>
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Warnings: {warningsCount} / 3</span>
            </div>
          )}

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all ${
            timeLeft < 300
              ? "bg-rose-500/10 border-rose-500/30 text-rose-700 animate-pulse"
              : "bg-[#FAF6F0] border-[#DFD5C6] text-[#262626]"
          }`}>
            <Clock className="h-3.5 w-3.5 text-[#C85A32]" />
            <span>Time: {formatTime(timeLeft)}</span>
          </div>

          <button
            disabled={submitting || !!submissionResult || !sessionStarted}
            onClick={() => setShowSubmitConfirm(true)}
            className="px-4 py-1.5 bg-[#C85A32] hover:bg-[#B83A14] disabled:opacity-50 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Grading Stress Tests...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Submit Assessment</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* =========================================================================
          MAIN WORKSPACE: SPLIT SCREEN (PROBLEM ON LEFT, IDE ON RIGHT)
          ========================================================================= */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* LEFT COLUMN: PROBLEM SPECIFICATION (5 Cols) */}
        <div className="lg:col-span-5 border-r border-[#DFD5C6] bg-[#FCFAF7] flex flex-col h-[calc(100vh-53px)] overflow-y-auto p-6 space-y-5">
          {/* Track Badges */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] uppercase tracking-wider">
                {problem?.difficulty || "Medium"} Track
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#FAF6F0] border border-[#DFD5C6] text-[#6E6359]">
                {problem?.track || "DSA & Systems"}
              </span>
              <span className="text-[10px] font-mono text-[#6E6359] ml-auto">
                Entry: <code className="text-[#262626] font-bold">{problem?.entry_point || "solution"}</code>
              </span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-serif font-bold text-[#262626] leading-tight">
              {problem?.title || assessment.problem_title}
            </h2>
          </div>

          {/* Formatted Problem Statement */}
          <div className="border-t border-[#DFD5C6]/60 pt-3">
            <ProblemMarkdownViewer text={problem?.description || ""} />
          </div>

          {/* Sample Invariants & Visible Test Cases */}
          {problem?.test_cases && problem.test_cases.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-[#DFD5C6]/60">
              <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#6E6359] flex items-center justify-between">
                <span>Sample Invariants & Test Cases</span>
                <span className="text-[10px] text-[#6E6359] font-normal">({problem.test_cases.length} Public Cases)</span>
              </h3>

              <div className="space-y-2.5">
                {problem.test_cases.map((tc: any, idx: number) => (
                  <div key={idx} className="bg-[#FAF6F0] border border-[#DFD5C6] p-3 rounded-xl space-y-1.5 font-mono text-[11px]">
                    <div className="flex items-center justify-between border-b border-[#DFD5C6]/40 pb-1">
                      <span className="font-bold text-[#C85A32]">Example Case {idx + 1}</span>
                      {tc.description && (
                        <span className="text-[10px] text-[#6E6359] italic">{tc.description}</span>
                      )}
                    </div>
                    <div className="text-[#6E6359] pt-1">
                      Input: <strong className="text-[#262626] bg-white px-1.5 py-0.5 rounded border border-[#DFD5C6]/40">{JSON.stringify(tc.input)}</strong>
                    </div>
                    <div className="text-[#2E5A44]">
                      Expected: <strong className="text-[#2E5A44] bg-white px-1.5 py-0.5 rounded border border-[#2E5A44]/30">{JSON.stringify(tc.expected)}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: CODE EDITOR & LIVE EXECUTION RUNNER (7 Cols) */}
        <div className="lg:col-span-7 bg-[#1E1E24] flex flex-col h-[calc(100vh-53px)] overflow-hidden">
          {/* Editor Header Bar */}
          <div className="bg-[#18181B] border-b border-[#27272A] px-4 py-2 flex items-center justify-between select-none">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-mono text-[#A1A1AA]">
                <FileCode2 className="h-4 w-4 text-[#C85A32]" />
                <span className="font-bold text-[#FCFAF7]">Solution</span>
              </div>

              {/* Supported Languages Selector */}
              <select
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="bg-[#27272A] border border-[#3F3F46] rounded-md px-2.5 py-1 text-xs font-mono font-bold text-[#FCFAF7] focus:outline-none focus:border-[#C85A32] cursor-pointer hover:bg-[#3F3F46] transition-all"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Editor Quick Toolbar */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleResetCode}
                title="Reset code to official template"
                className="p-1.5 rounded text-[#A1A1AA] hover:text-[#FCFAF7] hover:bg-[#27272A] transition-all text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-[10px]">Reset</span>
              </button>

              <button
                onClick={handleCopyCode}
                title="Copy code"
                className="p-1.5 rounded text-[#A1A1AA] hover:text-[#FCFAF7] hover:bg-[#27272A] transition-all text-xs font-mono flex items-center gap-1 cursor-pointer"
              >
                {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline text-[10px]">{copiedCode ? "Copied" : "Copy"}</span>
              </button>

              <div className="h-4 w-px bg-[#3F3F46]" />

              <button
                disabled={running || !!submissionResult || !sessionStarted}
                onClick={handleRunTests}
                title="Run sandboxed test cases (Ctrl + Enter)"
                className="px-3.5 py-1 bg-[#C85A32] hover:bg-[#B83A14] disabled:opacity-50 text-white rounded-md text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                <span>Run Tests</span>
              </button>
            </div>
          </div>

          {/* IDE Editor with Synchronized Line Numbers */}
          <div className="flex-1 relative flex bg-[#18181B] text-[#FCFAF7] overflow-hidden">
            {/* Gutter Line Numbers */}
            <div className="w-12 py-4 bg-[#141417] border-r border-[#27272A] text-right pr-3 font-mono text-[11px] text-[#52525B] select-none overflow-hidden">
              {lineNumbers.map((num) => (
                <div key={num} className="leading-5">{num}</div>
              ))}
            </div>

            {/* Code Textarea */}
            <div className="flex-1 relative overflow-hidden">
              <textarea
                ref={textareaRef}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!!submissionResult || !sessionStarted}
                spellCheck={false}
                className="w-full h-full py-4 px-4 bg-transparent text-[#F4F4F5] resize-none focus:outline-none font-mono text-xs leading-5 select-text overflow-y-auto"
                placeholder="// Write your production algorithmic implementation here..."
              />
            </div>
          </div>

          {/* Bottom Execution Console Drawer */}
          <div className="h-56 border-t border-[#27272A] bg-[#141417] flex flex-col overflow-hidden">
            {/* Console Header Bar */}
            <div className="px-4 py-2 bg-[#18181B] border-b border-[#27272A] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveConsoleTab("tests")}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                    activeConsoleTab === "tests"
                      ? "bg-[#27272A] text-[#FCFAF7]"
                      : "text-[#71717A] hover:text-[#A1A1AA]"
                  }`}
                >
                  <Terminal className="h-3.5 w-3.5 text-[#C85A32]" />
                  <span>Test Results</span>
                </button>

                <button
                  onClick={() => setActiveConsoleTab("stdout")}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all ${
                    activeConsoleTab === "stdout"
                      ? "bg-[#27272A] text-[#FCFAF7]"
                      : "text-[#71717A] hover:text-[#A1A1AA]"
                  }`}
                >
                  <Cpu className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Terminal Logs</span>
                </button>
              </div>

              {runResult && (
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                    runResult.passed === runResult.total
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  }`}>
                    {runResult.passed} / {runResult.total} Cases Passed
                  </span>
                  <span className="text-[10px] font-mono text-[#71717A]">
                    {runResult.runtime_ms || 12}ms
                  </span>
                </div>
              )}
            </div>

            {/* Console Output Body */}
            <div className="flex-1 p-3.5 font-mono text-xs overflow-y-auto space-y-2 text-[#D4D4D8]">
              {activeConsoleTab === "tests" && (
                <>
                  {runResult ? (
                    <div className="space-y-2">
                      {runResult.test_results?.map((tr: any, idx: number) => (
                        <div key={idx} className={`p-2.5 rounded-lg border text-[11px] space-y-1 ${
                          tr.passed
                            ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-300"
                            : "bg-rose-950/20 border-rose-800/40 text-rose-300"
                        }`}>
                          <div className="flex items-center gap-2 font-bold">
                            {tr.passed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                            )}
                            <span>Case {idx + 1}: {tr.passed ? "Passed" : "Assertion Mismatch"}</span>
                          </div>
                          {!tr.passed && (
                            <div className="ml-5.5 text-[10px] space-y-0.5 text-[#A1A1AA]">
                              <div>Expected: <code className="text-emerald-400">{JSON.stringify(tr.expected)}</code></div>
                              <div>Actual Output: <code className="text-rose-400">{JSON.stringify(tr.actual)}</code></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center text-[#71717A] text-xs py-6">
                      <span>Click "Run Tests" or press <kbd className="px-1.5 py-0.5 bg-[#27272A] rounded border border-[#3F3F46] text-[#FCFAF7]">Ctrl + Enter</kbd> to evaluate your implementation.</span>
                    </div>
                  )}
                </>
              )}

              {activeConsoleTab === "stdout" && (
                <div className="h-full">
                  {runResult?.stdout ? (
                    <pre className="p-2 bg-[#09090B] text-[#A1A1AA] rounded-md text-[11px] whitespace-pre-wrap font-mono">
                      {runResult.stdout}
                    </pre>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[#71717A] text-xs py-6">
                      No standard console logs captured during the last execution run.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PROCTORING GATEWAY: START OR RESUME IN FULLSCREEN MODAL
          ========================================================================= */}
      {(!sessionStarted || (!isInFullscreen && !violationModalOpen && !submissionResult)) && !submissionResult && (
        <div className="fixed inset-0 bg-[#18181B]/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#FCFAF7] border-2 border-[#DFD5C6] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className="h-16 w-16 rounded-2xl bg-[#C85A32]/10 border border-[#C85A32]/30 text-[#C85A32] flex items-center justify-center mx-auto shadow-inner">
              <Lock className="h-8 w-8" />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-mono font-bold px-3 py-1 rounded-full bg-[#C85A32]/15 text-[#C85A32] uppercase tracking-wider">
                Proctored Sandbox Assessment
              </span>
              <h2 className="text-2xl font-serif font-black text-[#262626]">
                {sessionStarted ? "Assessment in Progress" : "Live Coding Benchmark"}
              </h2>
              <p className="text-xs text-[#6E6359] leading-relaxed">
                {sessionStarted
                  ? "Your session and timer are actively running. Please re-enter full-screen mode to resume coding."
                  : "This benchmark evaluates production algorithms under rigorous security and proctoring protocols."}
              </p>
            </div>

            {/* Proctoring Rules Checklist */}
            <div className="bg-[#FAF6F0] border border-[#DFD5C6] p-4 rounded-2xl text-left space-y-2.5 text-xs text-[#262626] font-mono">
              <div className="flex items-start gap-2.5">
                <Maximize className="h-4 w-4 text-[#C85A32] shrink-0 mt-0.5" />
                <span>
                  <strong>Full Screen Enforced:</strong> The assessment runs strictly in full-screen mode.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>3 Warning Escape Limit:</strong> Pressing Escape or switching windows triggers a warning (3 maximum allowed).
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <Clock className="h-4 w-4 text-[#2E5A44] shrink-0 mt-0.5" />
                <span>
                  <strong>10-Second Grace Window:</strong> Each warning gives 10 seconds to return to full-screen before auto-submission.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <RefreshCw className="h-4 w-4 text-[#6E6359] shrink-0 mt-0.5" />
                <span>
                  <strong>Persistent Timer & Autosave:</strong> Refreshing the page preserves your timer and written code.
                </span>
              </div>
            </div>

            {sessionStarted && (
              <div className="flex items-center justify-between px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs font-mono text-amber-900 font-bold">
                <span>Time Remaining: {formatTime(timeLeft)}</span>
                <span>Warnings Incurred: {warningsCount} / 3</span>
              </div>
            )}

            <button
              onClick={handleStartOrResumeSession}
              className="w-full py-3.5 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-2xl text-sm font-mono font-bold cursor-pointer transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
            >
              <Maximize className="h-4 w-4" />
              <span>{sessionStarted ? "Re-enter Full Screen & Resume" : "Enter Full Screen & Start Assessment"}</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          URGENT PROCTORING VIOLATION MODAL WITH 10-SECOND COUNTDOWN
          ========================================================================= */}
      {violationModalOpen && !submissionResult && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4 animate-in zoom-in-95 duration-200">
          <div className="bg-[#1C1917] border-2 border-rose-500 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-[0_0_50px_rgba(244,63,94,0.35)] space-y-6 text-center text-white">
            <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
              <div className="h-16 w-16 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg relative z-10">
                <AlertOctagon className="h-9 w-9" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-400 text-xs font-mono font-bold uppercase tracking-wider">
                {warningsCount >= 3 ? "FINAL WARNING (3 / 3)" : `Warning ${warningsCount} of 3`}
              </div>
              <h2 className="text-2xl font-serif font-black text-white">
                Fullscreen Violation Detected!
              </h2>
              <p className="text-xs text-stone-400 leading-relaxed font-sans">
                You have pressed Escape or left full-screen mode. You must return to full-screen immediately or your test will be auto-submitted.
              </p>
            </div>

            {/* High-visibility Countdown Box */}
            <div className="bg-rose-950/40 border border-rose-800/60 p-4 rounded-2xl space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-wider text-rose-300">
                Auto-Submitting in:
              </span>
              <div className="text-4xl font-mono font-black text-rose-500 tracking-tight animate-pulse">
                00:{violationSecondsLeft.toString().padStart(2, "0")}
              </div>
              <p className="text-[10px] font-mono text-stone-400">
                {warningsCount >= 3
                  ? "Notice: This is your 3rd warning. Any subsequent violation will terminate the assessment immediately."
                  : `You have ${3 - warningsCount} warning(s) remaining after this.`}
              </p>
            </div>

            <button
              onClick={handleReturnToFullscreen}
              className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white rounded-2xl text-sm font-mono font-bold cursor-pointer transition-all shadow-lg hover:shadow-rose-600/30 flex items-center justify-center gap-2"
            >
              <Maximize className="h-4 w-4" />
              <span>Return to Full Screen Now</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          CONFIRMATION MODAL: BEFORE SUBMITTING ASSESSMENT
          ========================================================================= */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 bg-[#262626]/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="h-12 w-12 rounded-full bg-[#C85A32]/10 text-[#C85A32] flex items-center justify-center mx-auto">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-serif font-bold text-[#262626]">
                Ready to Finalize Submission?
              </h3>
              <p className="text-xs text-[#6E6359] leading-relaxed">
                Your code will be executed across sandboxed concurrency stress tests and adversarial edge cases. Your DevScore telemetry will be recorded directly into the founder's talent pipeline.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 py-2 border border-[#DFD5C6] bg-white hover:bg-[#FAF6F0] rounded-xl text-xs font-mono font-bold text-[#6E6359] cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                onClick={() => handleSubmitAssessment("manual")}
                className="flex-1 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-mono font-bold cursor-pointer shadow-sm"
              >
                Confirm & Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          FINAL SUBMISSION MODAL & VERIFIED DEVSCORE RECORD
          ========================================================================= */}
      {submissionResult && (
        <div className="fixed inset-0 bg-[#262626]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl space-y-6 text-center">
            <div className={`h-16 w-16 rounded-2xl flex items-center justify-center mx-auto ${
              autoSubmitReason === "proctoring_violations" || submissionResult.submission_reason === "proctoring_violations"
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-600"
                : "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700"
            }`}>
              {autoSubmitReason === "proctoring_violations" || submissionResult.submission_reason === "proctoring_violations" ? (
                <ShieldAlert className="h-8 w-8" />
              ) : (
                <CheckCircle2 className="h-8 w-8" />
              )}
            </div>

            <div className="space-y-1.5">
              {autoSubmitReason === "warning_timeout" && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-700 uppercase">
                  Auto-Submitted (10s Grace Expired)
                </span>
              )}
              {autoSubmitReason === "proctoring_violations" && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-rose-500/15 text-rose-700 uppercase">
                  Disqualified (3 Warnings Exceeded)
                </span>
              )}
              {autoSubmitReason === "time_expired" && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-700 uppercase">
                  Auto-Submitted (Time Limit Expired)
                </span>
              )}
              {(!autoSubmitReason || autoSubmitReason === "manual") && (
                <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 uppercase">
                  Standard Final Submission
                </span>
              )}

              <h3 className="text-2xl font-serif font-bold text-[#262626]">
                {autoSubmitReason === "proctoring_violations" ? "Assessment Terminated" : "Assessment Submitted!"}
              </h3>
              <p className="text-xs text-[#6E6359] font-medium leading-relaxed">
                {autoSubmitReason === "proctoring_violations"
                  ? "The assessment was auto-submitted because the maximum allowed fullscreen violations (3 warnings) were exceeded."
                  : autoSubmitReason === "warning_timeout"
                  ? "The assessment was auto-submitted because you did not return to full-screen mode within the 10-second grace window."
                  : autoSubmitReason === "time_expired"
                  ? "The assessment was auto-submitted because the total time limit expired."
                  : "Your code and adversarial stress test telemetry have been cryptographically verified and recorded for the hiring team."}
              </p>
            </div>

            {/* Score Metric Badges */}
            <div className="grid grid-cols-2 gap-3 bg-[#FAF6F0] border border-[#DFD5C6] p-4 rounded-xl text-center">
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">Overall Score</span>
                <p className="text-2xl font-black font-mono text-[#C85A32]">{submissionResult.score} / 1000</p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[9px] font-mono uppercase font-bold text-[#6E6359]">Chaos Resilience</span>
                <p className="text-2xl font-black font-mono text-[#2E5A44]">{submissionResult.chaos_resilience}%</p>
              </div>
            </div>

            <div className="pt-2 border-t border-[#DFD5C6]/60">
              <p className="text-[11px] font-mono text-[#6E6359]">
                Verdict: <strong className="text-[#262626]">{submissionResult.verdict}</strong>
              </p>
            </div>

            <button
              onClick={() => router.push("/")}
              className="w-full py-2.5 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-mono font-bold cursor-pointer transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Career Portal</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
