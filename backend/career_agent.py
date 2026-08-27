import os
import json
import random
import re
import time
import datetime
import hashlib
import threading
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import List, Optional
import database
from auth_deps import AuthUser, require_user
from ml.tfidf.tfidf import TFIDFModel
from browser_agent import AutoApplyAgent
from dotenv import load_dotenv
import pypdf
from config import GROQ_HEAVY_MODEL, GROQ_LIGHT_MODEL
import io
import requests

load_dotenv()

router = APIRouter()

LAST_REFRESH_TIME = 0
REFRESH_LOCK = threading.Lock()
REFRESH_INTERVAL = 1800  # Refresh every 30 minutes

# Initialize LLM providers
sarvam_api_key = os.environ.get("SARVAM_API_KEY")
groq_api_key = os.environ.get("GROQ_API_KEY")
openai_api_key = os.environ.get("OPENAI_API_KEY")
client = None
if groq_api_key:
    from groq import Groq
    client = Groq(api_key=groq_api_key)

def call_career_llm(messages: list, temperature: float = 0.7, max_tokens: int = 1500, json_mode: bool = False) -> Optional[str]:
    # 1. Primary: Sarvam AI 105B
    if sarvam_api_key:
        try:
            payload = {
                "model": "sarvam-105b-conversations",
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            resp = requests.post(
                "https://api.sarvam.ai/v1/chat/completions",
                headers={"api-subscription-key": sarvam_api_key, "Content-Type": "application/json"},
                json=payload,
                timeout=20
            )
            if resp.status_code == 200:
                raw = resp.json()["choices"][0]["message"]["content"].strip()
                if raw:
                    return raw
        except Exception as e:
            print(f"[CareerAgent] Sarvam LLM error: {e}")

    # 2. Secondary: Groq
    if client:
        try:
            kwargs = {
                "messages": messages,
                "model": GROQ_HEAVY_MODEL,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            completion = client.chat.completions.create(**kwargs)
            return completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"[CareerAgent] Groq LLM error: {e}")

    return None

class OnboardRequest(BaseModel):
    user_id: str
    job_type: str
    work_mode: str
    countries: List[str]
    cities: List[str]
    salary_expectations: str
    notice_period: str
    tech_stack_preferences: List[str]
    company_size_preference: str
    startup_vs_enterprise: str
    visa_sponsorship: str
    linkedin_url: Optional[str] = ""
    github_url: Optional[str] = ""

class GenerateAnswersRequest(BaseModel):
    user_id: str
    job_id: int

class SubmitApplicationRequest(BaseModel):
    user_id: str
    job_id: int
    custom_responses: dict

class SubmitConfirmedApplicationRequest(BaseModel):
    user_id: str
    job_id: int
    candidate_details: dict
    custom_responses: dict

# ----------------------------------------------------
# 1. Onboarding & Candidate Intelligence Engine
# ----------------------------------------------------
@router.post("/onboard")
async def onboard_candidate(
    user_id: str = Form(...),
    job_type: str = Form(...),
    work_mode: str = Form(...),
    countries: str = Form(...), # JSON list of strings
    cities: str = Form(...), # JSON list of strings
    salary_expectations: str = Form(...),
    notice_period: str = Form(...),
    tech_stack_preferences: str = Form(...), # JSON list of strings
    company_size_preference: str = Form(...),
    startup_vs_enterprise: str = Form(...),
    visa_sponsorship: str = Form(...),
    linkedin_url: str = Form(""),
    github_url: str = Form(""),
    company_type_preference: str = Form("Any"),
    portfolio_url: str = Form(""),
    resume: Optional[UploadFile] = File(None)
):
    # Parse JSON list fields
    try:
        countries_list = json.loads(countries)
        cities_list = json.loads(cities)
        tech_list = json.loads(tech_stack_preferences)
    except:
        countries_list = [countries]
        cities_list = [cities]
        tech_list = [tech_stack_preferences]

    resume_text = ""
    resume_name = None
    if resume:
        try:
            resume_name = resume.filename
            pdf_bytes = await resume.read()
            pdf_reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            resume_text = "\n".join([page.extract_text() or "" for page in pdf_reader.pages])
        except Exception as e:
            print(f"Failed to parse resume: {e}")

    # High-precision entity extraction from resume text
    extracted_creds = extract_candidate_entities(
        resume_text=resume_text,
        filename=resume_name
    )

    if not github_url and extracted_creds.get("github_url"):
        github_url = extracted_creds["github_url"]
    if not linkedin_url and extracted_creds.get("linkedin_url"):
        linkedin_url = extracted_creds["linkedin_url"]
    if not portfolio_url and extracted_creds.get("portfolio_url"):
        portfolio_url = extracted_creds["portfolio_url"]

    # Extract Skills from Resume Text or tech list
    detected_skills = list(set([t.strip() for t in tech_list if t.strip()]))
    if resume_text:
        # Simple extraction rules for skills
        common_skills = ["Python", "FastAPI", "Go", "Next.js", "React", "Node.js", "Docker", "PostgreSQL", "Redis", "TypeScript", "AWS", "Kubernetes", "System Design", "Distributed Systems"]
        for s in common_skills:
            if s.lower() in resume_text.lower() and s not in detected_skills:
                detected_skills.append(s)

    # Real GitHub statistics from the public API. The previous version filled
    # these with random.randint() the moment a URL was present, so a recruiter
    # reading the profile saw repo, commit and strength numbers that were
    # invented on the spot.
    github_stats = {
        "repo_count": 0,
        "primary_languages": [],
        "commit_count_30d": 0,
        "github_strength": 0,
        "open_source_score": 0,
        "connected": False,
    }

    if github_url:
        try:
            from profile_aggregator import fetch_github_stats
            live = fetch_github_stats(github_url)
            github_stats = {
                "repo_count": live.get("public_repos", 0),
                "primary_languages": live.get("primary_languages", []),
                "commit_count_30d": live.get("commit_count_30d", 0),
                "github_strength": live.get("github_strength", 0),
                "open_source_score": live.get("open_source_score", 0),
                "stars_total": live.get("stars_total", 0),
                "followers": live.get("followers", 0),
                "username": live.get("username", ""),
                "connected": bool(live.get("connected")),
            }
        except Exception as e:
            print(f"[CareerAgent] GitHub stats unavailable for {github_url}: {e}")

    # LinkedIn is not integrated. Skills come from the resume and the candidate's
    # own stack selection; nothing here is inferred or invented.
    linkedin_data = {
        "certifications": [],
        "skills": detected_skills,
        "experience_years": ""
    }

    profile = {
        "job_type": job_type,
        "work_mode": work_mode,
        "countries": countries_list,
        "cities": cities_list,
        "salary_expectations": salary_expectations,
        "notice_period": notice_period,
        "tech_stack_preferences": tech_list,
        "company_size_preference": company_size_preference,
        "startup_vs_enterprise": startup_vs_enterprise,
        "visa_sponsorship": visa_sponsorship,
        "company_type_preference": company_type_preference,
        "resume_name": resume_name,
        "resume_text": resume_text,
        "github_url": github_url,
        "linkedin_url": linkedin_url,
        "portfolio_url": portfolio_url,
        "github_stats": github_stats,
        "linkedin_data": linkedin_data
    }

    # Save to SQLite
    database.save_candidate_profile(user_id, profile)
    return {"status": "success", "profile": profile}

@router.get("/profile")
def get_profile(user_id: str = "", email: str = ""):
    profile = database.get_candidate_profile(user_id, email=email)
    if not profile:
        return {"status": "not_found", "message": "Candidate profile not found."}
    return profile

# ----------------------------------------------------
# 2. AI Job Matching & Readiness Engine
# ----------------------------------------------------
def _readiness_score(match_score: float, interview_score: float,
                     has_interview_signal: bool, skill_score: float = None) -> int:
    """
    Averages only the signals we actually measured for this candidate. Someone
    who has not sat a mock interview has no interview signal, so the term is
    dropped rather than filled with a placeholder — the old code averaged in a
    literal 70, which produced a readiness number we could not defend. Likewise
    a listing with no parsed skill list contributes no skill-coverage term
    instead of being credited a free 100%.
    """
    parts = [match_score]
    if skill_score is not None:
        parts.append(skill_score)
    if has_interview_signal:
        parts.append(interview_score)
    return max(0, min(100, int(sum(parts) / len(parts))))


@router.post("/jobs/refresh")
def refresh_external_jobs_feed(user: AuthUser = Depends(require_user)):
    """
    Force-refresh the external job feed. The 30-minute auto-refresh on
    `GET /jobs` is too slow when a candidate opens the page and immediately
    sees the same old listings; this route runs `run_jobs_fetch` inline
    (synchronously) so the very next `GET /jobs` reads the new rows. We cap
    the wait at ~25s with a thread so a flapping upstream provider can't
    hang the request indefinitely.
    """
    with REFRESH_LOCK:
        container = {"done": False, "error": None}

        def _runner():
            try:
                database.run_jobs_fetch()
            except Exception as e:
                container["error"] = str(e)
            finally:
                container["done"] = True

        t = threading.Thread(target=_runner, daemon=True)
        t.start()
        # Wait up to 25s; 30 upstream HTTP calls fit comfortably inside that.
        t.join(timeout=25)

        if not container["done"]:
            return {
                "status": "in_progress",
                "message": "Refresh is still running in the background; reload in a few seconds.",
            }
        if container["error"]:
            raise HTTPException(
                status_code=502,
                detail=f"Job feed refresh failed: {container['error']}",
            )
        return {"status": "ok", "message": "Job feed refreshed."}


@router.get("/jobs")
def discover_matched_jobs(user_id: str):
    global LAST_REFRESH_TIME
    current_time = time.time()
    if current_time - LAST_REFRESH_TIME > REFRESH_INTERVAL:
        with REFRESH_LOCK:
            if current_time - LAST_REFRESH_TIME > REFRESH_INTERVAL:
                LAST_REFRESH_TIME = current_time
                database.trigger_background_job_fetch()

    profile = database.get_candidate_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found. Complete onboarding first.")

    # This candidate's own verified interview performance. The previous version
    # called `get_history_data()`, which aggregates every user in the database —
    # so it reported other people's readiness as this candidate's.
    prep_stats = database.get_user_prepai_stats(user_id)
    has_interview_signal = int(prep_stats.get("sessions_count") or 0) > 0
    interview_score = round(float(prep_stats.get("voice_rating") or 0.0) * 10, 1)

    # Load candidate skills
    candidate_skills = profile.get("tech_stack_preferences", [])
    if profile.get("linkedin_data") and profile["linkedin_data"].get("skills"):
        candidate_skills = list(set(candidate_skills + profile["linkedin_data"]["skills"]))

    # Prepare corpus for similarity matching
    candidate_corpus = " ".join(candidate_skills) + " " + profile.get("resume_text", "")
    
    # 0. Featured requisitions posted by registered hiring organizations.
    # Each requisition carries ITS OWN organization's branding. The previous
    # implementation read one arbitrary startup_profiles row and stamped that
    # founder, website and stage onto every company's jobs.
    startup_jobs = []
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT j.id, j.role_title, j.company_name, j.location, j.work_mode,
                   j.salary_range, j.experience_level, j.required_skills, j.description,
                   o.name AS org_name, o.website_url AS org_website,
                   sp.company_name AS sp_company, sp.location AS sp_location,
                   sp.stage AS sp_stage, sp.founder_name, sp.founder_role,
                   sp.primary_tech_stack, sp.website_url AS sp_website, sp.about
            FROM recruiter_jobs j
            JOIN organizations o ON o.id = j.org_id
            LEFT JOIN startup_profiles sp ON sp.user_id = o.founder_user_id
            WHERE j.status = 'Active'
            ORDER BY j.created_at DESC
        """)
        rec_jobs = cursor.fetchall()
        conn.close()

        for rj in rec_jobs:
            r_skills = rj.get("required_skills")
            if isinstance(r_skills, str):
                try:
                    r_skills = json.loads(r_skills)
                except Exception:
                    r_skills = []
            r_skills = r_skills or []

            matched_sk = [s for s in r_skills if any(s.lower() in cs.lower() for cs in candidate_skills)]
            missing_sk = [s for s in r_skills if s not in matched_sk]

            description = rj.get("description") or rj.get("about") or ""
            try:
                tfidf = TFIDFModel([candidate_corpus, description])
                similarity = TFIDFModel.cosine_similarity(
                    tfidf.get_tfidf_vector(candidate_corpus),
                    tfidf.get_tfidf_vector(description)
                )
            except Exception:
                similarity = 0.0

            if r_skills:
                skill_score = len(matched_sk) / len(r_skills) * 100
                match_score = max(0, min(100, int((similarity * 40) + (skill_score * 0.6))))
            else:
                skill_score = None
                match_score = max(0, min(100, int(similarity * 100)))
            readiness_score = _readiness_score(match_score, interview_score, has_interview_signal, skill_score)

            reasons_list = [f"{ms} match" for ms in matched_sk[:3]]
            reasons_list += [f"{mis} gap" for mis in missing_sk[:2]]
            if rj.get("sp_stage"):
                reasons_list.append(f"{rj['sp_stage']} requisition")

            startup_jobs.append({
                "id": 900000 + rj["id"],
                "title": rj["role_title"],
                "company": rj.get("company_name") or rj.get("sp_company") or rj.get("org_name") or "",
                "location": rj.get("location") or rj.get("sp_location") or "",
                "work_mode": rj.get("work_mode") or "Remote",
                "salary": rj.get("salary_range") or "",
                "experience_required": rj.get("experience_level") or "",
                "skills_required": r_skills,
                "match_score": match_score,
                "readiness_score": readiness_score,
                "readiness_includes_interview": has_interview_signal,
                "matched_skills": matched_sk,
                "missing_skills": missing_sk[:2],
                "reasons": reasons_list,
                "url": rj.get("sp_website") or rj.get("org_website") or "",
                "ats_type": "PrepFlow Founder Gateway",
                "source": "PrepFlow Verified Requisition",
                "is_featured_startup": True,
                "is_registered_startup": True,
                "can_apply_via_agent": True,
                "portal_type": "PrepFlow Partner Gateway",
                "stage": rj.get("sp_stage") or "",
                "founder_name": rj.get("founder_name") or "",
                "founder_role": rj.get("founder_role") or "",
                "description": description,
            })
    except Exception as e:
        print(f"Error compiling featured requisitions: {e}")

    jobs = database.get_jobs()
    matched_jobs = []

    for job in jobs:
        # 1. Cosine similarity using scratch TF-IDF model
        try:
            tfidf = TFIDFModel([candidate_corpus, job["description"]])
            vec1 = tfidf.get_tfidf_vector(candidate_corpus)
            vec2 = tfidf.get_tfidf_vector(job["description"])
            similarity = TFIDFModel.cosine_similarity(vec1, vec2)
        except Exception:
            similarity = 0.0

        # 2. Skill match coverage calculation
        job_skills = job["skills_required"] or []
        matched_skills = [s for s in job_skills if any(s.lower() in cs.lower() for cs in candidate_skills)]
        missing_skills = [s for s in job_skills if s not in matched_skills]

        # 3. Match = text similarity + skill coverage. No artificial floor: the
        # old code clamped every score into [50, 98], so a candidate with zero
        # overlap still read as a 50% match.
        if job_skills:
            skill_score = len(matched_skills) / len(job_skills) * 100
            match_score = max(0, min(100, int((similarity * 40) + (skill_score * 0.6))))
        else:
            skill_score = None
            match_score = max(0, min(100, int(similarity * 100)))

        # 4. Readiness over the signals we actually have
        readiness_score = _readiness_score(match_score, interview_score, has_interview_signal, skill_score)

        # Compute reasons list
        reasons_list = []
        for ms in matched_skills[:3]:
            reasons_list.append(f"{ms} match")
        for mis in missing_skills[:2]:
            reasons_list.append(f"{mis} gap")

        # Basic filtering based on work mode preference
        if profile.get("work_mode") and profile["work_mode"] != "Remote" and job["work_mode"] == "Remote":
            pass # Keep them, but show fits

        matched_jobs.append({
            "id": job["id"],
            "title": job["title"],
            "company": job["company"],
            "location": job["location"],
            "work_mode": job["work_mode"],
            "salary": job["salary"],
            "experience_required": job["experience_required"],
            "skills_required": job_skills,
            "match_score": match_score,
            "readiness_score": readiness_score,
            "readiness_includes_interview": has_interview_signal,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "reasons": reasons_list,
            "url": job["url"],
            "ats_type": job["ats_type"],
            "source": job["source"],
            "listed_at": job.get("listed_at"),
            "fetched_at": job.get("fetched_at"),
            "is_featured_startup": False,
            "is_registered_startup": False,
            "can_apply_via_agent": False,
            "portal_type": "External Internet Listing"
        })

    # Sort external jobs by recency first, then by match score as the
    # tiebreaker. A candidate should see the freshest listings at the top of
    # the feed so the newest opportunities get real-world attention, but
    # when two listings went up the same day the better-matched one is more
    # useful to surface. Registered startup requisitions are not part of
    # this sort — they lead the response unchanged.
    def _listed_ts(job):
        raw = job.get("listed_at")
        if not raw:
            return None
        try:
            from datetime import datetime
            if isinstance(raw, datetime):
                return raw
            return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        except Exception:
            return None

    matched_jobs.sort(
        key=lambda j: (_listed_ts(j) or 0, j["match_score"]),
        reverse=True,
    )
    return startup_jobs + matched_jobs

# ----------------------------------------------------
# 3. Company-Specific Preparation Roadmap Engine
# ----------------------------------------------------
@router.get("/readiness/{job_id}")
def get_company_prep_roadmap(user_id: str, job_id: int):
    profile = database.get_candidate_profile(user_id)
    job = database.get_job_by_id(job_id)
    if not profile or not job:
        raise HTTPException(status_code=404, detail="Job or Profile not found.")

    # Calculate skill gaps
    candidate_skills = profile.get("tech_stack_preferences", [])
    if profile.get("linkedin_data") and profile["linkedin_data"].get("skills"):
        candidate_skills = list(set(candidate_skills + profile["linkedin_data"]["skills"]))
        
    job_skills = job["skills_required"]
    missing_skills = [s for s in job_skills if not any(s.lower() in cs.lower() for cs in candidate_skills)]
    if not missing_skills:
        missing_skills = ["System Design", "Distributed Systems"]

    # Calculate adaptive roadmap days based on missing skill count
    gap_count = len(missing_skills)
    roadmap_days = 2
    if gap_count > 4:
        roadmap_days = 14
    elif gap_count > 2:
        roadmap_days = 7
    elif gap_count > 0:
        roadmap_days = 5

    # Generate custom questions (Mocking list of questions or creating via LLM)
    questions = {
        "coding": [
            f"Write a function to implement an asynchronous cache synchronization layer using {', '.join(job_skills[:2])}.",
            f"Explain how you would resolve race conditions in a multithreaded environment utilizing local storage locks."
        ],
        "system_design": [
            f"Design a globally distributed storage engine for {job['company']} supporting 100k requests/sec.",
            "Detail the database schema optimization when scaling relational PostgreSQL tables containing millions of application entries."
        ],
        "behavioral": [
            f"Describe a time you had to take ownership of a critical production bug at {job['company']}.",
            "Explain how you handled a disagreement with a Principal Architect regarding database choices."
        ]
    }

    # Generate Roadmap timelines
    timeline = []
    if roadmap_days == 2:
        timeline = [
            {"day": "Day 1", "topic": f"Syntax Refresher & Core Gaps", "details": f"Review key syntax and paradigms for {', '.join(missing_skills)}. Practice standard coding setups."},
            {"day": "Day 2", "topic": "Mock Drills & Systems Review", "details": "Run a text-based Coding Prep interview on the platform and review system architecture concepts."}
        ]
    elif roadmap_days == 5:
        timeline = [
            {"day": "Day 1-2", "topic": f"Target Skill Deep Dive ({', '.join(missing_skills[:2])})", "details": "Read doc guides and build a small test implementation container."},
            {"day": "Day 3", "topic": "System Architecture Mocking", "details": f"Design a microservices system using {job['company']}'s stack details."},
            {"day": "Day 4", "topic": "DSA & Coding Practice", "details": "Solve 3 medium problem-solving algorithms on trees and caching structures."},
            {"day": "Day 5", "topic": "Final Readiness Checklist", "details": "Run a full Voice Copilot round to check communication presence and eye focus."}
        ]
    elif roadmap_days == 7:
        timeline = [
            {"day": "Day 1-3", "topic": f"Bridge Skill Gaps ({', '.join(missing_skills[:3])})", "details": "Deep theoretical and hands-on coding work. Deploy test configurations."},
            {"day": "Day 4-5", "topic": "Algorithmic Pattern Drills", "details": "Study sliding windows, double pointers, and system design pipelines."},
            {"day": "Day 6", "topic": f"Company Deep Dive ({job['company']})", "details": "Research recent engineering blogs and public API choices from their team."},
            {"day": "Day 7", "topic": "Full Mock Simulation", "details": "Run both Coding Prep and Voice Copilot reviews on the platform."}
        ]
    else: # 14 days
        timeline = [
            {"day": "Day 1-4", "topic": f"Core Technical Gaps ({', '.join(missing_skills[:3])})", "details": "Build extensive prototypes using these technologies. Study memory usage."},
            {"day": "Day 5-8", "topic": "Distributed System Design", "details": "Study load balancers, caching partitions, sharding, and message queues."},
            {"day": "Day 9-11", "topic": "Advanced DSA & Coding round", "details": "Focus on dynamic programming, graph traversals, and concurrency models."},
            {"day": "Day 12-13", "topic": f"Target Company Profiling", "details": "Analyze recent outages, tech stack shifts, and behavioral values of the team."},
            {"day": "Day 14", "topic": "Comprehensive Polish", "details": "Run multiple mock practice iterations and optimize speaking pace."}
        ]

    return {
        "job_id": job_id,
        "company": job["company"],
        "roadmap_days": roadmap_days,
        "timeline": timeline,
        "questions": questions
    }

from resume_parser import extract_candidate_entities

# ----------------------------------------------------
# 4. Human-In-The-Loop: Prepare & Generate Customized Fields
# ----------------------------------------------------
@router.post("/apply/prepare")
async def prepare_application(req: GenerateAnswersRequest):
    profile = database.get_candidate_profile(req.user_id)
    job = database.get_job_by_id(req.job_id)
    user_record = database.get_user_by_id(req.user_id)
    
    if not profile or not job:
        raise HTTPException(status_code=404, detail="Profile or Job not found.")

    resume_text = profile.get("resume_text", "")
    resume_name = profile.get("resume_name", "")
    user_name = user_record.get("name") if user_record else ""
    user_email = user_record.get("email") if user_record else ""

    # High-precision deterministic & semantic entity extraction from resume
    extracted_details = extract_candidate_entities(
        resume_text=resume_text,
        filename=resume_name,
        default_name=user_name,
        default_email=user_email
    )

    # Use profile overrides if explicitly configured
    if profile.get("linkedin_url"):
        extracted_details["linkedin_url"] = profile["linkedin_url"]
    if profile.get("github_url"):
        extracted_details["github_url"] = profile["github_url"]
    if profile.get("portfolio_url"):
        extracted_details["portfolio_url"] = profile["portfolio_url"]

    # 2. Scrape necessary details from website using AutoApplyAgent detect_form_structure
    agent = AutoApplyAgent(profile, job, {})
    form_structure = await agent.detect_form_structure()
    
    # 3. Generate answers for any custom questions detected on the website
    ai_answers = {}
    for q in form_structure["custom_questions"]:
        q_label = q["label"]
        q_type = q["type"]
        
        if q_type == "select":
            # If it's a dropdown, select 'Yes' or first option by default, or ask the candidate
            opts = q.get("options", [])
            # Pick a safe default
            if "yes" in [o.lower() for o in opts]:
                ai_answers[q_label] = [o for o in opts if o.lower() == "yes"][0]
            elif opts:
                ai_answers[q_label] = opts[0]
            else:
                ai_answers[q_label] = "Yes"
        elif q_type in ["text", "textarea"]:
            # Generate personalized answer via Sarvam AI / Groq
            prompt = (
                f"Candidate Name: {extracted_details.get('name')}\n"
                f"Resume Summary:\n{resume_text[:2000]}\n"
                f"GitHub: {extracted_details.get('github_url')}\n"
                f"Job Title: {job['title']} at {job['company']}\n"
                f"Job Description: {job['description'][:1500]}\n\n"
                f"Question: {q_label}\n"
                f"Write a professional response (exactly 2-3 sentences). Output ONLY the response text."
            )
            ans = call_career_llm([
                {"role": "system", "content": "You are a professional recruitment assistant. Output ONLY the response text."},
                {"role": "user", "content": prompt}
            ], temperature=0.7, max_tokens=300)
            if ans:
                ai_answers[q_label] = ans
            
            # Fallback answers
            if not ai_answers.get(q_label):
                if "why" in q_label.lower():
                    ai_answers[q_label] = (
                        f"I want to join {job['company']} because of your focus on scalable systems and your culture of high engineering standards. "
                        f"My background matches the core requirements of your search for a {job['title']}."
                    )
                elif "project" in q_label.lower():
                    ai_answers[q_label] = (
                        f"I recently optimized a database synchronization cache layer which processed concurrent updates. "
                        f"By introducing distributed locking and key sharding, I reduced latency by 45%."
                    )
                else:
                    ai_answers[q_label] = f"I am a software engineer with extensive experience in TypeScript, React, and Python, matches the role at {job['company']}."

    return {
        "candidate_details": extracted_details,
        "form_fields": form_structure,
        "ai_answers": ai_answers
    }

# ----------------------------------------------------
# 5. Playwright Browser Auto-Apply Execution
# ----------------------------------------------------
async def run_apply_background(user_id: str, job_id: int, custom_responses: dict, app_id: int, confirmed_details: dict):
    profile = database.get_candidate_profile(user_id)
    job = database.get_job_by_id(job_id)
    if not profile or not job:
        database.update_application_status(app_id, "Rejected")
        database.update_application_logs(app_id, "[BrowserAgent] Failed: Profile or Job not found.")
        return

    agent = AutoApplyAgent(profile, job, custom_responses, confirmed_details)
    try:
        logs = await agent.execute()
        database.update_application_status(app_id, "Applied")
        database.update_application_logs(app_id, logs)
    except Exception as e:
        error_logs = f"[BrowserAgent] Crash during automation: {str(e)}"
        database.update_application_status(app_id, "Rejected")
        database.update_application_logs(app_id, error_logs)

from email_service import send_application_confirmation_email

@router.post("/apply/submit")
def submit_application(req: SubmitConfirmedApplicationRequest, background_tasks: BackgroundTasks):
    job = database.get_job_by_id(req.job_id)
    profile = database.get_candidate_profile(req.user_id)
    user_record = database.get_user_by_id(req.user_id)
    
    resume_text = profile.get("resume_text", "") if profile else ""
    resume_name = profile.get("resume_name", "Resume.pdf") if profile else "Resume.pdf"
    user_name = user_record.get("name") if user_record else ""
    user_email = user_record.get("email") if user_record else ""

    # High-precision resume extraction
    scraped = extract_candidate_entities(
        resume_text=resume_text,
        filename=resume_name,
        default_name=user_name,
        default_email=user_email
    )
    
    candidate_name = req.candidate_details.get("name") if req.candidate_details else None
    if not candidate_name or candidate_name in ["Candidate", "User"]:
        candidate_name = scraped.get("name") or user_name or ""

    candidate_email = req.candidate_details.get("email") if req.candidate_details else None
    if not candidate_email or candidate_email == "candidate@example.com":
        candidate_email = scraped.get("email") or user_email or ""

    # No identity fallback. The previous version defaulted to one real person's
    # name and inbox, so every other user's application receipt was addressed to
    # — and emailed to — them.
    if not candidate_email:
        raise HTTPException(
            status_code=400,
            detail="We could not find an email address for your application. Add one to your profile or upload a resume that contains it, then try again."
        )
    if not candidate_name:
        candidate_name = candidate_email.split("@")[0]
        
    company_name = job["company"] if job else "PrepFlow Partner Company"
    job_title = job["title"] if job else "Software Engineer"
    ats_type = job.get("ats_type", "PrepFlow Founder Gateway") if job else "PrepFlow Founder Gateway"

    # Enforce: Apply via Agent is only permitted for PrepFlow AI registered partner startups
    is_registered = False
    if req.job_id >= 900000:
        is_registered = True
    else:
        try:
            conn = database.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT company_name FROM startup_profiles WHERE LOWER(company_name) = LOWER(%s)", (company_name,))
            found_profile = cursor.fetchone()
            conn.close()
            if found_profile:
                is_registered = True
        except Exception:
            pass

    if not is_registered:
        raise HTTPException(
            status_code=400,
            detail=f"Apply via Agent is exclusively enabled for PrepFlow AI registered partner startups. For external opportunities like {company_name}, please apply directly on their official career portal or use our AI Prep Roadmap & Cold Outreach generator."
        )

    # Send confirmation email & generate authentic receipt
    confirmation_receipt = send_application_confirmation_email(
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        job_title=job_title,
        company=company_name,
        ats_type=ats_type,
        resume_name=resume_name,
        custom_responses=req.custom_responses
    )

    # Create the application row in SQLite/PostgreSQL
    app_id = database.create_application(
        user_id=req.user_id,
        job_id=req.job_id,
        status="Applied",
        custom_responses=req.custom_responses,
        submission_logs=f"[BrowserAgent] Dispatched to {company_name} ({ats_type}). Ref: {confirmation_receipt['tracking_id']}",
        tracking_id=confirmation_receipt['tracking_id']
    )
    
    # File the application into the posting organization's pipeline. The org is
    # resolved from the requisition itself (candidate-facing ids are offset by
    # 900000), so an application can only ever reach the company that posted it.
    if req.job_id >= 900000:
        try:
            database.register_inbound_application(
                recruiter_job_id=req.job_id - 900000,
                candidate_user_id=str(req.user_id),
                candidate_name=candidate_name,
                note=f"Applied via AI Career Agent for {job_title} at {company_name}"
            )
        except Exception as e:
            print(f"Error adding candidate application to recruiter pipeline: {e}")

    # Run the playwright script in the background
    background_tasks.add_task(
        run_apply_background,
        req.user_id,
        req.job_id,
        req.custom_responses,
        app_id,
        req.candidate_details
    )

    return {
        "status": "success",
        "application_id": app_id,
        "receipt": confirmation_receipt,
        "confirmation_receipt": confirmation_receipt
    }

@router.get("/receipt/{job_id}")
def get_application_receipt(job_id: int, user_id: str):
    job = database.get_job_by_id(job_id)
    profile = database.get_candidate_profile(user_id)
    user_record = database.get_user_by_id(user_id)
    
    resume_text = profile.get("resume_text", "") if profile else ""
    resume_name = profile.get("resume_name", "Resume.pdf") if profile else "Resume.pdf"
    user_name = user_record.get("name") if user_record else ""
    user_email = user_record.get("email") if user_record else ""

    scraped = extract_candidate_entities(
        resume_text=resume_text,
        filename=resume_name,
        default_name=user_name,
        default_email=user_email
    )
    
    candidate_name = scraped.get("name") or user_name or ""
    candidate_email = scraped.get("email") or user_email or ""
    if not candidate_name and candidate_email:
        candidate_name = candidate_email.split("@")[0]
    company_name = job["company"] if job else "Technology Company"
    job_title = job["title"] if job else "Software Engineer"
    ats_type = job.get("ats_type", "Greenhouse") if job else "Greenhouse"

    # Check if there is an existing tracking_id in applications table
    existing_tracking_id = None
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT tracking_id, custom_responses FROM applications WHERE user_id = %s AND job_id = %s ORDER BY updated_at DESC LIMIT 1", (str(user_id), job_id))
        app_row = cursor.fetchone()
        conn.close()
        if app_row and app_row.get("tracking_id"):
            existing_tracking_id = app_row["tracking_id"]
    except Exception as e:
        print(f"Error getting existing tracking id: {e}")

    tracking_id = existing_tracking_id or generate_tracking_id(company_name)
    
    submission_time = datetime.datetime.now().strftime("%B %d, %Y at %I:%M %p IST")
    html_content = create_confirmation_html(
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        job_title=job_title,
        company=company_name,
        tracking_id=tracking_id,
        ats_type=ats_type,
        resume_name=resume_name,
        submission_time=submission_time,
        custom_responses={}
    )

    return {
        "receipt": {
            "status": "confirmed",
            "tracking_id": tracking_id,
            "company": company_name,
            "job_title": job_title,
            "candidate_name": candidate_name,
            "candidate_email": candidate_email,
            "ats_type": ats_type,
            "resume_name": resume_name,
            "submission_time": submission_time,
            "email_sent": False,
            "html_preview": html_content
        }
    }

# ----------------------------------------------------
# 6. Application Tracker Dashboard Metrics & Live Sync
# ----------------------------------------------------
@router.get("/applications")
def get_user_applications(user_id: str = "", user: AuthUser = Depends(require_user)):
    """
    The caller's own applications. `user_id` is accepted for backwards
    compatibility and ignored: this response carries live take-home tokens, and
    the previous version handed them to anyone who guessed a numeric user id —
    which let a stranger sit somebody else's assessment.
    """
    apps = database.get_applications(user.uid)
    tracker = database.get_candidate_tracker_state(user.uid)

    # Index by requisition so each application reflects the stage at the company
    # it was actually sent to.
    shortlist_by_job, assessment_by_job = {}, {}
    for row in tracker["shortlists"]:
        shortlist_by_job.setdefault(int(row.get("job_id") or 0), row)
    for row in tracker["assessments"]:
        assessment_by_job.setdefault(int(row.get("job_id") or 0), row)

    latest_shortlist = tracker["shortlists"][0] if tracker["shortlists"] else None
    latest_assessment = tracker["assessments"][0] if tracker["assessments"] else None

    for app in apps:
        # Candidate-facing requisition ids are offset by 900000.
        raw_job_id = int(app.get("job_id") or 0)
        req_id = raw_job_id - 900000 if raw_job_id >= 900000 else raw_job_id

        shortlist = shortlist_by_job.get(req_id)
        if shortlist:
            app["live_stage"] = shortlist["stage"]
            app["notes"] = shortlist.get("notes") or ""

        assessment = assessment_by_job.get(req_id)
        if assessment:
            app["takehome_token"] = assessment["token"]
            app["takehome_problem"] = assessment.get("problem_title") or ""
            app["takehome_status"] = assessment.get("status") or ""
            app["takehome_score"] = assessment.get("score") or 0
            app["takehome_expires_at"] = assessment.get("expires_at")
            app["takehome_time_limit_minutes"] = assessment.get("time_limit_minutes")

    # Funnel metrics over the real pipeline stages.
    sent = len(apps)
    response_rate = interview_rate = offer_rate = 0
    if sent > 0:
        interviews = sum(
            1 for a in apps
            if a.get("live_stage") in ("Interview", "Offer", "Hired")
            or a.get("status") in ("Interview Scheduled", "Offer Received")
        )
        offers = sum(
            1 for a in apps
            if a.get("live_stage") in ("Offer", "Hired") or a.get("status") == "Offer Received"
        )
        # A response is any movement past the stage an application lands in.
        responses = sum(
            1 for a in apps
            if (a.get("live_stage") and a["live_stage"] != "Sourced")
            or a.get("takehome_token")
            or a.get("status") not in (None, "", "Applied")
        )
        response_rate = int((responses / sent) * 100)
        interview_rate = int((interviews / sent) * 100)
        offer_rate = int((offers / sent) * 100)

    return {
        "applications": apps,
        "live_shortlist": latest_shortlist,
        "active_assessment": latest_assessment,
        "pipeline_stages": list(database.PIPELINE_STAGES),
        "metrics": {
            "sent": sent,
            "response_rate": response_rate,
            "interview_rate": interview_rate,
            "offer_rate": offer_rate
        }
    }

@router.get("/outreach")
def generate_cold_outreach(job_id: int, user_id: str, target_role: str = "Hiring Manager"):
    job = database.get_job_by_id(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    profile = database.get_candidate_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Candidate profile not found")
        
    user_record = database.get_user_by_id(user_id)
    candidate_name = (user_record.get("name") if user_record else "") or ""
    if not candidate_name and user_record and user_record.get("email"):
        candidate_name = user_record["email"].split("@")[0]
    github_url = profile.get("github_url") or ""
    linkedin_url = profile.get("linkedin_url") or ""
    portfolio_url = profile.get("portfolio_url") or ""
    resume_name = profile.get("resume_name") or "Resume.pdf"
    
    company_clean = re.sub(r'[^a-zA-Z0-9]', '', job['company']).lower()
    
    candidate_skills = profile.get("tech_stack_preferences", [])
    skills_str = ", ".join(candidate_skills)
    
    resume_summary = profile.get("resume_text", "")[:10000]

    # Helper function to generate persona-tailored outreach fallback
    def build_smart_outreach_fallback():
        greeting = "Hi Hiring Team,"
        subject_role = target_role
        if target_role == "Hiring Manager":
            greeting = f"Hi {job['company']} Engineering Team,"
            subject = f"Founding Full-Stack & Systems Engineer Inquiry — {candidate_name}"
            intro = f"I've been following {job['company']}'s work in scalable systems and wanted to reach out regarding the {job['title']} role."
            closing = f"I'd welcome the chance to discuss how my systems background aligns with your engineering roadmap. Do you have 10 minutes this week for a brief conversation?"
        elif target_role == "Recruiter":
            greeting = f"Hi {job['company']} Recruiting Team,"
            subject = f"Application & Portfolio: {candidate_name} for {job['title']}"
            intro = f"I am writing to express my strong interest in the {job['title']} opening at {job['company']}."
            closing = f"My resume and verified DevScore technical portfolio are attached. I am available for an initial screening call at your earliest convenience."
        else: # Team Peer
            greeting = f"Hi there,"
            subject = f"Fellow engineer reaching out regarding {job['title']} at {job['company']}"
            intro = f"I came across {job['company']}'s technical architecture and was very impressed by your engineering focus. I'm exploring the {job['title']} position."
            closing = f"Would love to connect and learn more about the team's engineering culture and day-to-day technical challenges if you have a moment to chat!"

        email_body = (
            f"{greeting}\n\n"
            f"My name is {candidate_name}, and {intro.lower() if intro.startswith('I ') else intro} "
            f"With hands-on experience in {skills_str}, I build scalable full-stack applications with high reliability and clean architectural patterns.\n\n"
            f"Key technical highlights and projects:\n"
            f"1. Distributed Systems Engine: Built resilient concurrency pipelines with Redis and PostgreSQL (Live: {portfolio_url or 'https://github.com/' + candidate_name.replace(' ', '')})\n"
            f"2. High-Throughput REST APIs: Architected sub-50ms latency microservices and automated CI/CD workflows in FastAPI/React.\n\n"
            f"Professional Profiles & Portfolio:\n"
            f"- GitHub: {github_url or ('https://github.com/' + candidate_name.replace(' ', ''))}\n"
            f"- Portfolio: {portfolio_url or 'https://' + candidate_name.lower().replace(' ', '') + '.xyz'}\n"
            f"- LinkedIn: {linkedin_url or ('https://linkedin.com/in/' + candidate_name.lower().replace(' ', ''))}\n"
            f"- Resume: [Attached: {resume_name}]\n\n"
            f"{closing}\n\n"
            f"Warm regards,\n"
            f"{candidate_name}"
        )

        return {
            "target": target_role,
            "contact_email": f"careers@{company_clean}.com",
            "subject": subject,
            "linkedin_connection": f"Hi, I'm {candidate_name}. I admire {job['company']}'s engineering standards and would love to connect regarding the {job['title']} opening!",
            "email_body": email_body,
            "follow_up": f"Hi, just following up on my previous note regarding the {job['title']} role at {job['company']}. I'd love to share my portfolio and discuss how I can contribute to the team. Thanks for your time!"
        }

    # Attempt LLM generation if client available, otherwise use smart persona fallback
    if client:
        prompt = (
            f"You are an expert career agent and copywriter helping a candidate land a job referral or interview. "
            f"Generate a personalized networking outreach sequence for a candidate contacting a {target_role} at {job['company']}.\n\n"
            f"Here is the Target Job description:\n"
            f"Title: {job['title']}\n"
            f"Company: {job['company']}\n"
            f"Skills Required: {json.dumps(job['skills_required'])}\n"
            f"Description: {job['description'][:1500]}\n\n"
            f"Here is the Candidate's profile details:\n"
            f"Name: {candidate_name}\n"
            f"Skills: {skills_str}\n"
            f"Resume Excerpt:\n{resume_summary}\n\n"
            f"Instructions for generating the cold email body ('email_body'):\n"
            f"1. Make the email highly professional, personalized, and around 150-250 words.\n"
            f"2. You MUST read the candidate's Resume Excerpt and identify 1-2 major/interesting projects the candidate has built that are relevant to this role.\n"
            f"3. You MUST mention these projects by name in the email body, write 1-2 specific points summarizing what was built, the tech stack used, and the impact/metrics.\n"
            f"4. You MUST include a live deployment link for each of these projects. If a deployment link is not found in the resume, generate a realistic deployment URL based on the project name (e.g., https://<project-name>.vercel.app or https://<project-name>.github.io).\n"
            f"5. You MUST end the email body by clearly listing the candidate's professional links:\n"
            f"   - GitHub: {github_url if github_url else '[Insert GitHub Link]'}\n"
            f"   - Portfolio: {portfolio_url if portfolio_url else '[Insert Portfolio Link]'}\n"
            f"   - LinkedIn: {linkedin_url if linkedin_url else '[Insert LinkedIn Link]'}\n"
            f"   - Resume: [Attached: {resume_name}]\n\n"
            f"Do not sound pushy. Also generate a guessable or standard company contact email (e.g. careers@{company_clean}.com or jobs@{company_clean}.com).\n\n"
            f"You MUST return a JSON response with the following keys and structure:\n"
            f"{{\n"
            f"  \"contact_email\": \"<a professional recruitment or engineering contact email for this company, e.g. careers@{company_clean}.com, recruiting@{company_clean}.com, or similar>\",\n"
            f"  \"subject\": \"<a catchy, professional email subject line>\",\n"
            f"  \"linkedin_connection\": \"<a highly personalized LinkedIn connection request note, strictly UNDER 300 characters>\",\n"
            f"  \"email_body\": \"<the personalized cold email pitch adhering to all the instructions above>\",\n"
            f"  \"follow_up\": \"<a short, polite follow-up message to send 3 days later, around 50 words>\"\n"
            f"}}\n"
            f"Verify your output is strictly valid JSON."
        )
        
        try:
            response_text = call_career_llm([
                {"role": "system", "content": prompt},
                {"role": "user", "content": "Please generate the outreach materials."}
            ], temperature=0.7, max_tokens=1200, json_mode=True)
            if response_text:
                if "```json" in response_text:
                    response_text = response_text.split("```json")[1].split("```")[0].strip()
                elif "```" in response_text:
                    response_text = response_text.split("```")[1].split("```")[0].strip()
                result = json.loads(response_text)
                result["target"] = target_role
                return result
        except Exception as e:
            print(f"[CareerAgent] LLM outreach generation error (falling back to smart persona generator): {e}")
            return build_smart_outreach_fallback()

    return build_smart_outreach_fallback()

# ----------------------------------------------------
# 6. Official Application Tracking ID Verification
# ----------------------------------------------------
@router.get("/verify-tracking/{tracking_id}")
def verify_application_tracking(tracking_id: str):
    clean_tid = tracking_id.strip().upper()
    app = database.get_application_by_tracking_id(clean_tid)
    if not app:
        raise HTTPException(
            status_code=404,
            detail=f"Application tracking reference '{clean_tid}' was not found in the verified registry."
        )

    # Fetch live stage from candidate_shortlists
    live_stage = app.get("status", "Applied")
    notes = ""
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT stage, notes FROM candidate_shortlists WHERE candidate_id = %s ORDER BY id DESC LIMIT 1", (str(app["user_id"]),))
        shortlist_row = cursor.fetchone()
        conn.close()
        if shortlist_row:
            live_stage = shortlist_row["stage"]
            notes = shortlist_row.get("notes") or ""
    except Exception as e:
        print(f"Error fetching live shortlist for tracking: {e}")

    # Generate deterministic audit verification hash
    raw_signature = f"{clean_tid}:{app['user_id']}:{app['job_id']}:{app['created_at']}:{app['company']}"
    audit_hash = hashlib.sha256(raw_signature.encode('utf-8')).hexdigest()

    return {
        "valid": True,
        "tracking_id": clean_tid,
        "application_id": app["id"],
        "job_id": app["job_id"],
        "job_title": app["title"],
        "company": app["company"],
        "location": app["location"],
        "work_mode": app["work_mode"],
        "candidate_name": app["candidate_name"],
        "candidate_email": app["candidate_email"],
        "resume_name": app["resume_name"],
        "devscore": app.get("devscore", 850),
        "status": app["status"],
        "live_stage": live_stage,
        "notes": notes,
        "submission_timestamp": app["created_at"],
        "ats_gateway": app.get("ats_type", "PrepFlow Founder Direct Gateway"),
        "audit_hash": audit_hash,
        "verification_status": "Cryptographically Verified",
        "custom_responses": app.get("custom_responses", {})
    }
