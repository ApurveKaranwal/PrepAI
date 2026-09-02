import io
import re
import os
import zipfile
import requests
import json
import random
import cv2
import numpy as np
from fastapi import (
    BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timedelta, timezone
import pypdf
from dotenv import load_dotenv
import time
from groq import Groq

# Import our database layer and custom ML model
import database
from ml.evaluation.evaluation import InterviewMLModel
from config import GROQ_HEAVY_MODEL, GROQ_LIGHT_MODEL
from llm_client import call_llm, call_llm_json
from auth_deps import AuthUser, OrgContext, require_user, require_org_member, optional_user, role_at_least
import resume_analyser

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


# ---------------------------------------------------------------------------
# CORS
# An explicit allow-list. The previous configuration paired a `*` origin and a
# `https?://.*` regex with allow_credentials=True, which lets any site on the
# internet make credentialed calls against this API on a signed-in user's behalf.
# Set ALLOWED_ORIGINS in the environment for deployed frontends.
# ---------------------------------------------------------------------------
_DEFAULT_ORIGINS = (
    "http://localhost:3000,http://localhost:3001,http://localhost:3002,"
    "http://127.0.0.1:3000,http://127.0.0.1:3001,http://127.0.0.1:3002,"
    "https://prepai.apurve.xyz"
)
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
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
    role: Optional[str] = "candidate"

class SignInRequest(BaseModel):
    email: str
    password: str

class GoogleSignInRequest(BaseModel):
    email: str
    name: str
    uid: str
    role: Optional[str] = None

class UpdateRoleRequest(BaseModel):
    role: str

class PlatformSyncRequest(BaseModel):
    # user_id is accepted for backwards compatibility but ignored: the target
    # profile is always the authenticated caller's.
    user_id: Optional[str] = None
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

# =========================================================================
# USER AUTHENTICATION
# Opaque DB-backed bearer tokens. The raw token is returned exactly once at
# sign-in; only its SHA-256 digest is persisted, so a database leak cannot be
# replayed as a live session.
# =========================================================================

def _issue_session(user: dict, user_agent: str = "") -> dict:
    """Wraps a freshly authenticated user with a bearer token for the client."""
    session = database.create_auth_session(user["uid"], user_agent)
    if not session:
        raise HTTPException(status_code=500, detail="Could not start a session. Please try again.")
    return {
        "status": "success",
        "user": user,
        "session_token": session["session_token"],
        "expires_at": session["expires_at"],
    }


@app.post("/api/auth/signup")
def signup(req: SignUpRequest, user_agent: Optional[str] = Header(None)):
    try:
        user = database.create_user(req.email, req.password, req.name, req.role or "candidate")
        return _issue_session(user, user_agent or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error during signup: {e}")
        raise HTTPException(status_code=500, detail="Could not create your account. Please try again.")

@app.post("/api/auth/signin")
def signin(req: SignInRequest, user_agent: Optional[str] = Header(None)):
    user = database.verify_user(req.email, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _issue_session(user, user_agent or "")

@app.post("/api/auth/google")
def google_auth(req: GoogleSignInRequest, user_agent: Optional[str] = Header(None)):
    try:
        user = database.get_or_create_google_user(req.email, req.name, req.uid, req.role or "candidate")
        return _issue_session(user, user_agent or "")
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error during Google auth: {e}")
        raise HTTPException(status_code=500, detail="Could not sign you in. Please try again.")

@app.post("/api/auth/signout")
def signout(authorization: Optional[str] = Header(None)):
    """Revokes the presented token. Idempotent — always reports success."""
    token = ""
    if authorization:
        parts = authorization.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1].strip()
    if token:
        database.revoke_auth_session(token)
    return {"status": "success"}

@app.get("/api/auth/me")
def whoami(user: AuthUser = Depends(require_user)):
    """Lets the client validate a stored token on boot and learn its org, if any."""
    org = database.get_user_org(user.uid)
    return {
        "status": "success",
        "user": {"uid": user.uid, "email": user.email, "name": user.name, "role": user.role},
        "organization": (
            {"id": org["id"], "name": org["name"], "slug": org["slug"], "role": org["role"]}
            if org else None
        ),
    }

@app.patch("/api/auth/role")
def update_role(req: UpdateRoleRequest, user: AuthUser = Depends(require_user)):
    """Updates the caller's role (candidate or recruiter)."""
    try:
        result = database.update_user_role(user.uid, req.role)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Error updating role: {e}")
        raise HTTPException(status_code=500, detail="Could not update role. Please try again.")

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
        try:
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
        except Exception as parse_error:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not read this PDF. The file may be encrypted, "
                    "corrupted, or image-based (a scanned document)."
                ),
            )
        text_parts = []
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
        text = "\n".join(text_parts)

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail=(
                    "Could not extract any text from this PDF. The file may be "
                    "a scanned image. Try re-exporting with a text-based PDF."
                ),
            )

        if not (job_role or "").strip():
            raise HTTPException(status_code=400, detail="Please provide a target job role.")

        # Deterministic analysis + LLM narrative. If the LLM is unreachable
        # the report still comes back — just with `narrative_source: "template"`
        # and shorter qualitative text.
        report = resume_analyser.analyze_resume_full(
            resume_text=text,
            job_role=job_role.strip(),
            filename=resume.filename or "",
        )

        status = "success" if report.get("narrative_source") == "llm" else "partial"

        return {
            "status": status,
            "analysis": report,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error analyzing resume: {e}")
        raise HTTPException(status_code=500, detail="Resume analysis failed unexpectedly.")

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
async def sync_candidate_platforms(payload: PlatformSyncRequest, user: AuthUser = Depends(require_user)):
    # The target user comes from the bearer token, never from the request body —
    # otherwise anyone could overwrite another candidate's platform handles.
    user_id = user.uid
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
async def get_candidate_devscore(
    user_id: Optional[str] = None,
    auth_user: Optional[AuthUser] = Depends(optional_user),
):
    uid = (auth_user.uid if auth_user else None) or user_id or "anonymous"

    try:
        profile = database.get_candidate_profile(uid)
        prepai_stats = database.get_user_prepai_stats(uid)
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

        lc_stats = profile.get("leetcode_stats") or {}
        cf_stats = profile.get("codeforces_stats") or {}
        gh_stats = profile.get("github_stats") or {}
        devscore_data = profile_aggregator.calculate_devscore(lc_stats, cf_stats, gh_stats, prepai_stats)

        database.update_candidate_platform_stats(uid, {
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
        return {
            "status": "success",
            "devscore": 0,
            "devscore_data": {"devscore": 0, "tier": "Bronze", "overall_percentile": 0},
            "profile": None
        }


# =========================================================================
# HIRING ORGANIZATION, RECRUITER PORTAL & CANDIDATE CONSENT ENDPOINTS
# =========================================================================
# Two rules govern every handler below:
#   1. Identity comes from the bearer token, tenancy from `require_org_member`.
#      No handler reads a recruiter_id, user_id or org_id out of the request.
#   2. A candidate's contact details are only ever returned once that candidate
#      has accepted this organization's outreach.
# =========================================================================

import recruiter_service
import email_service


def _to_naive_utc(value) -> Optional[datetime]:
    """Normalizes a DB timestamp (datetime or ISO string) for comparison."""
    if not value:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OrgCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    website_url: Optional[str] = ""
    description: Optional[str] = ""

class OrgUpdateRequest(BaseModel):
    name: Optional[str] = None
    website_url: Optional[str] = None
    description: Optional[str] = None

class OrgInviteRequest(BaseModel):
    email: str
    role: str = "member"

class OrgInviteAcceptRequest(BaseModel):
    invite_token: str

class OrgMemberRoleRequest(BaseModel):
    role: str

class RecruiterJobCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=160)
    role_title: str = Field(min_length=1, max_length=160)
    work_mode: str = "Remote"
    location: str = ""
    salary_range: str = ""
    min_devscore: int = 0
    required_skills: List[str] = []
    experience_level: str = "Mid-Level"
    description: str = ""
    status: str = "Active"

class RecruiterJobUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    role_title: Optional[str] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    min_devscore: Optional[int] = None
    required_skills: Optional[List[str]] = None
    experience_level: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class ShortlistCandidateRequest(BaseModel):
    candidate_id: str
    job_id: int = 0
    stage: str = "Sourced"
    notes: str = ""

class ShortlistUpdateRequest(BaseModel):
    stage: Optional[str] = None
    notes: Optional[str] = None
    job_id: Optional[int] = None

class StartupProfileRequest(BaseModel):
    company_name: str
    founder_name: Optional[str] = ""
    founder_role: Optional[str] = ""
    tagline: Optional[str] = ""
    stage: Optional[str] = ""
    website_url: Optional[str] = ""
    industry: Optional[str] = ""
    location: Optional[str] = ""
    team_size: Optional[str] = ""
    primary_tech_stack: Optional[List[str]] = []
    about: Optional[str] = ""
    logo_url: Optional[str] = ""

class SendAssessmentRequest(BaseModel):
    candidate_id: str
    job_id: int = 0
    role_title: Optional[str] = None
    problem_slug: str = "lru-cache-ttl"
    difficulty: str = "Medium"
    time_limit_minutes: int = 60

class OutreachRequest(BaseModel):
    candidate_id: str
    job_id: int = 0
    message: str = ""

class OpportunityOptInRequest(BaseModel):
    open_to_opportunities: bool
    opportunity_preferences: Optional[str] = None

class OutreachResponseRequest(BaseModel):
    accept: bool


# -------------------------------------------------------------------------
# Organization lifecycle
# -------------------------------------------------------------------------

@app.get("/api/org")
def get_my_org(user: AuthUser = Depends(require_user)):
    """
    Returns the caller's organization, or null. The frontend uses a null result
    to route to the create-organization screen instead of the portal.
    """
    org = database.get_user_org(user.uid)
    if not org:
        return {"status": "success", "organization": None, "members": [], "pending_invites": []}
    members = database.get_org_members(org["id"])
    invites = (
        database.get_pending_org_invites(org["id"])
        if database.role_at_least(org["role"], "admin") else []
    )
    return {
        "status": "success",
        "organization": org,
        "members": members,
        "pending_invites": invites,
    }


@app.post("/api/org")
def create_org(req: OrgCreateRequest, user: AuthUser = Depends(require_user)):
    existing = database.get_user_org(user.uid)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"You already belong to {existing['name']}. Leave it before creating another organization.",
        )
    try:
        org = database.create_organization(
            name=req.name, founder_user_id=user.uid,
            website_url=req.website_url or "", description=req.description or "",
        )
    except Exception as e:
        print(f"Error creating organization: {e}")
        raise HTTPException(status_code=500, detail="Could not create the organization. Please try again.")
    return {"status": "success", "organization": org}


@app.patch("/api/org")
def update_org(req: OrgUpdateRequest, org: OrgContext = Depends(require_org_member("admin"))):
    updated = database.update_organization(org.org_id, req.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return {"status": "success", "organization": updated}


@app.post("/api/org/invite")
def invite_teammate(
    req: OrgInviteRequest,
    background_tasks: BackgroundTasks,
    org: OrgContext = Depends(require_org_member("admin")),
):
    email = (req.email or "").strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if req.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'.")

    invite = database.create_org_invite(org.org_id, email, req.role, org.uid)
    if not invite:
        raise HTTPException(status_code=500, detail="Could not create the invitation. Please try again.")

    accept_base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    accept_url = f"{accept_base}/join?invite={invite['invite_token']}"
    background_tasks.add_task(
        email_service.send_org_invite_email,
        org_name=org.org_name, inviter_name=org.user.name or org.user.email,
        role=req.role, recipient_email=email, accept_url=accept_url,
    )
    # The raw invite token goes to the invitee by email and is echoed here so an
    # admin can copy the link manually when SMTP is not configured.
    return {
        "status": "success",
        "invite": {
            "id": invite["id"], "email": invite["email"], "role": invite["role"],
            "expires_at": invite["expires_at"], "accept_url": accept_url,
        },
    }


def _to_naive_utc(value) -> Optional[datetime]:
    """Normalizes a DB timestamp (datetime or ISO string) for comparison."""
    if not value:
        return None
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    return None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OrgCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    website_url: Optional[str] = ""
    description: Optional[str] = ""

class OrgUpdateRequest(BaseModel):
    name: Optional[str] = None
    website_url: Optional[str] = None
    description: Optional[str] = None

class OrgInviteRequest(BaseModel):
    email: str
    role: str = "member"

class OrgInviteAcceptRequest(BaseModel):
    invite_token: str

class OrgMemberRoleRequest(BaseModel):
    role: str

class RecruiterJobCreateRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=160)
    role_title: str = Field(min_length=1, max_length=160)
    work_mode: str = "Remote"
    location: str = ""
    salary_range: str = ""
    min_devscore: int = 0
    required_skills: List[str] = []
    experience_level: str = "Mid-Level"
    description: str = ""
    status: str = "Active"

class RecruiterJobUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    role_title: Optional[str] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    salary_range: Optional[str] = None
    min_devscore: Optional[int] = None
    required_skills: Optional[List[str]] = None
    experience_level: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class ShortlistCandidateRequest(BaseModel):
    candidate_id: str
    job_id: int = 0
    stage: str = "Sourced"
    notes: str = ""

class ShortlistUpdateRequest(BaseModel):
    stage: Optional[str] = None
    notes: Optional[str] = None
    job_id: Optional[int] = None

class StartupProfileRequest(BaseModel):
    company_name: str
    founder_name: Optional[str] = ""
    founder_role: Optional[str] = ""
    tagline: Optional[str] = ""
    stage: Optional[str] = ""
    website_url: Optional[str] = ""
    industry: Optional[str] = ""
    location: Optional[str] = ""
    team_size: Optional[str] = ""
    primary_tech_stack: Optional[List[str]] = []
    about: Optional[str] = ""
    logo_url: Optional[str] = ""

class SendAssessmentRequest(BaseModel):
    candidate_id: str
    job_id: int = 0
    role_title: Optional[str] = None
    problem_slug: str = "lru-cache-ttl"
    difficulty: str = "Medium"
    time_limit_minutes: int = 60

class OutreachRequest(BaseModel):
    candidate_id: str
    job_id: int = 0
    message: str = ""

class OpportunityOptInRequest(BaseModel):
    open_to_opportunities: bool
    opportunity_preferences: Optional[str] = None

class OutreachResponseRequest(BaseModel):
    accept: bool


# -------------------------------------------------------------------------
# Organization lifecycle
# -------------------------------------------------------------------------

@app.get("/api/org")
def get_my_org(user: AuthUser = Depends(require_user)):
    """
    Returns the caller's organization, or null. The frontend uses a null result
    to route to the create-organization screen instead of the portal.
    """
    org = database.get_user_org(user.uid)
    if not org:
        return {"status": "success", "organization": None, "members": [], "pending_invites": []}
    members = database.get_org_members(org["id"])
    invites = (
        database.get_pending_org_invites(org["id"])
        if database.role_at_least(org["role"], "admin") else []
    )
    return {
        "status": "success",
        "organization": org,
        "members": members,
        "pending_invites": invites,
    }


@app.post("/api/org")
def create_org(req: OrgCreateRequest, user: AuthUser = Depends(require_user)):
    existing = database.get_user_org(user.uid)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"You already belong to {existing['name']}. Leave it before creating another organization.",
        )
    try:
        org = database.create_organization(
            name=req.name, founder_user_id=user.uid,
            website_url=req.website_url or "", description=req.description or "",
        )
    except Exception as e:
        print(f"Error creating organization: {e}")
        raise HTTPException(status_code=500, detail="Could not create the organization. Please try again.")
    return {"status": "success", "organization": org}


@app.patch("/api/org")
def update_org(req: OrgUpdateRequest, org: OrgContext = Depends(require_org_member("admin"))):
    updated = database.update_organization(org.org_id, req.model_dump(exclude_none=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return {"status": "success", "organization": updated}


@app.post("/api/org/invite")
def invite_teammate(
    req: OrgInviteRequest,
    background_tasks: BackgroundTasks,
    org: OrgContext = Depends(require_org_member("admin")),
):
    email = (req.email or "").strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if req.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="Role must be 'admin' or 'member'.")

    invite = database.create_org_invite(org.org_id, email, req.role, org.uid)
    if not invite:
        raise HTTPException(status_code=500, detail="Could not create the invitation. Please try again.")

    accept_base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    accept_url = f"{accept_base}/join?invite={invite['invite_token']}"
    background_tasks.add_task(
        email_service.send_org_invite_email,
        org_name=org.org_name, inviter_name=org.user.name or org.user.email,
        role=req.role, recipient_email=email, accept_url=accept_url,
    )
    # The raw invite token goes to the invitee by email and is echoed here so an
    # admin can copy the link manually when SMTP is not configured.
    return {
        "status": "success",
        "invite": {
            "id": invite["id"], "email": invite["email"], "role": invite["role"],
            "expires_at": invite["expires_at"], "accept_url": accept_url,
        },
    }


@app.get("/api/org/invites")
def list_org_invites(org: OrgContext = Depends(require_org_member("admin"))):
    return {"status": "success", "invites": database.get_pending_org_invites(org.org_id)}


@app.post("/api/org/invite/accept")
def accept_invite(req: OrgInviteAcceptRequest, user: AuthUser = Depends(require_user)):
    result = database.accept_org_invite(req.invite_token, user.uid, user.email)
    reason = result.get("error") if result else "server"
    if reason:
        messages = {
            "invalid": (404, "That invitation link is not valid."),
            "used": (409, "That invitation has already been used."),
            "expired": (410, "That invitation has expired. Ask for a new one."),
            "email_mismatch": (403, "That invitation was sent to a different email address."),
            "already_member": (409, "You already belong to an organization."),
            "server": (500, "Could not accept the invitation. Please try again."),
        }
        status_code, detail = messages.get(reason, (400, "Could not accept the invitation."))
        raise HTTPException(status_code=status_code, detail=detail)
    return {"status": "success", "organization": result}


@app.patch("/api/org/members/{member_user_id}")
def change_member_role(
    member_user_id: str,
    req: OrgMemberRoleRequest,
    org: OrgContext = Depends(require_org_member("owner")),
):
    if req.role not in database.ORG_ROLES:
        raise HTTPException(status_code=400, detail="Unknown role.")
    if str(member_user_id) == str(org.uid):
        raise HTTPException(status_code=400, detail="You cannot change your own role.")
    if not database.update_org_member_role(org.org_id, member_user_id, req.role):
        raise HTTPException(status_code=404, detail="That teammate is not part of your organization.")
    return {"status": "success", "members": database.get_org_members(org.org_id)}


@app.delete("/api/org/members/{member_user_id}")
def remove_member(member_user_id: str, org: OrgContext = Depends(require_org_member("owner"))):
    if str(member_user_id) == str(org.uid):
        raise HTTPException(status_code=400, detail="You cannot remove yourself. Transfer ownership first.")
    if not database.remove_org_member(org.org_id, member_user_id):
        raise HTTPException(status_code=404, detail="That teammate is not part of your organization, or is the owner.")
    return {"status": "success", "members": database.get_org_members(org.org_id)}


# -------------------------------------------------------------------------
# Company branding (shared by the whole org, stored against the founder)
# -------------------------------------------------------------------------

@app.get("/api/recruiter/startup-profile")
def get_startup_profile_endpoint(user: AuthUser = Depends(require_user)):
    """
    One company profile per organization, so every teammate sees and edits the
    same branding. If user has an organization, guarantees the startup profile
    is persisted in the database.
    """
    org = database.get_user_org(user.uid)
    if not org:
        profile = database.get_startup_profile(user.uid)
        return {"status": "success", "profile": profile, "role": "owner"}
    
    org_id = org.get("id") or org.get("org_id")
    record = database.get_organization(org_id) or {} if org_id else {}
    owner_id = record.get("founder_user_id") or user.uid
    profile = database.get_startup_profile(owner_id)
    
    if not profile:
        profile_data = {
            "user_id": owner_id,
            "company_name": org.get("name") or "My Startup",
            "founder_name": user.name or "Founder",
            "founder_role": "Founder & CTO",
            "tagline": record.get("description") or "Building next-generation software.",
            "stage": "Seed",
            "website_url": record.get("website_url") or "",
            "industry": "AI & Machine Learning",
            "location": "Remote",
            "team_size": "1-10",
            "primary_tech_stack": ["Python", "FastAPI", "React", "PostgreSQL"],
            "about": record.get("description") or "Engineering-driven product team."
        }
        profile = database.create_or_update_startup_profile(profile_data) or profile_data

    return {"status": "success", "profile": profile, "role": org.get("role", "owner")}


@app.post("/api/recruiter/startup-profile")
def save_startup_profile_endpoint(
    req: StartupProfileRequest,
    user: AuthUser = Depends(require_user),
):
    org = database.get_user_org(user.uid)
    if not org:
        # First-time onboarding: create their organization automatically
        try:
            new_org = database.create_organization(
                name=req.company_name or f"{user.name or 'My'} Startup",
                founder_user_id=user.uid,
                website_url=req.website_url or "",
                description=req.about or "",
            )
            org = database.get_user_org(user.uid) or new_org
        except Exception as e:
            print(f"Error auto-creating organization for startup profile: {e}")
            raise HTTPException(status_code=500, detail="Could not initialize your company organization. Please try again.")
    elif not database.role_at_least(org.get("role"), "admin"):
        raise HTTPException(status_code=403, detail="This action requires the admin role or higher.")

    org_id = org.get("id") or org.get("org_id")
    record = database.get_organization(org_id) or {} if org_id else {}
    owner_id = record.get("founder_user_id") or user.uid
    payload = req.model_dump()
    payload["user_id"] = owner_id
    try:
        profile = database.create_or_update_startup_profile(payload)
        if org_id:
            database.update_organization(org_id, {
                "name": req.company_name or org.get("name"),
                "website_url": req.website_url,
            })
        return {"status": "success", "profile": profile, "organization": org}
    except Exception as e:
        print(f"Error saving startup profile: {e}")
        raise HTTPException(status_code=500, detail="Could not save the company profile. Please try again.")


# -------------------------------------------------------------------------
# Talent search
# -------------------------------------------------------------------------

@app.get("/api/recruiter/candidates")
def get_recruiter_candidates(
    org: OrgContext = Depends(require_org_member()),
    query: str = "",
    min_devscore: int = 0,
    primary_stack: str = "All",
    tier: str = "All",
    limit: int = Query(20, ge=1, le=recruiter_service.MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
):
    try:
        page = recruiter_service.search_candidate_talent(
            org_id=org.org_id, query=query, min_devscore=min_devscore,
            primary_stack=primary_stack, tier=tier, limit=limit, offset=offset,
        )
        if page.get("error"):
            raise HTTPException(status_code=500, detail="Talent search is temporarily unavailable.")
        return {
            "status": "success",
            "candidates": page["items"],
            "total_count": page["total"],
            "has_more": page["has_more"],
            "limit": limit,
            "offset": offset,
        }
    except Exception as e:
        print(f"Error in recruiter candidate search: {e}")
        raise HTTPException(status_code=500, detail="Talent search is temporarily unavailable.")


@app.get("/api/recruiter/candidates/{candidate_id}")
def get_recruiter_candidate_detail(candidate_id: str, org: OrgContext = Depends(require_org_member())):
    candidate = recruiter_service.get_candidate_detail(org.org_id, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="That candidate is not available for sourcing.")
    return {"status": "success", "candidate": candidate}


@app.get("/api/recruiter/candidate-resume/{candidate_id}")
def get_candidate_resume_endpoint(candidate_id: str, org: OrgContext = Depends(require_org_member())):
    """
    Résumé and contact details. Gated on the candidate having accepted this
    organization's outreach — a 403 here is the consent model working, not a bug.
    """
    candidate = recruiter_service.get_candidate_detail(org.org_id, candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="That candidate is not available for sourcing.")
    if not candidate.get("contact_unlocked"):
        raise HTTPException(
            status_code=403,
            detail="This candidate has not accepted your contact request yet. Send outreach to request their résumé and contact details.",
        )
    return {
        "status": "success",
        "candidate_id": candidate_id,
        "candidate_name": candidate.get("name") or candidate.get("display_name"),
        "candidate_email": candidate.get("email") or "",
        "resume_name": candidate.get("resume_name") or "",
        "resume_text": candidate.get("resume_text") or "",
        "skills": candidate.get("primary_stack") or [],
        "github_url": candidate.get("github_url") or "",
        "linkedin_url": candidate.get("linkedin_url") or "",
        "portfolio_url": candidate.get("portfolio_url") or "",
    }


# -------------------------------------------------------------------------
# Requisitions
# -------------------------------------------------------------------------

@app.get("/api/recruiter/jobs")
def list_recruiter_jobs(org: OrgContext = Depends(require_org_member())):
    return {"status": "success", "jobs": database.get_recruiter_jobs(org.org_id)}


@app.post("/api/recruiter/jobs")
def create_recruiter_job_endpoint(
    req: RecruiterJobCreateRequest,
    org: OrgContext = Depends(require_org_member()),
):
    job = database.create_recruiter_job(org.org_id, org.uid, req.model_dump())
    if not job:
        raise HTTPException(status_code=500, detail="Could not post the requisition. Please try again.")
    return {"status": "success", "job": job}


@app.patch("/api/recruiter/jobs/{job_id}")
def update_recruiter_job_endpoint(
    job_id: int,
    req: RecruiterJobUpdateRequest,
    org: OrgContext = Depends(require_org_member()),
):
    job = database.update_recruiter_job(org.org_id, job_id, req.model_dump(exclude_none=True))
    if not job:
        raise HTTPException(status_code=404, detail="Requisition not found.")
    return {"status": "success", "job": job}


@app.delete("/api/recruiter/jobs/{job_id}")
def delete_recruiter_job_endpoint(job_id: int, org: OrgContext = Depends(require_org_member("admin"))):
    if not database.delete_recruiter_job(org.org_id, job_id):
        raise HTTPException(status_code=404, detail="Requisition not found.")
    return {"status": "success", "deleted": True}


# -------------------------------------------------------------------------
# Pipeline
# -------------------------------------------------------------------------

@app.get("/api/recruiter/pipeline-stages")
def list_pipeline_stages(org: OrgContext = Depends(require_org_member())):
    return {"status": "success", "stages": list(database.PIPELINE_STAGES)}


@app.post("/api/recruiter/shortlist")
def shortlist_candidate_endpoint(
    req: ShortlistCandidateRequest,
    org: OrgContext = Depends(require_org_member()),
):
    if req.stage not in database.PIPELINE_STAGES:
        raise HTTPException(status_code=400, detail=f"Stage must be one of: {', '.join(database.PIPELINE_STAGES)}.")
    candidate = recruiter_service.get_candidate_detail(org.org_id, req.candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="That candidate is not available for sourcing.")
    if req.job_id and not database.get_recruiter_job(org.org_id, req.job_id):
        raise HTTPException(status_code=404, detail="That requisition does not exist.")

    payload = req.model_dump()
    # The stored label follows the consent gate: an anonymized handle until the
    # candidate accepts, so the pipeline never becomes a PII side channel.
    payload["candidate_name"] = candidate.get("name") or candidate.get("display_name")
    result = database.shortlist_candidate(org.org_id, org.uid, payload)
    if not result:
        raise HTTPException(status_code=500, detail="Could not add the candidate to your pipeline.")
    return {"status": "success", "shortlist": result}


@app.get("/api/recruiter/shortlist")
def get_shortlisted_endpoint(org: OrgContext = Depends(require_org_member())):
    return {
        "status": "success",
        "shortlists": database.get_shortlisted_candidates(org.org_id),
        "stages": list(database.PIPELINE_STAGES),
    }


@app.patch("/api/recruiter/shortlist/{shortlist_id}")
def update_shortlist_endpoint(
    shortlist_id: int,
    req: ShortlistUpdateRequest,
    org: OrgContext = Depends(require_org_member()),
):
    if req.job_id:
        if not database.get_recruiter_job(org.org_id, req.job_id):
            raise HTTPException(status_code=404, detail="That requisition does not exist.")
    result = database.update_shortlist_stage(
        org_id=org.org_id, shortlist_id=shortlist_id, actor_user_id=org.uid,
        stage=req.stage, notes=req.notes, job_id=req.job_id,
    )
    reason = result.get("error")
    if reason:
        messages = {
            "invalid_stage": (400, f"Stage must be one of: {', '.join(database.PIPELINE_STAGES)}."),
            "not_found": (404, "That pipeline entry does not exist."),
            "no_changes": (400, "Nothing to update."),
            "server": (500, "Could not update the pipeline. Please try again."),
        }
        status_code, detail = messages.get(reason, (400, "Could not update the pipeline."))
        raise HTTPException(status_code=status_code, detail=detail)

    # Notify the candidate about their pipeline stage change
    candidate_id = result.get("candidate_id")
    from_stage = result.get("from_stage")
    to_stage = result.get("stage")
    if candidate_id and from_stage and to_stage and from_stage != to_stage:
        # Get org name for the notification
        org_info = database.get_organization(org.org_id)
        org_name = org_info.get("name", "the company") if org_info else "the company"

        # Get job title if associated with a requisition
        job_title = ""
        if req.job_id:
            job = database.get_recruiter_job(org.org_id, req.job_id)
            if job:
                job_title = f" for {job.get('role_title', 'the role')}"

        notification_title = f"Moved to {to_stage} stage"
        notification_message = f"{org_name} has advanced your application{job_title} from {from_stage} to {to_stage}."
        if req.notes:
            notification_message += f" Note: {req.notes}"

        database.create_candidate_notification(
            user_id=candidate_id,
            org_id=org.org_id,
            org_name=org_name,
            title=notification_title,
            message=notification_message,
            notification_type="pipeline_update",
            related_id=shortlist_id,
            related_type="shortlist",
        )

    return {"status": "success", "shortlist": result}


@app.get("/api/recruiter/shortlist/{shortlist_id}/events")
def get_shortlist_events_endpoint(shortlist_id: int, org: OrgContext = Depends(require_org_member())):
    return {"status": "success", "events": database.get_shortlist_events(org.org_id, shortlist_id)}


@app.delete("/api/recruiter/shortlist/{shortlist_id}")
def delete_shortlist_endpoint(shortlist_id: int, org: OrgContext = Depends(require_org_member())):
    if not database.delete_shortlisted_candidate(org.org_id, shortlist_id):
        raise HTTPException(status_code=404, detail="That pipeline entry does not exist.")
    return {"status": "success", "deleted": True}


# -------------------------------------------------------------------------
# Outreach (the consent handshake)
# -------------------------------------------------------------------------

@app.post("/api/recruiter/outreach")
def send_outreach_endpoint(
    req: OutreachRequest,
    background_tasks: BackgroundTasks,
    org: OrgContext = Depends(require_org_member()),
):
    candidate = recruiter_service.get_candidate_detail(org.org_id, req.candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="That candidate is not available for sourcing.")

    result = database.create_outreach_request(
        org_id=org.org_id, candidate_user_id=req.candidate_id,
        job_id=req.job_id, message=req.message, sent_by=org.uid,
    )
    reason = result.get("error")
    if reason == "not_open_to_opportunities":
        raise HTTPException(status_code=409, detail="This candidate is no longer open to opportunities.")
    if reason:
        raise HTTPException(status_code=500, detail="Could not send the request. Please try again.")

    # Notify the candidate at their real address without exposing it to the
    # recruiter — the send happens server-side from the DB row.
    candidate_user = database.get_user_by_id(req.candidate_id)
    job = database.get_recruiter_job(org.org_id, req.job_id) if req.job_id else None
    role_suffix = f" for {job.get('role_title', 'a role')}" if job else ""

    # Create candidate in-app notification
    database.create_candidate_notification(
        user_id=str(req.candidate_id),
        org_id=org.org_id,
        org_name=org.org_name,
        title=f"New recruiter message from {org.org_name}",
        message=f"{org.org_name} has requested contact{role_suffix}: \"{req.message}\"" if req.message else f"{org.org_name} has requested contact{role_suffix}.",
        notification_type="outreach",
        related_id=result.get("id"),
        related_type="outreach",
    )

    if candidate_user and candidate_user.get("email"):
        inbox_base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
        background_tasks.add_task(
            email_service.send_outreach_notification_email,
            candidate_email=candidate_user["email"], org_name=org.org_name,
            role_title=(job or {}).get("role_title", ""), message=req.message or "",
            inbox_url=f"{inbox_base}/?tab=career-agent",
        )
    return {"status": "success", "outreach": result}


@app.get("/api/recruiter/outreach")
def list_outreach_endpoint(org: OrgContext = Depends(require_org_member())):
    return {"status": "success", "outreach": database.get_org_outreach(org.org_id)}


# -------------------------------------------------------------------------
# Take-home assessments (recruiter side)
# -------------------------------------------------------------------------

@app.get("/api/recruiter/assessment-problems")
def list_assessment_problems(org: OrgContext = Depends(require_org_member())):
    return {
        "status": "success",
        "problems": [
            {"slug": slug, "title": title}
            for slug, title in recruiter_service.TAKEHOME_PROBLEMS.items()
        ],
    }


@app.post("/api/recruiter/send-assessment")
def send_takehome_assessment_endpoint(
    req: SendAssessmentRequest,
    background_tasks: BackgroundTasks,
    org: OrgContext = Depends(require_org_member()),
):
    """
    Dispatches a take-home. Requires the candidate to have accepted outreach —
    the invite has to reach a real inbox, and this platform will not hand a
    recruiter an email address the candidate has not agreed to share.
    """
    if req.problem_slug not in recruiter_service.TAKEHOME_PROBLEMS:
        raise HTTPException(status_code=400, detail="Unknown assessment problem.")
    if not 15 <= req.time_limit_minutes <= 240:
        raise HTTPException(status_code=400, detail="Time limit must be between 15 and 240 minutes.")

    candidate = recruiter_service.get_candidate_detail(org.org_id, req.candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="That candidate is not available for sourcing.")
    if not candidate.get("contact_unlocked") or not candidate.get("email"):
        raise HTTPException(
            status_code=403,
            detail="Send an outreach request first. You can invite this candidate to an assessment once they accept.",
        )

    job = database.get_recruiter_job(org.org_id, req.job_id) if req.job_id else None
    if req.job_id and not job:
        raise HTTPException(status_code=404, detail="That requisition does not exist.")
    role_title = req.role_title or (job or {}).get("role_title") or candidate.get("role") or "Software Engineer"

    assessment = recruiter_service.dispatch_takehome_assessment(
        org_id=org.org_id, sent_by=org.uid, candidate_id=req.candidate_id,
        candidate_name=candidate.get("name") or "", candidate_email=candidate.get("email") or "",
        role_title=role_title, job_id=req.job_id, problem_slug=req.problem_slug,
        difficulty=req.difficulty, time_limit_minutes=req.time_limit_minutes,
    )
    if not assessment:
        raise HTTPException(status_code=500, detail="Could not create the assessment. Please try again.")

    token = assessment["token"]
    background_tasks.add_task(
        _deliver_takehome_invite,
        token=token, candidate_name=assessment["candidate_name"],
        candidate_email=assessment["candidate_email"], company=org.org_name,
        role_title=role_title, problem_title=assessment["problem_title"],
        difficulty=assessment["difficulty"], time_limit_minutes=assessment["time_limit_minutes"],
        expires_at=assessment["expires_at"],
    )

    # The raw token never leaves the server for a recruiter — whoever holds it
    # can sit the test. Move the candidate into the Assessment stage instead.
    shortlist_result = database.shortlist_candidate(org.org_id, org.uid, {
        "candidate_id": req.candidate_id,
        "candidate_name": candidate.get("name") or candidate.get("display_name"),
        "job_id": req.job_id, "stage": "Assessment",
        "notes": f"Assessment sent: {assessment['problem_title']}",
    })

    # Notify candidate about the assessment
    database.create_candidate_notification(
        user_id=req.candidate_id,
        org_id=org.org_id,
        org_name=org.org_name,
        title=f"Take-home assessment sent: {role_title}",
        message=f"You've been sent a take-home assessment from {org.org_name}: \"{assessment['problem_title']}\" ({assessment['difficulty']}, {assessment['time_limit_minutes']} minutes). Check your email for the private link.",
        notification_type="assessment_sent",
        related_id=assessment["id"],
        related_type="takehome_assessment",
    )

    return {
        "status": "success",
        "assessment": {
            "id": assessment["id"], "candidate_id": req.candidate_id,
            "candidate_name": assessment["candidate_name"], "role_title": role_title,
            "problem_title": assessment["problem_title"], "difficulty": assessment["difficulty"],
            "time_limit_minutes": assessment["time_limit_minutes"],
            "status": "Sent", "expires_at": assessment["expires_at"],
        },
        "shortlist_id": shortlist_result.get("id") if shortlist_result else None,
    }


def _deliver_takehome_invite(token: str, candidate_name: str, candidate_email: str,
                             company: str, role_title: str, problem_title: str,
                             difficulty: str, time_limit_minutes: int, expires_at: str):
    """Background task: email the invite, then record that it went out."""
    result = email_service.send_takehome_invite_email(
        candidate_name=candidate_name, candidate_email=candidate_email, company=company,
        role_title=role_title, problem_title=problem_title, difficulty=difficulty,
        time_limit_minutes=time_limit_minutes,
        invite_url=recruiter_service.build_invite_url(token), expires_at=expires_at,
    )
    if result.get("email_sent"):
        database.mark_takehome_invite_sent(token)


@app.get("/api/recruiter/assessments")
def get_assessments_endpoint(org: OrgContext = Depends(require_org_member())):
    return {"status": "success", "assessments": database.get_takehome_assessments(org.org_id)}


@app.post("/api/recruiter/assessments/{assessment_id}/resend")
def resend_assessment_endpoint(
    assessment_id: int,
    background_tasks: BackgroundTasks,
    org: OrgContext = Depends(require_org_member()),
):
    record = database.get_assessment_for_resend(org.org_id, assessment_id)
    if not record:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    if record.get("submitted_at"):
        raise HTTPException(status_code=409, detail="This candidate has already submitted.")
    if not record.get("candidate_email"):
        raise HTTPException(status_code=409, detail="No email address on file for this candidate.")
    expires_at = _to_naive_utc(record.get("expires_at"))
    if expires_at and expires_at < _utcnow():
        raise HTTPException(status_code=410, detail="This assessment link has expired. Send a new assessment instead.")

    background_tasks.add_task(
        _deliver_takehome_invite,
        token=record["token"], candidate_name=record.get("candidate_name") or "",
        candidate_email=record["candidate_email"], company=org.org_name,
        role_title=record.get("role_title") or "", problem_title=record.get("problem_title") or "",
        difficulty=record.get("difficulty") or "Medium",
        time_limit_minutes=record.get("time_limit_minutes") or 60,
        expires_at=str(record.get("expires_at") or ""),
    )
    return {"status": "success", "resent": True}


@app.delete("/api/recruiter/assessments/{assessment_id}")
def delete_assessment_endpoint(assessment_id: int, org: OrgContext = Depends(require_org_member())):
    if not database.delete_takehome_assessment(org.org_id, assessment_id):
        raise HTTPException(status_code=404, detail="Assessment not found.")
    return {"status": "success", "deleted": True}


# -------------------------------------------------------------------------
# Candidate side of the consent model
# -------------------------------------------------------------------------

@app.get("/api/candidate/opportunities")
def get_opportunity_optin(user: AuthUser = Depends(require_user)):
    return {"status": "success", **database.get_candidate_opportunity_status(user.uid)}


@app.patch("/api/candidate/opportunities")
def set_opportunity_optin(req: OpportunityOptInRequest, user: AuthUser = Depends(require_user)):
    result = database.set_candidate_opportunity_optin(
        user.uid, req.open_to_opportunities, req.opportunity_preferences,
    )
    if result is None:
        raise HTTPException(status_code=500, detail="Could not save your preference. Please try again.")
    return {"status": "success", **result}


@app.get("/api/candidate/outreach")
def list_candidate_outreach(user_id: str = "", user: Optional[AuthUser] = Depends(optional_user)):
    target_uid = user.uid if user else (user_id or "")
    if not target_uid:
        return {"status": "success", "outreach": []}
    return {"status": "success", "outreach": database.get_candidate_outreach(target_uid)}


@app.post("/api/candidate/outreach/{outreach_id}/respond")
def respond_candidate_outreach(
    outreach_id: int,
    req: OutreachResponseRequest,
    user_id: str = "",
    user: Optional[AuthUser] = Depends(optional_user),
):
    target_uid = user.uid if user else (user_id or "")
    if not target_uid:
        raise HTTPException(status_code=401, detail="Authentication required.")
    result = database.respond_to_outreach(outreach_id, target_uid, req.accept)
    reason = result.get("error")
    if reason == "not_found_or_answered":
        raise HTTPException(status_code=404, detail="That request no longer needs a response.")
    if reason:
        raise HTTPException(status_code=500, detail="Could not record your response. Please try again.")
    return {"status": "success", "outreach": result}



# =========================================================================
# REAL-TIME TAKE-HOME ASSESSMENT CANDIDATE EXECUTION ENDPOINTS
# =========================================================================
# The token in the URL is the candidate's only credential. Every handler here
# re-validates it against expiry and prior submission, and returns only the
# fields the candidate is allowed to see — never the recruiter id, the score of
# a previous attempt, or the hidden test expectations.
# =========================================================================

from code_studio.catalog import get_problem_by_id, PROBLEMS
from code_studio.runner import run_code_sandbox
from code_studio.chaos import run_chaos_stress_test

# Legacy assessment slugs mapped onto the current catalog ids.
PROBLEM_SLUG_MAP = {
    "lru-cache-ttl": "in-memory-lru-ttl",
    "concurrent-lru-cache": "in-memory-lru-ttl",
    "rate-limiter": "rate-limiter-sliding-log",
    "trapping-rain-water": "container-with-most-water",
    "stream-median": "longest-substring-without-repeat",
    "graph-chaos": "number-of-islands-grid",
}

DEFAULT_FALLBACK_TESTS = [{"input": {"data": [2, 7, 11, 15]}, "expected": [0, 1]}]


def _resolve_catalog_problem(raw_slug: str) -> dict:
    """Maps a stored assessment slug to a catalog problem, with a safe fallback."""
    raw_slug = raw_slug or "two-sum-sorted"
    target = PROBLEM_SLUG_MAP.get(raw_slug, raw_slug)
    return (
        get_problem_by_id(target)
        or get_problem_by_id(raw_slug)
        or get_problem_by_id("in-memory-lru-ttl")
        or get_problem_by_id("two-sum-sorted")
        or (PROBLEMS[0] if PROBLEMS else None)
    )


def _load_live_assessment(token: str, grace_seconds: int = 0) -> dict:
    """
    Fetches an assessment and asserts it is still open for work.
    404 unknown token, 410 expired, 409 already submitted.

    `grace_seconds` absorbs clock skew and request latency on submission: a
    candidate whose timer hits zero must still be able to land their answer.
    """
    assessment = database.get_takehome_assessment_by_token(token)
    if not assessment:
        raise HTTPException(status_code=404, detail="This assessment link is not valid.")

    if assessment.get("submitted_at") or assessment.get("completed_at"):
        raise HTTPException(
            status_code=409,
            detail="You have already submitted this assessment. The hiring team has your results.",
        )

    now = _utcnow()
    grace = timedelta(seconds=max(0, grace_seconds))
    expires_at = _to_naive_utc(assessment.get("expires_at"))
    if expires_at and expires_at + grace < now:
        raise HTTPException(
            status_code=410,
            detail="This assessment link has expired. Contact the hiring team for a new one.",
        )

    started_at = _to_naive_utc(assessment.get("started_at"))
    if started_at:
        limit_deadline = started_at + timedelta(minutes=int(assessment.get("time_limit_minutes") or 60))
        deadline = min(limit_deadline, expires_at) if expires_at else limit_deadline
        if deadline + grace < now:
            raise HTTPException(
                status_code=410,
                detail="The time limit for this assessment has passed.",
            )
        assessment["_remaining_seconds"] = max(0, int((deadline - now).total_seconds()))
    else:
        assessment["_remaining_seconds"] = int(assessment.get("time_limit_minutes") or 60) * 60
    return assessment


def _candidate_view(assessment: dict) -> dict:
    """The whitelist of assessment fields a candidate may see."""
    return {
        "id": assessment.get("id"),
        "candidate_name": assessment.get("candidate_name") or "",
        "role_title": assessment.get("role_title") or "",
        "problem_title": assessment.get("problem_title") or "",
        "problem_slug": assessment.get("problem_slug") or "",
        "difficulty": assessment.get("difficulty") or "Medium",
        "time_limit_minutes": int(assessment.get("time_limit_minutes") or 60),
        "remaining_seconds": assessment.get("_remaining_seconds", 0),
        "status": assessment.get("status") or "Sent",
        "expires_at": assessment.get("expires_at"),
        "started_at": assessment.get("started_at"),
    }


class TakeHomeRunRequest(BaseModel):
    code: str
    language: str = "python"
    entry_point: Optional[str] = "solution"
    custom_inputs: Optional[List[Dict[str, Any]]] = None

class TakeHomeSubmitRequest(BaseModel):
    code: str
    language: str = "python"
    entry_point: Optional[str] = "solution"
    submission_reason: Optional[str] = "manual"
    warnings_count: Optional[int] = 0
    time_taken_seconds: Optional[int] = None

@app.get("/api/takehome/{token}")
def get_takehome_challenge_details(token: str):
    assessment = _load_live_assessment(token)

    # Anchor the countdown server-side on first open, so closing the tab or
    # editing localStorage cannot buy extra time.
    if not assessment.get("started_at"):
        database.mark_takehome_started(token)
        assessment["status"] = "In Progress"

    catalog_problem = _resolve_catalog_problem(assessment.get("problem_slug"))
    if not catalog_problem:
        raise HTTPException(status_code=500, detail="This assessment problem is unavailable. Contact the hiring team.")

    # Ensure starter code covers all standard languages
    starter_code = dict(catalog_problem.get("starter_code", {}))
    entry_point = catalog_problem.get("entry_point", "solution")

    if "python" not in starter_code:
        starter_code["python"] = f"def {entry_point}(*args, **kwargs):\n    # Write your production implementation here\n    pass\n"
    if "cpp" not in starter_code:
        starter_code["cpp"] = "#include <iostream>\n#include <vector>\n\nclass Solution {\npublic:\n    // Write your C++ implementation here\n};\n"
    if "java" not in starter_code:
        starter_code["java"] = "public class Solution {\n    // Write your Java implementation here\n}\n"
    if "go" not in starter_code:
        starter_code["go"] = "package main\n\n// Write your Go implementation here\nfunc Solve() {\n}\n"
    if "typescript" not in starter_code:
        starter_code["typescript"] = f"export function {entry_point}(...args: any[]): any {{\n    // Write your TypeScript implementation here\n}}\n"
    if "javascript" not in starter_code:
        starter_code["javascript"] = f"function {entry_point}(...args) {{\n    // Write your JavaScript implementation here\n}}\n"

    # Hidden test expectations stay on the server.
    enriched_problem = {
        k: v for k, v in catalog_problem.items()
        if k not in ("test_cases", "hidden_test_cases", "reference_solution")
    }
    enriched_problem["starter_code"] = starter_code
    enriched_problem["entry_point"] = entry_point
    enriched_problem["supported_languages"] = ["python", "cpp", "java", "go", "typescript", "javascript"]
    enriched_problem["sample_test_cases"] = (catalog_problem.get("test_cases") or [])[:2]

    return {
        "status": "success",
        "assessment": _candidate_view(assessment),
        "problem": enriched_problem,
    }

@app.post("/api/takehome/{token}/run")
def run_takehome_test(token: str, req: TakeHomeRunRequest):
    assessment = _load_live_assessment(token)
    catalog_problem = _resolve_catalog_problem(assessment.get("problem_slug"))

    test_cases = (catalog_problem.get("test_cases") if catalog_problem else []) or DEFAULT_FALLBACK_TESTS
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
        "remaining_seconds": assessment.get("_remaining_seconds", 0),
        "result": result
    }

@app.post("/api/takehome/{token}/submit")
def submit_takehome_assessment(token: str, req: TakeHomeSubmitRequest):
    # A generous grace window: the timer expiring is exactly when the client
    # auto-submits, and refusing that submission would lose the candidate's work.
    assessment = _load_live_assessment(token, grace_seconds=180)
    catalog_problem = _resolve_catalog_problem(assessment.get("problem_slug"))

    test_cases = (catalog_problem.get("test_cases") if catalog_problem else []) or DEFAULT_FALLBACK_TESTS
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
        "chaos_resilience": resilience_pct,
        "submission_reason": req.submission_reason or "manual",
        "warnings_count": req.warnings_count or 0,
        "time_taken_seconds": req.time_taken_seconds
    }

    # 4. Save to Database
    final_status = "Completed"
    if req.submission_reason == "proctoring_violations":
        final_status = "Disqualified (Violations)"
    elif req.submission_reason == "warning_timeout":
        final_status = "Auto-Submitted (Timeout)"
    elif req.submission_reason == "time_expired":
        final_status = "Auto-Submitted (Time Limit)"

    # The write is guarded on submitted_at IS NULL, so a duplicate submission
    # (double-click, retried request, or a race) cannot overwrite the result.
    recorded = database.update_takehome_assessment_result(
        token=token,
        status=final_status,
        score=overall_score,
        chaos_resilience=resilience_pct,
        test_results=test_results_payload
    )
    if not recorded:
        raise HTTPException(
            status_code=409,
            detail="This assessment has already been submitted.",
        )

    return {
        "status": "success",
        "score": overall_score,
        "chaos_resilience": resilience_pct,
        "tests_passed": tests_passed,
        "total_tests": total_tests,
        "verdict": "Passed & Verified" if overall_score >= 650 else "Under Review",
        "submission_reason": req.submission_reason or "manual",
        "warnings_count": req.warnings_count or 0,
        "completed_at": datetime.now(timezone.utc).isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)

