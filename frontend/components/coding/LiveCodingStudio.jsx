"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Code2,
  Play,
  Zap,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Sparkles,
  Terminal,
  Cpu,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  HelpCircle,
  Award,
  BookOpen,
  Bug,
  Server,
  FolderGit2,
  Maximize2,
  Minimize2,
  ShieldAlert,
  Sliders,
  Search,
  X,
  Filter,
  Activity,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  Layers,
  BarChart2,
  FileCode2,
  CheckCheck,
  Bot,
  Shield
} from "lucide-react";

import ProblemRenderer from "./ProblemRenderer";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8001";

export default function LiveCodingStudio({ user, onNavigate }) {
  // Navigation & Track States
  const [activeTrack, setActiveTrack] = useState("DSA"); // 'DSA' | 'Backend' | 'BugHunt' | 'GitHub-Tailored'
  const [problems, setProblems] = useState([]);
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [currentProblem, setCurrentProblem] = useState(null);
  const [language, setLanguage] = useState("cpp"); // default to C++ for DSA
  const [code, setCode] = useState("");

  // Problem Library Modal State
  const [isProblemLibraryOpen, setIsProblemLibraryOpen] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const [libraryDifficultyFilter, setLibraryDifficultyFilter] = useState("All");

  // UI Panels & Tabs
  const [leftTab, setLeftTab] = useState("problem"); // 'problem' | 'copilot' | 'chaos' | 'scorecard'
  const [bottomTab, setBottomTab] = useState("tests"); // 'tests' | 'custom' | 'console' | 'ast'
  const [activeTestCaseIdx, setActiveTestCaseIdx] = useState(0);
  const [customInputText, setCustomInputText] = useState("");
  const [showHints, setShowHints] = useState({});
  const [copiedCode, setCopiedCode] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mobileActivePane, setMobileActivePane] = useState("left"); // 'left' | 'editor' | 'console'

  // Execution & AST State
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [isAnalyzingAST, setIsAnalyzingAST] = useState(false);
  const [isRunningChaos, setIsRunningChaos] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [testResults, setTestResults] = useState(null);
  const [chaosResults, setChaosResults] = useState(null);
  const [astAnalysis, setAstAnalysis] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [consoleOutput, setConsoleOutput] = useState("");

  // Timer & Session
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // AI Conversational Voice Copilot
  const [chatMessages, setChatMessages] = useState([
    {
      role: "assistant",
      content:
        "Welcome to the technical evaluation session. I am your interviewer today. Please walk me through your initial thoughts and approach before coding. I am here to discuss algorithm invariants, time/space tradeoffs, and answer questions along the way."
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const [isSpeakingAi, setIsSpeakingAi] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const chatEndRef = useRef(null);

  const languageRef = useRef(language);
  languageRef.current = language;

  const selectProblem = useCallback((problem, explicitLang) => {
    if (!problem) return;
    setCurrentProblem(problem);
    setSelectedProblemId(problem.id);
    setActiveTrack(problem.track);

    const langToUse = explicitLang || languageRef.current;
    const starter =
      problem.starter_code?.[langToUse] ||
      problem.starter_code?.cpp ||
      problem.starter_code?.python ||
      problem.starter_code?.javascript ||
      "";
    setCode(starter);

    // Reset test and evaluation states
    setTestResults(null);
    setChaosResults(null);
    setAstAnalysis(null);
    setScorecard(null);
    setConsoleOutput("");
    setActiveTestCaseIdx(0);
    setLeftTab("problem");

    // Prepare custom input default
    if (problem.test_cases && problem.test_cases.length > 0) {
      setCustomInputText(JSON.stringify(problem.test_cases[0].input, null, 2));
    }
  }, []);

  // Fetch problem catalog ONLY ONCE on mount
  useEffect(() => {
    const initCatalog = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/code/problems`);
        if (res.ok) {
          const data = await res.json();
          const loadedProblems = data.problems || [];
          setProblems(loadedProblems);
          if (loadedProblems.length > 0) {
            selectProblem(loadedProblems[0], "cpp");
          }
        }
      } catch (err) {
        console.error("Failed to fetch coding problems:", err);
      }
    };
    initCatalog();
  }, [selectProblem]);

  // Timer hook
  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Scroll chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const handleTrackChange = (track) => {
    setActiveTrack(track);
    let newLang = language;
    if (track === "DSA") {
      if (!["cpp", "java", "python", "javascript"].includes(language)) {
        newLang = "cpp";
        setLanguage("cpp");
      }
    } else {
      if (["cpp", "java"].includes(language)) {
        newLang = "python";
        setLanguage("python");
      }
    }

    if (track === "GitHub-Tailored") {
      generateTailoredProblem(newLang);
      return;
    }
    const filtered = problems.filter((p) => p.track === track);
    if (filtered.length > 0) {
      selectProblem(filtered[0], newLang);
    }
  };

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    if (currentProblem && currentProblem.starter_code) {
      const template =
        currentProblem.starter_code[newLang] ||
        currentProblem.starter_code.python ||
        currentProblem.starter_code.cpp ||
        currentProblem.starter_code.javascript ||
        "";
      setCode(template);
    }
  };

  // Run Code in Polyglot Sandbox
  const handleRunCode = async () => {
    if (!currentProblem) return;
    setIsRunningTests(true);
    setBottomTab("tests");
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileActivePane("console");
    }
    setConsoleOutput("> Initializing polyglot execution sandbox...\n> Compiling code against test suite...\n");

    try {
      const res = await fetch(`${BACKEND_URL}/api/code/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: language,
          code: code,
          entry_point: currentProblem.entry_point || "solution",
          test_cases: currentProblem.test_cases || [],
          timeout_seconds: 5.0
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestResults(data);

        let logs = `[Sandbox Execution Completed - Status: ${data.status}]\n`;
        logs += `Tests Passed: ${data.tests_passed} / ${data.total_tests}\n`;
        logs += `Benchmark Total Duration: ${data.duration_ms}ms\n\n`;

        if (data.stdout) logs += `[Standard Output]:\n${data.stdout}\n\n`;
        if (data.stderr) logs += `[Standard Error / Traces]:\n${data.stderr}\n\n`;

        data.test_results?.forEach((tr, i) => {
          logs += `Test #${i + 1} [${tr.passed ? "PASSED" : "FAILED"}]: ${tr.description} (${tr.duration_ms}ms)\n`;
        });

        setConsoleOutput(logs);

        // Auto-run AST complexity radar in background if all passed
        if (data.tests_passed === data.total_tests && data.total_tests > 0) {
          runASTAnalysis(false);
        }
      } else {
        const errData = await res.json();
        setConsoleOutput(`[Execution Error]: ${errData.detail || "Subprocess execution failed"}`);
      }
    } catch (err) {
      console.error("Run error:", err);
      setConsoleOutput(`[Network/Sandbox Error]: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Global Keyboard Shortcut: Ctrl + Enter / Cmd + Enter to Run Code
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleRunCode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // Run Custom Input
  const handleRunCustomInput = async () => {
    if (!currentProblem) return;
    let parsedInput;
    try {
      parsedInput = JSON.parse(customInputText);
    } catch (e) {
      alert("Invalid JSON format for custom input. Please format as valid JSON object or array.");
      return;
    }

    setIsRunningTests(true);
    setBottomTab("tests");
    try {
      const singleTest = [
        {
          input: parsedInput,
          expected: null,
          description: "Custom Input Verification"
        }
      ];

      const res = await fetch(`${BACKEND_URL}/api/code/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: language,
          code: code,
          entry_point: currentProblem.entry_point || "solution",
          test_cases: singleTest,
          timeout_seconds: 5.0
        })
      });

      if (res.ok) {
        const data = await res.json();
        setTestResults(data);
        setActiveTestCaseIdx(0);
      }
    } catch (err) {
      console.error("Custom run error:", err);
    } finally {
      setIsRunningTests(false);
    }
  };

  // Run AST Eye Complexity Analyzer
  const runASTAnalysis = async (switchToTab = false) => {
    if (!currentProblem) return;
    setIsAnalyzingAST(true);
    if (switchToTab) setBottomTab("ast");

    try {
      const res = await fetch(`${BACKEND_URL}/api/code/ast-complexity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code,
          language: language,
          problem_title: currentProblem.title,
          problem_description: currentProblem.description
        })
      });

      if (res.ok) {
        const data = await res.json();
        setAstAnalysis(data.analysis);
      }
    } catch (err) {
      console.error("AST error:", err);
    } finally {
      setIsAnalyzingAST(false);
    }
  };

  // Chaos Adversarial Stress Testing
  const handleChaosTest = async () => {
    if (!currentProblem) return;
    setIsRunningChaos(true);
    setLeftTab("chaos");
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileActivePane("left");
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/code/chaos-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code,
          language: language,
          problem_title: currentProblem.title,
          problem_description: currentProblem.description,
          entry_point: currentProblem.entry_point || "solution",
          standard_test_cases: currentProblem.test_cases || []
        })
      });

      if (res.ok) {
        const data = await res.json();
        setChaosResults(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Chaos test endpoint returned error:", res.status, errData);
      }
    } catch (err) {
      console.error("Chaos error:", err);
    } finally {
      setIsRunningChaos(false);
    }
  };

  // Submit Solution for Final Scorecard
  const handleSubmitSolution = async () => {
    if (!currentProblem) return;
    setIsSubmitting(true);
    setLeftTab("scorecard");
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileActivePane("left");
    }

    try {
      const passedCount = testResults?.tests_passed ?? (currentProblem.test_cases?.length || 0);
      const totalCount = testResults?.total_tests ?? (currentProblem.test_cases?.length || 0);

      const res = await fetch(`${BACKEND_URL}/api/code/submit-evaluation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.uid || "anonymous",
          problem_id: currentProblem.id,
          problem_title: currentProblem.title,
          problem_description: currentProblem.description || "",
          track: currentProblem.track || activeTrack,
          difficulty: currentProblem.difficulty || "Medium",
          language: language,
          code: code,
          tests_passed: passedCount,
          total_tests: totalCount,
          chaos_tests_passed: chaosResults?.chaos_tests_passed ?? passedCount,
          chaos_total_tests: chaosResults?.chaos_total_tests ?? totalCount,
          time_complexity: astAnalysis?.time_complexity || currentProblem.optimal_time || "O(N)",
          space_complexity: astAnalysis?.space_complexity || currentProblem.optimal_space || "O(1)",
          duration_seconds: timerSeconds
        })
      });

      if (res.ok) {
        const data = await res.json();
        const sc = data.scorecard || data.evaluation;
        setScorecard(sc);
      }
    } catch (err) {
      console.error("Submit error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Generate GitHub Tailored Problem
  const generateTailoredProblem = async (explicitLang) => {
    try {
      setLeftTab("problem");
      const res = await fetch(
        `${BACKEND_URL}/api/code/generate-from-repo?github_url=https://github.com/facebook/react&topic=Async+Concurrency`
      );
      if (res.ok) {
        const data = await res.json();
        const customP = data.problem;
        setCurrentProblem(customP);
        setSelectedProblemId(customP.id);
        const langToUse = explicitLang || language;
        setCode(customP.starter_code?.[langToUse] || customP.starter_code?.python || "");
        setProblems((prev) => [customP, ...prev.filter((p) => p.id !== customP.id)]);
      }
    } catch (err) {
      console.error("Failed to generate repo challenge:", err);
    }
  };

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // AI Conversational Chat with Socratic Response Handling
  const handleSendMessage = async (customPrompt) => {
    const textToSend = customPrompt || chatInput;
    if (!textToSend.trim() || isChatLoading) return;

    const userMsg = { role: "user", content: textToSend };
    const updatedHistory = [...chatMessages, userMsg];
    setChatMessages(updatedHistory);
    if (!customPrompt) setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/code/copilot-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_title: currentProblem?.title || "Coding Challenge",
          problem_description: currentProblem?.description || "",
          code: code,
          language: language,
          user_message: textToSend,
          chat_history: updatedHistory.slice(-6)
        })
      });

      if (res.ok) {
        const data = await res.json();
        const replyText = data.reply || "Let's analyze your code's invariant and look at how we can optimize time complexity.";
        const aiMsg = { role: "assistant", content: replyText };
        setChatMessages((prev) => [...prev, aiMsg]);

        // Synthesize Voice via Sarvam v3 TTS
        if (ttsEnabled) {
          playSpeech(replyText);
        }
      } else {
        const aiMsg = {
          role: "assistant",
          content: "Let's look at the invariants in your current code. What state are you maintaining, and can we optimize the time complexity to O(N) using two pointers or a hash map?"
        };
        setChatMessages((prev) => [...prev, aiMsg]);
        if (ttsEnabled) playSpeech(aiMsg.content);
      }
    } catch (err) {
      console.error("Chat error:", err);
      const aiMsg = {
        role: "assistant",
        content: "Consider the state and pointers you are tracking. Can we eliminate repeated inner scans by maintaining a sorted invariant or lookup set?"
      };
      setChatMessages((prev) => [...prev, aiMsg]);
      if (ttsEnabled) playSpeech(aiMsg.content);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Text-To-Speech Playback with Live Animated Audio Wave
  const playSpeech = async (text) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/text-to-speech`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, language_code: "en-IN" })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.audio_base64) {
          const audio = new Audio(`data:audio/mp3;base64,${data.audio_base64}`);
          setIsSpeakingAi(true);
          audio.onended = () => setIsSpeakingAi(false);
          audio.onerror = () => setIsSpeakingAi(false);
          audio.play();
        }
      }
    } catch (e) {
      console.error("TTS playback error:", e);
      setIsSpeakingAi(false);
    }
  };

  // Real Audio Recording with Sarvam saaras:v3 STT & Web Speech Fallback
  const toggleSpeechRecognition = async () => {
    if (isListeningMic) {
      // Stop recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      setIsListeningMic(false);
      return;
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          stream.getTracks().forEach((track) => track.stop());

          // Send to backend Sarvam saaras:v3 STT endpoint
          try {
            const formData = new FormData();
            formData.append("file", audioBlob, "user_speech.webm");
            formData.append("language_code", "en-IN");

            const res = await fetch(`${BACKEND_URL}/api/speech-to-text`, {
              method: "POST",
              body: formData
            });

            if (res.ok) {
              const data = await res.json();
              if (data.transcript && data.transcript.trim()) {
                setChatInput(data.transcript.trim());
              }
            }
          } catch (sttErr) {
            console.error("Sarvam STT transcription failed:", sttErr);
          }
        };

        mediaRecorder.start();
        setIsListeningMic(true);
      } else {
        throw new Error("getUserMedia not supported");
      }
    } catch (err) {
      console.warn("MediaRecorder mic access error, falling back to Web Speech API:", err);
      // Fallback to Web Speech API
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onstart = () => setIsListeningMic(true);
        recognition.onend = () => setIsListeningMic(false);
        recognition.onerror = () => setIsListeningMic(false);

        recognition.onresult = (event) => {
          const transcript = event.results[0][0].transcript;
          setChatInput(transcript);
        };

        recognition.start();
      } else {
        alert("Microphone access could not be started. Please allow microphone permissions in your browser bar.");
      }
    }
  };

  // Copy code helper
  const handleCopyCode = () => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Format timer
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const getDifficultyBadge = (diff) => {
    switch (diff) {
      case "Easy":
        return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
      case "Medium":
        return "bg-amber-500/10 text-amber-700 border-amber-500/20";
      case "Hard":
        return "bg-rose-500/10 text-rose-700 border-rose-500/20";
      case "FAANG Bar-Raiser":
        return "bg-purple-500/10 text-purple-700 border-purple-500/20";
      default:
        return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    }
  };

  const getLanguageLabel = (lang) => {
    switch (lang) {
      case "cpp":
        return "C++ (GCC 17)";
      case "java":
        return "Java (OpenJDK 21)";
      case "python":
        return "Python (3.11)";
      case "javascript":
        return "JavaScript (ES6)";
      case "typescript":
        return "TypeScript (Node.js)";
      case "go":
        return "Go (1.22)";
      default:
        return lang;
    }
  };

  const filteredLibraryProblems = problems.filter((p) => {
    const matchesTrack = p.track === activeTrack || activeTrack === "GitHub-Tailored";
    const matchesDiff = libraryDifficultyFilter === "All" || p.difficulty === libraryDifficultyFilter;
    const query = librarySearchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      p.title?.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query) ||
      p.tags?.some((t) => t.toLowerCase().includes(query)) ||
      p.description?.toLowerCase().includes(query);
    return matchesTrack && matchesDiff && matchesSearch;
  });

  const quickPrompts = [
    { label: "Invariant Hint", icon: HelpCircle, prompt: "Can you give me a Socratic hint on the optimal invariant or data structure without spoiling the solution?" },
    { label: "Complexity Audit", icon: Cpu, prompt: "Can you analyze my current code's Big-O time and space complexity and tell me where the bottlenecks are?" },
    { label: "Edge Case Analysis", icon: Shield, prompt: "What extreme edge cases or boundary conditions should I account for in this implementation?" },
    { label: "Big-O Tradeoffs", icon: Activity, prompt: "What are the tradeoffs between this approach versus an alternative data structure?" }
  ];

  return (
    <div
      className={`flex flex-col h-full bg-[#FAF6F0] text-[#262626] font-sans select-none overflow-hidden ${
        isFullScreen ? "fixed inset-0 z-50 p-2" : ""
      }`}
    >
      {/* =========================================================================
          TOP ACTION & CONTROL BAR WITH HIGH-TECH STATUS PILL
          ========================================================================= */}
      <header className="bg-[#FCFAF7] border-b border-[#DFD5C6] px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between gap-2 sm:gap-3 shrink-0 shadow-xs backdrop-blur-xs overflow-x-auto custom-scrollbar">
        {/* Left: Tracks & Problem Selector */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#DFD5C6]">
            {[
              { id: "DSA", label: "DSA", icon: Cpu },
              { id: "Backend", label: "Backend Systems", icon: Server },
              { id: "BugHunt", label: "Bug Hunt", icon: Bug },
              { id: "GitHub-Tailored", label: "GitHub Tailored", icon: FolderGit2 }
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTrack === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleTrackChange(t.id)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    active
                      ? "bg-[#C85A32] text-white shadow-xs"
                      : "text-[#6E6359] hover:text-[#262626] hover:bg-[#FCFAF7]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Problem Selector Dropdown */}
          <select
            value={selectedProblemId}
            onChange={(e) => {
              const p = problems.find((item) => item.id === e.target.value);
              if (p) selectProblem(p);
            }}
            className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs font-bold px-2.5 sm:px-3 py-1.5 text-[#262626] focus:outline-none focus:border-[#C85A32] cursor-pointer max-w-[140px] sm:max-w-[200px] truncate shadow-2xs"
          >
            {problems
              .filter((p) => p.track === activeTrack || activeTrack === "GitHub-Tailored")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
          </select>

          {/* Browse Full Library Button */}
          <button
            onClick={() => setIsProblemLibraryOpen(true)}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-[#FAF6F0] hover:bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs font-bold text-[#262626] transition-all cursor-pointer shadow-xs"
            title="Open Problem Explorer with search and filters"
          >
            <BookOpen className="h-3.5 w-3.5 text-[#C85A32]" />
            <span className="hidden sm:inline">
              Catalog ({problems.filter((p) => p.track === activeTrack || activeTrack === "GitHub-Tailored").length})
            </span>
          </button>

          {/* Difficulty Badge */}
          {currentProblem && (
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border shadow-2xs hidden sm:inline-block ${getDifficultyBadge(
                currentProblem.difficulty
              )}`}
            >
              {currentProblem.difficulty}
            </span>
          )}
        </div>

        {/* Center: Live Session Timer & Polyglot Sandbox Status */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden xl:flex items-center gap-2 bg-[#FAF6F0] px-2.5 py-1 rounded-lg border border-[#DFD5C6] text-[11px] font-mono text-[#6E6359]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
            <span>Native Sandbox</span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#FAF6F0] px-2.5 sm:px-3 py-1.5 rounded-xl border border-[#DFD5C6] shadow-2xs">
            <Clock className="h-3.5 w-3.5 text-[#6E6359]" />
            <span className="font-mono text-xs font-bold text-[#262626]">{formatTime(timerSeconds)}</span>
            <button
              onClick={() => setIsTimerRunning(!isTimerRunning)}
              className="text-[10px] font-semibold text-[#6E6359] hover:text-[#262626] cursor-pointer ml-1 underline"
            >
              {isTimerRunning ? "Pause" : "Resume"}
            </button>
          </div>
        </div>

        {/* Right: Actions (Language, Complexity, Stress Test, Run, Submit) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Dynamic Language Switcher */}
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-xl text-xs font-mono font-bold px-2.5 sm:px-3 py-1.5 text-[#262626] focus:outline-none focus:border-[#C85A32] cursor-pointer shadow-2xs"
          >
            {activeTrack === "DSA" ? (
              <>
                <option value="cpp">C++ (GCC 17)</option>
                <option value="java">Java (OpenJDK 21)</option>
                <option value="python">Python (3.11)</option>
                <option value="javascript">JavaScript (ES6)</option>
              </>
            ) : (
              <>
                <option value="python">Python (FastAPI)</option>
                <option value="javascript">JavaScript (Node.js)</option>
                <option value="typescript">TypeScript (Node.js)</option>
                <option value="go">Go (1.22)</option>
              </>
            )}
          </select>

          {/* Ask AI Interviewer */}
          <button
            onClick={() => {
              setLeftTab("copilot");
              if (typeof window !== "undefined" && window.innerWidth < 1024) setMobileActivePane("left");
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer shadow-2xs ${
              leftTab === "copilot"
                ? "bg-[#C85A32]/10 border-[#C85A32] text-[#C85A32]"
                : "border-[#DFD5C6] bg-[#FCFAF7] hover:bg-[#FAF6F0] text-[#6E6359] hover:text-[#262626]"
            }`}
            title="Ask AI Interviewer"
          >
            <Bot className="h-3.5 w-3.5 text-[#C85A32]" />
            <span className="hidden md:inline">AI Guidance</span>
          </button>

          {/* Analyze Complexity (AST) */}
          <button
            onClick={() => {
              runASTAnalysis(true);
              if (typeof window !== "undefined" && window.innerWidth < 1024) setMobileActivePane("console");
            }}
            disabled={isAnalyzingAST}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#DFD5C6] bg-[#FCFAF7] hover:bg-[#FAF6F0] text-[#6E6359] hover:text-[#262626] transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Analyze Big-O Complexity"
          >
            <Cpu className="h-3.5 w-3.5 text-[#6E6359]" />
            <span className="hidden md:inline">Complexity</span>
          </button>

          {/* Stress Test */}
          <button
            onClick={handleChaosTest}
            disabled={isRunningChaos}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border border-[#DFD5C6] bg-[#FCFAF7] hover:bg-[#FAF6F0] text-[#6E6359] hover:text-[#262626] transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Run Boundary Stress Test"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-[#C85A32]" />
            <span className="hidden md:inline">Stress Test</span>
          </button>

          {/* Run Code Button */}
          <button
            onClick={handleRunCode}
            disabled={isRunningTests}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 bg-[#262626] hover:bg-black text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.01]"
            title="Execute Code (Ctrl + Enter)"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>{isRunningTests ? "Running..." : "Run"}</span>
            <span className="hidden xl:inline text-[9px] bg-white/20 px-1 py-0.2 rounded font-mono">⌘↵</span>
          </button>

          {/* Submit Solution Button */}
          <button
            onClick={handleSubmitSolution}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.01]"
          >
            <Award className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isSubmitting ? "Evaluating..." : "Submit Solution"}</span>
            <span className="sm:hidden">{isSubmitting ? "..." : "Submit"}</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          MOBILE VIEW SELECTOR (Visible only on mobile/tablet < lg)
          ========================================================================= */}
      <div className="lg:hidden flex items-center justify-between border-b border-[#DFD5C6] bg-[#FCFAF7] px-3 py-1.5 shrink-0 select-none">
        <div className="flex items-center gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#DFD5C6] w-full">
          <button
            onClick={() => setMobileActivePane("left")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mobileActivePane === "left"
                ? "bg-[#C85A32] text-white shadow-2xs"
                : "text-[#6E6359] hover:text-[#262626]"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>{leftTab === "problem" ? "Problem" : leftTab === "copilot" ? "Interviewer" : leftTab === "chaos" ? "Stress" : "Score"}</span>
          </button>
          <button
            onClick={() => setMobileActivePane("editor")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mobileActivePane === "editor"
                ? "bg-[#C85A32] text-white shadow-2xs"
                : "text-[#6E6359] hover:text-[#262626]"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Editor</span>
          </button>
          <button
            onClick={() => {
              setMobileActivePane("console");
              setBottomTab("tests");
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              mobileActivePane === "console"
                ? "bg-[#C85A32] text-white shadow-2xs"
                : "text-[#6E6359] hover:text-[#262626]"
            }`}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>{testResults ? `${testResults.tests_passed}/${testResults.total_tests} Tests` : "Console"}</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          MAIN WORKSPACE: SPLIT SCREEN (LEFT: PROBLEM / AI, RIGHT: CODE / CONSOLE)
          ========================================================================= */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* =====================================================================
            LEFT PANEL: Problem Description, AI Copilot, Chaos Report, Scorecard
            ===================================================================== */}
        <div className={`w-full lg:w-[42%] border-r border-[#DFD5C6] flex flex-col bg-[#FCFAF7] overflow-hidden ${
          mobileActivePane === "left" ? "flex flex-1" : "hidden lg:flex"
        }`}>
          {/* Sub-tab Navigation */}
          <div className="flex items-center border-b border-[#DFD5C6] bg-[#FAF6F0] px-3 pt-2 gap-1 shrink-0">
            {[
              { id: "problem", label: "Problem", icon: BookOpen },
              { id: "copilot", label: "Interviewer", icon: Bot },
              { id: "chaos", label: "Stress Report", icon: ShieldAlert },
              { id: "scorecard", label: "Scorecard", icon: Award }
            ].map((tab) => {
              const Icon = tab.icon;
              const active = leftTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setLeftTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                    active
                      ? "border-[#C85A32] text-[#C85A32] bg-[#FCFAF7] rounded-t-lg shadow-2xs"
                      : "border-transparent text-[#6E6359] hover:text-[#262626]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Left Tab Contents */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            {/* 1. PROBLEM DESCRIPTION TAB */}
            {leftTab === "problem" && currentProblem && (
              <div className="space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-serif font-bold text-xl text-[#262626]">
                      {currentProblem.title}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                    {currentProblem.tags?.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] font-semibold bg-[#FAF6F0] border border-[#DFD5C6] text-[#6E6359] px-2.5 py-0.5 rounded-full font-mono shadow-2xs"
                      >
                        {tag}
                      </span>
                    ))}
                    <span className="text-[10px] font-mono text-[#C85A32] font-semibold bg-[#C85A32]/10 border border-[#C85A32]/20 px-2.5 py-0.5 rounded-lg">
                      Target: {currentProblem.optimal_time || "O(N)"} Time / {currentProblem.optimal_space || "O(1)"} Space
                    </span>
                  </div>
                </div>

                {/* Problem Description with Clean Markdown & Math Rendering */}
                <div className="pt-1">
                  <ProblemRenderer content={currentProblem.description} />
                </div>

                {/* Active Language Signature Card */}
                <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 space-y-2 font-mono shadow-xs">
                  <div className="flex items-center justify-between text-[11px] font-bold text-[#6E6359]">
                    <span className="flex items-center gap-1.5 text-[#262626]">
                      <Code2 className="h-4 w-4 text-[#C85A32]" />
                      Method Signature: <strong className="text-[#C85A32]">{getLanguageLabel(language)}</strong>
                    </span>
                    <span className="text-[10px] bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 px-2 py-0.5 rounded font-bold">
                      Entry: {currentProblem.entry_point || "solution"}
                    </span>
                  </div>
                  <pre className="bg-[#18181B] text-emerald-400 p-3 rounded-xl text-[11px] overflow-x-auto custom-scrollbar border border-[#27272A] leading-relaxed">
                    {currentProblem.starter_code?.[language] ||
                      currentProblem.starter_code?.cpp ||
                      currentProblem.starter_code?.python ||
                      `// Starter function for ${language}`}
                  </pre>
                </div>

                {/* Sample Test Case Preview */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359]">
                    Sample Test Cases
                  </h3>
                  <div className="space-y-3">
                    {currentProblem.test_cases?.slice(0, 3).map((tc, idx) => (
                      <div
                        key={idx}
                        className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-3.5 text-xs font-mono space-y-2 shadow-2xs"
                      >
                        <div className="text-[11px] font-bold text-[#6E6359] flex items-center justify-between">
                          <span>Example {idx + 1} ({tc.description})</span>
                        </div>
                        <div className="bg-[#FCFAF7] p-2.5 rounded-lg border border-[#DFD5C6]/60 text-[11px] overflow-x-auto">
                          <span className="text-[#6E6359]">Input: </span>
                          <span className="text-[#262626] font-bold">{JSON.stringify(tc.input)}</span>
                        </div>
                        <div className="bg-[#FCFAF7] p-2.5 rounded-lg border border-[#DFD5C6]/60 text-[11px] overflow-x-auto">
                          <span className="text-[#6E6359]">Expected Output: </span>
                          <span className="text-[#C85A32] font-bold">{JSON.stringify(tc.expected)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hints Accordion */}
                {currentProblem.hints && currentProblem.hints.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#DFD5C6]">
                    <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#6E6359] flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5 text-[#C85A32]" />
                      Socratic Hints
                    </h3>
                    <div className="space-y-2">
                      {currentProblem.hints.map((hint, idx) => {
                        const isOpen = showHints[idx];
                        return (
                          <div key={idx} className="border border-[#DFD5C6] rounded-xl bg-[#FAF6F0] overflow-hidden shadow-2xs">
                            <button
                              onClick={() => setShowHints((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                              className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-[#262626] flex items-center justify-between hover:bg-[#FCFAF7] cursor-pointer"
                            >
                              <span>Hint {idx + 1}</span>
                              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            {isOpen && (
                              <div className="px-3.5 pb-3.5 pt-1.5 text-xs text-[#6E6359] leading-relaxed border-t border-[#DFD5C6]/50 bg-[#FCFAF7]">
                                {hint}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. AI INTERVIEWER COPILOT TAB */}
            {leftTab === "copilot" && (
              <div className="flex flex-col h-full space-y-4">
                {/* Voice Copilot Header */}
                <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-4 flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[#C85A32] text-white flex items-center justify-center font-bold text-xs shadow-2xs font-mono">
                      INT
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#262626]">Technical Interviewer</p>
                      <p className="text-[10px] text-[#6E6359] font-mono">Sarvam AI Voice Engine Active</p>
                    </div>
                  </div>

                  {/* Audio Meter Controls */}
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-white rounded-xl border border-[#DFD5C6]">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span
                        key={i}
                        className={`w-1 rounded-full bg-[#C85A32] transition-all duration-300 ${
                          isSpeakingAi || isListeningMic || isChatLoading
                            ? `animate-soundwave-${i}`
                            : "h-2 opacity-30"
                        }`}
                      />
                    ))}
                    <button
                      onClick={() => setTtsEnabled(!ttsEnabled)}
                      className={`ml-2 p-1.5 rounded-lg border text-xs cursor-pointer ${
                        ttsEnabled ? "bg-[#C85A32]/10 border-[#C85A32] text-[#C85A32]" : "border-[#DFD5C6] text-[#6E6359]"
                      }`}
                      title={ttsEnabled ? "Audio Voice Enabled" : "Audio Voice Muted"}
                    >
                      {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Conversation Message List */}
                <div className="flex-1 space-y-3.5 overflow-y-auto pr-1">
                  {chatMessages.map((msg, idx) => {
                    const isAi = msg.role === "assistant";
                    return (
                      <div
                        key={idx}
                        className={`flex flex-col ${isAi ? "items-start" : "items-end"} space-y-1`}
                      >
                        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-[#6E6359]/70 px-1">
                          {isAi ? "Interviewer" : "You"}
                        </span>
                        <div
                          className={`max-w-[90%] rounded-2xl p-3.5 text-xs leading-relaxed shadow-2xs ${
                            isAi
                              ? "bg-[#FAF6F0] border border-[#DFD5C6] text-[#262626]"
                              : "bg-[#C85A32] text-white"
                          }`}
                        >
                          <div className="whitespace-pre-line">{msg.content}</div>
                        </div>
                      </div>
                    );
                  })}
                  {isChatLoading && (
                    <div className="flex items-center gap-2 text-xs font-mono text-[#6E6359] p-2 bg-[#FAF6F0] rounded-xl border border-[#DFD5C6]/60">
                      <Bot className="h-3.5 w-3.5 text-[#C85A32]" />
                      Interviewer is analyzing your AST and drafting Socratic guidance...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Socratic Prompt Chips */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {quickPrompts.map((qp, i) => {
                    const IconComp = qp.icon;
                    return (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(qp.prompt)}
                        disabled={isChatLoading}
                        className="flex items-center gap-1 text-[10px] font-medium bg-[#FAF6F0] hover:bg-[#FCFAF7] border border-[#DFD5C6] hover:border-[#C85A32] text-[#4B5563] hover:text-[#C85A32] px-2.5 py-1 rounded-lg transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
                      >
                        {IconComp && <IconComp className="h-3 w-3 text-[#C85A32]" />}
                        <span>{qp.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Chat Input Bar with Speech-to-Text */}
                <div className="pt-2 border-t border-[#DFD5C6] flex items-center gap-2">
                  <button
                    onClick={toggleSpeechRecognition}
                    className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isListeningMic
                        ? "bg-[#C85A32] text-white border-[#C85A32]"
                        : "bg-[#FAF6F0] text-[#6E6359] border-[#DFD5C6] hover:text-[#262626]"
                    }`}
                    title={isListeningMic ? "Listening... (Click to stop)" : "Speak via Microphone"}
                  >
                    {isListeningMic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </button>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Ask for an architectural hint, tradeoff question, or explain your idea..."
                    className="flex-1 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl px-3.5 py-2 text-xs text-[#262626] focus:outline-none focus:border-[#C85A32]"
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={isChatLoading || !chatInput.trim()}
                    className="bg-[#C85A32] hover:bg-[#B83A14] text-white p-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* 3. STRESS REPORT TAB */}
            {leftTab === "chaos" && (
              <div className="space-y-4">
                <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-5 space-y-3.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-[#C85A32]" />
                      <h3 className="font-serif font-bold text-sm text-[#262626]">
                        Adversarial Stress Testing
                      </h3>
                    </div>
                    {chaosResults && (
                      <span className="text-xs font-bold font-mono px-2.5 py-1 rounded-lg bg-[#FAF6F0] text-[#262626] border border-[#DFD5C6]">
                        Resilience: {chaosResults.resilience_percentage}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6E6359] leading-relaxed">
                    Injects extreme production boundary conditions, scale explosions ($N=10^5$), monotonic bursts, zero inputs, and memory strain traps.
                  </p>
                  <button
                    onClick={handleChaosTest}
                    disabled={isRunningChaos}
                    className="w-full bg-[#262626] hover:bg-black text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <ShieldAlert className="h-4 w-4 text-white" />
                    <span>{isRunningChaos ? "Executing Stress Suite..." : "Run Stress Suite"}</span>
                  </button>
                </div>

                {/* Results List */}
                {chaosResults && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono font-bold text-[#6E6359]">
                      <span>Test Cases Result</span>
                      <span>
                        {chaosResults.chaos_tests_passed} / {chaosResults.chaos_total_tests} Passed
                      </span>
                    </div>

                    <div className="space-y-2">
                      {chaosResults.test_results?.map((tr, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-xl border text-xs font-mono space-y-2 ${
                            tr.passed
                              ? "bg-emerald-500/5 border-emerald-500/30 text-emerald-900"
                              : "bg-rose-500/5 border-rose-500/30 text-rose-900"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5">
                              {tr.passed ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <XCircle className="h-4 w-4 text-rose-600" />
                              )}
                              Stress Case #{idx + 1}: {tr.description}
                            </span>
                            <span className="text-[10px] text-[#6E6359]">{tr.duration_ms}ms</span>
                          </div>
                          {!tr.passed && (
                            <div className="text-[11px] bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20 text-rose-800">
                              {tr.error ? tr.error : `Expected: ${JSON.stringify(tr.expected)} | Got: ${JSON.stringify(tr.actual)}`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Vulnerabilities Summary */}
                    {chaosResults.vulnerabilities && (
                      <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 space-y-2">
                        <span className="text-xs font-bold font-mono text-[#C85A32] flex items-center gap-1.5">
                          <ShieldAlert className="h-4 w-4" />
                          Diagnostic Vulnerability Analysis
                        </span>
                        <ul className="text-xs text-[#6E6359] space-y-1.5 list-disc list-inside">
                          {chaosResults.vulnerabilities.map((v, i) => (
                            <li key={i}>{v}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 4. SCORECARD TAB */}
            {leftTab === "scorecard" && (
              <div className="space-y-5">
                {scorecard ? (
                  <>
                    {/* Hiring Verdict Banner */}
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-2xl p-5 text-center space-y-2 shadow-xs">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[#6E6359]">
                        Hiring Committee Verdict
                      </span>
                      <div className="text-2xl font-serif font-extrabold text-[#262626] flex items-center justify-center gap-2">
                        <Award className="h-6 w-6 text-[#C85A32]" />
                        {scorecard.hiring_verdict}
                      </div>
                      <div className="text-sm font-mono font-bold text-[#C85A32]">
                        Overall Engineering Score: {scorecard.overall_score} / 100
                      </div>
                    </div>

                    {/* 5-Pillar Score Gauges */}
                    {scorecard.scores && (
                      <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                        {Object.entries(scorecard.scores).map(([key, val]) => (
                          <div
                            key={key}
                            className="bg-[#FCFAF7] border border-[#DFD5C6] p-3 rounded-xl flex flex-col justify-between shadow-2xs"
                          >
                            <span className="text-[#6E6359] capitalize">{key}</span>
                            <span className="text-base font-bold text-[#262626] mt-1">{val}%</span>
                            <div className="w-full bg-[#DFD5C6]/40 h-1.5 rounded-full mt-2 overflow-hidden">
                              <div
                                className="bg-[#C85A32] h-full rounded-full"
                                style={{ width: `${val}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Executive Summary */}
                    <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 space-y-1.5 shadow-2xs">
                      <span className="text-xs font-bold font-mono text-[#262626]">Executive Summary</span>
                      <p className="text-xs text-[#6E6359] leading-relaxed">
                        {scorecard.executive_summary}
                      </p>
                    </div>

                    {/* Strengths & Growth Points */}
                    <div className="grid grid-cols-1 gap-3">
                      {scorecard.strengths && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-xs space-y-1.5">
                          <span className="font-bold text-emerald-800">Key Strengths</span>
                          <ul className="text-emerald-900 space-y-1 list-disc list-inside">
                            {scorecard.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {scorecard.growth_areas && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs space-y-1.5">
                          <span className="font-bold text-amber-800">Growth Opportunities</span>
                          <ul className="text-amber-900 space-y-1 list-disc list-inside">
                            {scorecard.growth_areas.map((g, i) => (
                              <li key={i}>{g}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Optimal Solution Reference */}
                    {scorecard.optimal_solution_code && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold font-mono text-[#6E6359] uppercase tracking-wider">
                          Annotated Optimal Reference Solution
                        </span>
                        <pre className="bg-[#18181B] text-[#D4D4D4] p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-64 custom-scrollbar border border-[#27272A]">
                          {scorecard.optimal_solution_code}
                        </pre>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-12 space-y-3.5 bg-[#FAF6F0] rounded-2xl border border-[#DFD5C6] p-6">
                    <Award className="h-10 w-10 text-[#6E6359]/40 mx-auto" />
                    <p className="text-xs text-[#6E6359] font-mono">
                      No evaluation generated yet. Click &quot;Submit Solution&quot; to receive your hiring committee scorecard.
                    </p>
                    <button
                      onClick={handleSubmitSolution}
                      disabled={isSubmitting}
                      className="bg-[#C85A32] hover:bg-[#B83A14] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      {isSubmitting ? "Evaluating..." : "Generate Scorecard Now"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* =====================================================================
            RIGHT PANEL: Full Code Studio Editor & Terminal / Test Runner
            ===================================================================== */}
        <div className={`flex-1 flex flex-col bg-[#1E1E1E] text-[#D4D4D4] overflow-hidden ${
          mobileActivePane !== "left" ? "flex flex-1" : "hidden lg:flex"
        }`}>
          {/* ===================================================================
              TOP CODE EDITOR PANE
              =================================================================== */}
          <div className={`flex-1 flex flex-col min-h-0 ${
            mobileActivePane === "console" ? "hidden lg:flex" : "flex"
          }`}>
            {/* Editor Header Toolbar */}
            <div className="bg-[#252526] border-b border-[#333333] px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between shrink-0 text-xs font-mono select-none overflow-x-auto custom-scrollbar">
              <div className="flex items-center gap-3 shrink-0">
                <span className="flex items-center gap-1.5 text-white font-bold">
                  <FileCode2 className="h-4 w-4 text-[#C85A32]" />
                  {language === "cpp"
                    ? "solution.cpp"
                    : language === "java"
                    ? "Solution.java"
                    : language === "typescript"
                    ? "solution.ts"
                    : language === "go"
                    ? "solution.go"
                    : language === "javascript"
                    ? "solution.js"
                    : "solution.py"}
                </span>
                <span className="text-[#858585] text-[11px] hidden sm:inline">
                  Lines: {code.split("\n").length} | Chars: {code.length}
                </span>
              </div>

              {/* AST Complexity Live Indicator Badge */}
              <div className="flex items-center gap-2 shrink-0">
                {astAnalysis && (
                  <div className="hidden md:flex items-center gap-2 bg-[#18181B] px-3 py-1 rounded-lg border border-[#3E3E42] text-[11px] shadow-2xs">
                    <span className="text-[#858585]">Time:</span>
                    <span className="text-emerald-400 font-bold">{astAnalysis.time_complexity}</span>
                    <span className="text-[#858585] ml-1">Space:</span>
                    <span className="text-blue-400 font-bold">{astAnalysis.space_complexity}</span>
                    <span className="text-[#858585] ml-1">Score:</span>
                    <span className="text-amber-400 font-bold">{astAnalysis.code_quality_score}%</span>
                  </div>
                )}

                {/* Font Size Adjuster */}
                <div className="flex items-center gap-1 bg-[#18181B] px-2 py-0.5 rounded-lg border border-[#333333]">
                  <button
                    onClick={() => setEditorFontSize((prev) => Math.max(11, prev - 1))}
                    className="text-[#858585] hover:text-white p-0.5 cursor-pointer text-[10px]"
                    title="Decrease Font Size"
                  >
                    A-
                  </button>
                  <span className="text-[#858585] text-[10px] font-bold px-1">{editorFontSize}px</span>
                  <button
                    onClick={() => setEditorFontSize((prev) => Math.min(18, prev + 1))}
                    className="text-[#858585] hover:text-white p-0.5 cursor-pointer text-[10px]"
                    title="Increase Font Size"
                  >
                    A+
                  </button>
                </div>

                {/* Editor Action Controls */}
                <button
                  onClick={handleCopyCode}
                  className="p-1.5 rounded-lg hover:bg-[#333333] text-[#858585] hover:text-white cursor-pointer transition-all"
                  title="Copy Code Buffer"
                >
                  {copiedCode ? <CheckCheck className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => {
                    if (currentProblem?.starter_code?.[language]) {
                      setCode(currentProblem.starter_code[language]);
                    }
                  }}
                  className="p-1.5 rounded-lg hover:bg-[#333333] text-[#858585] hover:text-white cursor-pointer transition-all"
                  title="Reset to Template"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-1.5 rounded-lg hover:bg-[#333333] text-[#858585] hover:text-white cursor-pointer transition-all"
                  title={isFullScreen ? "Exit Fullscreen" : "Fullscreen"}
                >
                  {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Code Editor Body (Custom TextArea with line numbers & syntax feel) */}
            <div className="flex-1 flex overflow-hidden relative font-mono text-xs">
              {/* Line Numbers Column */}
              <div className="w-10 sm:w-12 bg-[#18181B] text-[#858585]/50 text-right pr-2 sm:pr-3 pt-3 select-none border-r border-[#27272A] font-mono text-xs leading-5">
                {code.split("\n").map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>

              {/* Editable Code Buffer */}
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  // Tab indentation handler
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const start = e.target.selectionStart;
                    const end = e.target.selectionEnd;
                    setCode(code.substring(0, start) + "    " + code.substring(end));
                    setTimeout(() => {
                      e.target.selectionStart = e.target.selectionEnd = start + 4;
                    }, 0);
                  }
                }}
                spellCheck={false}
                style={{ fontSize: `${editorFontSize}px` }}
                className="flex-1 bg-[#1E1E1E] text-[#D4D4D4] p-3 focus:outline-none resize-none leading-5 font-mono overflow-auto custom-scrollbar whitespace-pre"
                placeholder="// Write your solution here..."
              />
            </div>
          </div>

          {/* ===================================================================
              BOTTOM RUNNER / TEST SUITE PANEL (Tabbed: Tests, Custom, Console, AST)
              =================================================================== */}
          <div className={`bg-[#252526] border-t border-[#333333] flex flex-col shrink-0 ${
            mobileActivePane === "console" ? "flex-1 h-full" : "h-72 hidden lg:flex"
          }`}>
            {/* Bottom Tabs */}
            <div className="flex items-center justify-between border-b border-[#333333] px-3 bg-[#18181B] text-xs">
              <div className="flex items-center gap-1">
                {[
                  { id: "tests", label: "Test Suite", icon: CheckCircle2 },
                  { id: "custom", label: "Custom Arguments", icon: Sliders },
                  { id: "console", label: "Terminal Output", icon: Terminal },
                  { id: "ast", label: "AST Complexity Radar", icon: Zap }
                ].map((t) => {
                  const Icon = t.icon;
                  const active = bottomTab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setBottomTab(t.id)}
                      className={`flex items-center gap-1.5 px-3.5 py-2 font-bold border-b-2 transition-all cursor-pointer ${
                        active
                          ? "border-[#C85A32] text-white bg-[#252526]"
                          : "border-transparent text-[#858585] hover:text-white"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {t.label}
                      {t.id === "tests" && testResults && (
                        <span
                          className={`text-[10px] px-2 py-0.2 rounded-full font-bold ml-1 ${
                            testResults.tests_passed === testResults.total_tests
                              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {testResults.tests_passed}/{testResults.total_tests}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Quick Actions in Bottom Header */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRunCode}
                  disabled={isRunningTests}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>Run Suite</span>
                </button>
              </div>
            </div>

            {/* Bottom Tab Content Area */}
            <div className="flex-1 overflow-y-auto p-3.5 text-xs font-mono custom-scrollbar">
              {/* 1. TEST CASES TAB */}
              {bottomTab === "tests" && (
                <div className="space-y-3">
                  {/* Test Case Selection Chips */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {(testResults?.test_results || currentProblem?.test_cases || []).map((tc, idx) => {
                      const isPassed = tc.passed;
                      const hasRun = testResults !== null;
                      const active = activeTestCaseIdx === idx;
                      return (
                        <button
                          key={idx}
                          onClick={() => setActiveTestCaseIdx(idx)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                            active
                              ? "bg-[#3E3E42] border-[#C85A32] text-white shadow-2xs"
                              : "bg-[#1E1E1E] border-[#333333] text-[#858585] hover:text-white"
                          }`}
                        >
                          {hasRun ? (
                            isPassed ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-400" />
                            )
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-[#858585]" />
                          )}
                          Case {idx + 1}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Test Case Details & Diff Inspector */}
                  {(() => {
                    const activeCase = (testResults?.test_results || currentProblem?.test_cases || [])[
                      activeTestCaseIdx
                    ];
                    if (!activeCase) return null;
                    return (
                      <div className="bg-[#18181B] border border-[#333333] rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                        <div className="flex items-center justify-between text-[11px] text-[#858585]">
                          <span>Case #{activeTestCaseIdx + 1}: {activeCase.description || `Test Case ${activeTestCaseIdx + 1}`}</span>
                          {activeCase.duration_ms !== undefined && (
                            <span className="bg-[#27272A] px-2 py-0.5 rounded text-emerald-400 font-bold">
                              ⚡ {activeCase.duration_ms}ms
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div className="bg-[#202023] p-2.5 rounded-lg border border-[#333333]">
                            <span className="text-[#858585] text-[10px] font-bold">ARGUMENTS (INPUT)</span>
                            <pre className="text-white text-xs mt-1 overflow-x-auto custom-scrollbar">
                              {JSON.stringify(activeCase.input, null, 2)}
                            </pre>
                          </div>
                          <div className="bg-[#202023] p-2.5 rounded-lg border border-[#333333]">
                            <span className="text-[#858585] text-[10px] font-bold">EXPECTED OUTPUT</span>
                            <pre className="text-emerald-400 text-xs mt-1 overflow-x-auto custom-scrollbar">
                              {JSON.stringify(activeCase.expected, null, 2)}
                            </pre>
                          </div>
                        </div>

                        {/* Actual Return Value / Mismatch Highlight */}
                        {activeCase.actual !== undefined && (
                          <div className="bg-[#202023] p-2.5 rounded-lg border border-[#333333]">
                            <div className="flex items-center justify-between">
                              <span className="text-[#858585] text-[10px] font-bold">ACTUAL RETURN VALUE</span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  activeCase.passed
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-rose-500/20 text-rose-400"
                                }`}
                              >
                                {activeCase.passed ? "MATCH (PASSED)" : "MISMATCH (FAILED)"}
                              </span>
                            </div>
                            <pre
                              className={`text-xs mt-1 overflow-x-auto custom-scrollbar ${
                                activeCase.passed ? "text-emerald-400" : "text-rose-400"
                              }`}
                            >
                              {JSON.stringify(activeCase.actual, null, 2)}
                            </pre>
                          </div>
                        )}

                        {activeCase.error && (
                          <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg text-rose-300 text-xs overflow-x-auto custom-scrollbar">
                            <span className="font-bold">Error Stack / Runtime Diagnostic:</span>
                            <pre className="mt-1 whitespace-pre-wrap">{activeCase.error}</pre>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* 2. CUSTOM INPUT TAB */}
              {bottomTab === "custom" && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <span className="text-[#858585] text-xs">
                      Enter custom JSON parameters for <code className="text-amber-300 font-bold">{currentProblem?.entry_point}</code>:
                    </span>
                    <textarea
                      value={customInputText}
                      onChange={(e) => setCustomInputText(e.target.value)}
                      rows={3}
                      className="w-full bg-[#18181B] border border-[#333333] rounded-xl p-3 text-xs font-mono text-white focus:outline-none focus:border-[#C85A32]"
                      placeholder='{"numbers": [1, 2, 3], "target": 5}'
                    />
                  </div>
                  <button
                    onClick={handleRunCustomInput}
                    disabled={isRunningTests}
                    className="bg-[#C85A32] hover:bg-[#B83A14] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                  >
                    Run on Custom Arguments
                  </button>
                </div>
              )}

              {/* 3. CONSOLE LOGS TAB */}
              {bottomTab === "console" && (
                <div className="bg-[#18181B] p-3.5 rounded-xl border border-[#333333] h-full font-mono text-xs whitespace-pre-wrap overflow-y-auto custom-scrollbar leading-relaxed">
                  {consoleOutput || "> Native compiler sandbox initialized.\n> Press 'Run Code' or (⌘+Enter / Ctrl+Enter) to execute."}
                </div>
              )}

              {/* 4. AST RADAR DETAILS TAB */}
              {bottomTab === "ast" && (
                <div className="space-y-3">
                  {astAnalysis ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="bg-[#18181B] p-3.5 rounded-xl border border-[#333333] space-y-1 shadow-2xs">
                        <span className="text-[#858585] text-[10px] font-bold uppercase tracking-wider">TIME COMPLEXITY</span>
                        <div className="text-lg font-bold text-emerald-400">{astAnalysis.time_complexity}</div>
                        <p className="text-[11px] text-[#858585] leading-relaxed">{astAnalysis.time_complexity_reasoning}</p>
                      </div>

                      <div className="bg-[#18181B] p-3.5 rounded-xl border border-[#333333] space-y-1 shadow-2xs">
                        <span className="text-[#858585] text-[10px] font-bold uppercase tracking-wider">SPACE COMPLEXITY</span>
                        <div className="text-lg font-bold text-blue-400">{astAnalysis.space_complexity}</div>
                        <p className="text-[11px] text-[#858585] leading-relaxed">{astAnalysis.space_complexity_reasoning}</p>
                      </div>

                      <div className="bg-[#18181B] p-3.5 rounded-xl border border-[#333333] space-y-1 shadow-2xs">
                        <span className="text-[#858585] text-[10px] font-bold uppercase tracking-wider">CODE HEALTH RADAR</span>
                        <div className="text-lg font-bold text-amber-400">{astAnalysis.code_quality_score}%</div>
                        <p className="text-[11px] text-[#858585] leading-relaxed">
                          {astAnalysis.is_optimal ? "Optimal algorithm structure detected" : "Suboptimal structure with optimization potential"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[#858585] bg-[#18181B] rounded-xl border border-[#333333] space-y-2">
                      <Cpu className="h-6 w-6 text-[#A1A1AA] mx-auto" />
                      <p className="text-xs font-mono">
                        Click &quot;Complexity&quot; in the header bar to run native AST syntax parsing and Big-O complexity profiling.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          PROBLEM LIBRARY EXPLORER MODAL
          ========================================================================= */}
      {isProblemLibraryOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#DFD5C6] flex items-center justify-between bg-[#FAF6F0]">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#C85A32]/10 rounded-xl text-[#C85A32]">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold font-serif text-[#262626]">Curated Problem Catalog</h2>
                  <p className="text-xs text-[#6E6359]">
                    Select any industry challenge or synthesize infinite dynamic challenges with AI
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsProblemLibraryOpen(false)}
                className="p-2 rounded-xl hover:bg-[#DFD5C6]/40 text-[#6E6359] hover:text-[#262626] transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Search and Filters Bar */}
            <div className="p-4 border-b border-[#DFD5C6] bg-white flex flex-wrap items-center gap-3">
              <div className="flex-1 relative min-w-[220px]">
                <Search className="h-4 w-4 text-[#6E6359] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={librarySearchQuery}
                  onChange={(e) => setLibrarySearchQuery(e.target.value)}
                  placeholder="Search by title, tag, or topic (e.g., Sliding Window, LRU, DP)..."
                  className="w-full bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl pl-9 pr-3 py-2 text-xs text-[#262626] focus:outline-none focus:border-[#C85A32]"
                />
              </div>

              {/* Track Selector */}
              <select
                value={activeTrack}
                onChange={(e) => handleTrackChange(e.target.value)}
                className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs font-bold px-3 py-2 text-[#262626] focus:outline-none focus:border-[#C85A32] cursor-pointer"
              >
                <option value="DSA">Track: DSA</option>
                <option value="Backend">Track: Backend Systems</option>
                <option value="BugHunt">Track: Bug Hunt</option>
                <option value="GitHub-Tailored">Track: GitHub Tailored</option>
              </select>

              {/* Difficulty Selector */}
              <select
                value={libraryDifficultyFilter}
                onChange={(e) => setLibraryDifficultyFilter(e.target.value)}
                className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl text-xs font-bold px-3 py-2 text-[#262626] focus:outline-none focus:border-[#C85A32] cursor-pointer"
              >
                <option value="All">All Difficulties</option>
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
                <option value="FAANG Bar-Raiser">FAANG Bar-Raiser</option>
              </select>

              {/* AI Generator Button */}
              <button
                onClick={() => {
                  setIsProblemLibraryOpen(false);
                  generateTailoredProblem();
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#C85A32] hover:bg-[#B83A14] text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Generate AI Problem</span>
              </button>
            </div>

            {/* Problem Cards Grid */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar grid grid-cols-1 md:grid-cols-2 gap-3.5 bg-[#FAF6F0]/30">
              {filteredLibraryProblems.length > 0 ? (
                filteredLibraryProblems.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      selectProblem(p);
                      setIsProblemLibraryOpen(false);
                    }}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between hover:shadow-md ${
                      selectedProblemId === p.id
                        ? "bg-[#C85A32]/5 border-[#C85A32]"
                        : "bg-white border-[#DFD5C6] hover:border-[#C85A32]/60"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-bold text-[#262626] font-serif">{p.title}</h3>
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border shrink-0 ${getDifficultyBadge(
                            p.difficulty
                          )}`}
                        >
                          {p.difficulty}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#6E6359] mt-2 line-clamp-2 leading-relaxed">
                        {p.description?.replace(/###|```|\*\*/g, "").slice(0, 140)}...
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 mt-3.5 pt-2.5 border-t border-[#DFD5C6]/60 text-[10px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {p.tags?.slice(0, 2).map((t, idx) => (
                          <span
                            key={idx}
                            className="bg-[#FAF6F0] px-2 py-0.5 rounded-lg border border-[#DFD5C6] text-[#6E6359] font-mono"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <span className="font-mono text-[#C85A32] font-semibold">
                        {p.optimal_time || "O(N)"} Time
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="col-span-2 text-center py-12 space-y-2">
                  <p className="text-xs text-[#6E6359] font-mono">No problems match your query.</p>
                  <button
                    onClick={() => {
                      setLibrarySearchQuery("");
                      setLibraryDifficultyFilter("All");
                    }}
                    className="text-xs font-bold text-[#C85A32] underline cursor-pointer"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
