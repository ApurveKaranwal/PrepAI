"""
FastAPI Router for PrepAI Code Studio
Exposes endpoints for code execution, AST complexity analysis,
chaos testing, problem generation, AI interviewer interaction, and session evaluation.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

import database
from code_studio.catalog import get_all_problems, get_problem_by_id, PROBLEMS
from code_studio.runner import run_code_sandbox
from code_studio.analyzer import analyze_code_intelligence
from code_studio.chaos import run_chaos_stress_test
from code_studio.copilot import generate_interviewer_response
from code_studio.evaluator import evaluate_coding_session
from code_studio.dynamic_generator import generate_candidate_tailored_problem

router = APIRouter()


# =========================================================================
# Pydantic Schemas
# =========================================================================

class RunCodeRequest(BaseModel):
    language: str
    code: str
    entry_point: str
    test_cases: List[Dict[str, Any]]
    timeout_seconds: Optional[float] = 5.0

class AnalyzeCodeRequest(BaseModel):
    code: str
    language: str
    problem_title: str
    problem_description: str
    optimal_time: Optional[str] = "O(N)"
    optimal_space: Optional[str] = "O(1)"

class ChaosTestRequest(BaseModel):
    language: str
    code: str
    entry_point: Optional[str] = "solution"
    problem_title: Optional[str] = "Coding Challenge"
    problem_description: Optional[str] = ""
    standard_test_cases: Optional[List[Dict[str, Any]]] = None

class ChatCopilotRequest(BaseModel):
    problem_title: str
    problem_description: str
    code: str
    language: str
    user_message: str
    chat_history: Optional[List[Dict[str, str]]] = None

class EvaluateSessionRequest(BaseModel):
    user_id: Optional[str] = "anonymous"
    problem_id: Optional[str] = ""
    problem_title: Optional[str] = "Coding Challenge"
    track: Optional[str] = "DSA"
    difficulty: Optional[str] = "Medium"
    language: Optional[str] = "cpp"
    code: Optional[str] = ""
    problem_description: Optional[str] = ""
    tests_passed: Optional[int] = 0
    total_tests: Optional[int] = 0
    chaos_tests_passed: Optional[int] = 0
    chaos_total_tests: Optional[int] = 0
    time_complexity: Optional[str] = "O(N)"
    space_complexity: Optional[str] = "O(1)"
    duration_seconds: Optional[int] = 0

class GenerateProblemRequest(BaseModel):
    user_id: Optional[str] = None
    difficulty: Optional[str] = "Medium"
    language: Optional[str] = "python"


# =========================================================================
# Endpoints
# =========================================================================

@router.get("/problems")
async def list_problems():
    """
    Returns list of curated problem titles, tracks, and difficulties.
    """
    return {
        "problems": get_all_problems(),
        "tracks": ["DSA", "Backend", "BugHunt", "GitHub-Tailored"]
    }

@router.get("/problems/{problem_id}")
async def get_problem(problem_id: str):
    """
    Retrieves complete problem definition by ID.
    """
    problem = get_problem_by_id(problem_id)
    if not problem:
        raise HTTPException(status_code=404, detail=f"Problem '{problem_id}' not found.")
    return problem

@router.post("/problems/generate")
async def generate_custom_problem(req: GenerateProblemRequest):
    """
    Synthesizes a bespoke problem using candidate's GitHub / resume profile.
    """
    github_info = {}
    resume_skills = []
    
    if req.user_id:
        try:
            profile = database.get_candidate_profile(req.user_id)
            if profile:
                github_stats_raw = profile.get("github_stats")
                if github_stats_raw:
                    try:
                        import json
                        github_info = json.loads(github_stats_raw)
                    except Exception:
                        pass
                
                # Extract skills from candidate profile
                if profile.get("tech_stack_preferences"):
                    resume_skills.extend([s.strip() for s in profile.get("tech_stack_preferences").split(",")])
        except Exception as e:
            print(f"Error fetching profile for tailored problem: {e}")

    problem = generate_candidate_tailored_problem(
        github_info=github_info,
        resume_skills=resume_skills,
        difficulty=req.difficulty,
        target_language=req.language
    )
    return problem

@router.post("/run")
async def run_code(req: RunCodeRequest):
    """
    Runs user code against standard test cases in isolated subprocess sandbox.
    """
    result = run_code_sandbox(
        language=req.language,
        code=req.code,
        entry_point=req.entry_point,
        test_cases=req.test_cases,
        timeout_seconds=req.timeout_seconds or 5.0
    )
    return result

@router.post("/analyze")
@router.post("/ast-complexity")
async def analyze_code(req: AnalyzeCodeRequest):
    """
    High-accuracy AST and Big-O Complexity analyzer using LLaMA-3.3-70B.
    """
    analysis = analyze_code_intelligence(
        code=req.code,
        language=req.language,
        problem_title=req.problem_title,
        problem_description=req.problem_description,
        optimal_time=req.optimal_time,
        optimal_space=req.optimal_space
    )
    return {"analysis": analysis}

@router.post("/chaos-test")
async def chaos_stress_test(req: ChaosTestRequest):
    """
    Runs adversarial chaos edge-case stress test.
    """
    report = run_chaos_stress_test(
        language=req.language,
        code=req.code,
        entry_point=req.entry_point,
        problem_title=req.problem_title,
        problem_description=req.problem_description,
        standard_test_cases=req.standard_test_cases
    )
    return report

@router.post("/chat")
@router.post("/copilot-chat")
async def chat_interviewer(req: ChatCopilotRequest):
    """
    Conversational Socratic AI Interviewer guidance.
    """
    response = generate_interviewer_response(
        problem_title=req.problem_title,
        problem_description=req.problem_description,
        code=req.code,
        language=req.language,
        user_message=req.user_message,
        chat_history=req.chat_history
    )
    return response

@router.post("/evaluate-session")
@router.post("/submit-evaluation")
async def evaluate_session(req: EvaluateSessionRequest):
    """
    Generates comprehensive hiring scorecard and saves session to PostgreSQL.
    """
    evaluation = evaluate_coding_session(
        problem_title=req.problem_title,
        problem_description=req.problem_description,
        language=req.language,
        code=req.code,
        tests_passed=req.tests_passed,
        total_tests=req.total_tests,
        chaos_tests_passed=req.chaos_tests_passed,
        chaos_total_tests=req.chaos_total_tests,
        time_complexity=req.time_complexity,
        space_complexity=req.space_complexity,
        duration_seconds=req.duration_seconds or 0
    )

    # Save to database
    session_data = {
        "problem_id": req.problem_id,
        "problem_title": req.problem_title,
        "track": req.track,
        "difficulty": req.difficulty,
        "language": req.language,
        "user_code": req.code,
        "time_complexity": req.time_complexity,
        "space_complexity": req.space_complexity,
        "tests_passed": req.tests_passed,
        "total_tests": req.total_tests,
        "chaos_tests_passed": req.chaos_tests_passed,
        "chaos_total_tests": req.chaos_total_tests,
        "overall_score": evaluation.get("overall_score", 0.0),
        "hiring_verdict": evaluation.get("hiring_verdict", "Hire"),
        "evaluation_json": evaluation,
        "duration_seconds": req.duration_seconds
    }
    
    saved_session_id = None
    try:
        saved_session_id = database.save_coding_studio_session(
            user_id=req.user_id,
            session_data=session_data
        )
    except Exception as e:
        print(f"Error persisting coding session: {e}")

    return {
        "session_id": saved_session_id,
        "evaluation": evaluation,
        "scorecard": evaluation
    }

@router.get("/history")
async def get_session_history(user_id: Optional[str] = Query(None)):
    """
    Returns candidate's past coding sessions.
    """
    sessions = database.get_coding_studio_sessions(user_id=user_id)
    return {"sessions": sessions}
