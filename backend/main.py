import io
import re
import os
import zipfile
import requests
import json
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
SYSTEM_PROMPT = """You are an expert technical interviewer. Your task is to analyze the candidate's Resume text and their GitHub repository files, and generate exactly 4 highly technical mock interview questions.
The questions must alternate between:
- Conceptual questions about their codebase architecture, asynchronous patterns, state management, or API designs.
- Code snippet analysis questions where you extract an actual code segment (10-20 lines) from one of their source files and ask them to explain its execution order, execution context, or potential issues.

You must output a JSON object with a single root key "questions" containing a list of exactly 4 objects. Each object must have these keys:
- "id": integer (1 to 4)
- "type": "conceptual" or "code-analysis"
- "title": string (short title)
- "code": string (only if type is "code-analysis", containing the code block)
- "question": string (the question text)
- "initialTip": string (a tip to help them answer)
- "streamTranscript": list of strings (3 sentences simulating what their voice response might look like)

Do not return any conversational text or explanation outside the JSON block. Return ONLY the JSON object.
"""

EVAL_SYSTEM_PROMPT = """You are an expert technical interviewer. You will receive a question and a candidate's answer.
Analyze the answer for technical correctness and depth. Compare it against standard engineering practices.
You must output a JSON object containing:
- "score": a float score between 1.0 and 10.0.
- "live_tip": a brief, constructive tip (1-2 sentences) on how they can improve their response or what technical terms they missed.
- "matched_keywords": list of technical keywords they correctly mentioned.
- "missing_keywords": list of technical keywords they should have mentioned.

Return ONLY the JSON block.
"""

def generate_groq_questions(resume_text: str, repo_files: List[dict]) -> List[dict]:
    if not client:
        return []
    
    files_summary = ""
    # Sort files by content length (larger files usually contain more logic) and limit to top 15
    sorted_files = sorted(repo_files, key=lambda f: len(f['content']), reverse=True)
    for f in sorted_files[:15]:
        files_summary += f"\n--- File: {f['name']} ---\n{f['content'][:1000]}\n"
        
    user_prompt = f"Resume Content:\n{resume_text}\n\nGitHub Codebase:\n{files_summary}"
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        result = json.loads(chat_completion.choices[0].message.content)
        return result.get("questions", [])
    except Exception as e:
        print(f"Failed to generate questions from Groq: {e}")
        return []

def evaluate_groq_answer(question_text: str, candidate_answer: str) -> dict:
    if not client:
        return {}
    
    user_prompt = f"Question:\n{question_text}\n\nCandidate Answer:\n{candidate_answer}"
    
    try:
        chat_completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": EVAL_SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(chat_completion.choices[0].message.content)
    except Exception as e:
        print(f"Failed to evaluate answer using Groq: {e}")
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

    # 4. Generate Questions: Groq Llama-3.3 or Local Fallback model
    questions = []
    if client:
        questions = generate_groq_questions(resume_text, repo_files)
        
    if not questions:
        print("Using local keyword question builder fallback...")
        questions = ml_engine.generate_questions_from_stack(resume_text, repo_files)
        
    # 5. Create Session in SQLite database and save questions
    session_id = database.create_session(github_url, resume_name, resume_text, role)
    database.save_questions(session_id, questions)
    print(f"Created real session ID: {session_id} for role: {role}")

    return {
        "status": "success",
        "session_id": session_id,
        "github_url": github_url,
        "questions": questions
    }

@app.post("/api/submit-answer")
def submit_answer(submission: AnswerSubmission):
    print(f"Submitting answer for Session: {submission.session_id}, Question: {submission.question_id}")
    
    # 1. Fetch question text from database
    questions = database.get_questions_for_session(submission.session_id)
    q_data = next((q for q in questions if q["id"] == submission.question_id), {})
    q_text = q_data.get("question", "Explain your implementation details.")
    
    # 2. Estimate WPM & fillers
    word_count = len(submission.answer.split())
    # Standard conversation pacing WPM
    wpm = 135 if word_count > 30 else 120
    
    cleaned_answer = re.sub(r"[^\w\s]", "", submission.answer.lower())
    filler_list = ["um", "uh", "like", "actually", "basically", "so", "well"]
    filler_count = sum(1 for t in cleaned_answer.split() if t in filler_list)
    
    # 3. Evaluate: Groq Llama-3.1 or Local fallback
    if client:
        evaluation = evaluate_groq_answer(q_text, submission.answer)
        if evaluation:
            score = evaluation.get("score", 7.5)
            live_tip = evaluation.get("live_tip", "Good answer structure!")
            matched_keywords = evaluation.get("matched_keywords", [])
            missing_keywords = evaluation.get("missing_keywords", [])
        else:
            score, live_tip, matched_keywords, missing_keywords = 7.0, "Could not compute live metrics.", [], []
    else:
        # Fallback to local model
        evaluation = ml_engine.evaluate_answer(q_text, submission.answer)
        score = evaluation["score"]
        live_tip = evaluation["live_tip"]
        matched_keywords = evaluation["matched_keywords"]
        missing_keywords = evaluation["missing_keywords"]
        
    # 4. Save answer to SQLite DB
    database.save_answer(
        session_id=submission.session_id,
        question_id_in_session=submission.question_id,
        answer_text=submission.answer,
        score=score,
        wpm=wpm,
        fillers=filler_count,
        live_tip=live_tip,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords
    )
    
    return {
        "status": "success",
        "wpm": wpm,
        "fillers": filler_count,
        "live_tip": live_tip,
        "score": score,
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords
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
        text = ""
        for page in pdf_reader.pages:
            text += page.extract_text() + "\n"
            
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