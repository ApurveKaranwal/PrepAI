"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Square,
  Upload,
  Link2,
  Cpu,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Award,
  BookOpen,
  ArrowRight,
  Clock,
  Sparkles,
  RefreshCw,
  Volume2,
  Layers,
  ChevronRight,
  ChevronLeft,
  FileText,
  Volume1,
  Play,
  Send
} from "lucide-react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip
} from "recharts";

const SUPPORTED_LANGUAGES = [
  { code: "en-IN", name: "English (India)" },
  { code: "hi-IN", name: "Hindi (हिन्दी)" },
  { code: "ta-IN", name: "Tamil (தமிழ்)" },
  { code: "te-IN", name: "Telugu (తెలుగు)" },
  { code: "kn-IN", name: "Kannada (ಕನ್ನಡ)" },
  { code: "ml-IN", name: "Malayalam (മലയാളം)" },
  { code: "mr-IN", name: "Marathi (मराठी)" },
  { code: "gu-IN", name: "Gujarati (ગુજરાતી)" },
  { code: "bn-IN", name: "Bengali (বাংলা)" },
  { code: "pa-IN", name: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "od-IN", name: "Odia (ଓଡ଼ିଆ)" }
];

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8001';

export default function VoiceCopilot({ user }) {
  // Navigation & session state
  const [stage, setStage] = useState("onboarding"); // onboarding, scraping, ready, active, analysis
  const [sessionId, setSessionId] = useState(null);
  
  // Onboarding Form States
  const [resumeFile, setResumeFile] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  
  const [savedProfile, setSavedProfile] = useState(null);
  const [useSavedProfile, setUseSavedProfile] = useState(false);

  useEffect(() => {
    async function loadSavedProfile() {
      if (user?.uid) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/career/profile?user_id=${user.uid}`);
          if (res.ok) {
            const data = await res.json();
            setSavedProfile(data);
            setUseSavedProfile(true); // default to using saved profile
            if (data.github_url) setGithubUrl(data.github_url);
            if (data.linkedin_url) setLinkedinUrl(data.linkedin_url);
          }
        } catch (e) {
          console.error("Failed to load saved profile in Voice Copilot:", e);
        }
      }
    }
    loadSavedProfile();
  }, [user]);
  const [linkedinText, setLinkedinText] = useState("");
  const [interviewMode, setInterviewMode] = useState("Mid-Level");
  const [language, setLanguage] = useState("en-IN");
  const [isDragOver, setIsDragOver] = useState(false);

  // LinkedIn ingestion mode & PDF uploader states
  const [linkedinIngestMode, setLinkedinIngestMode] = useState("url"); // url, pdf, text
  const [linkedinFile, setLinkedinFile] = useState(null);
  const [linkedinDragOver, setLinkedinDragOver] = useState(false);
  
  // Scraping Steps Status
  const [scrapingStep, setScrapingStep] = useState(0);
  const scrapingSteps = [
    "Uploading and extracting PDF Resume...",
    "Contacting GitHub APIs for public repositories...",
    "Downloading repository READMEs and file trees...",
    "Scanning LinkedIn URL (evaluating auth wall fallbacks)...",
    "Running LLM analysis to deduce code architecture and skills...",
    "Initializing stateful Voice Interview Copilot session..."
  ];

  // Active Interview States
  const [profileSummary, setProfileSummary] = useState(null);
  const [roleTitle, setRoleTitle] = useState("Software Engineer");
  const [voiceStatus, setVoiceStatus] = useState("idle"); // idle, listening, thinking, speaking
  const [transcript, setTranscript] = useState([]); // Array of { role, text }
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(true);
  const [latestEvaluation, setLatestEvaluation] = useState(null);
  const [micLevel, setMicLevel] = useState(0); // 0 to 100 for live meter
  const [hearOwnVoice, setHearOwnVoice] = useState(false); // Hear your own voice toggle

  // Scorecard State
  const [scorecard, setScorecard] = useState(null);

  // Web Audio & Recording Refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const wsRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  
  const sourceNodeRef = useRef(null);
  const feedbackGainRef = useRef(null);
  
  const chunksRef = useRef([]);
  const recordingActiveRef = useRef(false);
  const vadIntervalRef = useRef(null);
  const timerIntervalRef = useRef(null);

  // VAD Speech Threshold Settings
  const speechThreshold = 18; // RMS energy threshold
  const silenceTimeout = 1500; // ms of silence before stopping and sending
  const speechBufferCount = 3; // consecutive active frames to trigger speech start

  // Format Timer
  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Drag and Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setResumeFile(e.dataTransfer.files[0]);
    }
  };

  // Onboarding Submission
  const handleOnboard = async (e) => {
    e.preventDefault();
    
    let targetGithubUrl = githubUrl;
    let targetLinkedinUrl = linkedinUrl;
    if (useSavedProfile && savedProfile) {
      targetGithubUrl = githubUrl || savedProfile.github_url;
      targetLinkedinUrl = linkedinUrl || savedProfile.linkedin_url;
    }

    setStage("scraping");
    
    // Simulate progression of scraping messages
    const stepInterval = setInterval(() => {
      setScrapingStep((prev) => {
        if (prev < scrapingSteps.length - 1) return prev + 1;
        return prev;
      });
    }, 2500);

    const formData = new FormData();
    if (!useSavedProfile && resumeFile) formData.append("resume", resumeFile);
    formData.append("github_url", targetGithubUrl);
    
    if (useSavedProfile) {
      formData.append("linkedin_url", targetLinkedinUrl || "");
      if (user?.uid) {
        formData.append("user_id", user.uid);
      }
    } else {
      formData.append("linkedin_url", linkedinUrl);
    } else if (linkedinIngestMode === "pdf") {
      if (linkedinFile) {
        formData.append("linkedin_pdf", linkedinFile);
      }
      formData.append("linkedin_url", "");
    } else if (linkedinIngestMode === "text") {
      if (linkedinText) {
        formData.append("linkedin_text", linkedinText);
      }
      formData.append("linkedin_url", "");
    } else {
      formData.append("linkedin_url", "");
    }
    
    formData.append("interview_mode", interviewMode);
    formData.append("language", language);

    try {
      const res = await fetch(`${BACKEND_URL}/api/voice-copilot/onboard`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const data = await res.json();
      setSessionId(data.session_id);
      setProfileSummary(data.profile_summary);
      setRoleTitle(data.role || "Software Engineer");
      
      clearInterval(stepInterval);
      setScrapingStep(scrapingSteps.length - 1);
      
      // Transition to "Ready" stage instead of auto-starting
      setTimeout(() => {
        setStage("ready");
      }, 1500);
      
    } catch (err) {
      console.error("Onboarding error:", err);
      alert("Onboarding failed. Please check your inputs and try again.");
      clearInterval(stepInterval);
      setStage("onboarding");
      setScrapingStep(0);
    }
  };

  // Start Interview triggered manually
  const triggerStartInterview = async () => {
    // Automatically clean up pre-flight monitor feedback loop if active
    if (hearOwnVoice) {
      setHearOwnVoice(false);
      if (feedbackGainRef.current) {
        try { feedbackGainRef.current.disconnect(); } catch (e) {}
      }
      if (streamRef.current) {
        try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (e) {}
      }
    }

    setStage("active");
    setVoiceStatus("thinking");
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/voice-copilot/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId })
      });
      
      const data = await res.json();
      setTranscript([{ role: "assistant", text: data.question }]);
      setVoiceStatus("speaking");
      
      // Start Session Timer
      setSecondsElapsed(0);
      timerIntervalRef.current = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
      
      // Connect WebSocket
      connectWebSocket(sessionId);
      
      // Play Welcoming Speech
      if (data.audio_base64) {
        playTTSAudio(data.audio_base64);
      } else {
        setVoiceStatus("listening");
        startMicrophoneCapture();
      }
      
    } catch (err) {
      console.error("Failed to start session:", err);
      setVoiceStatus("listening");
      startMicrophoneCapture();
    }
  };

  // Play Speech Audio
  const playTTSAudio = (base64Audio) => {
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
    }
    
    // Stop recording while playing speech to avoid echo feedback
    stopMicrophoneRecording();
    
    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes.buffer], { type: "audio/mp3" });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    const audio = new Audio(audioUrl);
    audioPlaybackRef.current = audio;
    
    audio.onended = () => {
      setVoiceStatus("listening");
      startMicrophoneCapture();
    };
    
    audio.onerror = () => {
      console.error("TTS audio playback error");
      setVoiceStatus("listening");
      startMicrophoneCapture();
    };
    
    setVoiceStatus("speaking");
    audio.play().catch((err) => {
      console.error("Playback block:", err);
      setVoiceStatus("listening");
      startMicrophoneCapture();
    });
  };

  // WebSocket Connection
  const connectWebSocket = (sessId) => {
    const wsProto = BACKEND_URL.startsWith("https") ? "wss" : "ws";
    const wsHost = BACKEND_URL.replace(/^https?:\/\//, "");
    const ws = new WebSocket(`${wsProto}://${wsHost}/api/voice-copilot/stream/${sessId}`);
    wsRef.current = ws;
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === "transcript") {
        setTranscript((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === data.role) {
            return [...prev.slice(0, -1), { role: data.role, text: data.text }];
          } else {
            return [...prev, { role: data.role, text: data.text }];
          }
        });
      } else if (data.type === "audio") {
        playTTSAudio(data.audio);
      } else if (data.type === "status") {
        setVoiceStatus(data.status);
      } else if (data.type === "evaluation") {
        setLatestEvaluation(data.metrics);
      } else if (data.type === "interrupt") {
        console.log("WebSocket triggered interrupt signal.");
        if (audioPlaybackRef.current) {
          audioPlaybackRef.current.pause();
        }
      } else if (data.type === "completed") {
        console.log("WebSocket completed signal received. Transitioning to scorecard.");
        handleEndInterview();
      }
    };
    
    ws.onclose = () => console.log("WebSocket closed");
    ws.onerror = (err) => console.error("WebSocket error:", err);
  };

  // Web Audio decibel-level VAD (Voice Activity Detection)
  const startMicrophoneCapture = async () => {
    if (isMuted) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioCtx;
      
      const source = audioCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;
      
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Connect loopback gain if "Hear Own Voice" is enabled
      if (hearOwnVoice) {
        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0.8;
        source.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        feedbackGainRef.current = gainNode;
      }

      // Start raw recording
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;
      
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length === 0) return;
        
        // Package user speech chunks into a valid, single WebM file
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        
        const reader = new FileReader();
        reader.onloadend = () => {
          const arrayBuffer = reader.result;
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            // Send entire binary audio payload
            wsRef.current.send(arrayBuffer);
            // Trigger server-side transcription and answer generation
            wsRef.current.send(JSON.stringify({ type: "silence" }));
          }
        };
        reader.readAsArrayBuffer(audioBlob);
      };

      // Start VAD Loop
      runVADLoop();
      
    } catch (err) {
      console.error("Microphone grab error:", err);
    }
  };

  const stopMicrophoneRecording = () => {
    if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
    setMicLevel(0);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      recordingActiveRef.current = false;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    
    sourceNodeRef.current = null;
    feedbackGainRef.current = null;
  };

  const runVADLoop = () => {
    if (!analyserRef.current) return;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let isSpeaking = false;
    let silenceStart = null;
    let speakFrames = 0;
    
    vadIntervalRef.current = setInterval(() => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / bufferLength);
      
      // Map energy RMS to a 0-100 micLevel scale for the real-time logo
      const energyLevel = Math.min(100, Math.round((rms / 40) * 100));
      setMicLevel(energyLevel);
      
      if (rms > speechThreshold) {
        speakFrames++;
        if (speakFrames >= speechBufferCount && !isSpeaking) {
          isSpeaking = true;
          setVoiceStatus("listening");
          
          // Interrupt active TTS speaking if any
          if (audioPlaybackRef.current) {
            audioPlaybackRef.current.pause();
          }
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "start_speaking" }));
          }
          
          // Start MediaRecorder if not already recording
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
            chunksRef.current = [];
            mediaRecorderRef.current.start(250);
            recordingActiveRef.current = true;
          }
        }
        silenceStart = null; // Reset silence timer
      } else {
        speakFrames = 0;
        if (isSpeaking) {
          if (!silenceStart) silenceStart = Date.now();
          
          if (Date.now() - silenceStart > silenceTimeout) {
            isSpeaking = false;
            setVoiceStatus("thinking");
            
            // Stop recorder to trigger binary WebM blob packaging in onstop
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              mediaRecorderRef.current.stop();
              recordingActiveRef.current = false;
            }
            
            stopMicrophoneRecording(); // Stop capture while server evaluates
          }
        }
      }
    }, 60);
  };

  // Manual submit answer (Done Speaking)
  const handleDoneSpeaking = () => {
    if (voiceStatus !== "listening") return;
    setVoiceStatus("thinking");
    
    // Stop recording immediately. This will trigger mediaRecorder.onstop which
    // packages and sends the entire valid WebM buffer to uvicorn, bypassing VAD delay.
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      recordingActiveRef.current = false;
    }
    
    stopMicrophoneRecording();
  };

  // Mute microphone
  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (!isMuted) {
      stopMicrophoneRecording();
      setVoiceStatus("idle");
    } else {
      setVoiceStatus("listening");
      startMicrophoneCapture();
    }
  };

  // Hear your own voice toggle
  const toggleHearOwnVoice = () => {
    const nextState = !hearOwnVoice;
    setHearOwnVoice(nextState);
    
    // Start temporary audio context to monitor voice if not currently in active interview
    if (stage === "ready") {
      if (nextState) {
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
          streamRef.current = stream;
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const gainNode = audioCtx.createGain();
          gainNode.gain.value = 0.8;
          source.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          feedbackGainRef.current = gainNode;
        }).catch(err => console.error("Mic error:", err));
      } else {
        if (feedbackGainRef.current) feedbackGainRef.current.disconnect();
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        if (audioContextRef.current) audioContextRef.current.close();
      }
      return;
    }
    
    if (nextState) {
      if (audioContextRef.current && sourceNodeRef.current) {
        try {
          const gainNode = audioContextRef.current.createGain();
          gainNode.gain.value = 0.8;
          sourceNodeRef.current.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);
          feedbackGainRef.current = gainNode;
        } catch (e) {
          console.error("Failed to connect feedback node:", e);
        }
      }
    } else {
      if (feedbackGainRef.current) {
        try {
          feedbackGainRef.current.disconnect();
        } catch (e) {
          console.error(e);
        }
        feedbackGainRef.current = null;
      }
    }
  };

  // End Interview
  const handleEndInterview = async () => {
    setVoiceStatus("thinking");
    stopMicrophoneRecording();
    clearInterval(timerIntervalRef.current);
    
    if (audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
    }
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/voice-copilot/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          duration_seconds: secondsElapsed
        })
      });
      
      const data = await res.json();
      setScorecard(data.scorecard);
      setStage("analysis");
      
      if (wsRef.current) {
        wsRef.current.close();
      }
    } catch (err) {
      console.error("Error closing session:", err);
      alert("Failed to compute performance analysis scorecard.");
    }
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      stopMicrophoneRecording();
      clearInterval(vadIntervalRef.current);
      clearInterval(timerIntervalRef.current);
      if (wsRef.current) wsRef.current.close();
      if (audioPlaybackRef.current) audioPlaybackRef.current.pause();
    };
  }, []);

  return (
    <div className="flex-1 min-h-screen bg-[#FAF6F0] text-[#262626] flex flex-col font-sans overflow-hidden select-none relative">
      
      {/* Styles for Organic Morphing Blob Visualizer */}
      <style jsx global>{`
        @keyframes morph {
          0% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
          50% { border-radius: 50% 60% 70% 30% / 50% 60% 40% 70%; }
          100% { border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%; }
        }
        .animate-morph {
          animation: morph 8s ease-in-out infinite;
        }
        .animate-morph-fast {
          animation: morph 3s ease-in-out infinite;
        }
        .animate-morph-slow {
          animation: morph 12s ease-in-out infinite;
        }
      `}</style>

      {/* 1. Onboarding Stage */}
      {stage === "onboarding" && (
        <div className="flex-1 overflow-y-auto h-screen flex flex-col justify-between py-12 px-8">
          <div className="max-w-5xl mx-auto w-full my-auto py-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              
              {/* Left Column: Product Info & Features */}
              <div className="lg:col-span-5 space-y-6 text-left">
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/20 px-3 py-1 rounded-full font-mono">
                    Speech Synthesis
                  </span>
                  <h1 className="text-3xl md:text-4xl font-serif font-medium text-[#262626] leading-tight flex items-center gap-2">
                    <Mic className="h-7 w-7 text-[#C85A32] shrink-0" />
                    Voice Interview Copilot
                  </h1>
                </div>
                
                <p className="text-[#6E6359] text-xs md:text-sm leading-relaxed font-medium">
                  Provide your backgrounds to assemble a stateful personalized FAANG mock screening.
                </p>

                <div className="space-y-4 pt-5 border-t border-[#DFD5C6]/60">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#C85A32]/5 border border-[#C85A32]/15 flex items-center justify-center text-[#C85A32] shrink-0">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">Stateful Profile Ingestion</h4>
                      <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed font-medium">Pulls experiences, resume keywords, and links to dynamically formulate topic boundaries.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#C85A32]/5 border border-[#C85A32]/15 flex items-center justify-center text-[#C85A32] shrink-0">
                      <Volume1 className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">Pre-flight Audio Monitor</h4>
                      <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed font-medium">Calibrates mic gains, sound thresholds, and feedback levels before entering the interview.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-[#C85A32]/5 border border-[#C85A32]/15 flex items-center justify-center text-[#C85A32] shrink-0">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[#262626]">Real-time Speech Assessment</h4>
                      <p className="text-[11px] text-[#6E6359] mt-0.5 leading-relaxed font-medium">Provides instant scores for technical depth, system design complexity, communication, and confidence.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Form Card */}
              <div className="lg:col-span-7 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 md:p-8 shadow-sm space-y-6">
                <div className="space-y-1 text-left">
                  <h3 className="text-lg font-serif text-[#262626] font-medium">Assemble Screening Profile</h3>
                  <p className="text-xs text-[#6E6359] font-medium">Fill in your professional parameters to configure your session.</p>
                </div>

                <form onSubmit={handleOnboard} className="space-y-6">
                  {/* Saved Profile Toggle */}
                  {savedProfile && (
                    <div className="flex items-start gap-3 p-3 bg-[#E8F2EC]/30 border border-[#B3D6C2] rounded-xl text-left select-none">
                      <input
                        type="checkbox"
                        id="use-saved-profile-voice"
                        checked={useSavedProfile}
                        onChange={(e) => {
                          setUseSavedProfile(e.target.checked);
                          if (e.target.checked && savedProfile.github_url) {
                            setGithubUrl(savedProfile.github_url);
                          }
                          if (e.target.checked && savedProfile.linkedin_url) {
                            setLinkedinUrl(savedProfile.linkedin_url);
                          }
                        }}
                        className="rounded text-[#C85A32] focus:ring-[#C85A32] border-[#DFD5C6] h-4 w-4 mt-0.5 cursor-pointer"
                      />
                      <label htmlFor="use-saved-profile-voice" className="flex flex-col cursor-pointer">
                        <span className="text-xs font-bold text-[#262626]">Use Saved Profile & Resume</span>
                        <span className="text-[10px] text-[#6E6359] mt-0.5 leading-normal">
                          Resume: <span className="font-semibold text-[#2E5A44]">{savedProfile.resume_name}</span><br />
                          GitHub: <span className="font-mono bg-[#FAF6F0] px-1 py-0.5 rounded text-[#262626]">{savedProfile.github_url}</span>
                        </span>
                      </label>
                    </div>
                  )}

                  {/* PDF Resume Uploader */}
                  <div className={`text-left transition-all ${useSavedProfile ? 'opacity-40 pointer-events-none' : ''}`}>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                      1. Resume (PDF)
                    </label>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      className={`flex flex-col items-center justify-center border border-dashed rounded-xl h-44 cursor-pointer transition-all duration-200 ${
                        isDragOver
                          ? "border-[#C85A32] bg-[#C85A32]/5"
                          : resumeFile
                          ? "border-emerald-300 bg-emerald-50/20"
                          : "border-[#DFD5C6] hover:bg-[#C85A32]/5 hover:border-[#C85A32] bg-[#FAF6F0]"
                      }`}
                      onClick={() => !useSavedProfile && document.getElementById("file-input").click()}
                    >
                      <input
                        id="file-input"
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) => e.target.files && setResumeFile(e.target.files[0])}
                      />
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {resumeFile ? (
                          <>
                            <FileText className="h-8 w-8 text-emerald-600 mb-2" />
                            <span className="text-xs font-bold text-[#262626] truncate max-w-[280px]">
                              {resumeFile.name}
                            </span>
                            <span className="text-[10px] text-[#6E6359]/60 mt-1 font-medium">Uploaded. Click to replace.</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-[#C85A32] mb-3 animate-bounce" />
                            <span className="text-xs font-bold text-[#262626]">Drag & drop your Resume, or <span className="text-[#C85A32]">browse</span></span>
                            <span className="text-[10px] text-[#6E6359]/60 mt-1">Supports PDF format up to 10MB</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* GitHub and LinkedIn URLs */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                        2. GitHub Profile URL
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Link2 className="h-4 w-4 text-[#6E6359]/60" />
                        </div>
                        <input
                          type="url"
                          required
                          placeholder="github.com/username"
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          className="block w-full rounded-xl border border-[#DFD5C6] pl-9 pr-3 py-2.5 text-xs bg-[#FCFAF7] text-[#262626] placeholder-[#6E6359]/50 focus:border-[#C85A32] focus:outline-none transition-colors font-medium"
                        />
                      </div>
                    </div>

                    <div className={`transition-all ${useSavedProfile ? 'opacity-40 pointer-events-none' : ''}`}>
                      <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                        3. LinkedIn Ingestion Mode
                      </label>
                      <div className="flex gap-1 p-1 bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl h-[38px] items-center">
                        {[
                          { id: "url", label: "Scrape URL" },
                          { id: "pdf", label: "Upload PDF" },
                          { id: "text", label: "Paste Text" }
                        ].map((mode) => (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => setLinkedinIngestMode(mode.id)}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-bold tracking-wide uppercase transition-all cursor-pointer ${
                              linkedinIngestMode === mode.id
                                ? "bg-[#C85A32] text-[#FCFAF7] shadow-xs"
                                : "text-[#6E6359] hover:bg-[#FCFAF7]/60 hover:text-[#262626]"
                            }`}
                          >
                            {mode.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic LinkedIn Input Field based on Ingestion Mode */}
                  <div className={`text-left mt-4 border-t border-[#DFD5C6]/60 pt-4 transition-all ${useSavedProfile ? 'opacity-40 pointer-events-none' : ''}`}>
                    {linkedinIngestMode === "url" && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                          LinkedIn Profile URL
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Link2 className="h-4 w-4 text-[#6E6359]/60" />
                          </div>
                          <input
                            type="url"
                            required={linkedinIngestMode === "url"}
                            placeholder="linkedin.com/in/username"
                            value={linkedinUrl}
                            onChange={(e) => setLinkedinUrl(e.target.value)}
                            className="block w-full rounded-xl border border-[#DFD5C6] pl-9 pr-3 py-2.5 text-xs bg-[#FCFAF7] text-[#262626] placeholder-[#6E6359]/50 focus:border-[#C85A32] focus:outline-none transition-colors font-medium"
                          />
                        </div>
                      </div>
                    )}

                    {linkedinIngestMode === "pdf" && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                          LinkedIn Profile PDF
                        </label>
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            setLinkedinDragOver(true);
                          }}
                          onDragLeave={() => setLinkedinDragOver(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setLinkedinDragOver(false);
                            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                              setLinkedinFile(e.dataTransfer.files[0]);
                            }
                          }}
                          className={`flex flex-col items-center justify-center border border-dashed rounded-xl h-44 cursor-pointer transition-all duration-200 ${
                            linkedinDragOver
                              ? "border-[#C85A32] bg-[#C85A32]/5"
                              : linkedinFile
                              ? "border-[#B3D6C2] bg-[#E8F2EC]/20"
                              : "border-[#DFD5C6] hover:bg-[#C85A32]/5 hover:border-[#C85A32] bg-[#FAF6F0]"
                          }`}
                          onClick={() => document.getElementById("linkedin-file-input").click()}
                        >
                          <input
                            id="linkedin-file-input"
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => e.target.files && setLinkedinFile(e.target.files[0])}
                          />
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {linkedinFile ? (
                              <>
                                <FileText className="h-8 w-8 text-[#2E5A44] mb-2" />
                                <span className="text-xs font-bold text-[#262626] truncate max-w-[280px]">
                                  {linkedinFile.name}
                                </span>
                                <span className="text-[10px] text-[#6E6359]/60 mt-1 font-medium">Uploaded. Click to replace.</span>
                              </>
                            ) : (
                              <>
                                <Upload className="h-8 w-8 text-[#C85A32] mb-3 animate-bounce" />
                                <span className="text-xs font-bold text-[#6E6359]">Drag & drop LinkedIn PDF, or <span className="text-[#C85A32]">browse</span></span>
                                <span className="text-[10px] text-[#6E6359]/60 mt-1 font-medium">Save profile as PDF on LinkedIn and upload here</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {linkedinIngestMode === "text" && (
                      <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                          LinkedIn Profile Text
                        </label>
                        <textarea
                          rows={4}
                          required={linkedinIngestMode === "text"}
                          placeholder="Paste your Headline, Experiences, Skills..."
                          value={linkedinText}
                          onChange={(e) => setLinkedinText(e.target.value)}
                          className="block w-full rounded-xl border border-[#DFD5C6] p-4 text-xs bg-[#FCFAF7] text-[#262626] placeholder-[#6E6359]/50 focus:border-[#C85A32] focus:outline-none transition-colors font-medium font-sans"
                        />
                      </div>
                    )}
                  </div>

                  {/* Seniority Selector */}
                  <div className="text-left">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                      Interview seniority Level
                    </label>
                    <div className="grid grid-cols-5 gap-2">
                      {["Junior", "Mid-Level", "Senior", "Staff Engineer", "Bar Raiser"].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setInterviewMode(lvl)}
                          className={`py-2 px-1 rounded-xl border text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer ${
                            interviewMode === lvl
                              ? "bg-[#C85A32]/10 border-[#C85A32] text-[#C85A32] shadow-sm"
                              : "bg-[#FCFAF7] border-[#DFD5C6] text-[#6E6359] hover:bg-[#FAF6F0] hover:text-[#262626]"
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language Selector */}
                  <div className="text-left">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#6E6359] font-mono mb-2">
                      Interview Language
                    </label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="block w-full rounded-xl border border-[#DFD5C6] p-3 text-xs bg-[#FCFAF7] text-[#262626] focus:border-[#C85A32] focus:outline-none transition-colors font-medium font-sans cursor-pointer shadow-2xs"
                    >
                      {SUPPORTED_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Submit button */}
                  <button
                    type="submit"
                    className="w-full flex justify-center items-center gap-2 rounded-xl bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] py-3.5 px-4 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer mt-4 hover:scale-[1.01] active:scale-[0.99] shadow-sm"
                  >
                    <span>Assemble Profile & Onboard</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Loading/Scraping Stage */}
      {stage === "scraping" && (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="w-full max-w-md text-center space-y-6 bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 shadow-sm">
            <div className="flex justify-center">
              <div className="relative">
                <div className="h-12 w-12 rounded-full border-2 border-[#DFD5C6] border-t-[#C85A32] animate-spin" />
                <Cpu className="h-5 w-5 text-[#C85A32] absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#262626] uppercase tracking-wider font-mono">
                Profiling Candidate
              </h3>
              <p className="text-[#6E6359] text-[11px]">
                Analyzing your backgrounds to personalize the technical interview...
              </p>
            </div>

            {/* Steps Progress bar */}
            <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 text-left space-y-2.5">
              {scrapingSteps.map((step, idx) => {
                const isDone = idx < scrapingStep;
                const isActive = idx === scrapingStep;
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    {isDone ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : isActive ? (
                      <RefreshCw className="h-3.5 w-3.5 text-[#C85A32] animate-spin shrink-0" />
                    ) : (
                      <div className="h-1.5 w-1.5 rounded-full bg-[#DFD5C6] mx-1 shrink-0" />
                    )}
                    <span className={`text-[10px] font-medium leading-none ${
                      isDone ? "text-[#6E6359]/70 line-through" : isActive ? "text-[#C85A32] font-bold" : "text-[#6E6359]/50"
                    }`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Manual "Ready" Stage */}
      {stage === "ready" && (
        <div className="flex-1 overflow-y-auto h-screen flex flex-col justify-center items-center py-12 px-6">
          <div className="max-w-xl w-full bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 shadow-sm space-y-6 text-center">
            
            <div className="space-y-2">
              <div className="inline-flex p-4 rounded-full bg-[#C85A32]/10 text-[#C85A32] mb-1">
                <Cpu className="h-8 w-8 animate-pulse" />
              </div>
              <h2 className="text-2xl font-serif text-[#262626] tracking-tight">Voice Session Assembled</h2>
              <p className="text-xs text-[#6E6359] max-w-sm mx-auto">
                Candidate profile is ready. Test your microphone monitor, check levels below, and start whenever you are prepared.
              </p>
            </div>

            {/* Profile Check list summary */}
            <div className="bg-[#FAF6F0] border border-[#DFD5C6] rounded-xl p-4 text-left space-y-2.5 text-xs">
              <div className="flex items-center justify-between border-b border-[#DFD5C6] pb-2">
                <span className="font-bold text-[#6E6359]">Interview Level</span>
                <span className="bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] font-bold uppercase text-[9px] px-2.5 py-0.5 rounded-full font-mono">{interviewMode}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#DFD5C6] pb-2">
                <span className="font-bold text-[#6E6359]">Interview Language</span>
                <span className="bg-[#C85A32]/10 border border-[#C85A32]/25 text-[#C85A32] font-bold uppercase text-[9px] px-2.5 py-0.5 rounded-full font-mono">
                  {SUPPORTED_LANGUAGES.find((lang) => lang.code === language)?.name || language}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-[#DFD5C6] pb-2">
                <span className="font-bold text-[#6E6359]">Target Role</span>
                <span className="text-[#262626] font-bold">{roleTitle}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#6E6359]">GitHub Repositories Scanned</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Checked</span>
              </div>
            </div>

            {/* Pre-flight Audio Check */}
            <div className="border border-[#DFD5C6] rounded-xl p-4 bg-[#FCFAF7] flex flex-col items-center gap-4">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[#6E6359]/60 font-mono">Pre-flight Audio Monitor</span>
              
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleHearOwnVoice}
                  className={`px-4 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    hearOwnVoice
                      ? "bg-[#C85A32]/10 border-[#C85A32] text-[#C85A32]"
                      : "bg-[#FCFAF7] border-[#DFD5C6] text-[#6E6359] hover:bg-[#FAF6F0]"
                  }`}
                >
                  <Volume1 className="h-4 w-4" />
                  {hearOwnVoice ? "Audio Monitor Loop: ON" : "Hear Your Own Voice"}
                </button>
              </div>
            </div>

            {/* Start Session Trigger Button */}
            <button
              onClick={triggerStartInterview}
              className="w-full flex justify-center items-center gap-2 rounded-lg bg-[#C85A32] hover:bg-[#B83A14] text-white py-3 px-4 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <Play className="h-4 w-4 fill-white" /> Start Technical Interview
            </button>

          </div>
        </div>
      )}

      {/* 3. Active Interview Stage */}
      {stage === "active" && (
        <div className="flex-1 flex overflow-hidden h-screen">
          
          {/* Main workspace */}
          <div className="flex-1 flex flex-col justify-between p-8 overflow-hidden bg-[#FAF6F0] bg-grid-overlay">
            
            {/* Top Bar - Minimal */}
            <div className="flex items-center justify-between pb-4 border-b border-[#DFD5C6]/50 select-none">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-bold uppercase tracking-wider bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/25 px-2.5 py-0.5 rounded-md font-mono">
                  {interviewMode} Mode
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wider bg-[#C85A32]/10 text-[#C85A32] border border-[#C85A32]/25 px-2.5 py-0.5 rounded-md font-mono">
                  {SUPPORTED_LANGUAGES.find((lang) => lang.code === language)?.name || language}
                </span>
                <span className="text-[#262626] text-xs font-bold font-serif">{roleTitle} Technical Screening</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#6E6359] bg-[#FCFAF7] px-3.5 py-1.5 rounded-xl border border-[#DFD5C6]/50 shadow-2xs">
                <Clock className="h-3.5 w-3.5 text-[#C85A32]" />
                {formatTime(secondsElapsed)}
              </div>
            </div>

            {/* Central visualizer: Minimalistic Pulsing Wave rings (SarvamAI style) */}
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="relative flex items-center justify-center h-64 w-64">
                
                {/* Outermost pulsing ring */}
                <div className={`absolute rounded-full border border-dashed transition-all duration-1000 ${
                  voiceStatus === "speaking" ? "w-56 h-56 border-[#C85A32]/35 animate-spin duration-10000" :
                  voiceStatus === "listening" ? "w-56 h-56 border-[#2E5A44]/35 animate-pulse" :
                  voiceStatus === "thinking" ? "w-52 h-52 border-[#A6690B]/35 animate-spin duration-3000" :
                  "w-48 h-48 border-[#DFD5C6]/40"
                }`} />

                {/* Middle concentric pulsing ring */}
                <div className={`absolute rounded-full border transition-all duration-700 ${
                  voiceStatus === "speaking" ? "w-44 h-44 border-[#C85A32]/45 scale-105" :
                  voiceStatus === "listening" ? "w-44 h-44 border-[#2E5A44]/45 scale-100 animate-ping duration-2000" :
                  voiceStatus === "thinking" ? "w-40 h-40 border-[#A6690B]/45 scale-95" :
                  "w-36 h-36 border-[#DFD5C6]/30"
                }`} />

                {/* Inner solid tracking ring */}
                <div className={`absolute rounded-full border-2 transition-all duration-500 ${
                  voiceStatus === "speaking" ? "w-32 h-32 border-[#C85A32]/60 bg-[#C85A32]/5" :
                  voiceStatus === "listening" ? "w-32 h-32 border-[#2E5A44]/60 bg-[#2E5A44]/5" :
                  voiceStatus === "thinking" ? "w-28 h-28 border-[#A6690B]/60 bg-[#A6690B]/5" :
                  "w-24 h-24 border-[#DFD5C6]/50 bg-white/40"
                }`} />

                {/* Central Micro Indicator Core */}
                <div className={`h-16 w-16 rounded-full flex items-center justify-center shadow-sm transition-all duration-500 relative z-10 border ${
                  voiceStatus === "speaking" ? "bg-[#C85A32] border-[#C85A32] text-white" :
                  voiceStatus === "listening" ? "bg-[#2E5A44] border-[#2E5A44] text-white" :
                  voiceStatus === "thinking" ? "bg-[#A6690B] border-[#A6690B] text-white" :
                  "bg-white border-[#DFD5C6] text-[#6E6359]"
                }`}>
                  {voiceStatus === "speaking" && <Volume2 className="h-5 w-5 animate-pulse" />}
                  {voiceStatus === "listening" && <Mic className="h-5 w-5 animate-pulse" />}
                  {voiceStatus === "thinking" && <RefreshCw className="h-5 w-5 animate-spin" />}
                  {voiceStatus === "idle" && <MicOff className="h-5 w-5" />}
                </div>
              </div>

              {/* Status Indicator */}
              <div className="mt-4 text-center space-y-1">
                <span className="text-[8px] font-bold uppercase tracking-widest text-[#6E6359]/60 font-mono">
                  State telemetry
                </span>
                <p className={`text-xs font-bold tracking-wide uppercase font-mono ${
                  voiceStatus === "speaking" ? "text-[#C85A32]" :
                  voiceStatus === "listening" ? "text-[#2E5A44]" :
                  voiceStatus === "thinking" ? "text-[#A6690B]" :
                  "text-[#6E6359]/60"
                }`}>
                  {voiceStatus === "speaking" ? "Interviewer Speaking" :
                   voiceStatus === "listening" ? "Listening to response" :
                   voiceStatus === "thinking" ? "Analyzing transcript" :
                   "Awaiting input"}
                </p>
              </div>
            </div>

            {/* Bottom Transcript box - Clean minimalist lines */}
            <div className="h-40 bg-[#FCFAF7] border border-[#DFD5C6]/50 rounded-xl p-4 overflow-y-auto shadow-2xs flex flex-col gap-3.5 scrollbar-thin">
              {transcript.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[#6E6359]/50 text-xs font-medium">
                  Transcript stream will initialize once you begin speaking...
                </div>
              ) : (
                transcript.map((msg, index) => (
                  <div key={index} className={`flex gap-3 text-xs leading-relaxed ${msg.role === "assistant" ? "text-[#262626]" : "text-[#C85A32]"}`}>
                    <span className={`font-bold font-mono shrink-0 uppercase tracking-wider text-[8px] py-0.5 px-2 rounded-md border h-5 flex items-center ${
                      msg.role === "assistant" ? "bg-[#FAF6F0] border-[#DFD5C6]/60 text-[#6E6359]" : "bg-[#C85A32]/10 border-[#C85A32]/20 text-[#C85A32]"
                    }`}>
                      {msg.role === "assistant" ? "AI" : "YOU"}
                    </span>
                    <p className="mt-0.5 font-medium leading-relaxed">{msg.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Control Panel - Sleek and clean */}
            <div className="flex items-center justify-between mt-4 bg-[#FCFAF7] p-3 rounded-xl border border-[#DFD5C6]/50 shadow-2xs">
              <div className="flex items-center gap-3">
                
                {/* Mic Status Indicator Group */}
                <div className="flex items-center gap-3 border-r border-[#DFD5C6]/50 pr-4">
                  <div className={`p-2 rounded-lg transition-all ${
                    isMuted ? "bg-red-50 text-red-600 border border-red-100" : "bg-[#E8F2EC] text-[#2E5A44] border border-[#B3D6C2]/60"
                  }`}>
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </div>
                  
                  {/* Decibel Meter */}
                  <div className="flex flex-col text-left select-none">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-[#6E6359]/60 font-mono">
                      Input Level
                    </span>
                    <div className="flex items-center gap-0.5 h-2.5 mt-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((bar) => {
                        const active = !isMuted && micLevel >= bar * 11;
                        return (
                          <div
                            key={bar}
                            className={`w-0.75 rounded-full transition-all duration-75 ${
                              active
                                ? bar > 6
                                  ? "bg-[#C85A32] h-2.5"
                                  : bar > 4
                                  ? "bg-[#A6690B] h-2"
                                  : "bg-[#2E5A44] h-1.5"
                                : "bg-[#DFD5C6]/40 h-1"
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Primary Mic Controls */}
                <button
                  onClick={toggleMute}
                  className={`py-2 px-4 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer ${
                    isMuted
                      ? "bg-red-50 border-red-100 text-red-600 hover:bg-red-100"
                      : "bg-[#FCFAF7] border-[#DFD5C6] text-[#6E6359] hover:bg-[#FAF6F0]"
                  }`}
                >
                  {isMuted ? "Unmute Mic" : "Mute Mic"}
                </button>

                {/* Hear Your Own Voice Loopback Toggle */}
                <button
                  onClick={toggleHearOwnVoice}
                  className={`py-2 px-4 rounded-xl border text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
                    hearOwnVoice
                      ? "bg-[#C85A32]/10 border-[#C85A32] text-[#C85A32] shadow-2xs"
                      : "bg-[#FCFAF7] border-[#DFD5C6] text-[#6E6359] hover:bg-[#FAF6F0]"
                  }`}
                >
                  <Volume1 className="h-3.5 w-3.5" />
                  {hearOwnVoice ? "Monitor: Active" : "Monitor Input"}
                </button>

                {/* Done Speaking (Instant Submit) Button */}
                {voiceStatus === "listening" && (
                  <button
                    onClick={handleDoneSpeaking}
                    className="py-2 px-4 rounded-xl bg-[#C85A32] border border-[#C85A32] text-white hover:bg-[#B83A14] text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Send className="h-3.5 w-3.5 fill-white" />
                    Submit Answer
                  </button>
                )}

              </div>

              {/* End Interview Action */}
              <button
                onClick={handleEndInterview}
                className="bg-slate-950 hover:bg-slate-800 text-white font-semibold py-2 px-4 rounded-xl text-xs flex items-center gap-1.5 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
              >
                <Square className="h-3 w-3" /> End session
              </button>
            </div>
          </div>

          {/* Profile Sidebar - SarvamAI-like minimal Metadata Inspector */}
          {isProfileOpen ? (
            <div className="w-80 border-l border-[#DFD5C6]/50 bg-[#FCFAF7] p-6 flex flex-col justify-between overflow-y-auto shrink-0 shadow-2xs animate-in fade-in slide-in-from-right duration-300">
              
              {/* Sidebar Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#DFD5C6]/50">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#C85A32]" />
                  <h4 className="text-xs font-mono font-bold text-[#262626] uppercase tracking-wider">
                    Candidate Profile
                  </h4>
                </div>
                <button
                  onClick={() => setIsProfileOpen(false)}
                  className="text-[#6E6359]/65 hover:text-[#262626] transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Sidebar Body */}
              <div className="flex-1 space-y-6 pt-5">
                
                {/* Languages list */}
                <div className="space-y-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E6359] font-mono">
                    Scraped Languages
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {profileSummary?.github?.languages_summary?.map((lang) => (
                      <span key={lang} className="text-[10px] px-3 py-1 rounded-full bg-slate-100/80 border border-slate-200/50 font-bold text-slate-700">
                        {lang}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Extracted Projects */}
                <div className="space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E6359] font-mono">
                    Scraped Repositories
                  </span>
                  <div className="space-y-3 divide-y divide-[#DFD5C6]/40">
                    {profileSummary?.github?.projects?.slice(0, 3).map((proj, idx) => (
                      <div key={idx} className={`space-y-1.5 ${idx > 0 ? "pt-3" : ""}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 font-serif tracking-tight truncate max-w-[120px]">{proj.name}</span>
                          <span className="text-[8px] font-bold text-orange-700 tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-orange-50 border border-orange-100/50">
                            {proj.architecture}
                          </span>
                        </div>
                        <p className="text-[10px] text-stone-500 leading-relaxed font-medium line-clamp-2">
                          {proj.description || "No description provided."}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {proj.technologies?.slice(0, 3).map((tech) => (
                            <span key={tech} className="text-[8px] px-2 py-0.5 bg-slate-100 text-stone-600 rounded-md font-mono border border-slate-200/20">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resume Skills */}
                <div className="space-y-2.5 pt-2 border-t border-[#DFD5C6]/40">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6E6359] font-mono">
                    Resume Keywords
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {profileSummary?.resume?.skills?.slice(0, 10).map((sk) => (
                      <span key={sk} className="text-[9px] px-2.5 py-1 bg-slate-100/80 text-slate-700 rounded-full font-medium border border-slate-200/50">
                        {sk}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Evaluation Telemetry block */}
                {latestEvaluation && (
                  <div className="border border-[#DFD5C6]/40 bg-[#FCFAF7] rounded-xl p-4 space-y-4 pt-4 border-t-2 border-t-[#C85A32]/80">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#C85A32]" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#C85A32] font-mono">
                        Adaptive Evaluations
                      </span>
                    </div>
                    <div className="space-y-3 text-[10px] font-sans font-medium text-[#6E6359]">
                      <div className="space-y-1">
                        <div className="flex justify-between font-mono">
                          <span>Technical Depth</span>
                          <span className="font-bold text-[#262626]">{latestEvaluation.technical_depth}/10</span>
                        </div>
                        <div className="w-full bg-[#DFD5C6]/30 h-1 rounded-full overflow-hidden">
                          <div className="bg-[#C85A32] h-full" style={{ width: `${latestEvaluation.technical_depth * 10}%` }}></div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between font-mono">
                          <span>System Design</span>
                          <span className="font-bold text-[#262626]">{latestEvaluation.system_design}/10</span>
                        </div>
                        <div className="w-full bg-[#DFD5C6]/30 h-1 rounded-full overflow-hidden">
                          <div className="bg-[#C85A32] h-full" style={{ width: `${latestEvaluation.system_design * 10}%` }}></div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between font-mono">
                          <span>Communication</span>
                          <span className="font-bold text-[#262626]">{latestEvaluation.communication}/10</span>
                        </div>
                        <div className="w-full bg-[#DFD5C6]/30 h-1 rounded-full overflow-hidden">
                          <div className="bg-[#C85A32] h-full" style={{ width: `${latestEvaluation.communication * 10}%` }}></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[9px] font-mono pt-1.5 border-t border-[#DFD5C6]/40">
                      <span className="text-[#6E6359]/70">Next Focus:</span>
                      <span className="text-[#C85A32] font-bold uppercase tracking-wide bg-[#C85A32]/10 px-2 py-0.5 rounded-md">
                        {latestEvaluation.followup_direction}
                      </span>
                    </div>
                  </div>
                )}

              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsProfileOpen(true)}
              className="absolute right-4 top-20 bg-[#FCFAF7] border border-[#DFD5C6]/50 p-2 rounded-full text-[#6E6359] hover:text-[#262626] shadow-2xs transition-all z-20 hover:bg-[#FAF6F0] cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

        </div>
      )}


      {/* 4. Post-Interview Performance Analysis Stage */}
      {stage === "analysis" && scorecard && (
        <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full space-y-8 animate-fadeIn scrollbar-thin">
          
          {/* Header Dashboard Banner */}
          <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
            <div className="text-center md:text-left space-y-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#C85A32] font-mono">
                Performance Scorecard
              </span>
              <h2 className="text-2xl font-serif text-[#262626] tracking-tight animate-fadeIn">
                Mock Interview Concluded
              </h2>
              <p className="text-[#6E6359] text-xs">
                Review your technical evaluation and recommended learning trajectory below.
              </p>
            </div>

            <div className="flex flex-col items-center md:items-end gap-1 shrink-0">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#6E6359]/60 font-mono">
                Recommendation
              </span>
              <div className={`px-4 py-2 rounded-lg text-xs font-bold uppercase border tracking-wider flex items-center gap-1.5 shadow-sm ${
                scorecard.hiring_recommendation.includes("Strong Hire") ? "bg-[#E8F2EC] border-[#B3D6C2] text-[#2E5A44]" :
                scorecard.hiring_recommendation.includes("Hire") ? "bg-[#C85A32]/10 border-[#C85A32]/25 text-[#C85A32]" :
                "bg-[#FCEBE6] border-[#F2C2B8] text-[#C85A32]"
              }`}>
                <Award className="h-4 w-4" />
                {scorecard.hiring_recommendation}
              </div>
            </div>
          </div>

          {/* Scores Panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Radar Chart of Dimensions */}
            <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm flex flex-col justify-between h-[360px]">
              <h3 className="text-sm font-semibold text-[#262626] font-serif pb-3 border-b border-[#DFD5C6]">
                Technical Capability Radar
              </h3>
              <div className="flex-1 flex justify-center items-center h-[260px] w-full text-xs mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" radius="80%" data={[
                    { subject: "Tech Depth", value: scorecard.scores.technical_depth },
                    { subject: "Communication", value: scorecard.scores.communication },
                    { subject: "Problem Solving", value: scorecard.scores.problem_solving },
                    { subject: "System Design", value: scorecard.scores.system_design },
                    { subject: "Ownership", value: scorecard.scores.ownership }
                  ]}>
                    <PolarGrid stroke="#e5dfd5" />
                    <PolarAngleAxis dataKey="subject" stroke="#6e6359" />
                    <PolarRadiusAxis angle={30} domain={[0, 10]} stroke="#cbd5e1" />
                    <Radar name="Score" dataKey="value" stroke="#C85A32" fill="#C85A32" fillOpacity={0.3} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Bar Chart breakout */}
            <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm flex flex-col justify-between h-[360px]">
              <h3 className="text-sm font-semibold text-[#262626] font-serif pb-3 border-b border-[#DFD5C6]">
                Technical Dimensions Breakout
              </h3>
              <div className="flex-1 h-[260px] w-full text-xs mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: "Tech Depth", Score: scorecard.scores.technical_depth },
                    { name: "Communication", Score: scorecard.scores.communication },
                    { name: "Problem Solving", Score: scorecard.scores.problem_solving },
                    { name: "System Design", Score: scorecard.scores.system_design },
                    { name: "Ownership", Score: scorecard.scores.ownership }
                  ]}>
                    <XAxis dataKey="name" stroke="#6e6359" />
                    <YAxis domain={[0, 10]} stroke="#6e6359" />
                    <Tooltip cursor={{ fill: "rgba(200,90,50,0.03)" }} />
                    <Bar dataKey="Score" fill="#C85A32" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>

          {/* Feedback & Resources grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Strengths & Weaknesses */}
            <div className="space-y-6">
              
              <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
                  <div className="bg-[#E8F2EC] p-2 rounded-lg text-[#2E5A44]">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#262626] font-serif">Core Strengths</h3>
                </div>
                <ul className="space-y-4">
                  {scorecard.strengths?.map((str, idx) => (
                    <li key={idx} className="flex items-start space-x-3 text-sm text-[#6E6359] font-medium">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#2E5A44] mt-2"></span>
                      <span className="leading-relaxed">{str}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
                  <div className="bg-[#FCEBE6] p-2 rounded-lg text-[#C85A32]">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#262626] font-serif">Development Areas</h3>
                </div>
                <ul className="space-y-4">
                  {scorecard.weaknesses?.map((weak, idx) => (
                    <li key={idx} className="flex items-start space-x-3 text-sm text-[#6E6359] font-medium">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#C85A32] mt-2"></span>
                      <span className="leading-relaxed">{weak}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

            {/* Missed Concepts & Suggested Trajectories */}
            <div className="space-y-6">
              
              <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
                  <div className="bg-[#FAF4EB] p-2 rounded-lg text-[#A6690B]">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#262626] font-serif">Missed Concepts</h3>
                </div>
                <ul className="space-y-4">
                  {scorecard.missed_concepts?.map((c, idx) => (
                    <li key={idx} className="flex items-start space-x-3 text-sm text-[#6E6359] font-medium">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#A6690B] mt-2"></span>
                      <span className="leading-relaxed">{c}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#FCFAF7] border border-[#DFD5C6] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center space-x-2 mb-5 pb-3 border-b border-[#DFD5C6]">
                  <div className="bg-[#FAF6F0] p-2 rounded-lg text-[#C85A32]">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#262626] font-serif">Suggested Resources</h3>
                </div>
                <ul className="space-y-4">
                  {scorecard.learning_resources?.map((res, idx) => (
                    <li key={idx} className="flex items-start space-x-3 text-sm text-[#6E6359] font-medium">
                      <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-[#C85A32] mt-2"></span>
                      <span className="leading-relaxed">{res}</span>
                    </li>
                  ))}
                </ul>
              </div>

            </div>

          </div>

          {/* Action buttons */}
          <div className="flex justify-center border-t border-[#DFD5C6] pt-8">
            <button
              onClick={() => {
                setStage("onboarding");
                setSessionId(null);
                setTranscript([]);
                setLatestEvaluation(null);
                setScorecard(null);
              }}
              className="bg-[#C85A32] hover:bg-[#B83A14] text-[#FCFAF7] font-bold py-3 px-8 rounded-md text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer"
            >
              Start New Mock Interview
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
