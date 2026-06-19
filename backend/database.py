import sqlite3
import json
import os
import hashlib
import re
import datetime
from datetime import datetime as dt_class

DB_FILE = os.path.join(os.path.dirname(__file__), "interviews.db")

# Wrapper classes for PostgreSQL compatibility
class DictRowWrapper:
    def __init__(self, d, keys):
        if isinstance(d, dict):
            self._dict = d
        elif isinstance(d, (list, tuple)):
            self._dict = {keys[i]: d[i] for i in range(len(keys))}
        else:
            self._dict = {keys[i]: d[i] for i in range(len(keys))}
        self._keys = keys

    def __getitem__(self, key):
        if isinstance(key, int):
            val = self._dict[self._keys[key]]
        else:
            val = self._dict[key]
        if isinstance(val, datetime.datetime):
            return val.strftime("%Y-%m-%d %H:%M:%S")
        return val

    def keys(self):
        return self._dict.keys()

    def get(self, key, default=None):
        val = self._dict.get(key, default)
        if isinstance(val, datetime.datetime):
            return val.strftime("%Y-%m-%d %H:%M:%S")
        return val

    def __iter__(self):
        return iter(self._dict)

    def __repr__(self):
        return repr(self._dict)
        
    def __len__(self):
        return len(self._dict)

class PgCursorWrapper:
    def __init__(self, pg_cursor):
        self._cursor = pg_cursor
        self._lastrowid = None

    def execute(self, query, params=None):
        converted_query = self._convert_query(query)
        is_insert = converted_query.strip().upper().startswith("INSERT")
        
        if is_insert and "RETURNING" not in converted_query.upper():
            tbl_match = re.search(r'(?i)\bINTO\s+(\w+)', converted_query)
            if tbl_match:
                table_name = tbl_match.group(1).lower()
                if table_name != "candidate_profiles":
                    converted_query += " RETURNING id"
        
        if params is not None and not isinstance(params, (tuple, list, dict)):
            params = tuple(params)
            
        self._cursor.execute(converted_query, params)
        
        if is_insert:
            try:
                if "RETURNING id" in converted_query:
                    row = self._cursor.fetchone()
                    if row:
                        if isinstance(row, dict):
                            self._lastrowid = row.get("id")
                        elif hasattr(row, "get"):
                            self._lastrowid = row.get("id")
                        else:
                            self._lastrowid = row[0]
            except Exception:
                self._lastrowid = None
        else:
            self._lastrowid = None
            
        return self

    def executemany(self, query, params_list):
        converted_query = self._convert_query(query)
        self._cursor.executemany(converted_query, params_list)
        return self

    def fetchone(self):
        row = self._cursor.fetchone()
        if row is None:
            return None
        return DictRowWrapper(row, [desc[0] for desc in self._cursor.description])

    def fetchall(self):
        rows = self._cursor.fetchall()
        if not rows:
            return []
        keys = [desc[0] for desc in self._cursor.description]
        return [DictRowWrapper(row, keys) for row in rows]

    @property
    def lastrowid(self):
        return self._lastrowid

    def _convert_query(self, query):
        if not query:
            return query
            
        # Replace ? placeholder with %s
        in_quotes = False
        quote_char = None
        chars = []
        for char in query:
            if char in ('"', "'"):
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif quote_char == char:
                    in_quotes = False
                    quote_char = None
            if char == '?' and not in_quotes:
                chars.append('%s')
            else:
                chars.append(char)
        converted = "".join(chars)
        
        # Replace AUTOINCREMENT with serial
        converted = re.sub(r'(?i)\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b', 'SERIAL PRIMARY KEY', converted)
        converted = re.sub(r'(?i)\bINTEGER\s+PRIMARY\s+KEY\b', 'SERIAL PRIMARY KEY', converted)
        
        # Convert TEXT DEFAULT CURRENT_TIMESTAMP to TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        converted = converted.replace("TEXT DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        
        return converted

    def __getattr__(self, name):
        return getattr(self._cursor, name)

class PgConnectionWrapper:
    def __init__(self, pg_conn):
        self._conn = pg_conn

    def cursor(self):
        return PgCursorWrapper(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)

def get_db_connection():
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        import psycopg2
        conn = psycopg2.connect(database_url)
        return PgConnectionWrapper(conn)
    else:
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
            language TEXT DEFAULT 'en-IN',
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
    
    # Create candidate_profiles table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS candidate_profiles (
            user_id TEXT PRIMARY KEY,
            job_type TEXT,
            work_mode TEXT,
            countries TEXT,
            cities TEXT,
            salary_expectations TEXT,
            notice_period TEXT,
            tech_stack_preferences TEXT,
            company_size_preference TEXT,
            startup_vs_enterprise TEXT,
            visa_sponsorship TEXT,
            resume_name TEXT,
            resume_text TEXT,
            github_url TEXT,
            linkedin_url TEXT,
            github_stats TEXT,
            linkedin_data TEXT,
            company_type_preference TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create jobs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT,
            work_mode TEXT,
            salary TEXT,
            experience_required TEXT,
            skills_required TEXT,
            description TEXT,
            source TEXT,
            url TEXT,
            ats_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create applications table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            status TEXT DEFAULT 'Applied',
            custom_responses TEXT,
            submission_logs TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
        )
    """)
    
    # Alter voice_sessions to add language column if migrating from an older DB
    try:
        cursor.execute("ALTER TABLE voice_sessions ADD COLUMN language TEXT DEFAULT 'en-IN'")
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

    # Alter candidate_profiles to add company_type_preference column if migrating from an older DB
    try:
        cursor.execute("ALTER TABLE candidate_profiles ADD COLUMN company_type_preference TEXT DEFAULT 'Any'")
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

    conn.commit()
    conn.close()
    print("SQLite Database successfully initialized at:", DB_FILE)
    
    # Seed default developer jobs if the table is empty
    seed_jobs_if_empty()


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
    except Exception as e:
        conn.close()
        err_str = str(e).lower()
        if "integrity" in err_str or "unique" in err_str or "duplicate" in err_str:
            raise ValueError("Email already registered")
        raise e

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

def get_user_by_id(user_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE id = ?", (int(user_id),))
        row = cursor.fetchone()
        if row:
            return {
                "id": str(row["id"]),
                "email": row["email"],
                "name": row["name"]
            }
    except Exception:
        pass
    finally:
        conn.close()
    return None

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
    except Exception:
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


# ----------------------------------------------------
# AI Career Agent Database Helper Functions
# ----------------------------------------------------

def save_candidate_profile(user_id: str, p: dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if profile already exists
    cursor.execute("SELECT 1 FROM candidate_profiles WHERE user_id = ?", (user_id,))
    exists = cursor.fetchone()
    
    if exists:
        cursor.execute("""
            UPDATE candidate_profiles SET
                job_type = ?, work_mode = ?, countries = ?, cities = ?,
                salary_expectations = ?, notice_period = ?, tech_stack_preferences = ?,
                company_size_preference = ?, startup_vs_enterprise = ?, visa_sponsorship = ?,
                resume_name = ?, resume_text = ?, github_url = ?, linkedin_url = ?,
                github_stats = ?, linkedin_data = ?, company_type_preference = ?
            WHERE user_id = ?
        """, (
            p.get("job_type"), p.get("work_mode"), json.dumps(p.get("countries", [])), json.dumps(p.get("cities", [])),
            p.get("salary_expectations"), p.get("notice_period"), json.dumps(p.get("tech_stack_preferences", [])),
            p.get("company_size_preference"), p.get("startup_vs_enterprise"), p.get("visa_sponsorship"),
            p.get("resume_name"), p.get("resume_text"), p.get("github_url"), p.get("linkedin_url"),
            json.dumps(p.get("github_stats", {})), json.dumps(p.get("linkedin_data", {})),
            p.get("company_type_preference", "Any"),
            user_id
        ))
    else:
        cursor.execute("""
            INSERT INTO candidate_profiles (
                user_id, job_type, work_mode, countries, cities,
                salary_expectations, notice_period, tech_stack_preferences,
                company_size_preference, startup_vs_enterprise, visa_sponsorship,
                resume_name, resume_text, github_url, linkedin_url,
                github_stats, linkedin_data, company_type_preference
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, p.get("job_type"), p.get("work_mode"), json.dumps(p.get("countries", [])), json.dumps(p.get("cities", [])),
            p.get("salary_expectations"), p.get("notice_period"), json.dumps(p.get("tech_stack_preferences", [])),
            p.get("company_size_preference"), p.get("startup_vs_enterprise"), p.get("visa_sponsorship"),
            p.get("resume_name"), p.get("resume_text"), p.get("github_url"), p.get("linkedin_url"),
            json.dumps(p.get("github_stats", {})), json.dumps(p.get("linkedin_data", {})),
            p.get("company_type_preference", "Any")
        ))
    
    conn.commit()
    conn.close()

def get_candidate_profile(user_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM candidate_profiles WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        return None
        
    return {
        "user_id": row["user_id"],
        "job_type": row["job_type"],
        "work_mode": row["work_mode"],
        "countries": json.loads(row["countries"]) if row["countries"] else [],
        "cities": json.loads(row["cities"]) if row["cities"] else [],
        "salary_expectations": row["salary_expectations"],
        "notice_period": row["notice_period"],
        "tech_stack_preferences": json.loads(row["tech_stack_preferences"]) if row["tech_stack_preferences"] else [],
        "company_size_preference": row["company_size_preference"],
        "startup_vs_enterprise": row["startup_vs_enterprise"],
        "visa_sponsorship": row["visa_sponsorship"],
        "resume_name": row["resume_name"],
        "resume_text": row["resume_text"],
        "github_url": row["github_url"],
        "linkedin_url": row["linkedin_url"],
        "github_stats": json.loads(row["github_stats"]) if row["github_stats"] else {},
        "linkedin_data": json.loads(row["linkedin_data"]) if row["linkedin_data"] else {},
        "company_type_preference": row["company_type_preference"] if "company_type_preference" in row.keys() else "Any",
        "created_at": row["created_at"]
    }

def get_jobs() -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs ORDER BY id DESC")
    rows = cursor.fetchall()
    conn.close()
    
    jobs_list = []
    for r in rows:
        jobs_list.append({
            "id": r["id"],
            "title": r["title"],
            "company": r["company"],
            "location": r["location"],
            "work_mode": r["work_mode"],
            "salary": r["salary"],
            "experience_required": r["experience_required"],
            "skills_required": json.loads(r["skills_required"]) if r["skills_required"] else [],
            "description": r["description"],
            "source": r["source"],
            "url": r["url"],
            "ats_type": r["ats_type"],
            "created_at": r["created_at"]
        })
    return jobs_list

def get_job_by_id(job_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
    r = cursor.fetchone()
    conn.close()
    
    if not r:
        return None
        
    return {
        "id": r["id"],
        "title": r["title"],
        "company": r["company"],
        "location": r["location"],
        "work_mode": r["work_mode"],
        "salary": r["salary"],
        "experience_required": r["experience_required"],
        "skills_required": json.loads(r["skills_required"]) if r["skills_required"] else [],
        "description": r["description"],
        "source": r["source"],
        "url": r["url"],
        "ats_type": r["ats_type"],
        "created_at": r["created_at"]
    }

def create_application(user_id: str, job_id: int, status: str = "Applied", custom_responses: dict = None, submission_logs: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO applications (user_id, job_id, status, custom_responses, submission_logs)
        VALUES (?, ?, ?, ?, ?)
    """, (
        user_id,
        job_id,
        status,
        json.dumps(custom_responses) if custom_responses else "{}",
        submission_logs
    ))
    conn.commit()
    app_id = cursor.lastrowid
    conn.close()
    return app_id

def get_applications(user_id: str) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT a.*, j.title, j.company, j.location, j.work_mode, j.ats_type, j.source
        FROM applications a
        JOIN jobs j ON a.job_id = j.id
        WHERE a.user_id = ?
        ORDER BY a.updated_at DESC
    """, (user_id,))
    rows = cursor.fetchall()
    conn.close()
    
    apps = []
    for r in rows:
        apps.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "job_id": r["job_id"],
            "status": r["status"],
            "custom_responses": json.loads(r["custom_responses"]) if r["custom_responses"] else {},
            "submission_logs": r["submission_logs"],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "title": r["title"],
            "company": r["company"],
            "location": r["location"],
            "work_mode": r["work_mode"],
            "ats_type": r["ats_type"],
            "source": r["source"]
        })
    return apps

def update_application_status(app_id: int, status: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE applications
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (status, app_id))
    conn.commit()
    conn.close()

def update_application_logs(app_id: int, logs: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE applications
        SET submission_logs = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    """, (logs, app_id))
    conn.commit()
    conn.close()

def seed_jobs_if_empty():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if jobs already seeded
    cursor.execute("SELECT count(*) FROM jobs")
    count = cursor.fetchone()[0]
    if count > 0:
        conn.close()
        return
        
    jobs_to_seed = [
        {
            "title": "Design Engineer",
            "company": "Vercel",
            "location": "Remote, US",
            "work_mode": "Remote",
            "salary": "$160,000 - $210,000",
            "experience_required": "3+ years",
            "skills_required": ["TypeScript", "React", "Next.js", "CSS", "Tailwind", "Git"],
            "description": "Vercel is looking for a Design Engineer to help build beautiful, highly interactive frontend applications and frameworks. In this role, you will bridge the gap between design and engineering, constructing reusable components and polished web animations. Experience with React, Next.js, and CSS layout engines is essential.",
            "source": "Vercel Careers",
            "url": "https://job-boards.greenhouse.io/vercel/jobs/5709080004",
            "ats_type": "Greenhouse"
        },
        {
            "title": "AI Applied Scientist",
            "company": "Figma",
            "location": "San Francisco, CA",
            "work_mode": "Onsite",
            "salary": "$200,000 - $260,000",
            "experience_required": "5+ years",
            "skills_required": ["Python", "FastAPI", "TypeScript", "Machine Learning", "AI", "LLM", "Docker"],
            "description": "Join the AI group at Figma to build intelligent design assistants, generative UI copilots, and advanced model integrations. You will train, fine-tune, and deploy models that understand vector design structures. Strong background in Python, PyTorch, LLMs, and API engineering is required.",
            "source": "Figma Careers",
            "url": "https://boards.greenhouse.io/figma/jobs/6014642004?gh_jid=6014642004",
            "ats_type": "Greenhouse"
        },
        {
            "title": "Fullstack Software Engineer",
            "company": "Reddit",
            "location": "Remote, USA",
            "work_mode": "Remote",
            "salary": "$140,000 - $190,000",
            "experience_required": "3+ years",
            "skills_required": ["Python", "Go", "TypeScript", "React", "Node.js", "PostgreSQL", "Redis"],
            "description": "Reddit is seeking a Fullstack Engineer for the Notifications Lifecycle team. You will build high-throughput messaging channels, configure real-time notification dispatchers in Python and Go, and build notification management tools in React and TypeScript. Experience scaling distributed databases like PostgreSQL and Redis is highly preferred.",
            "source": "Reddit Careers",
            "url": "https://job-boards.greenhouse.io/reddit/jobs/7792848",
            "ats_type": "Greenhouse"
        },
        {
            "title": "AI Engineer",
            "company": "Samsara",
            "location": "San Francisco, CA (Hybrid)",
            "work_mode": "Hybrid",
            "salary": "$150,000 - $200,000",
            "experience_required": "3+ years",
            "skills_required": ["Python", "Go", "Docker", "AWS", "Machine Learning", "AI", "LLM"],
            "description": "As an AI Engineer at Samsara, you will design and implement intelligent computer vision and NLP models to improve physical operations. You will develop backend APIs in Go/Python, dockerize ML model pipelines, and run large-scale inference tasks on AWS. Experience with real-world sensor data or video analytics is a plus.",
            "source": "Samsara Careers",
            "url": "https://www.samsara.com/company/careers/roles/7589442?gh_jid=7589442",
            "ats_type": "Greenhouse"
        },
        {
            "title": "Software Engineer, Frontend",
            "company": "Ramp",
            "location": "New York, NY",
            "work_mode": "Hybrid",
            "salary": "$140,000 - $180,000",
            "experience_required": "3+ years",
            "skills_required": ["TypeScript", "JavaScript", "React", "Next.js", "CSS", "Git"],
            "description": "Ramp is looking for a Frontend Engineer to construct premium credit card management products and corporate payment interfaces. You will develop highly responsive React frontends, optimize client-side bundle performance, and design secure dashboard states. Proficiency in TypeScript and CSS is required.",
            "source": "Ramp Careers",
            "url": "https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245",
            "ats_type": "Ashby"
        },
        {
            "title": "Site Reliability Engineer",
            "company": "WorkOS",
            "location": "Remote, US & Canada",
            "work_mode": "Remote",
            "salary": "$150,000 - $200,000",
            "experience_required": "5+ years",
            "skills_required": ["Go", "Docker", "Kubernetes", "AWS", "Terraform", "PostgreSQL", "Redis"],
            "description": "WorkOS is searching for a Site Reliability Engineer to manage global infrastructure for developer APIs. You will manage multi-region Kubernetes clusters, optimize PostgreSQL and Redis datastores, write infrastructure-as-code using Terraform, and implement containerized deployment pipelines. Deep Go, AWS, and networking knowledge is required.",
            "source": "Workos Careers",
            "url": "https://jobs.ashbyhq.com/workos/cff5a16f-fd1c-4b64-9b66-8a8321122375",
            "ats_type": "Ashby"
        }
    ]
    
    for job in jobs_to_seed:
        cursor.execute("""
            INSERT INTO jobs (title, company, location, work_mode, salary, experience_required, skills_required, description, source, url, ats_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            job["title"],
            job["company"],
            job["location"],
            job["work_mode"],
            job["salary"],
            job["experience_required"],
            json.dumps(job["skills_required"]),
            job["description"],
            job["source"],
            job["url"],
            job["ats_type"]
        ))
        
    conn.commit()
    conn.close()
    print("Jobs successfully seeded in database.")
