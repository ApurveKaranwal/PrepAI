import io
import re
import os
import zipfile
import requests
import json
import random
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
import pypdf
from dotenv import load_dotenv
import time
from groq import Groq

# Import our database layer and custom ML model
import database
from ml.evaluation.evaluation import InterviewMLModel
from config import GROQ_HEAVY_MODEL, GROQ_LIGHT_MODEL
from llm_client import call_llm, call_llm_json

# Load environment variables
load_dotenv()

# Initialize DB
database.init_db()

app = FastAPI(title="PrepAI Real Backend")

# Import and include routers
from voice_copilot.router import router as voice_copilot_router
app.include_router(voice_copilot_router, prefix="/api/voice-copilot")

from career_agent import router as career_agent_router
app.include_router(career_agent_router, prefix="/api/career")


# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "*"],
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Instantiate local ML engine
ml_engine = InterviewMLModel()

# Initialize Groq client if key is set
groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None

if client:
    print(f"Groq API successfully initialized for live evaluations using {GROQ_HEAVY_MODEL}!")
else:
    print("Groq API key not set in backend/.env. Running on local ML engine.")

class TTSRequest(BaseModel):
    text: str
    language_code: str = "en-IN"

class AnswerSubmission(BaseModel):
    session_id: int
    question_id: int
    answer: str

class EndSessionRequest(BaseModel):
    session_id: int
    duration_seconds: int
    total_frames: int = 0
    away_frames: int = 0

class SignUpRequest(BaseModel):
    email: str
    password: str
    name: str

class SignInRequest(BaseModel):
    email: str
    password: str

class GoogleSignInRequest(BaseModel):
    email: str
    name: str
    uid: str

class PlatformSyncRequest(BaseModel):
    user_id: str
    leetcode_handle: Optional[str] = ""
    codeforces_handle: Optional[str] = ""
    github_url: Optional[str] = ""

import profile_aggregator

# Helper to parse GitHub URL and extract code files from public zipball
def download_github_code(github_url: str) -> List[dict]:
    github_url = github_url.strip()
    if github_url.endswith("/"):
        github_url = github_url[:-1]
    if github_url.endswith(".git"):
        github_url = github_url[:-4]
        
    match = re.search(r"github\.com/([^/]+)/([^/]+)", github_url)
    if not match:
        print(f"Regex failed for: {github_url}")
        return []
    
    owner, repo = match.group(1), match.group(2)
    branches = ["main", "master"]
    repo_files = []
    
    for branch in branches:
        zip_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{branch}.zip"
        try:
            r = requests.get(zip_url, timeout=10)
            if r.status_code == 200:
                zip_data = io.BytesIO(r.content)
                with zipfile.ZipFile(zip_data) as z:
                    for file_info in z.infolist():
                        if not file_info.is_dir() and not any(k in file_info.filename.lower() for k in ["node_modules", "package-lock", "dist", ".git", ".next", "build", "vendor"]):
                            if file_info.filename.endswith((".js", ".jsx", ".ts", ".tsx", ".py", ".go", ".java", ".cpp", ".css", ".html")):
                                with z.open(file_info) as f:
                                    try:
                                        content = f.read().decode("utf-8", errors="ignore")
                                        if content.strip():
                                            repo_files.append({
                                                "name": file_info.filename,
                                                "content": content
                                            })
                                    except:
                                        pass
                print(f"Successfully downloaded {len(repo_files)} files from {branch}")
                if repo_files:
                    break
        except Exception as e:
            print(f"Failed branch {branch}: {e}")
            
    return repo_files

# Prompt templates for Groq
SYSTEM_PROMPT = """# Role & Objective
You are an elite, AI-powered Technical Coding Interviewer designed to conduct highly technical coding and debugging interviews for software engineering candidates. Your goal is to assess the candidate's coding, debugging, and systems implementation skills in a realistic, high-pressure, two-phase coding interview.

Unlike a general theory interview, you must focus on actual coding tasks, including debugging buggy code, refactoring implementation snippets, completing missing logic/functions, and analyzing codebase-specific performance bottlenecks.

---

# Phase 1: Code-Level & Project-Specific Interrogation
Act as a Principal Engineer. Using the candidate's scraped repository files, select a key implementation snippet or project area and ask coding-focused questions:
1. **Coding Tasks:** Challenge the candidate with concrete coding tasks. For example: "In your project, the file X has Y logic. Refactor it to handle Z concurrent request case," or "Here is a code block based on your repo's class structure. Debug it to resolve the race condition."
2. **Provide Code Blocks:** You MUST provide a code snippet in the `"code"` field of your JSON response for the candidate to review, debug, or complete.
3. **Execution Flow:** Ask exactly **one task at a time**. Analyze their answer critically, evaluate their syntax/logic, provide immediate sharp feedback, and then progress to the next coding exercise.

---

# Phase 2: Algorithmic & Problem-Solving Round
Explicitly move to the DSA (Data Structures & Algorithms) round.
1. **Present a Coding Problem:** Provide a concrete coding problem description in the `"question"` field and a skeleton code snippet in the `"code"` field.
2. **Completion and Complexity:** Have the candidate explain the approach, fill in/complete the code, and state the time and space complexity.

---

# Strict Interaction Rules
- **Code-Focused:** Do NOT ask generic high-level questions (e.g., "Tell me about your tech stack" or "Why did you choose React?"). Instead, ask code-specific questions: complete the code, write the main function, debug the code snippet, analyze time complexity, find the memory leak, etc.
- **Provide code snippets:** Whenever possible, include code snippets or skeletons in the `"code"` field.
- **Anti-Vagueness:** If the candidate gives a vague answer (e.g., "I don't know"), stay on the topic, explain the solution briefly in `"feedback"`, and ask them to implement it or fix another part of the code snippet in `"question"`.
- **The Final Evaluation:** After 4-5 total questions, break character to deliver a comprehensive performance scorecard: Project Code Review Rating (1-10), Algorithmic Coding Rating (1-10), Key Red Flags.

IMPORTANT: YOU MUST ALWAYS RESPOND IN JSON FORMAT matching this exact schema:
{
    "feedback": "Your evaluation/feedback on their PREVIOUS answer (leave empty if this is the first question)",
    "question": "Your next question/coding instruction for the user (or the final evaluation scorecard if the interview is over)",
    "code": "A code snippet, buggy function, skeleton function, or code block representing the coding task (or empty string/null if not applicable)",
    "type": "code-analysis",
    "is_final": boolean (true ONLY if you are giving the final scorecard, false otherwise)
}
"""

def generate_initial_question(resume_text: str, repo_files: List[dict], role: str) -> dict:
    files_summary = ""
    sorted_files = sorted(repo_files, key=lambda f: len(f['content']), reverse=True)
    selected_files = []
    
    if len(sorted_files) <= 10:
        selected_files = sorted_files
    else:
        top_files = sorted_files[:3]
        remaining_files = sorted_files[3:]
        random_files = random.sample(remaining_files, min(7, len(remaining_files)))
        selected_files = top_files + random_files
        random.shuffle(selected_files)

    for f in selected_files:
        files_summary += f"\n--- File: {f['name']} ---\n{f['content'][:1500]}\n"
        
    user_prompt = f"Candidate Target Role: {role}\nResume Content:\n{resume_text}\n\nGitHub Codebase:\n{files_summary}\n\nStart the interview now with your first Phase 1 question."
    
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt}
    ]
    
    result = call_llm_json(messages, temperature=0.7, max_tokens=1200)
    if result and "question" in result:
        return {
            "result": result,
            "raw_prompt": user_prompt
        }
    return {}

def generate_next_turn(session_id: int) -> dict:
    history = database.get_messages_for_session(session_id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
        
    result = call_llm_json(messages, temperature=0.7, max_tokens=1200)
    return result if (result and "question" in result) else {}

@app.get("/")
def read_root():
    return {"status": "PrepAI Real Engine is active"}

@app.post("/api/ingest")
async def ingest_details(
    resume: Optional[UploadFile] = File(None),
    github_url: Optional[str] = Form(None),
    user_id: Optional[str] = Form(None)
):
    print(f"Ingesting Details. GitHub: {github_url}, User ID: {user_id}")
    resume_text = ""
    resume_name = None
    
    # Check if we should load from stored profile
    if user_id and not resume:
        try:
            profile = database.get_candidate_profile(user_id)
            if profile:
                resume_text = profile.get("resume_text", "")
                resume_name = profile.get("resume_name", "Saved_Resume.pdf")
                if not github_url:
                    github_url = profile.get("github_url", "")
                print(f"Loaded saved profile for user {user_id}. Resume Length: {len(resume_text)}, GitHub: {github_url}")
        except Exception as profile_err:
            print(f"Failed to load candidate profile for user {user_id}: {profile_err}")
            
    # Fallback to github_url empty string if none provided
    if not github_url:
        github_url = ""

    # 1. Parse Resume PDF
    if resume:
        try:
            resume_name = resume.filename
            pdf_bytes = await resume.read()
            pdf_reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            extracted_pages = []
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_pages.append(page_text)
            resume_text = "\n".join(extracted_pages)
            print(f"Parsed PDF. Length: {len(resume_text)}")
            
            # Auto-save resume to candidate profile in DB if user_id is provided
            if user_id:
                try:
                    profile = database.get_candidate_profile(user_id) or {}
                    profile["resume_name"] = resume_name
                    profile["resume_text"] = resume_text
                    if github_url:
                        profile["github_url"] = github_url
                    database.save_candidate_profile(user_id, profile)
                    print(f"Auto-saved uploaded resume to profile for user: {user_id}")
                except Exception as db_err:
                    print(f"Failed to auto-save profile: {db_err}")
        except Exception as e:
            print(f"Failed to parse PDF Resume: {e}")
            
    # 2. Scrape Github code files
    repo_files = []
    try:
        repo_files = download_github_code(github_url)
        print(f"Scraped {len(repo_files)} files from GitHub ZIP.")
    except Exception as e:
        print(f"Failed to download codebase ZIP: {e}")

    # 3. Determine Job Role
    role = "Software Engineer"
    if resume_text:
        try:
            extracted_role = call_llm(
                messages=[
                    {"role": "system", "content": "You are a resume parser. Output ONLY a short job role title (2-4 words) that describes the candidate based on their resume. Examples: 'Senior Backend Engineer', 'Frontend Developer', 'Data Scientist'. Return nothing else."},
                    {"role": "user", "content": resume_text[:2000]}
                ],
                temperature=0.1,
                max_tokens=25
            )
            if extracted_role and len(extracted_role) < 40 and "error" not in extracted_role.lower():
                role = extracted_role.strip('"\n ')
        except Exception as e:
            print("Failed to extract role via LLM, using fallback:", e)

    if role == "Software Engineer" and resume_text:
        patterns = {
            "Backend Engineer": ["backend", "fastapi", "django", "node", "express", "spring", "flask", "database", "sql"],
            "Frontend Developer": ["frontend", "react", "nextjs", "vue", "angular", "css", "html", "web design"],
            "Fullstack Engineer": ["fullstack", "full-stack", "mern", "mean"],
            "DevOps Engineer": ["devops", "kubernetes", "docker", "ci/cd", "terraform", "jenkins"],
            "Mobile Developer": ["android", "ios", "flutter", "react native", "swift"]
        }
        for r_name, words in patterns.items():
            if any(w in resume_text.lower() for w in words):
                role = r_name
                break

    # 4. Generate Initial Question & Create Session
    session_id = database.create_session(github_url, resume_name, resume_text, role)
    
    initial_payload = generate_initial_question(resume_text, repo_files, role)
    if initial_payload and "result" in initial_payload:
        database.save_message(session_id, "user", initial_payload["raw_prompt"])
        database.save_message(session_id, "assistant", json.dumps(initial_payload["result"]))
        first_q = initial_payload["result"]
    else:
        first_q = {"question": "Could you explain your background and a recent project?", "feedback": "", "is_final": False}
        database.save_message(session_id, "assistant", json.dumps(first_q))

    print(f"Created stateful session ID: {session_id} for role: {role}")

    return {
        "status": "success",
        "session_id": session_id,
        "github_url": github_url,
        "first_question": first_q
    }

@app.post("/api/submit-answer")
def submit_answer(submission: AnswerSubmission):
    print(f"Submitting answer for Session: {submission.session_id}, Question: {submission.question_id}")
    
    # Estimate WPM & fillers
    word_count = len(submission.answer.split())
    wpm = 135 if word_count > 30 else 120
    cleaned_answer = re.sub(r"[^\w\s]", "", submission.answer.lower())
    filler_list = ["um", "uh", "like", "actually", "basically", "so", "well"]
    filler_count = sum(1 for t in cleaned_answer.split() if t in filler_list)
    
    # 1. Save candidate's answer to DB
    database.save_message(submission.session_id, "user", submission.answer)
    
    # 2. Save to old 'answers' table for analytics compatibility (dummy metrics since we defer to next msg)
    database.save_answer(
        session_id=submission.session_id,
        question_id_in_session=submission.question_id,
        answer_text=submission.answer,
        score=8.0,
        wpm=wpm,
        fillers=filler_count,
        live_tip="Computing next step...",
        matched_keywords=[],
        missing_keywords=[]
    )
    
    # 3. Generate Next Turn using full history
    next_turn = generate_next_turn(submission.session_id)
    
    if next_turn:
        database.save_message(submission.session_id, "assistant", json.dumps(next_turn))
    else:
        next_turn = {"question": "Could you clarify your previous point?", "feedback": "Connection error", "is_final": False}
        database.save_message(submission.session_id, "assistant", json.dumps(next_turn))
        
    return {
        "status": "success",
        "wpm": wpm,
        "fillers": filler_count,
        "next_turn": next_turn
    }

@app.post("/api/end-session")
def end_session(request: EndSessionRequest):
    print(f"Ending Session: {request.session_id} with duration {request.duration_seconds}s")
    result = database.end_session(request.session_id, request.duration_seconds, request.total_frames, request.away_frames)
    return {
        "status": "success",
        "score": result["score"],
        "duration": result["duration"]
    }

@app.post("/api/text-to-speech")
def text_to_speech(req: TTSRequest):
    sarvam_api_key = os.environ.get("SARVAM_API_KEY")
    if not sarvam_api_key:
        raise HTTPException(status_code=400, detail="Sarvam API key not set in backend/.env file.")
    
    text_to_speak = req.text
    # 1. Translate to Indic language if not en-IN
    if req.language_code != "en-IN":
        try:
            translate_url = "https://api.sarvam.ai/translate"
            headers = {
                "api-subscription-key": sarvam_api_key,
                "Content-Type": "application/json"
            }
            payload = {
                "input": req.text,
                "source_language_code": "en-IN",
                "target_language_code": req.language_code
            }
            r = requests.post(translate_url, json=payload, headers=headers, timeout=10)
            if r.status_code == 200:
                text_to_speak = r.json().get("translated_text", req.text)
            else:
                print(f"Sarvam translation failed status {r.status_code}: {r.text}")
        except Exception as e:
            print(f"Translation exception: {e}")

    # 2. Convert to Speech using bulbul:v3
    try:
        tts_url = "https://api.sarvam.ai/text-to-speech"
        headers = {
            "api-subscription-key": sarvam_api_key,
            "Content-Type": "application/json"
        }
        payload = {
            "text": text_to_speak,
            "target_language_code": req.language_code,
            "speaker": "shubh",
            "model": "bulbul:v3"
        }
        r = requests.post(tts_url, json=payload, headers=headers, timeout=10)
        if r.status_code == 200:
            audios = r.json().get("audios", [])
            if audios:
                return {
                    "status": "success",
                    "audio_base64": audios[0],
                    "translated_text": text_to_speak if req.language_code != "en-IN" else None
                }
        raise HTTPException(status_code=r.status_code if r.status_code >= 400 else 500, detail=f"Sarvam TTS failed: {r.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/speech-to-text")
def speech_to_text(file: UploadFile = File(...), language_code: str = Form("en-IN")):
    sarvam_api_key = os.environ.get("SARVAM_API_KEY")
    if not sarvam_api_key:
        raise HTTPException(status_code=400, detail="Sarvam API key not set in backend/.env file.")
    
    try:
        audio_bytes = file.file.read()
        stt_url = "https://api.sarvam.ai/speech-to-text"
        headers = {
            "api-subscription-key": sarvam_api_key
        }
        data = {
            "model": "saaras:v3",
            "mode": "translate"
        }
        files = {
            "file": (file.filename, audio_bytes, file.content_type or "audio/webm")
        }
        
        r = requests.post(stt_url, files=files, data=data, headers=headers, timeout=15)
        if r.status_code == 200:
            res_json = r.json()
            return {
                "status": "success",
                "transcript": res_json.get("transcript", ""),
                "detected_language": res_json.get("language_code", "")
            }
        raise HTTPException(status_code=r.status_code if r.status_code >= 400 else 500, detail=f"Sarvam STT failed: {r.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/history")
def get_history():
    try:
        history_data = database.get_history_data()
        return history_data
    except Exception as e:
        print(f"Error fetching history: {e}")
        return {"sessions": [], "error": "Failed to load history. Please try again."}

# User authentication endpoints
@app.post("/api/auth/signup")
def signup(req: SignUpRequest):
    try:
        user = database.create_user(req.email, req.password, req.name)
        return {"status": "success", "user": user}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/signin")
def signin(req: SignInRequest):
    user = database.verify_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {"status": "success", "user": user}

@app.post("/api/auth/google")
def google_auth(req: GoogleSignInRequest):
    try:
        user = database.get_or_create_google_user(req.email, req.name, req.uid)
        return {"status": "success", "user": user}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Load OpenCV cascades for gaze tracking
face_cascade = None
eye_cascade = None
try:
    if hasattr(cv2, 'CascadeClassifier') and hasattr(cv2, 'data'):
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
    else:
        print("[Vision] cv2.CascadeClassifier is not available in this OpenCV build/version.")
except Exception as cv_err:
    print(f"[Vision] Failed to load OpenCV cascades: {cv_err}")

@app.post("/api/vision/gaze")
async def process_gaze(frame: UploadFile = File(...)):
    try:
        contents = await frame.read()
        if face_cascade is None or eye_cascade is None:
            return {"looking_at_screen": True, "warning": "Gaze tracking not available: OpenCV cascades not loaded."}
            
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"looking_at_screen": False, "error": "Could not decode image"}

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)
        
        if len(faces) == 0:
            return {"looking_at_screen": False, "reason": "No face detected"}

        # If a face is detected, we mark them as looking at the screen.
        # Haar cascade eye tracking is highly fragile and fails for users wearing glasses
        # or in poor lighting conditions due to lens glare/reflections.
        return {"looking_at_screen": True}
        
    except Exception as e:
        print(f"Error processing vision frame: {e}")
        return {"looking_at_screen": False, "error": str(e)}

def generate_heuristic_ats_analysis(text: str, job_role: str) -> dict:
    """Intelligent heuristic fallback to compute authentic ATS scores and keyword gaps."""
    text_lower = text.lower()
    role_lower = job_role.lower()
    
    tech_keywords = {
        "django": ["django", "python", "rest framework", "drf", "orm", "postgresql", "celery", "redis", "docker", "gunicorn", "pytest"],
        "fastapi": ["fastapi", "python", "pydantic", "sqlalchemy", "asyncio", "postgresql", "docker", "pytest", "redis"],
        "react": ["react", "javascript", "typescript", "redux", "tailwind", "next.js", "nextjs", "html", "css", "webpack"],
        "backend": ["backend", "sql", "postgresql", "database", "api", "rest", "microservices", "redis", "docker", "git", "ci/cd"],
        "frontend": ["frontend", "javascript", "typescript", "react", "html5", "css3", "ui/ux", "responsive", "state management"],
        "fullstack": ["react", "node", "python", "sql", "docker", "api", "git", "mongodb", "postgresql", "typescript"]
    }
    
    target_pool = set()
    for k, v in tech_keywords.items():
        if k in role_lower:
            target_pool.update(v)
    if not target_pool:
        target_pool = {"python", "javascript", "sql", "git", "rest api", "docker", "data structures", "algorithms"}
        
    found_keywords = [kw for kw in target_pool if kw in text_lower]
    missing_keywords = [kw.capitalize() for kw in target_pool if kw not in text_lower][:6]
    
    match_ratio = len(found_keywords) / max(1, len(target_pool))
    has_metrics = bool(re.search(r"\b\d+[%kKmMxX]?\b", text))
    word_count = len(text.split())
    
    skills_score = int(min(98, max(50, match_ratio * 90 + 10)))
    experience_score = int(min(95, max(55, 65 + (20 if has_metrics else 5) + (10 if word_count > 300 else 0))))
    formatting_score = int(min(96, max(70, 80 + (10 if len(text) > 500 else 0))))
    impact_score = int(min(92, max(45, 60 + (25 if has_metrics else 0))))
    
    ats_score = int(round((skills_score * 0.35) + (experience_score * 0.30) + (formatting_score * 0.15) + (impact_score * 0.20)))
    
    return {
        "overall_summary": f"Candidate demonstrates relevant engineering foundations for {job_role}. Alignment is strongest in core implementation concepts with key optimization opportunities in ATS keyword density.",
        "ats_score": ats_score,
        "sub_scores": {
            "skills": skills_score,
            "experience": experience_score,
            "formatting": formatting_score,
            "impact": impact_score
        },
        "pros": [
            f"Demonstrated project and technical experience relevant to {job_role}.",
            "Clean structure with legible experience chronology and skill listings."
        ],
        "cons": [
            f"Missing targeted high-frequency keywords: {', '.join(missing_keywords[:3]) if missing_keywords else 'modern tools'}.",
            "Experience bullet points could benefit from stronger quantifiable metrics (e.g. latency, throughput, scale)."
        ],
        "missing_keywords": missing_keywords or ["CI/CD Pipelines", "System Architecture", "Performance Profiling"],
        "experience_feedback": "Experience bullet points describe technical duties well. To pass senior ATS filters, rewrite bullet points using the STAR method: Action Verb + Context + Quantified Metric Result.",
        "suggestions": [
            f"Add explicitly mentioned tools ({', '.join(missing_keywords[:3]) if missing_keywords else 'cloud architecture'}) to your Skills section.",
            "Quantify impact with concrete percentages (e.g., 'Reduced query latency by 35%')."
        ]
    }

@app.post("/api/resume-analyze")
async def analyze_resume_deep(
    resume: UploadFile = File(...),
    job_role: str = Form(...)
):
    if not resume.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported at this time.")
        
    try:
        content = await resume.read()
        pdf_reader = pypdf.PdfReader(io.BytesIO(content))
        text_parts = []
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        text = "\n".join(text_parts)
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the provided PDF.")
            
        compact_text = re.sub(r"\s+", " ", text[:3200]).strip()
        
        prompt = f"""
        You are an elite Technical Recruiter and ATS analyzer.
        Critically analyze this resume against target job role: "{job_role}".
        
        Resume Text:
        {compact_text}
        
        Provide your analysis in EXACTLY the following JSON format:
        {{
            "overall_summary": "A 2-3 sentence paragraph summarizing their overall fit and the initial impression for this role.",
            "ats_score": 82,
            "sub_scores": {{
                "skills": 85,
                "experience": 80,
                "formatting": 90,
                "impact": 75
            }},
            "pros": ["detailed pro 1", "detailed pro 2"],
            "cons": ["detailed con 1", "detailed con 2"],
            "missing_keywords": ["keyword1", "keyword2", "keyword3"],
            "experience_feedback": "A 2-3 sentence critique on experience bullet points (metrics, action verbs).",
            "suggestions": ["actionable step 1", "actionable step 2"]
        }}
        """
        
        fallback_data = generate_heuristic_ats_analysis(text, job_role)
        
        response_json = call_llm_json(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=900,
            default=fallback_data
        )
        
        if not response_json or "ats_score" not in response_json:
            response_json = fallback_data
            
        return {"status": "success", "analysis": response_json}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error analyzing resume: {e}")
        return {"status": "success", "analysis": generate_heuristic_ats_analysis(text if 'text' in locals() else "", job_role)}

@app.post("/api/resume-rewrite")
async def rewrite_resume(
    resume: UploadFile = File(...),
    job_role: str = Form(...)
):
    if not resume.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF resumes are supported at this time.")
        
    try:
        content = await resume.read()
        pdf_reader = pypdf.PdfReader(io.BytesIO(content))
        text_parts = []
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        text = "\n".join(text_parts)
            
        if not text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from the provided PDF.")
            
        compact_text = re.sub(r"\s+", " ", text[:3200]).strip()
        
        prompt = f"""
        You are an elite Career Coach and Resume Writer. 
        Identify the 3 weakest experience bullet points in this resume and rewrite them for the target role: "{job_role}".
        
        Resume Text:
        {compact_text}
        
        Provide your response in EXACTLY the following JSON format:
        {{
            "rewrites": [
                {{
                    "original": "The exact original weak bullet point from the resume.",
                    "optimized": "The fully rewritten, highly impactful, ATS-optimized version with metrics.",
                    "explanation": "A 1-sentence explanation of why this new version is better."
                }}
            ]
        }}
        """
        
        fallback_rewrites = {
            "rewrites": [
                {
                    "original": "Responsible for developing backend API services and database models.",
                    "optimized": f"Architected high-throughput REST APIs and optimized database query execution plans for {job_role}, improving endpoint response times by 32%.",
                    "explanation": "Replaced passive task description with strong action verbs and quantified performance improvement."
                },
                {
                    "original": "Worked on bug fixes and performance improvements across modules.",
                    "optimized": "Diagnosed and resolved critical race conditions and memory leaks across core microservices, increasing system uptime to 99.95%.",
                    "explanation": "Framed routine maintenance as high-value reliability and uptime engineering."
                },
                {
                    "original": "Collaborated with team to deploy new features.",
                    "optimized": f"Spearheaded automated CI/CD pipeline deployments and modular service refactoring for {job_role}, reducing release cycle times by 40%.",
                    "explanation": "Emphasized leadership, modern engineering workflow, and concrete throughput metrics."
                }
            ]
        }
        
        response_json = call_llm_json(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=900,
            default=fallback_rewrites
        )
        if not response_json or "rewrites" not in response_json:
            response_json = fallback_rewrites
            
        return {"status": "success", "data": response_json}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error rewriting resume: {e}")
        return {"status": "success", "data": fallback_rewrites}


# -------------------------------------------------------------
# Multi-Platform Profile Aggregator & DevScore Routes
# -------------------------------------------------------------
@app.post("/api/profile/sync-platforms")
async def sync_candidate_platforms(payload: PlatformSyncRequest):
    user_id = payload.user_id
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required")

    try:
        # 1. Fetch live metrics from platforms
        lc_stats = profile_aggregator.fetch_leetcode_stats(payload.leetcode_handle) if payload.leetcode_handle else {}
        cf_stats = profile_aggregator.fetch_codeforces_stats(payload.codeforces_handle) if payload.codeforces_handle else {}
        gh_stats = profile_aggregator.fetch_github_stats(payload.github_url) if payload.github_url else {}

        # 2. Get real aggregated PrepAI voice interview metrics
        prepai_stats = database.get_user_prepai_stats(user_id)

        # 3. Calculate unified DevScore
        devscore_data = profile_aggregator.calculate_devscore(lc_stats, cf_stats, gh_stats, prepai_stats)

        # 4. Persist to PostgreSQL
        database.update_candidate_platform_stats(user_id, {
            "leetcode_handle": payload.leetcode_handle or "",
            "leetcode_stats": lc_stats,
            "codeforces_handle": payload.codeforces_handle or "",
            "codeforces_stats": cf_stats,
            "github_url": payload.github_url or "",
            "github_stats": gh_stats,
            "devscore": devscore_data["devscore"],
            "devscore_breakdown": devscore_data
        })

        updated_profile = database.get_candidate_profile(user_id)

        return {
            "status": "success",
            "devscore": devscore_data["devscore"],
            "tier": devscore_data["tier"],
            "devscore_data": devscore_data,
            "profile": updated_profile
        }
    except Exception as e:
        print(f"Error syncing candidate platforms: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/profile/devscore")
async def get_candidate_devscore(user_id: str):
    if not user_id:
        raise HTTPException(status_code=400, detail="User ID is required")

    try:
        profile = database.get_candidate_profile(user_id)
        prepai_stats = database.get_user_prepai_stats(user_id)
        if not profile:
            default_ds = profile_aggregator.calculate_devscore({}, {}, {}, prepai_stats)
            return {
                "status": "success",
                "devscore": default_ds["devscore"],
                "devscore_data": default_ds,
                "profile": None
            }

        devscore_breakdown = profile.get("devscore_breakdown", {})
        if devscore_breakdown and devscore_breakdown.get("devscore"):
            # Update prepai voice stats in breakdown if changed
            if prepai_stats and prepai_stats.get("voice_rating", 0) > 0:
                devscore_breakdown["platform_stats"]["prepai"] = prepai_stats
            return {
                "status": "success",
                "devscore": profile.get("devscore", 0),
                "devscore_data": devscore_breakdown,
                "profile": profile
            }

        # If profile exists but devscore not calculated yet
        lc_stats = profile.get("leetcode_stats") or (profile_aggregator.fetch_leetcode_stats(profile.get("leetcode_handle", "")) if profile.get("leetcode_handle") else {})
        cf_stats = profile.get("codeforces_stats") or (profile_aggregator.fetch_codeforces_stats(profile.get("codeforces_handle", "")) if profile.get("codeforces_handle") else {})
        gh_stats = profile.get("github_stats") or (profile_aggregator.fetch_github_stats(profile.get("github_url", "")) if profile.get("github_url") else {})

        devscore_data = profile_aggregator.calculate_devscore(lc_stats, cf_stats, gh_stats, prepai_stats)
        database.update_candidate_platform_stats(user_id, {
            "leetcode_handle": profile.get("leetcode_handle", ""),
            "leetcode_stats": lc_stats,
            "codeforces_handle": profile.get("codeforces_handle", ""),
            "codeforces_stats": cf_stats,
            "github_url": profile.get("github_url", ""),
            "github_stats": gh_stats,
            "devscore": devscore_data["devscore"],
            "devscore_breakdown": devscore_data
        })

        return {
            "status": "success",
            "devscore": devscore_data["devscore"],
            "devscore_data": devscore_data,
            "profile": profile
        }
    except Exception as e:
        print(f"Error fetching devscore: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =========================================================================
# RECRUITER & FOUNDER PORTAL ENDPOINTS
# =========================================================================

import recruiter_service

class RecruiterJobCreateRequest(BaseModel):
    recruiter_id: str = "default_recruiter"
    company_name: str
    role_title: str
    work_mode: str = "Remote"
    location: str = "Global / Remote"
    salary_range: str = "$130k - $170k"
    min_devscore: int = 700
    required_skills: List[str] = ["Python", "System Design"]
    experience_level: str = "Senior"
    description: str = ""

class ShortlistCandidateRequest(BaseModel):
    recruiter_id: str = "default_recruiter"
    candidate_id: str
    candidate_name: str
    job_id: int = 0
    stage: str = "Shortlisted"
    notes: str = ""

class StartupProfileRequest(BaseModel):
    user_id: str
    company_name: str
    founder_name: Optional[str] = ""
    founder_role: Optional[str] = "Founder / CTO"
    tagline: Optional[str] = ""
    stage: Optional[str] = "Seed"
    website_url: Optional[str] = ""
    industry: Optional[str] = "AI & DevTools"
    location: Optional[str] = "Remote"
    team_size: Optional[str] = "1-10"
    primary_tech_stack: Optional[List[str]] = []
    about: Optional[str] = ""
    logo_url: Optional[str] = ""

class SendAssessmentRequest(BaseModel):
    recruiter_id: str = "default_recruiter"
    candidate_id: str
    candidate_name: str
    role_title: str = "Software Engineer"
    problem_slug: str = "lru-cache-ttl"
    difficulty: str = "Medium"
    time_limit_minutes: int = 45

@app.get("/api/recruiter/startup-profile")
def get_startup_profile_endpoint(user_id: str):
    try:
        profile = database.get_startup_profile(user_id)
        return {
            "status": "success",
            "profile": profile
        }
    except Exception as e:
        print(f"Error getting startup profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recruiter/startup-profile")
def save_startup_profile_endpoint(req: StartupProfileRequest):
    try:
        profile = database.create_or_update_startup_profile(req.dict())
        return {
            "status": "success",
            "profile": profile
        }
    except Exception as e:
        print(f"Error saving startup profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recruiter/candidates")
def get_recruiter_candidates(
    query: str = "",
    min_devscore: int = 0,
    primary_stack: str = "All",
    tier: str = "All",
    min_resilience: float = 0.0
):
    try:
        candidates = recruiter_service.search_candidate_talent(
            query=query,
            min_devscore=min_devscore,
            primary_stack=primary_stack,
            tier=tier,
            min_resilience=min_resilience
        )
        return {
            "status": "success",
            "total_count": len(candidates),
            "candidates": candidates
        }
    except Exception as e:
        print(f"Error in recruiter candidate search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recruiter/jobs")
def list_recruiter_jobs(recruiter_id: Optional[str] = None):
    try:
        jobs = database.get_recruiter_jobs(recruiter_id)
        return {
            "status": "success",
            "jobs": jobs
        }
    except Exception as e:
        print(f"Error fetching recruiter jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recruiter/jobs")
def create_recruiter_job_endpoint(req: RecruiterJobCreateRequest):
    try:
        res = database.create_recruiter_job(req.dict())
        return {
            "status": "success",
            "job": res
        }
    except Exception as e:
        print(f"Error creating recruiter job: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recruiter/shortlist")
def shortlist_candidate_endpoint(req: ShortlistCandidateRequest):
    try:
        res = database.shortlist_candidate(req.dict())
        return {
            "status": "success",
            "shortlist": res
        }
    except Exception as e:
        print(f"Error shortlisting candidate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recruiter/shortlist")
def get_shortlisted_endpoint(recruiter_id: str = "default_recruiter"):
    try:
        shortlists = database.get_shortlisted_candidates(recruiter_id)
        return {
            "status": "success",
            "shortlists": shortlists
        }
    except Exception as e:
        print(f"Error fetching shortlists: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/recruiter/shortlist/{shortlist_id}")
def delete_shortlist_endpoint(shortlist_id: int):
    try:
        success = database.delete_shortlisted_candidate(shortlist_id)
        return {
            "status": "success",
            "deleted": success
        }
    except Exception as e:
        print(f"Error deleting shortlisted candidate: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recruiter/send-assessment")
def send_takehome_assessment_endpoint(req: SendAssessmentRequest):
    try:
        assessment = recruiter_service.dispatch_takehome_assessment(
            recruiter_id=req.recruiter_id,
            candidate_id=req.candidate_id,
            candidate_name=req.candidate_name,
            role_title=req.role_title,
            problem_slug=req.problem_slug,
            difficulty=req.difficulty,
            time_limit_minutes=req.time_limit_minutes
        )
        return {
            "status": "success",
            "assessment": assessment
        }
    except Exception as e:
        print(f"Error dispatching takehome assessment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recruiter/assessments")
def get_assessments_endpoint(recruiter_id: Optional[str] = None):
    try:
        assessments = database.get_takehome_assessments(recruiter_id)
        return {
            "status": "success",
            "assessments": assessments
        }
    except Exception as e:
        print(f"Error fetching assessments: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/recruiter/assessments/{assessment_id}")
def delete_assessment_endpoint(assessment_id: int):
    try:
        success = database.delete_takehome_assessment(assessment_id)
        return {
            "status": "success",
            "deleted": success
        }
    except Exception as e:
        print(f"Error deleting assessment: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/recruiter/candidate-resume/{candidate_id}")
def get_candidate_resume_endpoint(candidate_id: str):
    try:
        profile = database.get_candidate_profile(candidate_id)
        user = database.get_user_by_id(candidate_id)
        name = user.get("name") if user else f"Candidate #{candidate_id}"
        email = user.get("email") if user else ""
        
        resume_text = profile.get("resume_text", "") if profile else ""
        resume_name = profile.get("resume_name", "") if profile else ""
        
        if not resume_name:
            resume_name = f"{name.replace(' ', '_')}_Resume.txt"
            
        return {
            "status": "success",
            "candidate_id": candidate_id,
            "candidate_name": name,
            "candidate_email": email,
            "resume_name": resume_name,
            "resume_text": resume_text,
            "skills": profile.get("tech_stack_preferences", []) if profile else [],
            "github_url": profile.get("github_url", "") if profile else "",
            "linkedin_url": profile.get("linkedin_url", "") if profile else ""
        }
    except Exception as e:
        print(f"Error retrieving candidate resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# =========================================================================
# REAL-TIME TAKE-HOME ASSESSMENT CANDIDATE EXECUTION ENDPOINTS
# =========================================================================

from code_studio.catalog import get_problem_by_id, PROBLEMS
from code_studio.runner import run_code_sandbox
from code_studio.chaos import run_chaos_stress_test

class TakeHomeRunRequest(BaseModel):
    code: str
    language: str = "python"
    entry_point: Optional[str] = "solution"
    custom_inputs: Optional[List[Dict[str, Any]]] = None

class TakeHomeSubmitRequest(BaseModel):
    code: str
    language: str = "python"
    entry_point: Optional[str] = "solution"

@app.get("/api/takehome/{token}")
def get_takehome_challenge_details(token: str):
    assessment = database.get_takehome_assessment_by_token(token)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment session not found or link has expired.")
    
    raw_slug = assessment.get("problem_slug", "two-sum-sorted")
    
    slug_map = {
        "lru-cache-ttl": "in-memory-lru-ttl",
        "concurrent-lru-cache": "in-memory-lru-ttl",
        "rate-limiter": "rate-limiter-sliding-log",
        "trapping-rain-water": "container-with-most-water",
        "stream-median": "longest-substring-without-repeat",
        "graph-chaos": "number-of-islands-grid"
    }
    target_slug = slug_map.get(raw_slug, raw_slug)
    catalog_problem = get_problem_by_id(target_slug) or get_problem_by_id(raw_slug)
    
    if not catalog_problem:
        catalog_problem = get_problem_by_id("in-memory-lru-ttl") or get_problem_by_id("two-sum-sorted") or PROBLEMS[0]
    
    # Ensure starter code covers all standard languages
    starter_code = dict(catalog_problem.get("starter_code", {}))
    entry_point = catalog_problem.get("entry_point", "solution")
    
    if "python" not in starter_code:
        starter_code["python"] = f"def {entry_point}(*args, **kwargs):\n    # Write your production implementation here\n    pass\n"
    if "cpp" not in starter_code:
        starter_code["cpp"] = f"#include <iostream>\n#include <vector>\n\nclass Solution {{\npublic:\n    // Write your C++ implementation here\n}};\n"
    if "java" not in starter_code:
        starter_code["java"] = f"public class Solution {{\n    // Write your Java implementation here\n}}\n"
    if "go" not in starter_code:
        starter_code["go"] = f"package main\n\n// Write your Go implementation here\nfunc Solve() {{\n}}\n"
    if "typescript" not in starter_code:
        starter_code["typescript"] = f"export function {entry_point}(...args: any[]): any {{\n    // Write your TypeScript implementation here\n}}\n"
    if "javascript" not in starter_code:
        starter_code["javascript"] = f"function {entry_point}(...args) {{\n    // Write your JavaScript implementation here\n}}\n"

    enriched_problem = dict(catalog_problem)
    enriched_problem["starter_code"] = starter_code
    enriched_problem["supported_languages"] = ["python", "cpp", "java", "go", "typescript", "javascript"]

    return {
        "status": "success",
        "assessment": assessment,
        "problem": enriched_problem
    }

@app.post("/api/takehome/{token}/run")
def run_takehome_test(token: str, req: TakeHomeRunRequest):
    assessment = database.get_takehome_assessment_by_token(token)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment session not found.")
    
    raw_slug = assessment.get("problem_slug", "two-sum-sorted")
    slug_map = {
        "lru-cache-ttl": "in-memory-lru-ttl",
        "concurrent-lru-cache": "in-memory-lru-ttl",
        "rate-limiter": "rate-limiter-sliding-log",
        "trapping-rain-water": "container-with-most-water",
        "stream-median": "longest-substring-without-repeat",
        "graph-chaos": "number-of-islands-grid"
    }
    target_slug = slug_map.get(raw_slug, raw_slug)
    catalog_problem = get_problem_by_id(target_slug) or get_problem_by_id(raw_slug) or get_problem_by_id("in-memory-lru-ttl") or get_problem_by_id("two-sum-sorted")
    
    test_cases = (catalog_problem.get("test_cases") if catalog_problem else []) or [
        {"input": {"data": [2, 7, 11, 15]}, "expected": [0, 1]}
    ]
    
    entry_point = req.entry_point or (catalog_problem.get("entry_point") if catalog_problem else "solution")

    result = run_code_sandbox(
        language=req.language,
        code=req.code,
        entry_point=entry_point,
        test_cases=test_cases,
        timeout_seconds=5.0
    )
    return {
        "status": "success",
        "result": result
    }

@app.post("/api/takehome/{token}/submit")
def submit_takehome_assessment(token: str, req: TakeHomeSubmitRequest):
    assessment = database.get_takehome_assessment_by_token(token)
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment session not found.")
    
    raw_slug = assessment.get("problem_slug", "two-sum-sorted")
    slug_map = {
        "lru-cache-ttl": "in-memory-lru-ttl",
        "concurrent-lru-cache": "in-memory-lru-ttl",
        "rate-limiter": "rate-limiter-sliding-log",
        "trapping-rain-water": "container-with-most-water",
        "stream-median": "longest-substring-without-repeat",
        "graph-chaos": "number-of-islands-grid"
    }
    target_slug = slug_map.get(raw_slug, raw_slug)
    catalog_problem = get_problem_by_id(target_slug) or get_problem_by_id(raw_slug) or get_problem_by_id("in-memory-lru-ttl") or get_problem_by_id("two-sum-sorted")
    
    test_cases = (catalog_problem.get("test_cases") if catalog_problem else []) or [
        {"input": {"data": [2, 7, 11, 15]}, "expected": [0, 1]}
    ]
    entry_point = req.entry_point or (catalog_problem.get("entry_point") if catalog_problem else "solution")
    
    # 1. Run Standard Sandbox Tests
    run_res = run_code_sandbox(
        language=req.language,
        code=req.code,
        entry_point=entry_point,
        test_cases=test_cases,
        timeout_seconds=8.0
    )
    
    # 2. Run Adversarial Chaos Stress Tests
    chaos_res = run_chaos_stress_test(
        language=req.language,
        code=req.code,
        entry_point=entry_point,
        problem_title=assessment.get("problem_title", "Take-Home Challenge"),
        problem_description=catalog_problem.get("description", "") if catalog_problem else "",
        standard_test_cases=test_cases
    )
    
    # 3. Calculate Real DevScore and Resilience
    tests_passed = run_res.get("passed", 0)
    total_tests = max(1, run_res.get("total", len(test_cases)))
    base_accuracy = (tests_passed / total_tests)
    
    chaos_passed = chaos_res.get("chaos_passed", 0)
    chaos_total = max(1, chaos_res.get("chaos_total", 5))
    chaos_resilience_ratio = chaos_passed / chaos_total
    
    overall_score = int((base_accuracy * 600) + (chaos_resilience_ratio * 400))
    resilience_pct = int(chaos_resilience_ratio * 100)
    
    test_results_payload = {
        "sandbox_run": run_res,
        "chaos_stress": chaos_res,
        "submitted_code": req.code,
        "language": req.language,
        "tests_passed": tests_passed,
        "total_tests": total_tests,
        "chaos_passed": chaos_passed,
        "chaos_total": chaos_total,
        "overall_score": overall_score,
        "chaos_resilience": resilience_pct
    }
    
    # 4. Save to Database
    database.update_takehome_assessment_result(
        token=token,
        status="Completed",
        score=overall_score,
        chaos_resilience=resilience_pct,
        test_results=test_results_payload
    )
    
    return {
        "status": "success",
        "score": overall_score,
        "chaos_resilience": resilience_pct,
        "tests_passed": tests_passed,
        "total_tests": total_tests,
        "verdict": "Passed & Verified" if overall_score >= 650 else "Under Review",
        "completed_at": datetime.utcnow().isoformat()
    }

