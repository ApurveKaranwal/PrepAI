import sqlite3
import json
import os
import hashlib
from datetime import datetime

DB_FILE = os.path.join(os.path.dirname(__file__), "interviews.db")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    salt = os.urandom(16)
    db_val = salt + hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return db_val.hex()

def verify_password(stored_password_hex: str, provided_password: str) -> bool:
    try:
        db_val = bytes.fromhex(stored_password_hex)
        salt = db_val[:16]
        stored_hash = db_val[16:]
        new_hash = hashlib.pbkdf2_hmac('sha256', provided_password.encode('utf-8'), salt, 100000)
        return stored_hash == new_hash
    except Exception:
        return False

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            github_url TEXT NOT NULL,
            resume_name TEXT,
            resume_text TEXT,
            role TEXT DEFAULT 'Software Engineer',
            score REAL,
            duration TEXT,
            body_score REAL DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create questions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            question_id_in_session INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            code TEXT,
            question_text TEXT NOT NULL,
            initial_tip TEXT,
            stream_transcript TEXT, -- JSON array of strings
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Create answers table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            question_id_in_session INTEGER NOT NULL,
            answer_text TEXT NOT NULL,
            score REAL NOT NULL,
            wpm INTEGER NOT NULL,
            fillers INTEGER NOT NULL,
            live_tip TEXT,
            matched_keywords TEXT, -- JSON array of strings
            missing_keywords TEXT, -- JSON array of strings
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Create messages table for conversational interview
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Create voice_sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS voice_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            github_url TEXT,
            linkedin_url TEXT,
            resume_name TEXT,
            resume_text TEXT,
            role TEXT DEFAULT 'Software Engineer',
            interview_mode TEXT DEFAULT 'Mid-Level',
            profile_summary TEXT, -- JSON Candidate Profile
            technical_depth REAL,
            communication REAL,
            problem_solving REAL,
            system_design REAL,
            ownership REAL,
            overall_rating REAL,
            strengths TEXT, -- JSON array of strings
            weaknesses TEXT, -- JSON array of strings
            missed_concepts TEXT, -- JSON array of strings
            learning_resources TEXT, -- JSON array of strings
            hiring_recommendation TEXT,
            duration_seconds INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create voice_messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS voice_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            audio_path TEXT,
            evaluation TEXT, -- JSON string for hidden evaluation
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES voice_sessions (id) ON DELETE CASCADE
        )
    """)
    
    conn.commit()
    conn.close()
    print("SQLite Database successfully initialized at:", DB_FILE)


# User authentication logic
def create_user(email: str, password: str, name: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    hashed = hash_password(password)
    try:
        cursor.execute(
            "INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
            (email.strip().lower(), hashed, name.strip())
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return {
            "uid": str(user_id),
            "email": email.strip().lower(),
            "name": name.strip(),
            "provider": "password"
        }
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("Email already registered")

def verify_user(email: str, password: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    conn.close()
    
    if row and verify_password(row["password"], password):
        return {
            "uid": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "provider": "password"
        }
    return None

def get_or_create_google_user(email: str, name: str, uid: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    
    if row:
        conn.close()
        return {
            "uid": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "provider": "google"
        }
    
    dummy_pass = os.urandom(32).hex()
    hashed = hash_password(dummy_pass)
    cursor.execute(
        "INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
        (email.strip().lower(), hashed, name.strip())
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return {
        "uid": str(user_id),
        "email": email.strip().lower(),
        "name": name.strip(),
        "provider": "google"
    }

# Session logic
def create_session(github_url: str, resume_name: str = None, resume_text: str = None, role: str = "Software Engineer") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (github_url, resume_name, resume_text, role) VALUES (?, ?, ?, ?)",
        (github_url, resume_name, resume_text, role)
    )
    conn.commit()
    session_id = cursor.lastrowid
    conn.close()
    return session_id

def save_questions(session_id: int, questions_list: list):
    conn = get_db_connection()
    cursor = conn.cursor()
    for q in questions_list:
        cursor.execute(
            """
            INSERT INTO questions (session_id, question_id_in_session, type, title, code, question_text, initial_tip, stream_transcript)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                q.get("id"),
                q.get("type"),
                q.get("title"),
                q.get("code"),
                q.get("question"),
                q.get("initialTip"),
                json.dumps(q.get("streamTranscript", []))
            )
        )
    conn.commit()
    conn.close()

def save_message(session_id: int, role: str, content: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
        (session_id, role, content)
    )
    conn.commit()
    conn.close()

def get_messages_for_session(session_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def save_answer(session_id: int, question_id_in_session: int, answer_text: str, score: float, wpm: int, fillers: int, live_tip: str, matched_keywords: list, missing_keywords: list):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM answers WHERE session_id = ? AND question_id_in_session = ?",
        (session_id, question_id_in_session)
    )
    cursor.execute(
        """
        INSERT INTO answers (session_id, question_id_in_session, answer_text, score, wpm, fillers, live_tip, matched_keywords, missing_keywords)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            session_id,
            question_id_in_session,
            answer_text,
            score,
            wpm,
            fillers,
            live_tip,
            json.dumps(matched_keywords),
            json.dumps(missing_keywords)
        )
    )
    conn.commit()
    conn.close()

def end_session(session_id: int, duration_seconds: int, total_frames: int = 0, away_frames: int = 0) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT score FROM answers WHERE session_id = ?", (session_id,))
    rows = cursor.fetchall()
    
    if rows:
        avg_score = round(sum(r["score"] for r in rows) / len(rows), 1)
    else:
        avg_score = 0.0
        
    m = duration_seconds // 60
    s = duration_seconds % 60
    duration_str = f"{m}m {s}s" if m > 0 else f"{s}s"
    
    body_score = 100
    if total_frames > 0:
        away_ratio = min(1.0, away_frames / total_frames)
        body_score = max(0, int(100 - (away_ratio * 100)))
    
    cursor.execute(
        "UPDATE sessions SET score = ?, duration = ?, body_score = ? WHERE id = ?",
        (avg_score, duration_str, body_score, session_id)
    )
    conn.commit()
    conn.close()
    
    return {
        "score": avg_score,
        "duration": duration_str
    }

def get_history_data() -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM sessions WHERE score IS NOT NULL ORDER BY id DESC")
    sessions = [dict(s) for s in cursor.fetchall()]
    
    dashboard_history = []
    analytics_history = []
    
    for i, s in enumerate(sessions):
        try:
            dt = datetime.strptime(s["created_at"], "%Y-%m-%d %H:%M:%S")
            formatted_date = dt.strftime("%b %d, %Y")
        except Exception:
            formatted_date = s["created_at"]
            
        dashboard_history.append({
            "id": s["id"],
            "session": s["role"],
            "date": formatted_date,
            "status": f"{s['score']} / 10",
            "duration": s["duration"] or "0s"
        })
        
        trend = "neutral"
        if i + 1 < len(sessions):
            prev_score = sessions[i+1]["score"]
            if s["score"] > prev_score:
                trend = "up"
            elif s["score"] < prev_score:
                trend = "down"
                
        analytics_history.append({
            "date": formatted_date,
            "role": s["role"],
            "score": f"{int(s['score'] * 10)}%",
            "trend": trend
        })
        
    cursor.execute("""
        SELECT a.* FROM answers a
        JOIN sessions s ON a.session_id = s.id
        WHERE s.score IS NOT NULL
    """)
    answers = [dict(ans) for ans in cursor.fetchall()]
    
    # Query voice sessions
    try:
        cursor.execute("SELECT * FROM voice_sessions WHERE overall_rating IS NOT NULL ORDER BY id DESC")
        voice_sessions = [dict(vs) for vs in cursor.fetchall()]
    except sqlite3.OperationalError:
        voice_sessions = []
        
    conn.close()
    
    voice_history = []
    for vs in voice_sessions:
        try:
            dt = datetime.strptime(vs["created_at"], "%Y-%m-%d %H:%M:%S")
            formatted_date = dt.strftime("%b %d, %Y")
        except Exception:
            formatted_date = vs["created_at"]
            
        voice_history.append({
            "id": vs["id"],
            "session": vs["role"],
            "date": formatted_date,
            "status": f"{vs['overall_rating']} / 10",
            "duration": f"{vs['duration_seconds'] // 60}m {vs['duration_seconds'] % 60}s" if vs.get("duration_seconds") else "0s"
        })

    # Combined Averages & Insights
    overall_readiness = 0
    comm_score = 75
    tech_score = 70
    body_score = 80
    conf_score = 70
    problem_solving_score = 70
    system_design_score = 70
    ownership_score = 70
    improvements = []
    
    # 1. Process Coding Sessions
    coding_count = len(sessions)
    if sessions:
        latest_score = sessions[0]["score"]
        avg_coding_score = sum(s["score"] for s in sessions) / coding_count
        
        avg_body = sum((s["body_score"] or 0) for s in sessions) / coding_count
        body_score = int(avg_body)
        
        total_fillers = sum(a["fillers"] for a in answers)
        total_wpm = sum(a["wpm"] for a in answers)
        total_answers = len(answers) if answers else 1
        correct_answers = sum(1 for a in answers if a["score"] >= 7.0)
        
        avg_fillers = total_fillers / total_answers
        avg_wpm = total_wpm / total_answers
        
        coding_comm_score = int(max(40, min(100, 100 - (avg_fillers * 7) - abs(avg_wpm - 130) * 0.8)))
        coding_conf_score = int(max(40, min(100, 100 - (avg_fillers * 10))))
        avg_score_10 = avg_coding_score
        
        if avg_fillers > 3:
            improvements.append({
                "type": "warning",
                "title": "Reduce Filler Words",
                "detail": f"You averaged {round(avg_fillers, 1)} filler words ('um', 'like', 'actually') per question. Focus on brief pauses rather than filler sounds."
            })
        if avg_score_10 < 8.0:
            improvements.append({
                "type": "lightbulb",
                "title": "Technical Depth",
                "detail": "Your answers occasionally lacked specific technical terminology or details. Try explaining core architectural flows or code constraints."
            })
        if avg_wpm < 110 or avg_wpm > 160:
            improvements.append({
                "type": "warning",
                "title": "Pacing Adjustment",
                "detail": f"Your talking speed averaged {int(avg_wpm)} WPM. Standard professional pacing is 120-140 WPM. Focus on clear, rhythmic delivery."
            })
        if body_score < 70:
            improvements.append({
                "type": "camera",
                "title": "Eye Contact",
                "detail": "Our OpenCV models detected that you frequently look away from the camera. Maintain consistent focus to build stronger presence."
            })
    else:
        coding_comm_score = None
        coding_conf_score = None
        avg_coding_score = None
        correct_answers = 0
        total_answers = 0
        
    # 2. Process Voice Sessions
    voice_count = len(voice_sessions)
    if voice_sessions:
        avg_voice_overall = sum(vs["overall_rating"] for vs in voice_sessions) / voice_count
        avg_technical_depth = sum(vs["technical_depth"] for vs in voice_sessions) / voice_count
        avg_communication = sum(vs["communication"] for vs in voice_sessions) / voice_count
        avg_problem_solving = sum(vs["problem_solving"] for vs in voice_sessions) / voice_count
        avg_system_design = sum(vs["system_design"] for vs in voice_sessions) / voice_count
        avg_ownership = sum(vs["ownership"] for vs in voice_sessions) / voice_count
        
        # Pull strengths/weaknesses/missed_concepts from the latest voice session
        latest_voice = voice_sessions[0]
        if latest_voice.get("weaknesses"):
            try:
                weaknesses_list = json.loads(latest_voice["weaknesses"])
                if isinstance(weaknesses_list, list):
                    for w in weaknesses_list[:2]:
                        improvements.append({
                            "type": "warning",
                            "title": "Voice Copilot: Development Area",
                            "detail": w
                        })
            except Exception:
                pass
                
        if latest_voice.get("missed_concepts"):
            try:
                missed_list = json.loads(latest_voice["missed_concepts"])
                if isinstance(missed_list, list):
                    for mc in missed_list[:2]:
                        improvements.append({
                            "type": "lightbulb",
                            "title": "Voice Copilot: Concept to Review",
                            "detail": f"You missed or didn't detail: '{mc}'. Review this topic to boost your architectural depth."
                        })
            except Exception:
                pass
    else:
        avg_voice_overall = None
        avg_technical_depth = None
        avg_communication = None
        avg_problem_solving = None
        avg_system_design = None
        avg_ownership = None
        
    # 3. Calculations (No dummy defaults, purely based on database records)
    latest_scores = []
    if sessions:
        latest_scores.append(sessions[0]["score"] * 10)
    if voice_sessions:
        latest_scores.append(voice_sessions[0]["overall_rating"] * 10)
        
    if latest_scores:
        overall_readiness = int(sum(latest_scores) / len(latest_scores))
        
    # Problem Solving: based on DSA coding tests (average coding score * 10)
    if avg_coding_score is not None:
        problem_solving_score = int(avg_coding_score * 10)
    elif avg_problem_solving is not None:
        problem_solving_score = int(avg_problem_solving * 10)
    else:
        problem_solving_score = 0
        
    # Technical Depth: based on Voice Copilot technical depth
    if avg_technical_depth is not None:
        tech_score = int(avg_technical_depth * 10)
    elif avg_coding_score is not None:
        tech_score = int(avg_coding_score * 10)
    else:
        tech_score = 0
        
    # Communication Flow: based on Voice Copilot communication rating
    if avg_communication is not None:
        comm_score = int(avg_communication * 10)
    elif coding_comm_score is not None:
        comm_score = coding_comm_score
    else:
        comm_score = 0
        
    # System Architecture: based on Voice Copilot system design rating
    if avg_system_design is not None:
        system_design_score = int(avg_system_design * 10)
    else:
        system_design_score = 0
        
    # Behavioral & Leadership: based on Voice Copilot ownership rating
    if avg_ownership is not None:
        ownership_score = int(avg_ownership * 10)
    else:
        ownership_score = 0
        
    if coding_conf_score is not None:
        conf_score = coding_conf_score
        
    if not improvements:
        improvements.append({
            "type": "lightbulb",
            "title": "STAR Response Model",
            "detail": "When answering behavioral or conceptual questions, explicitly frame them using the Situation, Task, Action, and Result approach."
        })
        
    # Construct skills report
    roles_tested = list(set([s["role"] for s in sessions] + [vs["role"] for vs in voice_sessions]))
    if roles_tested:
        role_str = roles_tested[0]
        skills_report = (
            f"Your performance in '{role_str}' sessions indicates "
            f"{'excellent communication pacing' if comm_score >= 85 else 'a solid communication basis'} and "
            f"{'strong technical knowledge depth' if tech_score >= 80 else 'growing technical fundamentals'}. "
            f"Your confidence ratings averaged {conf_score}/100. "
            f"Focus on resolving the highlighted improvements to elevate your interview readiness."
        )
    else:
        skills_report = "No interview sessions completed yet. Start a session to analyze your communication and technical patterns."
        
    return {
        "dashboard_history": dashboard_history,
        "voice_history": voice_history,
        "analytics_history": analytics_history,
        "overall_stats": {
            "overall_readiness": overall_readiness,
            "communication": comm_score,
            "technical_knowledge": tech_score,
            "problem_solving": problem_solving_score,
            "system_design": system_design_score,
            "ownership": ownership_score,
            "body_language": body_score,
            "confidence": conf_score,
            "improvements": improvements,
            "correct_answers": correct_answers,
            "total_answers": total_answers,
            "coding_sessions_count": coding_count,
            "voice_sessions_count": voice_count
        },
        "skills_report": skills_report
    }

def get_questions_for_session(session_id: int) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM questions WHERE session_id = ? ORDER BY question_id_in_session ASC", (session_id,))
    rows = cursor.fetchall()
    conn.close()
    
    questions = []
    for r in rows:
        questions.append({
            "id": r["question_id_in_session"],
            "type": r["type"],
            "title": r["title"],
            "code": r["code"],
            "question": r["question_text"],
            "initialTip": r["initial_tip"],
            "streamTranscript": json.loads(r["stream_transcript"]) if r["stream_transcript"] else []
        })
    return questions
