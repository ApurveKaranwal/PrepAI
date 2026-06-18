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
from typing import List, Optional
import pypdf
from dotenv import load_dotenv
from groq import Groq

# Import our database layer and custom ML model
import database
from ml_model import InterviewMLModel

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
    print("Groq API successfully initialized for live evaluations using llama-3.3-70b-versatile!")
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
    if not client:
        return {}
    
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
    
    try:
        chat_completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        result = json.loads(chat_completion.choices[0].message.content)
        return {
            "result": result,
            "raw_prompt": user_prompt
        }
    except Exception as e:
        print(f"Failed to generate initial question: {e}")
        return {}

def generate_next_turn(session_id: int) -> dict:
    if not client:
        return {}
        
    history = database.get_messages_for_session(session_id)
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})
        
    try:
        chat_completion = client.chat.completions.create(
            messages=messages,
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.7,
        )
        result = json.loads(chat_completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Failed to generate next turn: {e}")
        return {}

@app.get("/")
def read_root():
    return {"status": "PrepAI Real Engine is active"}

@app.post("/api/ingest")
async def ingest_details(
    resume: Optional[UploadFile] = File(None),
    github_url: str = Form(...)
):
    print(f"Ingesting Details. GitHub: {github_url}")
    resume_text = ""
    resume_name = None
    
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
    if client and resume_text:
        try:
            chat_completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a resume parser. Output ONLY a short job role title (2-4 words) that describes the candidate based on their resume. Examples: 'Senior Backend Engineer', 'Frontend Developer', 'Data Scientist'. Return nothing else."},
                    {"role": "user", "content": resume_text[:2000]}
                ],
                model="llama-3.1-8b-instant",
                temperature=0.1,
            )
            extracted_role = chat_completion.choices[0].message.content.strip()
            if extracted_role and len(extracted_role) < 40 and "error" not in extracted_role.lower():
                role = extracted_role.strip('"')
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
    history_data = database.get_history_data()
    return history_data

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
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')

@app.post("/api/vision/gaze")
async def process_gaze(frame: UploadFile = File(...)):
    try:
        contents = await frame.read()
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return {"looking_at_screen": False, "error": "Could not decode image"}

        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = face_cascade.detectMultiScale(gray, 1.3, 5)
        
        if len(faces) == 0:
            return {"looking_at_screen": False, "reason": "No face detected"}

        # Check for eyes in the first (largest) face
        for (x, y, w, h) in faces:
            roi_gray = gray[y:y+h, x:x+w]
            eyes = eye_cascade.detectMultiScale(roi_gray, 1.1, 4)
            if len(eyes) > 0:
                return {"looking_at_screen": True}
        
        return {"looking_at_screen": False, "reason": "Face detected but no eyes detected"}
        
    except Exception as e:
        print(f"Error processing vision frame: {e}")
        return {"looking_at_screen": False, "error": str(e)}

@app.post("/api/resume-analyze")
async def analyze_resume(
    resume: UploadFile = File(...),
    job_role: str = Form(...)
):
    if not client:
        raise HTTPException(status_code=500, detail="Groq API key not configured")
        
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
            
        prompt = f"""
        You are an elite Technical Recruiter and an advanced ATS (Applicant Tracking System).
        Conduct a deep, critical analysis of the following resume against the target job role: "{job_role}".
        
        Resume Text:
        {text[:8000]}
        
        Provide your analysis in EXACTLY the following JSON format:
        {{
            "overall_summary": "A 2-3 sentence paragraph summarizing their overall fit and the initial impression they give for this role.",
            "ats_score": <a number between 0 and 100 representing the match percentage>,
            "sub_scores": {{
                "skills": <number 0-100>,
                "experience": <number 0-100>,
                "formatting": <number 0-100>,
                "impact": <number 0-100>
            }},
            "pros": ["detailed pro 1", "detailed pro 2"],
            "cons": ["detailed con 1", "detailed con 2"],
            "missing_keywords": ["keyword1", "keyword2", "tool1", "skill1"],
            "experience_feedback": "A 2-3 sentence critique specifically on how their experience bullet points are written (e.g., use of metrics, impact, action verbs).",
            "suggestions": ["specific actionable step 1", "specific actionable step 2"]
        }}
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.2,
            response_format={"type": "json_object"}
        )
        
        response_json = json.loads(completion.choices[0].message.content)
        return {"status": "success", "analysis": response_json}
        
    except json.JSONDecodeError:
         raise HTTPException(status_code=500, detail="Failed to parse analysis from AI.")
    except Exception as e:
        print(f"Error analyzing resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/resume-rewrite")
async def rewrite_resume(
    resume: UploadFile = File(...),
    job_role: str = Form(...)
):
    if not client:
        raise HTTPException(status_code=500, detail="Groq API key not configured")
        
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
            
        prompt = f"""
        You are an elite Career Coach and Resume Writer. 
        Your task is to identify the 3 weakest experience bullet points in the provided resume and completely rewrite them to be highly optimized for the target job role: "{job_role}".
        
        The rewritten bullet points must:
        - Naturally integrate missing ATS keywords relevant to the role.
        - Start with strong action verbs.
        - Follow the STAR method (Situation, Task, Action, Result) where possible.
        - Emphasize quantifiable metrics and impact.
        
        Resume Text:
        {text[:8000]}
        
        Provide your response in EXACTLY the following JSON format:
        {{
            "rewrites": [
                {{
                    "original": "The exact original weak bullet point from the resume.",
                    "optimized": "The fully rewritten, highly impactful, ATS-optimized version.",
                    "explanation": "A 1-sentence explanation of why this new version is better (e.g., added metrics, injected specific keywords)."
                }}
            ]
        }}
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        response_json = json.loads(completion.choices[0].message.content)
        return {"status": "success", "data": response_json}
        
    except json.JSONDecodeError:
         raise HTTPException(status_code=500, detail="Failed to parse rewrite from AI.")
    except Exception as e:
        print(f"Error rewriting resume: {e}")
        raise HTTPException(status_code=500, detail=str(e))