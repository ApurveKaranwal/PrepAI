"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  Link2,
  Play,
  CheckCircle,
  Send,
  FileText,
  AlertCircle,
  RefreshCw,
  Clock,
  Brain,
  Mic,
  Volume2,
  VolumeX
} from "lucide-react";

export default function InterviewPrep({ user, onEndInterview }) {
  // Ingestion states: 'idle', 'reading_resume', 'scraping_github', 'parsing_code', 'completed'
  const [ingestState, setIngestState] = useState("idle");
  const [resumeFile, setResumeFile] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Active interview states
  const [sessionStarted, setSessionStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [answerText, setAnswerText] = useState("");
  const [sessionId, setSessionId] = useState(null);
  
  // Video stage settings
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const gazeIntervalRef = useRef(null);
  const [isLookingAway, setIsLookingAway] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [liveTip, setLiveTip] = useState("");
  const [transcripts, setTranscripts] = useState([]);
  const [ingestError, setIngestError] = useState("");

  const transcriptEndRef = useRef(null);
  const totalFramesRef = useRef(0);
  const awayFramesRef = useRef(0);

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [languageCode, setLanguageCode] = useState("en-IN");
  const [recordDuration, setRecordDuration] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  // Audio Recording (STT) Logic
  const startAudioRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await uploadAudioForSTT(audioBlob);
      };

      mediaRecorder.start(250);
      setIsRecordingAudio(true);
      setRecordDuration(0);
      recordTimerRef.current = setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      alert("Microphone access is required for speech-to-text.");
    }
  };

  const stopAudioRecording = () => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      mediaRecorderRef.current.stop();
      setIsRecordingAudio(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    }
  };

  const uploadAudioForSTT = async (audioBlob) => {
    setAudioLoading(true);
    const formData = new FormData();
    formData.append("file", audioBlob, "recording.webm");
    formData.append("language_code", languageCode);

    try {
      const res = await fetch("http://localhost:8001/api/speech-to-text", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.transcript) {
          setAnswerText((prev) => {
            const separator = prev.trim() ? " " : "";
            return prev + separator + data.transcript;
          });
        }
      } else {
        const errData = await res.json();
        console.error("STT error:", errData.detail);
        alert(`Transcription failed: ${errData.detail || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Error transcribing audio:", err);
      alert("Failed to connect to transcription server.");
    } finally {
      setAudioLoading(false);
    }
  };

  // Text-to-Speech (TTS) Logic
  const playTTS = async (text, isFinal = false) => {
    if (!ttsEnabled) return;
    const textToSpeak = isFinal 
      ? "The interview has concluded. Please review your final evaluation scorecard on the screen." 
      : text;

    try {
      const res = await fetch("http://localhost:8001/api/text-to-speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: textToSpeak,
          language_code: languageCode
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audio_base64) {
          const audioSrc = `data:audio/wav;base64,${data.audio_base64}`;
          const audio = new Audio(audioSrc);
          audio.play();
          return;
        }
      }
      nativeSpeechSynthesis(textToSpeak);
    } catch (err) {
      console.warn("TTS backend failed, falling back to native SpeechSynthesis:", err);
      nativeSpeechSynthesis(textToSpeak);
    }
  };

  const nativeSpeechSynthesis = (text) => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = languageCode;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Trigger TTS on new question or TTS toggle
  useEffect(() => {
    if (ttsEnabled && currentQuestion && currentQuestion.question) {
      playTTS(currentQuestion.question, currentQuestion.is_final);
    }
  }, [currentQuestion, ttsEnabled]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  // Scroll transcript to bottom
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [transcripts]);

  // Session timer & Webcam Tracker
  useEffect(() => {
    let interval = null;
    if (sessionStarted) {
      // 1. Setup Timer
      interval = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);

      // 2. Setup Webcam
      const startWebcam = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
          streamRef.current = stream;
        } catch (err) {
          console.error("Camera access denied or unavailable", err);
          setCameraError("Camera access is required for the interview.");
        }
      };
      startWebcam();

      // 3. Setup OpenCV Gaze Tracking Polling
      gazeIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || !canvasRef.current) return;
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const formData = new FormData();
          formData.append("frame", blob, "frame.jpg");
          
          try {
            const res = await fetch("http://localhost:8001/api/vision/gaze", {
              method: "POST",
              body: formData,
            });
            if (res.ok) {
              const data = await res.json();
              if (data && data.looking_at_screen !== undefined) {
                const lookingAway = !data.looking_at_screen;
                setIsLookingAway(lookingAway);
                totalFramesRef.current += 1;
                if (lookingAway) {
                  awayFramesRef.current += 1;
                }
              }
            }
          } catch (e) {
             // Ignore silent failures from tracking
          }
        }, "image/jpeg", 0.7);
      }, 2000);

    }
    
    return () => {
      clearInterval(interval);
      if (gazeIntervalRef.current) clearInterval(gazeIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [sessionStarted]);

  // Format seconds to MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // 1. Ingestion Form Submit to FastAPI
  const handleStartIngestion = async (e) => {
    e.preventDefault();
    if (!githubUrl) return;
    if (!resumeFile) {
      setIngestError("Please upload your resume before starting the session.");
      return;
    }

    setIngestError("");
    setIngestState("reading_resume");

    // Ingestion simulation stages
    setTimeout(() => {
      setIngestState("scraping_github");
      setTimeout(() => {
        setIngestState("parsing_code");
      }, 1500);
    }, 1500);

    try {
      const formData = new FormData();
      if (resumeFile) {
        formData.append("resume", resumeFile);
      }
      formData.append("github_url", githubUrl);

      const res = await fetch("http://localhost:8001/api/ingest", {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.first_question) {
          setCurrentQuestion(data.first_question);
          setSessionId(data.session_id); // Save real session ID
          // Sync state to complete ingestion
          setTimeout(() => {
            setIngestState("completed");
            setTimeout(() => {
              setSessionStarted(true);
              setLiveTip(data.first_question.initialTip || "Analyze the codebase carefully.");
              // Setup initial transcripts
              setTranscripts([
                {
                  sender: "Interviewer",
                  time: "00:00",
                  text: data.first_question.question,
                  code: data.first_question.code,
                  type: data.first_question.type
                }
              ]);
            }, 800);
          }, 4500);
          return;
        }
      }
    } catch (err) {
      console.error("FastAPI backend error during ingestion:", err);
      setIngestState("idle");
      setIngestError("Failed to connect to the backend server. Please make sure the FastAPI backend is running on http://localhost:8001 before starting an interview session.");
    }
  };

  // Helper to notify backend the session has finalized
  const triggerEndSession = async () => {
    if (sessionId) {
      try {
        await fetch("http://localhost:8001/api/end-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            duration_seconds: secondsElapsed,
            total_frames: totalFramesRef.current,
            away_frames: awayFramesRef.current
          })
        });
      } catch (err) {
        console.error("Failed to end session on backend:", err);
      }
    }
  };

  // 2. Answer Submission to FastAPI
  const handleSubmitAnswer = async () => {
    if (!answerText.trim()) return;

    const timestamp = formatTime(secondsElapsed);
    const submissionText = answerText.trim();
    setAnswerText("");

    // Append user answer to transcript
    setTranscripts((prev) => [
      ...prev,
      { sender: "You", time: timestamp, text: submissionText }
    ]);

    try {
      const res = await fetch("http://localhost:8001/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: 1, // dummy value since it's now stateful
          answer: submissionText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const nextTurn = data.next_turn;
        
        if (nextTurn.is_final) {
          setLiveTip("The interview has concluded. See your scorecard.");
          setTranscripts((prev) => [
            ...prev,
            {
              sender: "Interviewer",
              time: formatTime(secondsElapsed),
              text: "Final Scorecard: " + nextTurn.question,
              code: nextTurn.code,
              type: nextTurn.type
            }
          ]);
          setCurrentQuestion(nextTurn);
          setTimeout(() => {
            triggerEndSession();
          }, 5000);
        } else {
          setCurrentQuestion(nextTurn);
          setLiveTip(nextTurn.feedback || "Good structure.");
          
          setTimeout(() => {
            setTranscripts((prev) => [
              ...prev,
              {
                sender: "Interviewer",
                time: formatTime(secondsElapsed),
                text: nextTurn.question,
                code: nextTurn.code,
                type: nextTurn.type
              }
            ]);
          }, 600);
        }
      }
    } catch (err) {
      console.warn("FastAPI backend not active on answer submit:", err);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setResumeFile(e.dataTransfer.files[0]);
    }
  };

  // INGESTION COMPONENT
  if (ingestState !== "idle" && !sessionStarted) {
    return (
      <div className="flex-1 bg-white flex items-center justify-center p-8 font-sans text-black select-none">
        <div className="max-w-md w-full border border-slate-100 rounded-xl shadow-sm p-8 space-y-8 text-center bg-white">
          <div className="flex flex-col items-center justify-center">
            <RefreshCw className="h-10 w-10 text-[#4F46E5] animate-spin mb-4" />
            <h3 className="text-lg font-bold tracking-tight">AI Codebase Analyzer</h3>
            <p className="text-xs text-gray-500 mt-2">Setting up your sandbox environment...</p>
          </div>

          <div className="space-y-4 text-left">
            {/* Stage 1 */}
            <div className="flex items-center gap-3">
              {ingestState === "reading_resume" ? (
                <div className="h-2 w-2 rounded-full bg-[#4F46E5] animate-ping" />
              ) : ingestState !== "reading_resume" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border border-gray-200" />
              )}
              <span className={`text-xs font-semibold ${ingestState === "reading_resume" ? "text-black" : "text-gray-400"}`}>
                Reading Resume data...
              </span>
            </div>

            {/* Stage 2 */}
            <div className="flex items-center gap-3">
              {ingestState === "scraping_github" ? (
                <div className="h-2 w-2 rounded-full bg-[#4F46E5] animate-ping" />
              ) : ingestState === "parsing_code" || ingestState === "completed" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border border-gray-200" />
              )}
              <span className={`text-xs font-semibold ${ingestState === "scraping_github" ? "text-black" : "text-gray-400"}`}>
                Scraping GitHub Repository...
              </span>
            </div>

            {/* Stage 3 */}
            <div className="flex items-center gap-3">
              {ingestState === "parsing_code" ? (
                <div className="h-2 w-2 rounded-full bg-[#4F46E5] animate-ping" />
              ) : ingestState === "completed" ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <div className="h-5 w-5 rounded-full border border-gray-200" />
              )}
              <span className={`text-xs font-semibold ${ingestState === "parsing_code" ? "text-black" : "text-gray-400"}`}>
                Parsing repository code snippets...
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-1 overflow-hidden">
            <div
              className="bg-[#4F46E5] h-1 transition-all duration-500"
              style={{
                width:
                  ingestState === "reading_resume"
                    ? "25%"
                    : ingestState === "scraping_github"
                    ? "60%"
                    : ingestState === "parsing_code"
                    ? "90%"
                    : "100%"
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (ingestState === "idle" && !sessionStarted) {
    return (
      <div className="flex-1 bg-white overflow-y-auto h-screen flex flex-col justify-between py-12 px-8 font-sans text-black">
        <div className="max-w-xl mx-auto w-full space-y-8 my-auto">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">GitHub & Resume AI Interrogator</h1>
            <p className="text-xs text-gray-500 mt-2">
              Upload your Resume and supply a GitHub link to run a mock interview session customized to your repository code.
            </p>
          </div>

          <form onSubmit={handleStartIngestion} className="space-y-6">
            {/* Resume File */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 font-mono mb-2">
                1. Upload Resume
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-8 cursor-pointer transition-colors ${
                  dragOver ? "border-[#4F46E5] bg-indigo-50/20" : resumeFile ? "border-green-200 bg-green-50/10" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  id="resume-file"
                  type="file"
                  accept=".pdf,.docx"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setResumeFile(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />
                <label htmlFor="resume-file" className="cursor-pointer flex flex-col items-center">
                  {resumeFile ? (
                    <>
                      <FileText className="h-8 w-8 text-green-500 mb-2" />
                      <span className="text-xs font-semibold text-gray-800">{resumeFile.name}</span>
                      <span className="text-[10px] text-gray-400 mt-1">Uploaded. Click to replace.</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-8 w-8 text-gray-400 mb-2" />
                      <span className="text-xs font-semibold text-gray-700">Drag & drop your Resume, or browse</span>
                      <span className="text-[10px] text-gray-400 mt-1">Supports PDF, DOCX up to 10MB</span>
                    </>
                  )}
                </label>
              </div>
            </div>

            {/* GitHub URL */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 font-mono mb-2">
                2. GitHub Project URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Link2 className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type="url"
                  required
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username/project"
                  className="block w-full rounded-md border border-gray-200 pl-9 pr-3 py-2 text-xs text-black placeholder-gray-400 focus:border-black focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Error Message */}
            {ingestError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-md text-red-600 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{ingestError}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-black hover:bg-gray-900 text-white py-3 px-4 font-bold text-xs transition-colors shadow-sm cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              Analyze Codebase & Resume
            </button>
          </form>
        </div>

        <footer className="text-center text-[10px] text-gray-400 border-t border-slate-50 pt-6">
          © 2026 PrepAI Performance Engine. All data is processed using proprietary LLMs.
        </footer>
      </div>
    );
  }

  // ACTIVE INTERVIEW COMPONENT
  return (
    <div className="flex-1 bg-white overflow-hidden h-screen flex flex-col font-sans text-black">
      {/* Top Header Row */}
      <header className="border-b border-slate-100 py-3.5 px-6 flex items-center justify-between shrink-0 select-none bg-white">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-lg tracking-tight">PrepAI</span>
          <div className="h-4 w-[1px] bg-gray-200"></div>
          <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100/50 px-2.5 py-0.5 rounded-full">
            <span className="h-2 w-2 rounded-full bg-red-500 recording-indicator"></span>
            <span className="text-[9px] font-bold font-mono text-gray-500 uppercase tracking-widest">
              Session Live
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <select
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs px-2.5 py-1.5 rounded-lg text-gray-700 font-semibold focus:outline-none focus:border-black cursor-pointer"
          >
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">Hindi (हिन्दी)</option>
            <option value="bn-IN">Bengali (বাংলা)</option>
            <option value="ta-IN">Tamil (தமிழ்)</option>
            <option value="te-IN">Telugu (తెలుగు)</option>
            <option value="kn-IN">Kannada (ಕನ್ನಡ)</option>
            <option value="mr-IN">Marathi (मराठी)</option>
            <option value="gu-IN">Gujarati (ગુજરાતી)</option>
            <option value="ml-IN">Malayalam (മലയാളം)</option>
            <option value="pa-IN">Punjabi (ਪੰਜਾਬੀ)</option>
          </select>

          {/* TTS Toggle */}
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
              ttsEnabled
                ? "bg-indigo-50 border-indigo-200 text-[#4F46E5]"
                : "bg-white border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            }`}
            title={ttsEnabled ? "Disable Read Aloud" : "Enable Read Aloud"}
          >
            {ttsEnabled ? (
              <Volume2 className="h-4 w-4" />
            ) : (
              <VolumeX className="h-4 w-4" />
            )}
          </button>

          <div className="h-4 w-[1px] bg-gray-200"></div>

          <div className="flex items-center gap-1.5 text-gray-500 font-semibold font-mono text-xs">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span>{formatTime(secondsElapsed)}</span>
          </div>
          <button
            onClick={async () => {
              await triggerEndSession();
              onEndInterview();
            }}
            className="bg-black hover:bg-gray-900 text-white text-xs px-4 py-2 rounded-lg font-bold transition-colors shadow-sm cursor-pointer"
          >
            End Interview
          </button>
        </div>
      </header>

      {/* Main Layout: Split Screen */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Conversation Area (Chat-like layout) */}
        <section className="flex-1 flex flex-col bg-slate-50/20 overflow-hidden">
          
          {/* Scrollable Conversation History */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar">
            {transcripts.map((t, idx) => {
              const isInterviewer = t.sender === "Interviewer";
              return (
                <div
                  key={idx}
                  className={`flex gap-4 max-w-3xl ${
                    isInterviewer ? "mr-auto" : "ml-auto flex-row-reverse"
                  }`}
                >
                  {/* Avatar or Badge */}
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-extrabold font-mono ${
                      isInterviewer
                        ? "bg-slate-900 text-white"
                        : "bg-[#4F46E5] text-white"
                    }`}
                  >
                    {isInterviewer ? "AI" : "YOU"}
                  </div>

                  {/* Message Bubble */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-bold text-gray-900">
                        {isInterviewer ? "AI Interviewer" : "You"}
                      </span>
                      <span className="text-[9px] text-gray-400 font-mono">
                        {t.time}
                      </span>
                    </div>

                    <div
                      className={`p-4 rounded-xl text-xs leading-relaxed border ${
                        isInterviewer
                          ? "bg-white border-slate-100 text-gray-800 shadow-2xs"
                          : "bg-[#4F46E5] border-[#4338CA] text-white shadow-2xs"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{t.text}</p>
                      
                      {/* Code Snippet (if available in this turn) */}
                      {t.code && (
                        <div className="mt-3 rounded-lg bg-gray-950 border border-gray-800 p-4 font-mono text-[11px] overflow-x-auto text-gray-300">
                          <pre>{t.code}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={transcriptEndRef} />
          </div>

          {/* Dedicated Text Input Box */}
          <div className="p-4 md:p-6 bg-white border-t border-slate-100 shrink-0">
            <div className="max-w-3xl mx-auto space-y-3">
              <textarea
                rows={3}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmitAnswer();
                  }
                }}
                placeholder="Type your structured answer here... (Press Ctrl + Enter to submit)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-xs text-black placeholder-gray-400 focus:border-black focus:bg-white focus:outline-none transition-all resize-none font-sans"
              />
              <div className="flex justify-between items-center text-[10px] text-gray-400">
                <span>Protip: Press <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-gray-600 font-bold">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px] text-gray-600 font-bold">Enter</kbd> to submit</span>
                <div className="flex items-center gap-2">
                  {/* Record Button */}
                  {isRecordingAudio ? (
                    <button
                      onClick={stopAudioRecording}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white px-4 py-2 text-xs font-bold transition-all animate-pulse cursor-pointer shadow-xs"
                    >
                      <span className="h-2 w-2 rounded-full bg-white recording-indicator inline-block"></span>
                      Stop ({formatTime(recordDuration)})
                    </button>
                  ) : audioLoading ? (
                    <button
                      disabled
                      className="flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 px-4 py-2 text-xs font-bold transition-all"
                    >
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Transcribing...
                    </button>
                  ) : (
                    <button
                      onClick={startAudioRecording}
                      className="flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      <Mic className="h-3.5 w-3.5 text-gray-500" />
                      Record Answer
                    </button>
                  )}

                  {/* Submit Button */}
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!answerText.trim() || isRecordingAudio || audioLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-black hover:bg-gray-900 text-white px-5 py-2 text-xs font-bold transition-all disabled:opacity-30 disabled:hover:bg-black shadow-xs cursor-pointer"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Submit Answer
                  </button>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* Right Sidebar: Camera Preview & Dynamic Context Panel */}
        <aside className="w-80 border-l border-slate-100 bg-white flex flex-col select-none shrink-0 p-5 space-y-6 overflow-y-auto custom-scrollbar">
          
          {/* Webcam Preview Container */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                Webcam Feed
              </span>
            </div>
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center shadow-xs">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover transition-all ${
                  isLookingAway ? "grayscale opacity-40 blur-xs" : ""
                }`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Focus warning */}
              {isLookingAway && (
                <div className="absolute inset-0 bg-red-950/85 flex items-center justify-center p-4 text-center pointer-events-none transition-all">
                  <div className="flex flex-col items-center">
                    <AlertCircle className="h-6 w-6 text-red-500 mb-1.5 animate-pulse" />
                    <span className="font-bold text-xs text-white">Please look at the screen</span>
                    <span className="text-[9px] text-red-200 mt-0.5">Focus is required during the interview</span>
                  </div>
                </div>
              )}

              {/* Camera access error */}
              {cameraError && (
                <div className="absolute inset-0 bg-red-50 flex items-center justify-center p-4 text-center pointer-events-none">
                  <div className="flex flex-col items-center text-red-650">
                    <AlertCircle className="h-6 w-6 mb-1.5" />
                    <span className="font-semibold text-xs text-center">{cameraError}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Round Info */}
          <div className="border border-slate-100 rounded-lg p-4 space-y-3 bg-slate-50/50">
            <span className="text-[9px] font-bold font-mono uppercase tracking-wider text-gray-400 block">
              Interview State
            </span>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-500">Current Phase</span>
                <span className="font-bold text-gray-800">
                  {currentQuestion?.type === "conceptual"
                    ? "Phase 1: Project Grilling"
                    : currentQuestion?.type === "code-analysis"
                    ? "Phase 2: Code Review"
                    : "Technical Evaluation"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Timer</span>
                <span className="font-mono font-bold text-gray-800">
                  {formatTime(secondsElapsed)}
                </span>
              </div>
            </div>
          </div>

          {/* Interviewer Feedback (Not WPM or voice slop) */}
          {liveTip && (
            <div className="ai-feedback-accent p-4 rounded-r-lg space-y-2">
              <div className="flex items-center gap-1.5 text-[#4F46E5]">
                <Brain className="h-4 w-4" />
                <span className="text-[9px] font-bold uppercase tracking-wider font-mono">
                  Interviewer Guidance
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed font-medium">
                {liveTip}
              </p>
            </div>
          )}

        </aside>

      </div>
    </div>
  );
}
