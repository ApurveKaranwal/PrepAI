"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Upload,
  Link2,
  Play,
  CheckCircle,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  PhoneOff,
  Send,
  Sparkles,
  Volume2,
  FileText,
  AlertCircle,
  RefreshCw,
  Clock,
  Brain,
  Terminal
} from "lucide-react";

export default function InterviewPrep({ user, onEndInterview }) {
  // Ingestion states: 'idle', 'reading_resume', 'scraping_github', 'parsing_code', 'completed'
  const [ingestState, setIngestState] = useState("idle");
  const [resumeFile, setResumeFile] = useState(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Active interview states
  const [sessionStarted, setSessionStarted] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  
  // Video stage settings (removed dummy toggles)
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const gazeIntervalRef = useRef(null);
  const [isLookingAway, setIsLookingAway] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Analysis metrics
  const [wpm, setWpm] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [vocalEnergy, setVocalEnergy] = useState([0, 0, 0, 0, 0, 0, 0, 0]);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [liveTip, setLiveTip] = useState("");
  const [subtitles, setSubtitles] = useState("");
  const [transcripts, setTranscripts] = useState([]);
  const [ingestError, setIngestError] = useState("");

  const transcriptEndRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const totalFramesRef = useRef(0);
  const awayFramesRef = useRef(0);

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
        if (Math.random() > 0.8) {
          setVocalEnergy(() => Array.from({ length: 8 }, () => Math.floor(Math.random() * 15) + 3));
        }
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
            const res = await fetch("http://localhost:8000/api/vision/gaze", {
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

      const res = await fetch("http://localhost:8000/api/ingest", {
        method: "POST",
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.questions) {
          setQuestions(data.questions);
          setSessionId(data.session_id); // Save real session ID!
          // Sync state to complete ingestion
          setTimeout(() => {
            setIngestState("completed");
            setTimeout(() => {
              setSessionStarted(true);
              setSubtitles(data.questions[0].question);
              setLiveTip(data.questions[0].initialTip);
              // Setup initial transcripts
              setTranscripts([
                {
                  sender: "Interviewer",
                  time: "12:42",
                  text: data.questions[0].question
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
      setIngestError("Failed to connect to the backend server. Please make sure the FastAPI backend is running on http://localhost:8000 before starting an interview session.");
    }
  };

  // Helper to notify backend the session has finalized
  const triggerEndSession = async () => {
    if (sessionId) {
      try {
        await fetch("http://localhost:8000/api/end-session", {
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

    const currentQ = questions[currentQuestionIndex];
    const timestamp = formatTime(secondsElapsed);

    // Append user answer to transcript
    setTranscripts((prev) => [
      ...prev,
      { sender: "You", time: timestamp, text: answerText.trim() }
    ]);

    const submissionText = answerText.trim();
    setAnswerText("");
    setIsRecording(false);
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);

    try {
      const res = await fetch("http://localhost:8000/api/submit-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: currentQ.id,
          answer: submissionText
        })
      });

      if (res.ok) {
        const data = await res.json();
        setWpm(data.wpm);
        setFillerCount(data.fillers);
        setLiveTip(data.live_tip);
      }
    } catch (err) {
      console.warn("FastAPI backend not active on answer submit:", err);
    }

    // Move to next question
    if (currentQuestionIndex < questions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      setSubtitles(questions[nextIndex].question);
      
      // Simulating interviewer voice text
      setTimeout(() => {
        setTranscripts((prev) => [
          ...prev,
          {
            sender: "Interviewer",
            time: formatTime(secondsElapsed),
            text: questions[nextIndex].question
          }
        ]);
      }, 600);
    } else {
      setSubtitles("Awesome job! You've completed the interview session. Click 'End Interview' to see your metrics.");
      setLiveTip("Success! Your overall communication metrics were strong. Your technical analysis maps directly to the code structures.");
      triggerEndSession(); // Automatically trigger end-session!
    }
  };

  // 3. Audio Recording Simulation (Streams text into input box)
  const handleToggleRecord = () => {
    if (isRecording) {
      setIsRecording(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    } else {
      setIsRecording(true);
      const currentQ = questions[currentQuestionIndex];
      const sentences = currentQ?.streamTranscript || ["I am explaining my implementation details."];
      let sentenceIdx = 0;
      let wordIdx = 0;
      let fullText = answerText ? answerText + " " : "";

      recordingIntervalRef.current = setInterval(() => {
        if (sentenceIdx >= sentences.length) {
          setIsRecording(false);
          clearInterval(recordingIntervalRef.current);
          return;
        }

        const sentenceWords = sentences[sentenceIdx].split(" ");
        if (wordIdx < sentenceWords.length) {
          fullText += (wordIdx === 0 && fullText.length > 0 ? "" : " ") + sentenceWords[wordIdx];
          setAnswerText(fullText);
          wordIdx++;
          
          if (Math.random() > 0.94) {
            setFillerCount((prev) => prev + 1);
          }
        } else {
          sentenceIdx++;
          wordIdx = 0;
          fullText += " ";
        }
      }, 200);
    }
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    };
  }, []);

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
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-black hover:bg-gray-900 text-white py-3 px-4 font-bold text-xs transition-colors shadow-sm"
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

  // ACTIVE INTERVIEW COMPONENT (Screenshot 2 Alignment)
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
              Session: Senior Product Designer
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-gray-500 font-semibold font-mono text-xs">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            <span>{formatTime(secondsElapsed)}</span>
          </div>
          <button
            onClick={async () => {
              await triggerEndSession();
              onEndInterview();
            }}
            className="bg-black hover:bg-gray-900 text-white text-xs px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
          >
            End Interview
          </button>
        </div>
      </header>

      {/* Main Grid: Left Video / Question & Right Transcription / Insights */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side */}
        <section className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto custom-scrollbar">
          
          {/* Large Video Stage */}
          <div className="relative flex-1 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-xs min-h-[360px] flex items-center justify-center">
            {/* Live Webcam Feed */}
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover transition-all ${isLookingAway ? 'grayscale opacity-50 blur-sm' : ''}`}
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {/* OpenCV Warning Overlay */}
            {isLookingAway && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-red-500/90 text-white px-6 py-4 rounded-xl shadow-2xl flex flex-col items-center animate-pulse">
                  <AlertCircle className="h-10 w-10 mb-2" />
                  <span className="font-bold text-lg">Please maintain focus on the screen</span>
                  <span className="text-xs mt-1 text-red-100">Our AI cannot detect your eyes.</span>
                </div>
              </div>
            )}
            
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-red-50 text-red-600 border border-red-200 px-6 py-4 rounded-xl shadow-md flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-bold text-sm">{cameraError}</span>
                </div>
              </div>
            )}

            {/* Subtitles Overlay */}
            <div className="absolute bottom-4 left-4 right-4 flex justify-center">
              <p className="bg-black/80 text-white px-5 py-2.5 rounded-lg text-center text-xs max-w-lg shadow-md backdrop-blur-xs leading-relaxed font-medium">
                &quot;{subtitles}&quot;
              </p>
            </div>
          </div>

          {/* Action Control Bar (Camera enforced, buttons removed) */}
          <div className="flex justify-center items-center gap-3">
            <button
              onClick={onEndInterview}
              className="px-5 py-2.5 rounded-full flex items-center gap-1.5 border border-red-200 text-red-500 hover:bg-red-50 font-bold text-xs transition-colors"
            >
              <PhoneOff className="h-4 w-4" />
              Emergency Stop
            </button>
          </div>

          {/* Minimalist Question Display & Answer Box (Notion-like) */}
          <div className="border border-slate-100 rounded-xl p-5 space-y-4 bg-white shadow-xs select-none">
            <div className="flex items-center justify-between border-b border-slate-50 pb-2">
              <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-[#4F46E5] flex items-center gap-1">
                <Brain className="h-3.5 w-3.5" />
                Active Question {currentQuestionIndex + 1} of {questions.length || 2}
              </span>
              <span className="text-[9px] bg-gray-50 border border-gray-100/50 px-2 py-0.5 rounded-full text-gray-400 font-bold">
                {questions[currentQuestionIndex]?.type === "conceptual" ? "Conceptual" : "Code Snippet Analysis"}
              </span>
            </div>

            {questions[currentQuestionIndex]?.type === "code-analysis" && (
              <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 font-mono text-xs overflow-x-auto text-gray-300">
                <pre>{questions[currentQuestionIndex].code}</pre>
              </div>
            )}

            <div className="space-y-1">
              <h2 className="text-sm font-bold text-gray-900">{questions[currentQuestionIndex]?.title}</h2>
              <p className="text-xs text-gray-500 leading-relaxed">{questions[currentQuestionIndex]?.question}</p>
            </div>

            {/* Clean Answer Input Area */}
            <div className="space-y-3 pt-1">
              <div className="relative">
                <textarea
                  rows={2}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full rounded-lg border border-gray-100 bg-gray-50/30 p-3 text-xs text-black placeholder-gray-400 focus:border-black focus:bg-white focus:outline-none transition-all resize-none font-sans"
                />
                {isRecording && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-50 border border-red-100/30 px-2 py-0.5 rounded text-[10px] text-red-500 font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 recording-indicator"></span>
                    Transcribing...
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center">
                <button
                  onClick={handleToggleRecord}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold border transition-colors ${
                    isRecording
                      ? "bg-red-50 border-red-200 text-red-500"
                      : "border-gray-200 hover:bg-gray-50 text-gray-600"
                  }`}
                >
                  <Mic className="h-3.5 w-3.5" />
                  {isRecording ? "Stop Recording" : "Record Audio (Simulated)"}
                </button>
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answerText.trim()}
                  className="flex items-center gap-1 rounded-md bg-[#4F46E5] hover:bg-[#4338CA] text-white px-4 py-1.5 text-[10px] font-bold shadow-xs transition-colors disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Submit Answer
                </button>
              </div>
            </div>

          </div>

        </section>

        {/* Right Sidebar */}
        <aside className="w-80 border-l border-slate-100 bg-white flex flex-col select-none shrink-0">
          
          {/* Live Transcription Box */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-mono text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Live Transcription
              </h3>
              <Volume2 className="h-4 w-4 text-gray-400" />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar text-xs">
              {transcripts.map((t, idx) => (
                <div key={idx} className="space-y-1">
                  <span className={`text-[9px] font-mono font-bold uppercase block ${
                    t.sender === "Interviewer" ? "text-gray-400" : "text-[#4F46E5]"
                  }`}>
                    {t.sender} • {t.time}
                  </span>
                  <p className="text-xs text-gray-700 leading-relaxed bg-gray-50/30 p-2.5 border border-gray-100 rounded-lg">
                    {t.text}
                  </p>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* AI Insights Sidebar */}
          <div className="p-5 bg-gray-50/50 border-t border-slate-100 space-y-4 shrink-0">
            <h3 className="font-mono text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-[#4F46E5]" />
              AI Insights
            </h3>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-slate-100 p-3 rounded-lg shadow-2xs">
                <span className="text-[9px] text-gray-400 font-mono uppercase block mb-1">Pacing</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold text-gray-900">{wpm}</span>
                  <span className="text-[9px] text-gray-400 font-mono font-medium">wpm</span>
                </div>
                <div className="w-full bg-gray-100 h-1 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-black w-[72%]" />
                </div>
              </div>

              <div className="bg-white border border-slate-100 p-3 rounded-lg shadow-2xs">
                <span className="text-[9px] text-gray-400 font-mono uppercase block mb-1">Filler Words</span>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold text-gray-900">{fillerCount}</span>
                  <span className="text-[9px] text-gray-400 font-mono font-medium">this min</span>
                </div>
                <div className="w-full bg-gray-100 h-1 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-red-500 w-[40%]" />
                </div>
              </div>
            </div>

            {/* Live Tip */}
            <div className="ai-feedback-accent p-3 rounded-r-lg">
              <div className="flex items-center gap-1.5 mb-1 text-[#4F46E5]">
                <Volume2 className="h-3.5 w-3.5" />
                <span className="text-[9px] font-bold uppercase tracking-wider font-mono">Live Tip</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                {liveTip}
              </p>
            </div>

            {/* Vocal Energy */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 font-semibold">Vocal Energy</span>
              <div className="flex items-end gap-0.5 h-6">
                {vocalEnergy.map((v, idx) => (
                  <div
                    key={idx}
                    className="w-1 bg-[#4F46E5] rounded-t-full transition-all duration-300"
                    style={{ height: `${(v / 20) * 100}%` }}
                  />
                ))}
              </div>
            </div>

          </div>

        </aside>
      </div>
    </div>
  );
}
