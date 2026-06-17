import os
import json
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional

# Re-use the existing SQLite database file location or postgresql connection string
DB_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "interviews.db")
DATABASE_URL = os.environ.get("DATABASE_URL")

def get_db_conn():
    if DATABASE_URL:
        # If PostgreSQL is configured
        try:
            import psycopg2
            from psycopg2.extras import RealDictCursor
            conn = psycopg2.connect(DATABASE_URL)
            # Enable auto-commit for ease of use or manage transaction
            conn.autocommit = True
            return conn, True
        except ImportError:
            print("psycopg2 not installed, falling back to SQLite.")
    
    # SQLite fallback
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn, False

def execute_query(query: str, params: tuple = (), fetch_all: bool = False, fetch_one: bool = False, is_insert: bool = False):
    conn, is_pg = get_db_conn()
    try:
        if is_pg:
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
        else:
            cursor = conn.cursor()
            
        cursor.execute(query, params)
        
        result = None
        if fetch_all:
            rows = cursor.fetchall()
            result = [dict(row) for row in rows]
        elif fetch_one:
            row = cursor.fetchone()
            result = dict(row) if row else None
        elif is_insert:
            if is_pg:
                # PostgreSQL doesn't have lastrowid, needs RETURNING id in query
                try:
                    result = cursor.fetchone()["id"]
                except:
                    result = None
            else:
                result = cursor.lastrowid
                
        if not is_pg and not (fetch_all or fetch_one):
            conn.commit()
            
        return result
    finally:
        conn.close()

def create_voice_session(
    github_url: str,
    linkedin_url: str,
    resume_name: Optional[str],
    resume_text: Optional[str],
    role: str,
    interview_mode: str
) -> int:
    query = """
        INSERT INTO voice_sessions (github_url, linkedin_url, resume_name, resume_text, role, interview_mode)
        VALUES (?, ?, ?, ?, ?, ?)
    """
    conn, is_pg = get_db_conn()
    try:
        cursor = conn.cursor()
        if is_pg:
            # PostgreSQL syntax
            pg_query = """
                INSERT INTO voice_sessions (github_url, linkedin_url, resume_name, resume_text, role, interview_mode)
                VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """
            cursor.execute(pg_query, (github_url, linkedin_url, resume_name, resume_text, role, interview_mode))
            session_id = cursor.fetchone()[0]
        else:
            cursor.execute(query, (github_url, linkedin_url, resume_name, resume_text, role, interview_mode))
            conn.commit()
            session_id = cursor.lastrowid
        return session_id
    finally:
        conn.close()

def update_voice_profile(session_id: int, profile_summary: Dict[str, Any]):
    conn, is_pg = get_db_conn()
    try:
        cursor = conn.cursor()
        profile_json = json.dumps(profile_summary)
        if is_pg:
            cursor.execute(
                "UPDATE voice_sessions SET profile_summary = %s WHERE id = %s",
                (profile_json, session_id)
            )
        else:
            cursor.execute(
                "UPDATE voice_sessions SET profile_summary = ? WHERE id = ?",
                (profile_json, session_id)
            )
            conn.commit()
    finally:
        conn.close()

def save_voice_message(
    session_id: int,
    role: str,
    content: str,
    audio_path: Optional[str] = None,
    evaluation: Optional[Dict[str, Any]] = None
) -> int:
    eval_json = json.dumps(evaluation) if evaluation else None
    conn, is_pg = get_db_conn()
    try:
        cursor = conn.cursor()
        if is_pg:
            cursor.execute(
                """
                INSERT INTO voice_messages (session_id, role, content, audio_path, evaluation)
                VALUES (%s, %s, %s, %s, %s) RETURNING id
                """,
                (session_id, role, content, audio_path, eval_json)
            )
            msg_id = cursor.fetchone()[0]
        else:
            cursor.execute(
                """
                INSERT INTO voice_messages (session_id, role, content, audio_path, evaluation)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, role, content, audio_path, eval_json)
            )
            conn.commit()
            msg_id = cursor.lastrowid
        return msg_id
    finally:
        conn.close()

def get_voice_messages(session_id: int) -> List[Dict[str, Any]]:
    conn, is_pg = get_db_conn()
    try:
        if is_pg:
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(
                "SELECT * FROM voice_messages WHERE session_id = %s ORDER BY created_at ASC",
                (session_id,)
            )
        else:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM voice_messages WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,)
            )
        rows = cursor.fetchall()
        messages = []
        for r in rows:
            msg = dict(r)
            if msg.get("evaluation"):
                try:
                    msg["evaluation"] = json.loads(msg["evaluation"])
                except Exception:
                    pass
            messages.append(msg)
        return messages
    finally:
        conn.close()

def get_voice_session(session_id: int) -> Optional[Dict[str, Any]]:
    conn, is_pg = get_db_conn()
    try:
        if is_pg:
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM voice_sessions WHERE id = %s", (session_id,))
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM voice_sessions WHERE id = ?", (session_id,))
        row = cursor.fetchone()
        if not row:
            return None
        session = dict(row)
        if session.get("profile_summary"):
            try:
                session["profile_summary"] = json.loads(session["profile_summary"])
            except Exception:
                pass
        for field in ["strengths", "weaknesses", "missed_concepts", "learning_resources"]:
            if session.get(field):
                try:
                    session[field] = json.loads(session[field])
                except Exception:
                    pass
        return session
    finally:
        conn.close()

def end_voice_session(
    session_id: int,
    duration_seconds: int,
    scores: Dict[str, float],
    strengths: List[str],
    weaknesses: List[str],
    missed_concepts: List[str],
    learning_resources: List[str],
    hiring_recommendation: str,
    overall_rating: float
):
    conn, is_pg = get_db_conn()
    try:
        cursor = conn.cursor()
        
        strengths_json = json.dumps(strengths)
        weaknesses_json = json.dumps(weaknesses)
        missed_json = json.dumps(missed_concepts)
        resources_json = json.dumps(learning_resources)
        
        tech_depth = scores.get("technical_depth", 0.0)
        comm = scores.get("communication", 0.0)
        prob_solving = scores.get("problem_solving", 0.0)
        sys_design = scores.get("system_design", 0.0)
        ownership = scores.get("ownership", 0.0)
        
        if is_pg:
            cursor.execute(
                """
                UPDATE voice_sessions
                SET duration_seconds = %s,
                    technical_depth = %s,
                    communication = %s,
                    problem_solving = %s,
                    system_design = %s,
                    ownership = %s,
                    overall_rating = %s,
                    strengths = %s,
                    weaknesses = %s,
                    missed_concepts = %s,
                    learning_resources = %s,
                    hiring_recommendation = %s
                WHERE id = %s
                """,
                (
                    duration_seconds,
                    tech_depth,
                    comm,
                    prob_solving,
                    sys_design,
                    ownership,
                    overall_rating,
                    strengths_json,
                    weaknesses_json,
                    missed_json,
                    resources_json,
                    hiring_recommendation,
                    session_id
                )
            )
        else:
            cursor.execute(
                """
                UPDATE voice_sessions
                SET duration_seconds = ?,
                    technical_depth = ?,
                    communication = ?,
                    problem_solving = ?,
                    system_design = ?,
                    ownership = ?,
                    overall_rating = ?,
                    strengths = ?,
                    weaknesses = ?,
                    missed_concepts = ?,
                    learning_resources = ?,
                    hiring_recommendation = ?
                WHERE id = ?
                """,
                (
                    duration_seconds,
                    tech_depth,
                    comm,
                    prob_solving,
                    sys_design,
                    ownership,
                    overall_rating,
                    strengths_json,
                    weaknesses_json,
                    missed_json,
                    resources_json,
                    hiring_recommendation,
                    session_id
                )
            )
            conn.commit()
    finally:
        conn.close()

def get_voice_history() -> List[Dict[str, Any]]:
    conn, is_pg = get_db_conn()
    try:
        if is_pg:
            from psycopg2.extras import RealDictCursor
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT * FROM voice_sessions WHERE overall_rating IS NOT NULL ORDER BY id DESC")
        else:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM voice_sessions WHERE overall_rating IS NOT NULL ORDER BY id DESC")
        rows = cursor.fetchall()
        
        history = []
        for r in rows:
            session = dict(r)
            if session.get("profile_summary"):
                try:
                    session["profile_summary"] = json.loads(session["profile_summary"])
                except Exception:
                    pass
            for field in ["strengths", "weaknesses", "missed_concepts", "learning_resources"]:
                if session.get(field):
                    try:
                        session[field] = json.loads(session[field])
                    except Exception:
                        pass
            history.append(session)
        return history
    finally:
        conn.close()
