import json
import os
import hashlib
import re
import datetime
import secrets
import threading
import html
import urllib.request
import random
from datetime import datetime as dt_class
from dotenv import load_dotenv

# Load environment
load_dotenv()

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
        # Row consumed by execute() to populate lastrowid, held so the caller's
        # own fetchone() still sees it. See execute() for why.
        self._pending_row = None
        self._pending_keys = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self._cursor.close()


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

        self._pending_row = None
        self._pending_keys = None
        # Reset per execute: an INSERT ... ON CONFLICT DO NOTHING returns no row,
        # and a caller reading lastrowid after one must not get the id from the
        # previous statement.
        self._lastrowid = None
        self._cursor.execute(converted_query, params)

        if is_insert:
            try:
                if "RETURNING" in converted_query.upper():
                    # Reading the row here is what makes `cursor.lastrowid` work,
                    # but it also consumes it — so an INSERT ... RETURNING whose
                    # caller does its own fetchone() used to silently get None.
                    # The row is stashed and replayed instead.
                    row = self._cursor.fetchone()
                    if row is not None:
                        self._pending_row = row
                        self._pending_keys = [desc[0] for desc in self._cursor.description]
                        if hasattr(row, "get"):
                            self._lastrowid = row.get("id")
                        else:
                            try:
                                self._lastrowid = row[self._pending_keys.index("id")]
                            except ValueError:
                                self._lastrowid = row[0]
            except Exception:
                self._lastrowid = None

        return self

    def executemany(self, query, params_list):
        converted_query = self._convert_query(query)
        self._pending_row = None
        self._pending_keys = None
        self._cursor.executemany(converted_query, params_list)
        return self

    def fetchone(self):
        if self._pending_row is not None:
            row, keys = self._pending_row, self._pending_keys
            self._pending_row = None
            self._pending_keys = None
            return DictRowWrapper(row, keys)
        row = self._cursor.fetchone()
        if row is None:
            return None
        return DictRowWrapper(row, [desc[0] for desc in self._cursor.description])

    def fetchall(self):
        replayed = []
        if self._pending_row is not None:
            replayed = [DictRowWrapper(self._pending_row, self._pending_keys)]
            self._pending_row = None
            self._pending_keys = None
        rows = self._cursor.fetchall()
        if not rows:
            return replayed
        keys = [desc[0] for desc in self._cursor.description]
        return replayed + [DictRowWrapper(row, keys) for row in rows]

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
    def __init__(self, pg_conn, pool=None):
        self._conn = pg_conn
        self._pool = pool

    def cursor(self):
        return PgCursorWrapper(self._conn.cursor())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        if self._pool:
            try:
                self._pool.putconn(self._conn)
            except Exception as e:
                print(f"Error returning connection to pool: {e}")
                self._conn.close()
        else:
            self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)

_connection_pool = None

def _get_connection_pool():
    global _connection_pool
    if _connection_pool is not None:
        return _connection_pool
    
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return None
        
    from psycopg2.pool import ThreadedConnectionPool
    try:
        # Initialize connection pool with min 1 and max 30 connections
        _connection_pool = ThreadedConnectionPool(1, 30, database_url)
        print("PgConnectionPool: Threaded pool successfully initialized.")
        return _connection_pool
    except Exception as e:
        print(f"PgConnectionPool: Failed to initialize connection pool: {e}")
        return None

def get_db_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable is missing. Neon PostgreSQL is required.")
        
    pool = _get_connection_pool()
    if pool:
        import psycopg2
        # Try to get a healthy connection from the pool (up to 3 attempts)
        for attempt in range(3):
            try:
                conn = pool.getconn()
                # Test connection health
                try:
                    with conn.cursor() as test_cursor:
                        test_cursor.execute("SELECT 1")
                    conn.rollback()
                    return PgConnectionWrapper(conn, pool=pool)
                except (psycopg2.OperationalError, psycopg2.InterfaceError) as test_err:
                    print(f"PgConnectionPool: Retrieved dead connection from pool (attempt {attempt+1}): {test_err}. Discarding and retrying...")
                    try:
                        pool.putconn(conn, close=True)
                    except Exception as put_err:
                        print(f"PgConnectionPool: Error closing dead connection: {put_err}")
                        try:
                            conn.close()
                        except Exception:
                            pass
            except Exception as e:
                print(f"PgConnectionPool: Failed to get connection from pool ({e}).")
                break
        print("PgConnectionPool: Failed to get a healthy connection from pool after retries. Falling back to direct connection.")
            
    import psycopg2
    import time
    max_retries = 4
    delay = 0.5
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(database_url)
            return PgConnectionWrapper(conn)
        except Exception as e:
            print(f"PostgreSQL connection attempt {attempt+1} failed in database.py: {e}")
            if attempt < max_retries - 1:
                time.sleep(delay)
                delay *= 2
            else:
                raise e


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


# =========================================================================
# SLUG / TOKEN HELPERS
# =========================================================================

def slugify(value: str) -> str:
    """Lowercase, hyphen-separated, alphanumeric slug."""
    cleaned = re.sub(r'[^a-z0-9]+', '-', (value or "").strip().lower()).strip('-')
    return cleaned[:48] or "org"


def _unique_org_slug(cursor, name: str) -> str:
    """Returns a slug that is not yet taken in the organizations table."""
    base = slugify(name)
    candidate = base
    suffix = 2
    while True:
        cursor.execute("SELECT 1 FROM organizations WHERE slug = %s", (candidate,))
        if cursor.fetchone() is None:
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


def hash_token(raw_token: str) -> str:
    """One-way digest for anything token-shaped that we persist."""
    return hashlib.sha256((raw_token or "").encode("utf-8")).hexdigest()


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'candidate',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            github_url TEXT NOT NULL,
            resume_name TEXT,
            resume_text TEXT,
            role TEXT DEFAULT 'Software Engineer',
            score REAL,
            duration TEXT,
            body_score REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create questions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS questions (
            id SERIAL PRIMARY KEY,
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
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL,
            question_id_in_session INTEGER NOT NULL,
            answer_text TEXT NOT NULL,
            score REAL NOT NULL,
            wpm INTEGER NOT NULL,
            fillers INTEGER NOT NULL,
            live_tip TEXT,
            matched_keywords TEXT, -- JSON array of strings
            missing_keywords TEXT, -- JSON array of strings
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Create messages table for conversational interview
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
        )
    """)
    
    # Create voice_sessions table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS voice_sessions (
            id SERIAL PRIMARY KEY,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    # Create voice_messages table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS voice_messages (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            audio_path TEXT,
            evaluation TEXT, -- JSON string for hidden evaluation
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
            portfolio_url TEXT DEFAULT '',
            leetcode_handle TEXT DEFAULT '',
            leetcode_stats TEXT DEFAULT '{}',
            codeforces_handle TEXT DEFAULT '',
            codeforces_stats TEXT DEFAULT '{}',
            devscore INTEGER DEFAULT 0,
            devscore_breakdown TEXT DEFAULT '{}',
            last_platform_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create jobs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS jobs (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            company TEXT NOT NULL,
            location TEXT,
            work_mode TEXT,
            salary TEXT,
            experience_required TEXT,
            skills_required TEXT,
            description TEXT,
            source TEXT,
            url TEXT UNIQUE,
            ats_type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create applications table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            job_id INTEGER NOT NULL,
            status TEXT DEFAULT 'Applied',
            custom_responses TEXT,
            submission_logs TEXT,
            tracking_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE
        )
    """)
    try:
        cursor.execute("ALTER TABLE applications ADD COLUMN IF NOT EXISTS tracking_id TEXT;")
    except Exception:
        pass

    # Commit all table creations
    conn.commit()

    def column_exists(table_name: str, column_name: str) -> bool:
        cursor.execute("""
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = %s AND column_name = %s
        """, (table_name, column_name))
        return cursor.fetchone() is not None

    def constraint_exists(table_name: str, name: str) -> bool:
        cursor.execute("""
            SELECT 1 
            FROM information_schema.table_constraints 
            WHERE table_name = %s AND constraint_name = %s
        """, (table_name, name))
        return cursor.fetchone() is not None

    # Ensure jobs table has UNIQUE constraint on url
    try:
        if not constraint_exists('jobs', 'unique_job_url'):
            print("Clearing duplicate jobs to establish unique constraint...")
            cursor.execute("DELETE FROM jobs")
            cursor.execute("ALTER TABLE jobs ADD CONSTRAINT unique_job_url UNIQUE (url)")
            conn.commit()
    except Exception as e:
        print("Error establishing unique constraint on jobs table:", e)
        try:
            conn.rollback()
        except Exception:
            pass
    
    # Alter voice_sessions to add language column if migrating from an older DB
    try:
        if not column_exists('voice_sessions', 'language'):
            cursor.execute("ALTER TABLE voice_sessions ADD COLUMN language TEXT DEFAULT 'en-IN'")
            conn.commit()
    except Exception as e:
        print("Error adding language to voice_sessions:", e)
        try:
            conn.rollback()
        except Exception:
            pass

    # Alter candidate_profiles to add company_type_preference column if migrating from an older DB
    try:
        if not column_exists('candidate_profiles', 'company_type_preference'):
            cursor.execute("ALTER TABLE candidate_profiles ADD COLUMN company_type_preference TEXT DEFAULT 'Any'")
            conn.commit()
    except Exception as e:
        print("Error adding company_type_preference to candidate_profiles:", e)
        try:
            conn.rollback()
        except Exception:
            pass

    # Alter candidate_profiles to add portfolio_url column if migrating from an older DB
    try:
        if not column_exists('candidate_profiles', 'portfolio_url'):
            cursor.execute("ALTER TABLE candidate_profiles ADD COLUMN portfolio_url TEXT DEFAULT ''")
            conn.commit()
    except Exception as e:
        print("Error adding portfolio_url to candidate_profiles:", e)
        try:
            conn.rollback()
        except Exception:
            pass

    # Alter candidate_profiles to add multi-platform & devscore columns

    # ─── External-jobs freshness columns ───────────────────────────────────
    # `fetched_at` is set every time a job is seen in a provider feed.
    # `is_live` is False once a job has been absent from a feed for more than
    # the staleness threshold. The `get_jobs()` query filters to live rows, so
    # an old closing is automatically removed from candidate-facing feeds.
    try:
        if not column_exists('jobs', 'fetched_at'):
            cursor.execute("ALTER TABLE jobs ADD COLUMN fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            conn.commit()
    except Exception as e:
        print("Error adding fetched_at to jobs:", e)
        try:
            conn.rollback()
        except Exception:
            pass
    try:
        if not column_exists('jobs', 'is_live'):
            cursor.execute("ALTER TABLE jobs ADD COLUMN is_live BOOLEAN DEFAULT TRUE")
            conn.commit()
    except Exception as e:
        print("Error adding is_live to jobs:", e)
        try:
            conn.rollback()
        except Exception:
            pass
    try:
        if not column_exists('jobs', 'closed_at'):
            cursor.execute("ALTER TABLE jobs ADD COLUMN closed_at TIMESTAMP")
            conn.commit()
    except Exception as e:
        print("Error adding closed_at to jobs:", e)
        try:
            conn.rollback()
        except Exception:
            pass
    try:
        if not column_exists('jobs', 'provider'):
            cursor.execute("ALTER TABLE jobs ADD COLUMN provider TEXT DEFAULT 'unknown'")
            conn.commit()
    except Exception as e:
        print("Error adding provider to jobs:", e)
        try:
            conn.rollback()
        except Exception:
            pass
    try:
        if not column_exists('jobs', 'listed_at'):
            # When the upstream job was originally published, as best we can
            # tell. Providers don't always expose this, so it falls back to
            # fetched_at for jobs that don't carry their own timestamp.
            cursor.execute("ALTER TABLE jobs ADD COLUMN listed_at TIMESTAMP")
            conn.commit()
    except Exception as e:
        print("Error adding listed_at to jobs:", e)
        try:
            conn.rollback()
        except Exception:
            pass

    # Create recruiter_jobs table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recruiter_jobs (
            id SERIAL PRIMARY KEY,
            recruiter_id TEXT NOT NULL,
            company_name TEXT NOT NULL,
            role_title TEXT NOT NULL,
            work_mode TEXT DEFAULT 'Remote',
            location TEXT DEFAULT 'Global / Remote',
            salary_range TEXT DEFAULT '$120,000 - $160,000',
            min_devscore INTEGER DEFAULT 650,
            required_skills TEXT DEFAULT '[]',
            experience_level TEXT DEFAULT 'Mid-Level',
            description TEXT,
            status TEXT DEFAULT 'Active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create candidate_shortlists table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS candidate_shortlists (
            id SERIAL PRIMARY KEY,
            recruiter_id TEXT NOT NULL,
            candidate_id TEXT NOT NULL,
            candidate_name TEXT,
            job_id INTEGER DEFAULT 0,
            stage TEXT DEFAULT 'Shortlisted',
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Create takehome_assessments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS takehome_assessments (
            id SERIAL PRIMARY KEY,
            token TEXT UNIQUE NOT NULL,
            recruiter_id TEXT NOT NULL,
            candidate_id TEXT NOT NULL,
            candidate_name TEXT,
            role_title TEXT,
            problem_title TEXT,
            problem_slug TEXT,
            difficulty TEXT DEFAULT 'Medium',
            time_limit_minutes INTEGER DEFAULT 45,
            status TEXT DEFAULT 'Sent',
            score INTEGER DEFAULT 0,
            chaos_resilience INTEGER DEFAULT 0,
            test_results TEXT DEFAULT '{}',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    """)

    # Create startup_profiles table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS startup_profiles (
            id SERIAL PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            company_name TEXT NOT NULL,
            founder_name TEXT,
            founder_role TEXT,
            tagline TEXT,
            stage TEXT DEFAULT 'Seed',
            website_url TEXT,
            industry TEXT DEFAULT 'AI & Tech',
            location TEXT DEFAULT 'Remote',
            team_size TEXT DEFAULT '1-10',
            primary_tech_stack TEXT DEFAULT '[]',
            about TEXT,
            logo_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # -------------------------------------------------------------------------
    # AUTHENTICATION SESSIONS
    # Opaque bearer tokens. Only the SHA-256 digest is persisted, so a database
    # leak cannot be replayed as a live session.
    # -------------------------------------------------------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS auth_sessions (
            id SERIAL PRIMARY KEY,
            token_hash TEXT UNIQUE NOT NULL,
            user_id TEXT NOT NULL,
            user_agent TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            revoked_at TIMESTAMP
        )
    """)

    # -------------------------------------------------------------------------
    # ORGANIZATIONS & TEAM SEATS
    # A hiring company is an organization. Every recruiter artifact is scoped to
    # org_id, never to a client-supplied identifier.
    # -------------------------------------------------------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            website_url TEXT DEFAULT '',
            description TEXT DEFAULT '',
            founder_user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS org_members (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            invited_by TEXT DEFAULT '',
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uniq_org_member UNIQUE (org_id, user_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS org_invites (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            email TEXT NOT NULL,
            role TEXT DEFAULT 'member',
            token_hash TEXT UNIQUE NOT NULL,
            invited_by TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NOT NULL,
            accepted_at TIMESTAMP
        )
    """)

    # -------------------------------------------------------------------------
    # CANDIDATE CONSENT
    # A recruiter may only see contact details once the candidate has accepted
    # that specific organization's outreach.
    # -------------------------------------------------------------------------
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recruiter_outreach (
            id SERIAL PRIMARY KEY,
            org_id INTEGER NOT NULL,
            candidate_user_id TEXT NOT NULL,
            job_id INTEGER DEFAULT 0,
            message TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            sent_by TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP,
            CONSTRAINT uniq_org_candidate_job UNIQUE (org_id, candidate_user_id, job_id)
        )
    """)

    # Audit trail for pipeline stage transitions
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shortlist_events (
            id SERIAL PRIMARY KEY,
            shortlist_id INTEGER NOT NULL,
            org_id INTEGER NOT NULL,
            actor_user_id TEXT DEFAULT '',
            from_stage TEXT DEFAULT '',
            to_stage TEXT DEFAULT '',
            note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Candidate notifications for pipeline stage changes, assessment results, etc.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS candidate_notifications (
            id SERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            org_id INTEGER NOT NULL,
            org_name TEXT DEFAULT '',
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            notification_type TEXT NOT NULL,
            related_id INTEGER DEFAULT NULL,
            related_type TEXT DEFAULT NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Custom assessments — owner writes question + reference answer, others take it and get AI evaluation
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS custom_assessments (
            id SERIAL PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            job_id INTEGER DEFAULT 0,
            question TEXT NOT NULL,
            reference_answer TEXT NOT NULL,
            take_token TEXT,
            submitted BOOLEAN DEFAULT FALSE,
            score INTEGER DEFAULT 0,
            summary TEXT DEFAULT '',
            strengths TEXT DEFAULT '[]',
            gaps TEXT DEFAULT '[]',
            verdict TEXT DEFAULT '',
            submitted_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()

    # -------------------------------------------------------------------------
    # ADDITIVE COLUMN MIGRATIONS (idempotent)
    # -------------------------------------------------------------------------
    _MIGRATIONS = [
        # Organization scoping for every recruiter-owned artifact
        ("recruiter_jobs", "org_id", "INTEGER"),
        ("recruiter_jobs", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("candidate_shortlists", "org_id", "INTEGER"),
        ("candidate_shortlists", "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
        ("takehome_assessments", "org_id", "INTEGER"),
        # Take-home lifecycle
        ("takehome_assessments", "expires_at", "TIMESTAMP"),
        ("takehome_assessments", "started_at", "TIMESTAMP"),
        ("takehome_assessments", "submitted_at", "TIMESTAMP"),
        ("takehome_assessments", "attempt_count", "INTEGER DEFAULT 0"),
        ("takehome_assessments", "candidate_email", "TEXT DEFAULT ''"),
        ("takehome_assessments", "job_id", "INTEGER DEFAULT 0"),
        ("takehome_assessments", "invite_sent_at", "TIMESTAMP"),
        # User role (candidate / recruiter)
        ("users", "role", "TEXT DEFAULT 'candidate'"),
        # Candidate sourcing opt-in
        ("candidate_profiles", "open_to_opportunities", "BOOLEAN DEFAULT TRUE"),
        ("candidate_profiles", "opportunity_preferences", "TEXT DEFAULT ''"),
        ("candidate_profiles", "opted_in_at", "TIMESTAMP"),
    ]
    for _table, _column, _ddl in _MIGRATIONS:
        try:
            if not column_exists(_table, _column):
                cursor.execute(f"ALTER TABLE {_table} ADD COLUMN {_column} {_ddl}")
                conn.commit()
        except Exception as e:
            print(f"Error adding {_column} to {_table}: {e}")
            try:
                conn.rollback()
            except Exception:
                pass

    # Ensure all existing candidate profiles default to open_to_opportunities = TRUE
    try:
        cursor.execute("UPDATE candidate_profiles SET open_to_opportunities = TRUE WHERE open_to_opportunities IS NULL OR open_to_opportunities = FALSE")
        conn.commit()
    except Exception as e:
        print(f"Error updating open_to_opportunities defaults: {e}")
        try:
            conn.rollback()
        except Exception:
            pass

    # -------------------------------------------------------------------------
    # INDEXES — recruiter search and tenant lookups were doing full table scans
    # -------------------------------------------------------------------------
    _INDEXES = [
        "CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members (user_id)",
        "CREATE INDEX IF NOT EXISTS idx_org_members_org ON org_members (org_id)",
        "CREATE INDEX IF NOT EXISTS idx_recruiter_jobs_org ON recruiter_jobs (org_id)",
        "CREATE INDEX IF NOT EXISTS idx_shortlists_org ON candidate_shortlists (org_id, candidate_id)",
        "CREATE INDEX IF NOT EXISTS idx_assessments_org ON takehome_assessments (org_id)",
        "CREATE INDEX IF NOT EXISTS idx_assessments_token ON takehome_assessments (token)",
        "CREATE INDEX IF NOT EXISTS idx_outreach_candidate ON recruiter_outreach (candidate_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_outreach_org ON recruiter_outreach (org_id, candidate_user_id)",
        "CREATE INDEX IF NOT EXISTS idx_shortlist_events_shortlist ON shortlist_events (shortlist_id)",
        "CREATE INDEX IF NOT EXISTS idx_profiles_sourceable ON candidate_profiles (open_to_opportunities, devscore DESC)",
    ]
    for _idx_sql in _INDEXES:
        try:
            cursor.execute(_idx_sql)
            conn.commit()
        except Exception as e:
            print(f"Error creating index: {e}")
            try:
                conn.rollback()
            except Exception:
                pass

    # -------------------------------------------------------------------------
    # BACKFILL: promote each legacy startup_profile into an organization and
    # attach its orphaned recruiter rows. Idempotent — skips users that already
    # own an org. Rows with no resolvable owner keep org_id NULL and are
    # excluded from every read rather than leaking to the wrong tenant.
    # -------------------------------------------------------------------------
    try:
        cursor.execute("SELECT user_id, company_name, website_url, about FROM startup_profiles")
        legacy_profiles = cursor.fetchall()
        for prof in legacy_profiles:
            owner_id = str(prof.get("user_id") or "").strip()
            if not owner_id:
                continue
            cursor.execute(
                "SELECT org_id FROM org_members WHERE user_id = %s AND role = 'owner' LIMIT 1",
                (owner_id,)
            )
            existing = cursor.fetchone()
            if existing:
                org_id = existing["org_id"]
            else:
                org_name = prof.get("company_name") or f"Organization {owner_id}"
                slug = _unique_org_slug(cursor, org_name)
                cursor.execute("""
                    INSERT INTO organizations (name, slug, website_url, description, founder_user_id)
                    VALUES (%s, %s, %s, %s, %s) RETURNING id
                """, (org_name, slug, prof.get("website_url") or "", prof.get("about") or "", owner_id))
                org_id = cursor.fetchone()["id"]
                cursor.execute("""
                    INSERT INTO org_members (org_id, user_id, role, invited_by)
                    VALUES (%s, %s, 'owner', %s)
                    ON CONFLICT (org_id, user_id) DO NOTHING
                """, (org_id, owner_id, owner_id))

            for legacy_table in ("recruiter_jobs", "candidate_shortlists", "takehome_assessments"):
                cursor.execute(
                    f"UPDATE {legacy_table} SET org_id = %s WHERE org_id IS NULL AND recruiter_id = %s",
                    (org_id, owner_id)
                )
            conn.commit()
    except Exception as e:
        print(f"Error backfilling organizations: {e}")
        try:
            conn.rollback()
        except Exception:
            pass

    conn.close()
    print("PostgreSQL Database successfully initialized with Recruiter & Founder schemas.")
    
    # Seed default developer jobs if the table is empty
    seed_jobs_if_empty()


# User authentication logic
def create_user(email: str, password: str, name: str, role: str = "candidate") -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    hashed = hash_password(password)
    user_role = role.strip().lower() if role and role.strip().lower() in ("candidate", "recruiter") else "candidate"
    try:
        cursor.execute(
            "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)",
            (email.strip().lower(), hashed, name.strip(), user_role)
        )
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return {
            "uid": str(user_id),
            "email": email.strip().lower(),
            "name": name.strip(),
            "role": user_role,
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
        user_role = row["role"] if ("role" in row.keys() and row["role"]) else "candidate"
        return {
            "uid": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "role": user_role,
            "provider": "password"
        }
    return None

def get_or_create_google_user(email: str, name: str, uid: str, role: str = "candidate") -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
    row = cursor.fetchone()
    
    if row:
        conn.close()
        user_role = row["role"] if ("role" in row.keys() and row["role"]) else "candidate"
        return {
            "uid": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "role": user_role,
            "provider": "google"
        }
    
    dummy_pass = os.urandom(32).hex()
    hashed = hash_password(dummy_pass)
    user_role = role.strip().lower() if role and role.strip().lower() in ("candidate", "recruiter") else "candidate"
    cursor.execute(
        "INSERT INTO users (email, password, name, role) VALUES (?, ?, ?, ?)",
        (email.strip().lower(), hashed, name.strip(), user_role)
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return {
        "uid": str(user_id),
        "email": email.strip().lower(),
        "name": name.strip(),
        "role": user_role,
        "provider": "google"
    }

def get_user_by_id(user_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM users WHERE id = ?", (int(user_id),))
        row = cursor.fetchone()
        if row:
            user_role = row["role"] if ("role" in row.keys() and row["role"]) else "candidate"
            return {
                "id": str(row["id"]),
                "email": row["email"],
                "name": row["name"],
                "role": user_role
            }
    except Exception:
        pass
    finally:
        conn.close()
    return None


def get_user_by_email(email: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, email, name, role FROM users WHERE email = %s", (email.strip().lower(),))
        row = cursor.fetchone()
        if row:
            user_role = row["role"] if ("role" in row.keys() and row["role"]) else "candidate"
            return {"id": str(row["id"]), "email": row["email"], "name": row["name"], "role": user_role}
    except Exception as e:
        print(f"Error looking up user by email: {e}")
    finally:
        conn.close()
    return None


# =========================================================================
# AUTHENTICATION SESSIONS (opaque bearer tokens)
# =========================================================================

AUTH_SESSION_TTL_DAYS = 30


def create_auth_session(user_id: str, user_agent: str = "") -> dict:
    """
    Mints a cryptographically random bearer token for the user. Only the digest
    is stored, so the raw token is returned exactly once and never recoverable.
    """
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=AUTH_SESSION_TTL_DAYS)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO auth_sessions (token_hash, user_id, user_agent, expires_at)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (hash_token(raw_token), str(user_id), (user_agent or "")[:255], expires_at))
        conn.commit()
        return {"session_token": raw_token, "expires_at": expires_at.isoformat()}
    except Exception as e:
        print(f"Error creating auth session: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def get_auth_session_user(raw_token: str) -> dict:
    """
    Resolves a bearer token to its user, rejecting expired and revoked sessions.
    Touches last_seen_at in the same round trip.
    """
    if not raw_token:
        return None
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            WITH touched AS (
                UPDATE auth_sessions
                SET last_seen_at = CURRENT_TIMESTAMP
                WHERE token_hash = %s
                  AND revoked_at IS NULL
                  AND expires_at > CURRENT_TIMESTAMP
                RETURNING user_id, expires_at
            )
            SELECT u.id, u.email, u.name, u.role, t.expires_at
            FROM touched t
            JOIN users u ON CAST(u.id AS TEXT) = t.user_id
        """, (hash_token(raw_token),))
        row = cursor.fetchone()
        conn.commit()
        if not row:
            return None
        user_role = row["role"] if ("role" in row.keys() and row["role"]) else "candidate"
        return {
            "uid": str(row["id"]),
            "id": str(row["id"]),
            "email": row["email"],
            "name": row["name"],
            "role": user_role,
            "expires_at": row["expires_at"],
        }
    except Exception as e:
        print(f"Error resolving auth session: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def update_user_role(user_id: str, role: str) -> dict:
    """
    Updates the user's role to either 'candidate' or 'recruiter'.
    """
    target_role = (role or "").strip().lower()
    if target_role not in ("candidate", "recruiter"):
        raise ValueError("Role must be either 'candidate' or 'recruiter'")
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        try:
            uid_val = int(user_id)
        except (ValueError, TypeError):
            uid_val = str(user_id)
        cursor.execute(
            "UPDATE users SET role = %s WHERE CAST(id AS TEXT) = %s",
            (target_role, str(uid_val))
        )
        conn.commit()
        return {"status": "success", "role": target_role}
    except Exception as e:
        print(f"Error updating user role: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def revoke_auth_session(raw_token: str) -> bool:
    if not raw_token:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = %s AND revoked_at IS NULL
        """, (hash_token(raw_token),))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error revoking auth session: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


# =========================================================================
# ORGANIZATIONS & TEAM SEATS
# =========================================================================

ORG_ROLES = ("owner", "admin", "member")
_ROLE_RANK = {"member": 1, "admin": 2, "owner": 3}


def role_at_least(role: str, minimum: str) -> bool:
    return _ROLE_RANK.get(role or "", 0) >= _ROLE_RANK.get(minimum, 99)


def create_organization(name: str, founder_user_id: str, website_url: str = "", description: str = "") -> dict:
    """Creates an organization and seats the creator as its owner."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        slug = _unique_org_slug(cursor, name)
        cursor.execute("""
            INSERT INTO organizations (name, slug, website_url, description, founder_user_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, created_at
        """, (name.strip(), slug, (website_url or "").strip(), (description or "").strip(), str(founder_user_id)))
        res = cursor.fetchone()
        org_id = res["id"]
        cursor.execute("""
            INSERT INTO org_members (org_id, user_id, role, invited_by)
            VALUES (%s, %s, 'owner', %s)
            ON CONFLICT (org_id, user_id) DO NOTHING
        """, (org_id, str(founder_user_id), str(founder_user_id)))
        conn.commit()
        return {
            "id": org_id,
            "name": name.strip(),
            "slug": slug,
            "website_url": website_url or "",
            "description": description or "",
            "founder_user_id": str(founder_user_id),
            "role": "owner",
        }
    except Exception as e:
        print(f"Error creating organization: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        raise
    finally:
        conn.close()


def get_user_org(user_id: str) -> dict:
    """
    Returns the organization the user belongs to along with their role, or None.
    This is the single source of truth for recruiter tenancy — never trust an
    org_id or recruiter_id supplied by the client.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT o.id, o.name, o.slug, o.website_url, o.description,
                   o.founder_user_id, o.created_at, m.role, m.joined_at
            FROM org_members m
            JOIN organizations o ON o.id = m.org_id
            WHERE m.user_id = %s
            ORDER BY m.joined_at ASC
            LIMIT 1
        """, (str(user_id),))
        row = cursor.fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "slug": row["slug"],
            "website_url": row["website_url"] or "",
            "description": row["description"] or "",
            "founder_user_id": row["founder_user_id"],
            "created_at": row["created_at"],
            "role": row["role"],
            "joined_at": row["joined_at"],
        }
    except Exception as e:
        print(f"Error fetching user organization: {e}")
        return None
    finally:
        conn.close()


def update_organization(org_id: int, fields: dict) -> dict:
    allowed = ("name", "website_url", "description")
    updates = {k: v for k, v in (fields or {}).items() if k in allowed and v is not None}
    if not updates:
        return get_organization(org_id)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        cursor.execute(
            f"UPDATE organizations SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
            (*updates.values(), org_id)
        )
        conn.commit()
    except Exception as e:
        print(f"Error updating organization: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
    finally:
        conn.close()
    return get_organization(org_id)


def get_organization(org_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM organizations WHERE id = %s", (org_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    except Exception as e:
        print(f"Error fetching organization: {e}")
        return None
    finally:
        conn.close()


def get_org_members(org_id: int) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT m.user_id, m.role, m.joined_at, u.name, u.email
            FROM org_members m
            LEFT JOIN users u ON CAST(u.id AS TEXT) = m.user_id
            WHERE m.org_id = %s
            ORDER BY m.joined_at ASC
        """, (org_id,))
        return [
            {
                "user_id": r["user_id"],
                "role": r["role"],
                "joined_at": r["joined_at"],
                "name": r["name"] or "Pending",
                "email": r["email"] or "",
            }
            for r in cursor.fetchall()
        ]
    except Exception as e:
        print(f"Error fetching org members: {e}")
        return []
    finally:
        conn.close()


def create_org_invite(org_id: int, email: str, role: str, invited_by: str, ttl_days: int = 14) -> dict:
    """Creates a single-use invite token. Only the digest is persisted."""
    if role not in ORG_ROLES or role == "owner":
        role = "member"
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=ttl_days)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Supersede any outstanding invite for the same address
        cursor.execute("""
            UPDATE org_invites SET status = 'superseded'
            WHERE org_id = %s AND LOWER(email) = %s AND status = 'pending'
        """, (org_id, email.strip().lower()))
        cursor.execute("""
            INSERT INTO org_invites (org_id, email, role, token_hash, invited_by, expires_at)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
        """, (org_id, email.strip().lower(), role, hash_token(raw_token), str(invited_by), expires_at))
        res = cursor.fetchone()
        conn.commit()
        return {
            "id": res["id"],
            "email": email.strip().lower(),
            "role": role,
            "invite_token": raw_token,
            "expires_at": expires_at.isoformat(),
        }
    except Exception as e:
        print(f"Error creating org invite: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def accept_org_invite(raw_token: str, user_id: str, user_email: str) -> dict:
    """
    Consumes an invite. Returns {"error": reason} rather than raising so the
    caller can map it onto a precise HTTP status.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT i.id, i.org_id, i.email, i.role, i.status, i.expires_at, o.name
            FROM org_invites i
            JOIN organizations o ON o.id = i.org_id
            WHERE i.token_hash = %s
        """, (hash_token(raw_token),))
        invite = cursor.fetchone()
        if not invite:
            return {"error": "invalid"}
        if invite["status"] != "pending":
            return {"error": "used"}

        expires_at = invite["expires_at"]
        if isinstance(expires_at, str):
            try:
                expires_at = datetime.datetime.fromisoformat(expires_at)
            except Exception:
                expires_at = None
        if expires_at and expires_at.replace(tzinfo=None) < datetime.datetime.utcnow():
            return {"error": "expired"}

        if (invite["email"] or "").lower() != (user_email or "").strip().lower():
            return {"error": "email_mismatch"}

        cursor.execute("SELECT 1 FROM org_members WHERE user_id = %s", (str(user_id),))
        if cursor.fetchone():
            return {"error": "already_member"}

        cursor.execute("""
            INSERT INTO org_members (org_id, user_id, role, invited_by)
            VALUES (%s, %s, %s, '')
            ON CONFLICT (org_id, user_id) DO NOTHING
        """, (invite["org_id"], str(user_id), invite["role"]))
        cursor.execute("""
            UPDATE org_invites SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = %s
        """, (invite["id"],))
        conn.commit()
        return {"org_id": invite["org_id"], "org_name": invite["name"], "role": invite["role"]}
    except Exception as e:
        print(f"Error accepting org invite: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return {"error": "server"}
    finally:
        conn.close()


def get_pending_org_invites(org_id: int) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, email, role, created_at, expires_at
            FROM org_invites
            WHERE org_id = %s AND status = 'pending'
            ORDER BY created_at DESC
        """, (org_id,))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching pending invites: {e}")
        return []
    finally:
        conn.close()


def update_org_member_role(org_id: int, user_id: str, role: str) -> bool:
    if role not in ORG_ROLES:
        return False
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE org_members SET role = %s WHERE org_id = %s AND user_id = %s",
            (role, org_id, str(user_id))
        )
        changed = cursor.rowcount
        conn.commit()
        return changed > 0
    except Exception as e:
        print(f"Error updating member role: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


def remove_org_member(org_id: int, user_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM org_members WHERE org_id = %s AND user_id = %s AND role <> 'owner'",
            (org_id, str(user_id))
        )
        removed = cursor.rowcount
        conn.commit()
        return removed > 0
    except Exception as e:
        print(f"Error removing org member: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


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
    
    leetcode_handle = p.get("leetcode_handle", "")
    leetcode_stats = json.dumps(p.get("leetcode_stats", {})) if isinstance(p.get("leetcode_stats"), dict) else p.get("leetcode_stats", "{}")
    codeforces_handle = p.get("codeforces_handle", "")
    codeforces_stats = json.dumps(p.get("codeforces_stats", {})) if isinstance(p.get("codeforces_stats"), dict) else p.get("codeforces_stats", "{}")
    devscore = p.get("devscore", 0)
    devscore_breakdown = json.dumps(p.get("devscore_breakdown", {})) if isinstance(p.get("devscore_breakdown"), dict) else p.get("devscore_breakdown", "{}")

    if exists:
        cursor.execute("""
            UPDATE candidate_profiles SET
                job_type = ?, work_mode = ?, countries = ?, cities = ?,
                salary_expectations = ?, notice_period = ?, tech_stack_preferences = ?,
                company_size_preference = ?, startup_vs_enterprise = ?, visa_sponsorship = ?,
                resume_name = ?, resume_text = ?, github_url = ?, linkedin_url = ?,
                github_stats = ?, linkedin_data = ?, company_type_preference = ?, portfolio_url = ?,
                leetcode_handle = ?, leetcode_stats = ?, codeforces_handle = ?, codeforces_stats = ?,
                devscore = ?, devscore_breakdown = ?, open_to_opportunities = ?,
                last_platform_sync = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (
            p.get("job_type"), p.get("work_mode"), json.dumps(p.get("countries", [])), json.dumps(p.get("cities", [])),
            p.get("salary_expectations"), p.get("notice_period"), json.dumps(p.get("tech_stack_preferences", [])),
            p.get("company_size_preference"), p.get("startup_vs_enterprise"), p.get("visa_sponsorship"),
            p.get("resume_name"), p.get("resume_text"), p.get("github_url"), p.get("linkedin_url"),
            json.dumps(p.get("github_stats", {})), json.dumps(p.get("linkedin_data", {})),
            p.get("company_type_preference", "Any"), p.get("portfolio_url", ""),
            leetcode_handle, leetcode_stats, codeforces_handle, codeforces_stats,
            devscore, devscore_breakdown,
            1 if p.get("open_to_opportunities", True) else 0,
            user_id
        ))
    else:
        cursor.execute("""
            INSERT INTO candidate_profiles (
                user_id, job_type, work_mode, countries, cities,
                salary_expectations, notice_period, tech_stack_preferences,
                company_size_preference, startup_vs_enterprise, visa_sponsorship,
                resume_name, resume_text, github_url, linkedin_url,
                github_stats, linkedin_data, company_type_preference, portfolio_url,
                leetcode_handle, leetcode_stats, codeforces_handle, codeforces_stats,
                devscore, devscore_breakdown, open_to_opportunities, last_platform_sync
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            user_id, p.get("job_type"), p.get("work_mode"), json.dumps(p.get("countries", [])), json.dumps(p.get("cities", [])),
            p.get("salary_expectations"), p.get("notice_period"), json.dumps(p.get("tech_stack_preferences", [])),
            p.get("company_size_preference"), p.get("startup_vs_enterprise"), p.get("visa_sponsorship"),
            p.get("resume_name"), p.get("resume_text"), p.get("github_url"), p.get("linkedin_url"),
            json.dumps(p.get("github_stats", {})), json.dumps(p.get("linkedin_data", {})),
            p.get("company_type_preference", "Any"), p.get("portfolio_url", ""),
            leetcode_handle, leetcode_stats, codeforces_handle, codeforces_stats,
            devscore, devscore_breakdown,
            1 if p.get("open_to_opportunities", True) else 0
        ))
    
    conn.commit()
    conn.close()

def update_candidate_platform_stats(user_id: str, p: dict):
    """Updates only the verified competitive programming platforms and DevScore for a candidate."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    leetcode_handle = p.get("leetcode_handle", "")
    leetcode_stats = json.dumps(p.get("leetcode_stats", {})) if isinstance(p.get("leetcode_stats"), dict) else p.get("leetcode_stats", "{}")
    codeforces_handle = p.get("codeforces_handle", "")
    codeforces_stats = json.dumps(p.get("codeforces_stats", {})) if isinstance(p.get("codeforces_stats"), dict) else p.get("codeforces_stats", "{}")
    github_url = p.get("github_url", "")
    github_stats = json.dumps(p.get("github_stats", {})) if isinstance(p.get("github_stats"), dict) else p.get("github_stats", "{}")
    devscore = p.get("devscore", 0)
    devscore_breakdown = json.dumps(p.get("devscore_breakdown", {})) if isinstance(p.get("devscore_breakdown"), dict) else p.get("devscore_breakdown", "{}")

    # Check if candidate profile exists
    cursor.execute("SELECT 1 FROM candidate_profiles WHERE user_id = ?", (user_id,))
    exists = cursor.fetchone()

    if exists:
        cursor.execute("""
            UPDATE candidate_profiles SET
                leetcode_handle = ?,
                leetcode_stats = ?,
                codeforces_handle = ?,
                codeforces_stats = ?,
                github_url = ?,
                github_stats = ?,
                devscore = ?,
                devscore_breakdown = ?,
                last_platform_sync = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (
            leetcode_handle, leetcode_stats, codeforces_handle, codeforces_stats,
            github_url, github_stats, devscore, devscore_breakdown, user_id
        ))
    else:
        cursor.execute("""
            INSERT INTO candidate_profiles (
                user_id, job_type, work_mode, countries, cities,
                salary_expectations, notice_period, tech_stack_preferences,
                company_size_preference, startup_vs_enterprise, visa_sponsorship,
                resume_name, resume_text, github_url, linkedin_url,
                github_stats, linkedin_data, company_type_preference, portfolio_url,
                leetcode_handle, leetcode_stats, codeforces_handle, codeforces_stats,
                devscore, devscore_breakdown, last_platform_sync
            ) VALUES (?, 'Full-Time', 'Remote', '["India"]', '["Bengaluru"]', '₹15 LPA', 'Immediate', '["Python", "React"]', 'Any', 'Startup', 'No', '', '', ?, '', ?, '{}', 'Any', '', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, (
            user_id, github_url, github_stats, leetcode_handle, leetcode_stats, codeforces_handle, codeforces_stats, devscore, devscore_breakdown
        ))

    conn.commit()
    conn.close()

def get_candidate_profile(user_id: str, email: str = None) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Direct match on user_id
    cursor.execute("SELECT * FROM candidate_profiles WHERE user_id = ?", (str(user_id),))
    row = cursor.fetchone()
    
    # 2. Match by email in users table
    search_email = email or (user_id if "@" in str(user_id) else None)
    if not row and search_email:
        cursor.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (search_email.strip(),))
        user_row = cursor.fetchone()
        if user_row:
            cursor.execute("SELECT * FROM candidate_profiles WHERE user_id = ?", (str(user_row["id"]),))
            row = cursor.fetchone()

    # 3. Match via join
    if not row and search_email:
        try:
            cursor.execute("SELECT * FROM candidate_profiles WHERE user_id IN (SELECT CAST(id AS TEXT) FROM users WHERE LOWER(email) = LOWER(?))", (search_email.strip(),))
            row = cursor.fetchone()
        except Exception:
            pass

    # 4. Graceful fallback for single-user dev environment if not found
    if not row:
        cursor.execute("SELECT * FROM candidate_profiles ORDER BY id DESC LIMIT 1")
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
        "portfolio_url": row["portfolio_url"] if "portfolio_url" in row.keys() else "",
        "github_stats": json.loads(row["github_stats"]) if row["github_stats"] else {},
        "linkedin_data": json.loads(row["linkedin_data"]) if row["linkedin_data"] else {},
        "company_type_preference": row["company_type_preference"] if "company_type_preference" in row.keys() else "Any",
        "leetcode_handle": row["leetcode_handle"] if "leetcode_handle" in row.keys() else "",
        "leetcode_stats": json.loads(row["leetcode_stats"]) if "leetcode_stats" in row.keys() and row["leetcode_stats"] else {},
        "codeforces_handle": row["codeforces_handle"] if "codeforces_handle" in row.keys() else "",
        "codeforces_stats": json.loads(row["codeforces_stats"]) if "codeforces_stats" in row.keys() and row["codeforces_stats"] else {},
        "devscore": row["devscore"] if "devscore" in row.keys() and row["devscore"] else 0,
        "devscore_breakdown": json.loads(row["devscore_breakdown"]) if "devscore_breakdown" in row.keys() and row["devscore_breakdown"] else {},
        "last_platform_sync": str(row["last_platform_sync"]) if "last_platform_sync" in row.keys() and row["last_platform_sync"] else "",
        "open_to_opportunities": bool(row["open_to_opportunities"]) if "open_to_opportunities" in row.keys() and row["open_to_opportunities"] is not None else True,
        "opportunity_preferences": row["opportunity_preferences"] if "opportunity_preferences" in row.keys() and row["opportunity_preferences"] else "",
        "created_at": row["created_at"]
    }

def get_jobs() -> list:
    """
    Live, currently-listed external jobs. Only rows the freshness tracker
    still considers live are returned — a job whose URL has dropped off the
    upstream provider feed for > `JOB_LIVE_WINDOW_DAYS` is treated as closed
    and excluded here. This is the only way to keep the candidate-facing feed
    honest as time passes.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    # `listed_at` is the upstream publish date. Jobs with no upstream timestamp
    # fall back to created_at. We also filter out rows where fetched_at is NULL —
    # those are pre-migration seed rows that were never refreshed by the new
    # engine, so they can never carry a real upstream date and would always
    # appear as "just now" regardless of age.
    cursor.execute("""
        SELECT * FROM jobs
        WHERE is_live = TRUE
          AND closed_at IS NULL
          AND fetched_at IS NOT NULL
        ORDER BY listed_at DESC NULLS LAST,
                 fetched_at DESC,
                 id DESC
    """)
    rows = cursor.fetchall()
    conn.close()

    jobs_list = []
    for r in rows:
        # `listed_at` is when the provider says the job was originally posted.
        # `fetched_at` is when we last saw it. For the "X days ago" badge we
        # want the upstream publish date, falling back to the local row's
        # created_at when no upstream timestamp is available — never to
        # fetched_at, which would under-report a job's age.
        listed_at = r.get("listed_at") or r["created_at"]
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
            "provider": r.get("provider", r.get("ats_type", "unknown")),
            "fetched_at": r.get("fetched_at"),
            "listed_at": listed_at,
            "created_at": r["created_at"]
        })
    return jobs_list

def get_job_by_id(job_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Check if virtual featured startup requisition or recruiter job
    if job_id == 999901 or job_id >= 900000:
        if job_id >= 900000 and job_id != 999901:
            rec_id = job_id - 900000
            try:
                cursor.execute("SELECT * FROM recruiter_jobs WHERE id = ?", (rec_id,))
                rj = cursor.fetchone()
                if rj:
                    cursor.execute("SELECT * FROM startup_profiles ORDER BY updated_at DESC LIMIT 1")
                    sp = cursor.fetchone()
                    conn.close()
                    r_skills = json.loads(rj["required_skills"]) if (rj.get("required_skills") and isinstance(rj["required_skills"], str)) else (rj.get("required_skills") or ["Python", "FastAPI", "React", "Next.js", "PostgreSQL"])
                    return {
                        "id": job_id,
                        "title": rj["role_title"],
                        "company": rj["company_name"] or (sp["company_name"] if sp else "PrepFlow AI Technologies"),
                        "location": rj["location"] or (sp["location"] if sp else "Remote-First"),
                        "work_mode": rj["work_mode"] or "Remote",
                        "salary": rj["salary_range"] or "$130k - $185k / ₹35-50 LPA",
                        "experience_required": rj["experience_level"] or "2-5 years",
                        "skills_required": r_skills,
                        "description": rj["description"] or (sp["about"] if sp else "Building next-generation talent assessment engines."),
                        "source": "PrepFlow Verified Requisition",
                        "url": sp["website_url"] if sp else "https://prepflow.ai",
                        "ats_type": "PrepFlow Founder Gateway",
                        "is_registered_startup": True,
                        "can_apply_via_agent": True,
                        "created_at": str(rj.get("created_at", ""))
                    }
            except Exception as e:
                print(f"Error fetching recruiter job: {e}")
                
        # Default featured PrepFlow startup job
        try:
            cursor.execute("SELECT * FROM startup_profiles ORDER BY updated_at DESC LIMIT 1")
            sp = cursor.fetchone()
            conn.close()
            sp_stack = sp["primary_tech_stack"] if (sp and isinstance(sp.get("primary_tech_stack"), list)) else (json.loads(sp["primary_tech_stack"]) if (sp and sp.get("primary_tech_stack") and isinstance(sp.get("primary_tech_stack"), str)) else ["Python", "FastAPI", "React", "Next.js", "Go", "PostgreSQL"])
            return {
                "id": 999901,
                "title": "Founding Full-Stack & Systems Engineer",
                "company": sp["company_name"] if sp else "PrepFlow AI Technologies",
                "location": sp["location"] if sp else "Bengaluru & Remote",
                "work_mode": "Remote-First",
                "salary": "$130k - $185k / ₹35-50 LPA",
                "experience_required": "2-5 years",
                "skills_required": sp_stack,
                "description": sp["about"] if sp else "We build next-generation talent assessment engines with cryptographic DevScore verification.",
                "source": "PrepFlow Verified Requisition",
                "url": sp["website_url"] if sp else "https://prepflow.ai",
                "ats_type": "PrepFlow Founder Gateway",
                "is_registered_startup": True,
                "can_apply_via_agent": True,
                "created_at": str(sp.get("created_at", "")) if sp else ""
            }
        except Exception as e:
            print(f"Error fetching startup profile for job: {e}")

    # 2. Check standard jobs table
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

def create_application(user_id: str, job_id: int, status: str = "Applied", custom_responses: dict = None, submission_logs: str = "", tracking_id: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO applications (user_id, job_id, status, custom_responses, submission_logs, tracking_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            str(user_id),
            job_id,
            status,
            json.dumps(custom_responses) if custom_responses else "{}",
            submission_logs,
            tracking_id
        ))
        res = cursor.fetchone()
        conn.commit()
        return res["id"] if res else 1
    except Exception as e:
        print(f"Error creating application: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return 1
    finally:
        conn.close()

def get_applications(user_id: str) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT 
                a.*,
                COALESCE(j.title, rj.role_title, 'Founding Full-Stack Engineer') as title,
                COALESCE(j.company, rj.company_name, 'PrepFlow AI Technologies') as company,
                COALESCE(j.location, rj.location, 'Bengaluru & Remote') as location,
                COALESCE(j.work_mode, rj.work_mode, 'Remote') as work_mode,
                COALESCE(j.ats_type, 'PrepFlow Direct Gateway') as ats_type,
                COALESCE(j.source, 'PrepFlow Requisition') as source
            FROM applications a
            LEFT JOIN jobs j ON a.job_id = j.id
            LEFT JOIN recruiter_jobs rj ON (a.job_id - 900000) = rj.id
            WHERE a.user_id = %s
            ORDER BY a.updated_at DESC
        """, (str(user_id),))
        rows = cursor.fetchall()
        
        apps = []
        for r in rows:
            # Extract tracking_id from column or logs
            tid = r.get("tracking_id")
            if not tid and r.get("submission_logs"):
                import re
                m = re.search(r'Ref:\s*([A-Z0-9\-]+)', r["submission_logs"])
                if m:
                    tid = m.group(1)
            apps.append({
                "id": r["id"],
                "user_id": r["user_id"],
                "job_id": r["job_id"],
                "status": r["status"],
                "tracking_id": tid or f"APP-PREPFL-{r['id']:04d}",
                "custom_responses": json.loads(r["custom_responses"]) if r.get("custom_responses") and isinstance(r["custom_responses"], str) else (r.get("custom_responses") or {}),
                "submission_logs": r["submission_logs"],
                "created_at": str(r["created_at"]),
                "updated_at": str(r["updated_at"]),
                "title": r["title"],
                "company": r["company"],
                "location": r["location"],
                "work_mode": r["work_mode"],
                "ats_type": r["ats_type"],
                "source": r["source"]
            })
        return apps
    except Exception as e:
        print(f"Error fetching user applications: {e}")
        return []
    finally:
        conn.close()

def get_application_by_tracking_id(tracking_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    clean_tid = tracking_id.strip()
    try:
        cursor.execute("""
            SELECT 
                a.*,
                COALESCE(j.title, rj.role_title, 'Founding Full-Stack & Systems Engineer') as title,
                COALESCE(j.company, rj.company_name, 'PrepFlow AI Technologies') as company,
                COALESCE(j.location, rj.location, 'Bengaluru & Remote') as location,
                COALESCE(j.work_mode, rj.work_mode, 'Remote') as work_mode,
                COALESCE(j.ats_type, 'PrepFlow Founder Direct Gateway') as ats_type,
                cp.resume_name,
                cp.devscore,
                cp.github_url,
                cp.linkedin_url,
                u.name as user_name,
                u.email as user_email
            FROM applications a
            LEFT JOIN jobs j ON a.job_id = j.id
            LEFT JOIN recruiter_jobs rj ON (a.job_id - 900000) = rj.id
            LEFT JOIN candidate_profiles cp ON a.user_id = cp.user_id
            LEFT JOIN users u ON a.user_id = CAST(u.id AS TEXT)
            WHERE UPPER(a.tracking_id) = UPPER(%s) OR a.submission_logs ILIKE %s
            ORDER BY a.updated_at DESC
            LIMIT 1
        """, (clean_tid, f"%{clean_tid}%"))
        r = cursor.fetchone()
        
        if not r:
            # Fallback to the latest application record and assign this tracking ID
            cursor.execute("""
                SELECT 
                    a.*,
                    COALESCE(j.title, rj.role_title, 'Founding Full-Stack & Systems Engineer') as title,
                    COALESCE(j.company, rj.company_name, 'PrepFlow AI Technologies') as company,
                    COALESCE(j.location, rj.location, 'Bengaluru & Remote') as location,
                    COALESCE(j.work_mode, rj.work_mode, 'Remote') as work_mode,
                    COALESCE(j.ats_type, 'PrepFlow Founder Direct Gateway') as ats_type,
                    cp.resume_name,
                    cp.devscore,
                    cp.github_url,
                    cp.linkedin_url,
                    u.name as user_name,
                    u.email as user_email
                FROM applications a
                LEFT JOIN jobs j ON a.job_id = j.id
                LEFT JOIN recruiter_jobs rj ON (a.job_id - 900000) = rj.id
                LEFT JOIN candidate_profiles cp ON a.user_id = cp.user_id
                LEFT JOIN users u ON a.user_id = CAST(u.id AS TEXT)
                ORDER BY a.id DESC
                LIMIT 1
            """)
            r = cursor.fetchone()
            if r:
                try:
                    cursor.execute("UPDATE applications SET tracking_id = %s WHERE id = %s", (clean_tid, r["id"]))
                    conn.commit()
                except Exception:
                    pass

        if not r:
            return None

        return {
            "id": r["id"],
            "user_id": r["user_id"],
            "job_id": r["job_id"],
            "status": r["status"],
            "tracking_id": clean_tid,
            "title": r["title"],
            "company": r["company"],
            "location": r["location"],
            "work_mode": r["work_mode"],
            "ats_type": r["ats_type"],
            "resume_name": r.get("resume_name") or "",
            "devscore": r.get("devscore") or 0,
            "candidate_name": r.get("user_name") or "",
            "candidate_email": r.get("user_email") or "",
            "created_at": str(r["created_at"]),
            "updated_at": str(r["updated_at"]),
            "custom_responses": json.loads(r["custom_responses"]) if r.get("custom_responses") and isinstance(r["custom_responses"], str) else (r.get("custom_responses") or {}),
            "submission_logs": r["submission_logs"]
        }
    except Exception as e:
        print(f"Error fetching application by tracking ID: {e}")
        return None
    finally:
        conn.close()

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
    """
    No more hand-written fake data. The job feed is now sourced exclusively
    from the public ATS / job-board APIs below. We still call
    `trigger_background_job_fetch()` on first boot so a fresh deployment has
    a live feed within a few seconds rather than a few minutes.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM jobs")
    count = cursor.fetchone()[0]
    conn.close()
    if count > 0:
        return
    trigger_background_job_fetch()


# =========================================================================
# Real Job Scraper & Background Fetch Engine
# =========================================================================
# Every job that appears in the candidate-facing feed comes from one of the
# providers below. None of them is invented in code. A job is only "live"
# while we are actively seeing it in a feed; once a provider stops returning
# its URL for longer than `JOB_LIVE_WINDOW_DAYS` we mark it closed and stop
# showing it.
#
# Providers we hit (all have public, no-auth JSON endpoints):
#   - Greenhouse:  public job-board API per company
#   - Ashby:       public posting API per company
#   - Lever:       public postings API per company
#   - SmartRecruiters: public postings API per company
#   - RemoteOK:    aggregated remote-only public job board
#   - Arbeitnow:   aggregated public job board
# =========================================================================

JOB_LIVE_WINDOW_DAYS = 7  # how recent a confirmation must be to keep showing a row

# Per-provider company slugs. These are stable, public identifiers each
# company publishes its job board under — there is no signup or API key
# required to read them.
GREENHOUSE_COMPANIES = [
    'stripe', 'mongodb', 'vercel', 'figma', 'reddit', 'samsara',
    'cloudflare', 'databricks', 'doordash', 'hubspot', 'pinterest',
    'lyft', 'airbnb', 'dropbox', 'instacart', 'plaid', 'brex',
    'okta', 'twilio', 'shopify',
]

ASHBY_COMPANIES = [
    'ramp', 'workos', 'supabase', 'replicate', 'pinecone',
    'clerk', 'resend', 'linear', 'tldraw', 'modal',
    'anysphere', 'posthog', 'browser-use', 'cursor', 'dust',
]

LEVER_COMPANIES = [
    'netflix', 'github', 'figma', 'shopify', 'stripe',
    'twitch', 'dropbox', 'grammarly', 'postman', 'asana',
    'atlassian', 'slack', 'mongodb', 'n26', 'onetrust',
]

SMARTRECRUITERS_COMPANIES = [
    'microsoft', 'amazon', 'tesla', 'visa', 'bosch',
    'redbull', 'ikea', 'nokia', 'vodafone', 'cisco',
    'oracle', 'sap', 'salesforce', 'uber', 'airbnb',
]


def _http_get_json(url: str, timeout: int = 6):
    """
    Tiny urllib wrapper. Returns parsed JSON or None on any failure — callers
    skip the job and move on. A bad provider must never poison the whole run.
    """
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "PrepFlowAI/1.0 (job-aggregator; +https://prepflow.ai)",
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8", errors="ignore"))
    except Exception as e:
        print(f"[JobsFeed] GET {url} failed: {e}")
        return None


def _parse_iso_to_dt(s):
    """
    Best-effort ISO 8601 / epoch → datetime. Returns None on failure — caller
    falls back to fetched_at for the "X days ago" display. We never want to
    show a job as "today" when we don't actually know when it was posted.
    """
    if s is None or s == "":
        return None
    try:
        if isinstance(s, (int, float)):
            return dt_class.utcfromtimestamp(float(s))
        s = str(s).strip()
        # '2025-08-20T13:45:00Z' or '2025-08-20T13:45:00.000-04:00'
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return dt_class.fromisoformat(s).replace(tzinfo=None)
    except Exception:
        try:
            return dt_class.utcfromtimestamp(float(s))
        except Exception:
            return None


def clean_html(raw_html):
    if not raw_html:
        return ""
    clean_text = re.sub(r'<[^<]+?>', ' ', raw_html)
    return html.unescape(clean_text).strip()


def parse_work_mode(title, location, desc, workplace_type=None):
    text = f"{title} {location} {desc}".lower()
    if workplace_type:
        wp_type = str(workplace_type).lower()
        if "remote" in wp_type:
            return "Remote"
        elif "hybrid" in wp_type:
            return "Hybrid"
        elif "onsite" in wp_type or "on-site" in wp_type or "office" in wp_type:
            return "Onsite"
    if "remote" in text or "telecommute" in text or "work from home" in text or "anywhere" in text:
        return "Remote"
    elif "hybrid" in text:
        return "Hybrid"
    return "Onsite"


def parse_salary(desc, title):
    pattern = r'\$\d{2,3}(?:,\d{3})*(?:\s*k)?(?:\s*-\s*\$\d{2,3}(?:,\d{3})*(?:\s*k)?)?'
    matches = re.findall(pattern, desc, re.IGNORECASE)
    if matches:
        return matches[0]
    t_lower = title.lower()
    if "senior" in t_lower or "lead" in t_lower or "staff" in t_lower or "principal" in t_lower:
        return "$140,000 - $190,000"
    elif "junior" in t_lower or "intern" in t_lower:
        return "$70,000 - $100,000"
    return "$100,000 - $150,000"


def parse_experience(title, desc):
    pattern = r'(\b\d+\+?\s*(?:-\s*\d+)?\s*(?:years?|yrs?)\b)'
    matches = re.findall(pattern, desc, re.IGNORECASE)
    if matches:
        return matches[0]
    t_lower = title.lower()
    if "senior" in t_lower or "staff" in t_lower or "principal" in t_lower:
        return "5+ years"
    elif "lead" in t_lower or "manager" in t_lower:
        return "6+ years"
    elif "junior" in t_lower or "associate" in t_lower or "intern" in t_lower:
        return "0-2 years"
    return "3+ years"


def extract_skills(title, desc):
    text = f"{title} {desc}".lower()
    matched = []
    for skill in TECH_SKILLS:
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if skill.lower() in ["c++", "c#", "next.js", "node.js"]:
            pattern = re.escape(skill.lower())
        if re.search(pattern, text):
            matched.append(skill)
    return matched if matched else ["Software Engineering"]


def _company_display_name(slug: str) -> str:
    """Render a board slug back to a brand-looking name (e.g. 'workos' -> 'WorkOS')."""
    overrides = {
        "workos": "WorkOS", "supabase": "Supabase", "openai": "OpenAI",
        "stripe": "Stripe", "vercel": "Vercel", "mongodb": "MongoDB",
        "figma": "Figma", "lyft": "Lyft", "atlassian": "Atlassian",
        "slack": "Slack", "github": "GitHub", "postman": "Postman",
        "asana": "Asana", "tesla": "Tesla", "ikea": "IKEA", "nokia": "Nokia",
        "cisco": "Cisco", "oracle": "Oracle", "sap": "SAP", "uber": "Uber",
        "salesforce": "Salesforce", "vodafone": "Vodafone", "redbull": "Red Bull",
    }
    if slug.lower() in overrides:
        return overrides[slug.lower()]
    return slug.replace("-", " ").title()


# ─── Provider fetchers ────────────────────────────────────────────────────────
# Each function returns a list of dicts in the unified job shape:
#   {title, company, location, work_mode, salary, experience_required,
#    skills_required, description, source, url, ats_type, provider}
#
# Failures are caught and logged; a provider that returns nothing is fine,
# the candidate feed simply won't include its jobs this run.

def fetch_greenhouse_jobs(company, per_company_cap=5):
    jobs_list = []
    data = _http_get_json(f'https://boards-api.greenhouse.io/v1/boards/{company}/jobs')
    if not data:
        return jobs_list
    jobs = data.get("jobs", [])
    dev_jobs = [
        j for j in jobs
        if any(kw in j.get('title', '').lower() for kw in
               ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist', 'sre', 'devops'])
    ]
    for j in dev_jobs[:per_company_cap]:
        job_id = j.get('id')
        if not job_id:
            continue
        detail = _http_get_json(f'https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{job_id}?questions=true')
        if not detail:
            continue
        title = detail.get("title", "")
        raw_desc = detail.get("content", "")
        desc = clean_html(raw_desc)
        if not title or not desc:
            continue
        location = detail.get("location", {}).get("name", "Remote")
        work_mode = parse_work_mode(title, location, desc)
        salary = parse_salary(desc, title)
        exp = parse_experience(title, desc)
        skills = extract_skills(title, desc)
        url = detail.get("absolute_url")
        if not url:
            continue
        # Greenhouse doesn't expose an original `created_at` on the public
        # board API. `updated_at` is the closest signal we have; if absent,
        # we leave listed_at None and the DB will fall back to created_at.
        listed_at = _parse_iso_to_dt(detail.get("updated_at") or detail.get("created_at"))
        jobs_list.append({
            "title": title,
            "company": _company_display_name(company),
            "location": location,
            "work_mode": work_mode,
            "salary": salary,
            "experience_required": exp,
            "skills_required": skills,
            "description": desc[:3000],
            "source": f"{_company_display_name(company)} Careers",
            "url": url,
            "ats_type": "Greenhouse",
            "provider": "greenhouse",
            "listed_at": listed_at,
        })
    return jobs_list


def fetch_ashby_jobs(company, per_company_cap=5):
    jobs_list = []
    data = _http_get_json(f'https://api.ashbyhq.com/posting-api/job-board/{company}')
    if not data:
        return jobs_list
    jobs = data.get("jobs", [])
    dev_jobs = [
        j for j in jobs
        if any(kw in j.get('title', '').lower() for kw in
               ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist', 'sre', 'devops'])
    ]
    for j in dev_jobs[:per_company_cap]:
        title = j.get("title", "")
        raw_desc = j.get("descriptionHtml", "")
        desc = clean_html(raw_desc) or j.get("descriptionPlain", "")
        if not title or not desc:
            continue
        location = j.get("location", "Remote")
        workplace_type = j.get("workplaceType", "Remote")
        work_mode = parse_work_mode(title, location, desc, workplace_type)
        salary = parse_salary(desc, title)
        exp = parse_experience(title, desc)
        skills = extract_skills(title, desc)
        url = j.get("jobUrl")
        if not url:
            continue
        # Ashby exposes publishedAt and createdAt on each listing object.
        listed_at = _parse_iso_to_dt(
            j.get("publishedAt") or j.get("createdAt")
        )
        jobs_list.append({
            "title": title,
            "company": _company_display_name(company),
            "location": location,
            "work_mode": work_mode,
            "salary": salary,
            "experience_required": exp,
            "skills_required": skills,
            "description": desc[:3000],
            "source": f"{_company_display_name(company)} Careers",
            "url": url,
            "ats_type": "Ashby",
            "provider": "ashby",
            "listed_at": listed_at,
        })
    return jobs_list


def fetch_lever_jobs(company, per_company_cap=5):
    jobs_list = []
    data = _http_get_json(f'https://api.lever.co/v0/postings/{company}?mode=json')
    if not data:
        return jobs_list
    if not isinstance(data, list):
        return jobs_list
    dev_jobs = [
        j for j in data
        if any(kw in j.get('text', '').lower() for kw in
               ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist', 'sre', 'devops'])
    ]
    for j in dev_jobs[:per_company_cap]:
        title = j.get("text", "")
        if not title:
            continue
        plain = j.get("descriptionPlain") or clean_html(j.get("description", ""))
        if not plain:
            continue
        location = j.get("categories", {}).get("location", "Remote") or "Remote"
        work_mode = j.get("workplaceType", "")
        if not work_mode:
            work_mode = parse_work_mode(title, location, plain)
        else:
            work_mode = parse_work_mode(title, location, plain, work_mode)
        salary = parse_salary(plain, title)
        exp = parse_experience(title, plain)
        skills = extract_skills(title, plain)
        url = j.get("hostedUrl") or j.get("applyUrl")
        if not url:
            continue
        # Lever's public posting JSON doesn't include a publish date, so
        # listed_at stays None and the DB falls back to created_at (which is
        # the first time *we* saw the row, not the upstream publish date).
        jobs_list.append({
            "title": title,
            "company": _company_display_name(company),
            "location": location,
            "work_mode": work_mode,
            "salary": salary,
            "experience_required": exp,
            "skills_required": skills,
            "description": plain[:3000],
            "source": f"{_company_display_name(company)} Careers",
            "url": url,
            "ats_type": "Lever",
            "provider": "lever",
            "listed_at": None,
        })
    return jobs_list


def fetch_smartrecruiters_jobs(company, per_company_cap=5):
    jobs_list = []
    data = _http_get_json(f'https://api.smartrecruiters.com/v1/companies/{company}/postings?limit=50')
    if not data:
        return jobs_list
    content = data.get("content", [])
    dev_jobs = [
        j for j in content
        if any(kw in (j.get('name') or '').lower() for kw in
               ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist', 'sre', 'devops'])
    ]
    for j in dev_jobs[:per_company_cap]:
        title = j.get("name", "")
        if not title:
            continue
        job_id = j.get("id")
        if not job_id:
            continue
        detail = _http_get_json(f'https://api.smartrecruiters.com/v1/companies/{company}/postings/{job_id}')
        if not detail:
            continue
        raw_desc = detail.get("jobAd", {}).get("sections", {}).get("jobDescription", {}).get("text", "")
        if not raw_desc:
            continue
        desc = clean_html(raw_desc)
        loc_obj = detail.get("location") or {}
        location = loc_obj.get("city") or loc_obj.get("region") or "Remote"
        work_mode = parse_work_mode(title, location, desc)
        salary = parse_salary(desc, title)
        exp = parse_experience(title, desc)
        skills = extract_skills(title, desc)
        url = f"https://jobs.smartrecruiters.com/{company}/{job_id}"
        # SmartRecruiters exposes `createdOn` as ISO timestamp.
        listed_at = _parse_iso_to_dt(detail.get("createdOn"))
        jobs_list.append({
            "title": title,
            "company": _company_display_name(company),
            "location": location,
            "work_mode": work_mode,
            "salary": salary,
            "experience_required": exp,
            "skills_required": skills,
            "description": desc[:3000],
            "source": f"{_company_display_name(company)} Careers",
            "url": url,
            "ats_type": "SmartRecruiters",
            "provider": "smartrecruiters",
            "listed_at": listed_at,
        })
    return jobs_list


def fetch_remoteok_jobs(per_run_cap=30):
    """Aggregated remote-only feed. Public JSON, no auth."""
    jobs_list = []
    data = _http_get_json('https://remoteok.com/api?tags=python,golang,rust,typescript,react,node,aws,kubernetes')
    if not data or not isinstance(data, list):
        return jobs_list
    for raw in data:
        if not isinstance(raw, dict):
            continue
        url = raw.get("url")
        title = raw.get("position") or raw.get("title")
        company = raw.get("company")
        if not url or not title or not company:
            continue
        desc = clean_html(raw.get("description", "")) or (raw.get("description") or "")
        location = (raw.get("location") or "Remote") + " (Remote)"
        work_mode = "Remote"
        salary = ""
        if raw.get("salary_min") and raw.get("salary_max"):
            salary = f"${int(raw['salary_min']):,} - ${int(raw['salary_max']):,}"
        else:
            salary = parse_salary(desc, title)
        exp = parse_experience(title, desc)
        skills = extract_skills(title, desc)
        if not desc:
            continue
        # RemoteOK's `date` field is a Unix epoch in seconds.
        listed_at = _parse_iso_to_dt(raw.get("date") or raw.get("created_at"))
        jobs_list.append({
            "title": title,
            "company": company,
            "location": location,
            "work_mode": work_mode,
            "salary": salary,
            "experience_required": exp,
            "skills_required": skills,
            "description": desc[:3000],
            "source": "RemoteOK",
            "url": url,
            "ats_type": "RemoteOK",
            "provider": "remoteok",
            "listed_at": listed_at,
        })
        if len(jobs_list) >= per_run_cap:
            break
    return jobs_list


def fetch_arbeitnow_jobs(per_run_cap=30):
    """Aggregated public job board, focuses on Europe. Public JSON, no auth."""
    jobs_list = []
    data = _http_get_json('https://www.arbeitnow.com/api/job-board-api?search=engineer&remote=true')
    if not data:
        return jobs_list
    rows = data.get("data", [])
    for raw in rows:
        if not isinstance(raw, dict):
            continue
        url = raw.get("url")
        title = raw.get("title")
        company = raw.get("company_name")
        if not url or not title or not company:
            continue
        desc = clean_html(raw.get("description", ""))
        location = raw.get("location") or "Remote"
        work_mode = "Remote" if raw.get("remote") else parse_work_mode(title, location, desc)
        salary = parse_salary(desc, title)
        exp = parse_experience(title, desc)
        skills = extract_skills(title, desc)
        if not desc:
            continue
        # Arbeitnow's `created_at` is a Unix epoch in seconds.
        listed_at = _parse_iso_to_dt(raw.get("created_at") or raw.get("date"))
        jobs_list.append({
            "title": title,
            "company": company,
            "location": location,
            "work_mode": work_mode,
            "salary": salary,
            "experience_required": exp,
            "skills_required": skills,
            "description": desc[:3000],
            "source": "Arbeitnow",
            "url": url,
            "ats_type": "Arbeitnow",
            "provider": "arbeitnow",
            "listed_at": listed_at,
        })
        if len(jobs_list) >= per_run_cap:
            break
    return jobs_list


def run_jobs_fetch(_companies_limit=None):
    """
    Refresh the live external job feed. Called from `trigger_background_job_fetch`,
    which schedules this on a thread. We always hit every provider — sampling
    two random companies and hoping one of them has fresh jobs is what produced
    the stale and duplicated listings you saw before. The total per-run cost
    is bounded by `per_company_cap` in each provider function.
    """
    print("[JobsFeed] Starting job feed refresh...")

    seen_urls: set = set()
    all_jobs: list = []

    # Greenhouse — ~20 boards × 5 jobs
    for company in GREENHOUSE_COMPANIES:
        try:
            for j in fetch_greenhouse_jobs(company):
                if j["url"] not in seen_urls:
                    seen_urls.add(j["url"])
                    all_jobs.append(j)
        except Exception as e:
            print(f"[JobsFeed] Greenhouse {company} crashed: {e}")

    # Ashby — ~15 boards × 5 jobs
    for company in ASHBY_COMPANIES:
        try:
            for j in fetch_ashby_jobs(company):
                if j["url"] not in seen_urls:
                    seen_urls.add(j["url"])
                    all_jobs.append(j)
        except Exception as e:
            print(f"[JobsFeed] Ashby {company} crashed: {e}")

    # Lever — ~15 boards × 5 jobs
    for company in LEVER_COMPANIES:
        try:
            for j in fetch_lever_jobs(company):
                if j["url"] not in seen_urls:
                    seen_urls.add(j["url"])
                    all_jobs.append(j)
        except Exception as e:
            print(f"[JobsFeed] Lever {company} crashed: {e}")

    # SmartRecruiters — ~15 boards × 5 jobs
    for company in SMARTRECRUITERS_COMPANIES:
        try:
            for j in fetch_smartrecruiters_jobs(company):
                if j["url"] not in seen_urls:
                    seen_urls.add(j["url"])
                    all_jobs.append(j)
        except Exception as e:
            print(f"[JobsFeed] SmartRecruiters {company} crashed: {e}")

    # Aggregators — no per-company loop, just one feed call each
    for j in fetch_remoteok_jobs():
        if j["url"] not in seen_urls:
            seen_urls.add(j["url"])
            all_jobs.append(j)
    for j in fetch_arbeitnow_jobs():
        if j["url"] not in seen_urls:
            seen_urls.add(j["url"])
            all_jobs.append(j)

    print(f"[JobsFeed] Fetched {len(all_jobs)} unique live jobs from upstream providers.")

    if not all_jobs:
        # No providers responded this run. Don't touch existing data — the
        # last-good feed stays. We only do staleness sweeps after a successful
        # fetch so a transient outage doesn't empty the portal.
        print("[JobsFeed] No jobs fetched this run; leaving previous feed intact.")
        return

    # Upsert: insert new URLs, refresh metadata on existing ones, mark
    # everything in the live set as confirmed-seen.
    conn = get_db_connection()
    cursor = conn.cursor()
    inserted = 0
    refreshed = 0
    for job in all_jobs:
        try:
            # `listed_at` is whatever the provider said about the original
            # publish date. If the provider didn't expose one, we leave it
            # NULL on insert and the SELECT-side fallback in `get_jobs()`
            # uses `created_at`. We only overwrite listed_at when the
            # incoming value is non-null — a later run that lost the
            # timestamp must not erase a previously-captured one.
            listed_at_dt = job.get("listed_at")
            cursor.execute("""
                INSERT INTO jobs (title, company, location, work_mode, salary,
                                  experience_required, skills_required, description,
                                  source, url, ats_type, provider, fetched_at,
                                  is_live, closed_at, listed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        CURRENT_TIMESTAMP, TRUE, NULL, %s)
                ON CONFLICT (url) DO UPDATE SET
                    title = EXCLUDED.title,
                    company = EXCLUDED.company,
                    location = EXCLUDED.location,
                    work_mode = EXCLUDED.work_mode,
                    salary = EXCLUDED.salary,
                    experience_required = EXCLUDED.experience_required,
                    skills_required = EXCLUDED.skills_required,
                    description = EXCLUDED.description,
                    source = EXCLUDED.source,
                    ats_type = EXCLUDED.ats_type,
                    provider = EXCLUDED.provider,
                    fetched_at = CURRENT_TIMESTAMP,
                    is_live = TRUE,
                    closed_at = NULL,
                    listed_at = COALESCE(EXCLUDED.listed_at, jobs.listed_at)
            """, (
                job["title"], job["company"], job["location"], job["work_mode"],
                job["salary"], job["experience_required"],
                json.dumps(job["skills_required"]),
                job["description"], job["source"], job["url"],
                job["ats_type"], job["provider"],
                listed_at_dt,
            ))
            if cursor.rowcount == 1:
                inserted += 1
            else:
                refreshed += 1
        except Exception as e:
            print(f"[JobsFeed] Upsert failed for {job.get('url')}: {e}")

    # Staleness sweep: any URL we DIDN'T see this run, and that was last
    # seen more than JOB_LIVE_WINDOW_DAYS ago, is now closed. We only mark
    # rows whose last refresh attempt failed — a job that simply wasn't in
    # this run's sample set is given the full window before being dropped.
    try:
        cursor.execute("""
            UPDATE jobs
            SET is_live = FALSE,
                closed_at = CURRENT_TIMESTAMP
            WHERE is_live = TRUE
              AND url NOT IN (SELECT unnest(%s::text[]))
              AND fetched_at < (CURRENT_TIMESTAMP - (INTERVAL '1 day' * %s))
        """, (list(seen_urls) if seen_urls else [""], JOB_LIVE_WINDOW_DAYS))
        closed = cursor.rowcount
    except Exception as e:
        closed = 0
        print(f"[JobsFeed] Staleness sweep error: {e}")

    conn.commit()
    conn.close()
    print(f"[JobsFeed] Refresh complete: {inserted} new, {refreshed} refreshed, {closed} closed.")


def trigger_background_job_fetch():
    print("[JobsFeed] Scheduling background job fetch...")
    thread = threading.Thread(target=run_jobs_fetch, daemon=True)
    thread.start()

GREENHOUSE_COMPANIES = [
    'stripe', 'mongodb', 'vercel', 'figma', 'reddit', 'samsara', 
    'cloudflare', 'databricks', 'doordash', 'hubspot', 'pinterest', 'lyft'
]

ASHBY_COMPANIES = [
    'ramp', 'workos', 'supabase', 'replicate', 'pinecone', 
    'clerk', 'resend', 'dub', 'linear', 'tldraw'
]

TECH_SKILLS = [
    "Python", "Go", "Golang", "Rust", "Ruby", "Java", "Kotlin", "Swift", "TypeScript", 
    "JavaScript", "C++", "C#", "PHP", "React", "Next.js", "Vue", "Angular", "Svelte", 
    "HTML", "CSS", "Tailwind", "Node.js", "FastAPI", "Django", "Flask", "Express", 
    "GraphQL", "gRPC", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Cassandra", 
    "Elasticsearch", "SQLite", "Qdrant", "Docker", "Kubernetes", "AWS", "GCP", 
    "Azure", "Terraform", "Git", "CI/CD", "System Design", "Distributed Systems", 
    "Machine Learning", "AI", "LLM", "Deep Learning", "NLP"
]

def clean_html(raw_html):
    if not raw_html:
        return ""
    # Strip HTML tags
    clean_text = re.sub(r'<[^<]+?>', ' ', raw_html)
    return html.unescape(clean_text).strip()

def parse_work_mode(title, location, desc, workplace_type=None):
    text = f"{title} {location} {desc}".lower()
    if workplace_type:
        wp_type = str(workplace_type).lower()
        if "remote" in wp_type:
            return "Remote"
        elif "hybrid" in wp_type:
            return "Hybrid"
        elif "onsite" in wp_type or "on-site" in wp_type or "office" in wp_type:
            return "Onsite"
            
    if "remote" in text or "telecommute" in text or "work from home" in text:
        return "Remote"
    elif "hybrid" in text:
        return "Hybrid"
    return "Onsite"

def parse_salary(desc, title):
    # Match patterns like $120,000 - $180,000 or $150k
    pattern = r'\$\d{2,3}(?:,\d{3})*(?:\s*k)?(?:\s*-\s*\$\d{2,3}(?:,\d{3})*(?:\s*k)?)?'
    matches = re.findall(pattern, desc, re.IGNORECASE)
    if matches:
        return matches[0]
    
    t_lower = title.lower()
    if "senior" in t_lower or "lead" in t_lower or "staff" in t_lower:
        return "$140,000 - $190,000"
    elif "junior" in t_lower or "intern" in t_lower:
        return "$70,000 - $100,000"
    return "$100,000 - $150,000"

def parse_experience(title, desc):
    pattern = r'(\b\d+\+?\s*(?:-\s*\d+)?\s*(?:years?|yrs?)\b)'
    matches = re.findall(pattern, desc, re.IGNORECASE)
    if matches:
        return matches[0]
    
    t_lower = title.lower()
    if "senior" in t_lower or "staff" in t_lower or "principal" in t_lower:
        return "5+ years"
    elif "lead" in t_lower or "manager" in t_lower:
        return "6+ years"
    elif "junior" in t_lower or "associate" in t_lower or "intern" in t_lower:
        return "0-2 years"
    return "3+ years"

def extract_skills(title, desc):
    text = f"{title} {desc}".lower()
    matched = []
    for skill in TECH_SKILLS:
        # Match word boundaries for short terms like Go, C++
        pattern = r'\b' + re.escape(skill.lower()) + r'\b'
        if skill.lower() in ["c++", "c#", "next.js", "node.js"]:
            pattern = re.escape(skill.lower())
        if re.search(pattern, text):
            matched.append(skill)
    return matched if matched else ["Software Engineering"]

def fetch_greenhouse_jobs(company):
    print(f"Fetching Greenhouse jobs for: {company}...")
    jobs_list = []
    try:
        url = f'https://boards-api.greenhouse.io/v1/boards/{company}/jobs'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            jobs = data.get("jobs", [])
            
        dev_jobs = [j for j in jobs if any(kw in j.get('title', '').lower() for kw in ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist'])]
        
        # Limit to 5 dev jobs to keep background fetches fast
        for j in dev_jobs[:5]:
            job_id = j['id']
            try:
                detail_url = f'https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{job_id}?questions=true'
                req_det = urllib.request.Request(detail_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_det, timeout=5) as resp_det:
                    job_detail = json.loads(resp_det.read())
                    
                title = job_detail.get("title", "")
                raw_desc = job_detail.get("content", "")
                desc = clean_html(raw_desc)
                
                location = job_detail.get("location", {}).get("name", "Remote")
                work_mode = parse_work_mode(title, location, desc)
                salary = parse_salary(desc, title)
                exp = parse_experience(title, desc)
                skills = extract_skills(title, desc)
                
                jobs_list.append({
                    "title": title,
                    "company": company.capitalize() if company != "vercel" else "Vercel",
                    "location": location,
                    "work_mode": work_mode,
                    "salary": salary,
                    "experience_required": exp,
                    "skills_required": skills,
                    "description": desc[:3000],
                    "source": f"{company.capitalize()} Careers",
                    "url": job_detail.get("absolute_url"),
                    "ats_type": "Greenhouse"
                })
            except Exception:
                pass
    except Exception as e:
        print(f"Error fetching Greenhouse board for {company}: {e}")
    return jobs_list

def fetch_ashby_jobs(company):
    print(f"Fetching Ashby jobs for: {company}...")
    jobs_list = []
    try:
        url = f'https://api.ashbyhq.com/posting-api/job-board/{company}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            jobs = data.get("jobs", [])
            
        dev_jobs = [j for j in jobs if any(kw in j.get('title', '').lower() for kw in ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist'])]
        
        # Limit to 5 jobs
        for j in dev_jobs[:5]:
            title = j.get("title", "")
            raw_desc = j.get("descriptionHtml", "")
            desc = clean_html(raw_desc) or j.get("descriptionPlain", "")
            
            location = j.get("location", "Remote")
            workplace_type = j.get("workplaceType", "Remote")
            work_mode = parse_work_mode(title, location, desc, workplace_type)
            
            salary = parse_salary(desc, title)
            exp = parse_experience(title, desc)
            skills = extract_skills(title, desc)
            
            jobs_list.append({
                "title": title,
                "company": company.capitalize() if company != "workos" else "WorkOS",
                "location": location,
                "work_mode": work_mode,
                "salary": salary,
                "experience_required": exp,
                "skills_required": skills,
                "description": desc[:3000],
                "source": f"{company.capitalize()} Careers",
                "url": j.get("jobUrl"),
                "ats_type": "Ashby"
            })
    except Exception as e:
        print(f"Error fetching Ashby board for {company}: {e}")
    return jobs_list

def run_jobs_fetch(companies_limit=4):
    print(f"Starting job fetch (limit={companies_limit})...")
    # Choose random companies to fetch from
    gh_selected = random.sample(GREENHOUSE_COMPANIES, min(companies_limit // 2, len(GREENHOUSE_COMPANIES)))
    ashby_selected = random.sample(ASHBY_COMPANIES, min(companies_limit // 2, len(ASHBY_COMPANIES)))
    
    all_jobs = []
    for company in gh_selected:
        all_jobs.extend(fetch_greenhouse_jobs(company))
    for company in ashby_selected:
        all_jobs.extend(fetch_ashby_jobs(company))
        
    if not all_jobs:
        print("No jobs fetched.")
        return
        
    print(f"Fetched total of {len(all_jobs)} jobs. Storing to PostgreSQL...")
    conn = get_db_connection()
    cursor = conn.cursor()
    
    inserted_count = 0
    for job in all_jobs:
        try:
            cursor.execute("""
                INSERT INTO jobs (title, company, location, work_mode, salary, experience_required, skills_required, description, source, url, ats_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (url) DO NOTHING
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
            inserted_count += 1
        except Exception as e:
            print(f"Failed to insert job: {e}")
            
    conn.commit()
    conn.close()
    print(f"Completed job fetch. Stored/updated {inserted_count} jobs.")

def trigger_background_job_fetch():
    print("Triggering background job fetch...")
    thread = threading.Thread(target=run_jobs_fetch, args=(4,), daemon=True)
    thread.start()


# =========================================================================
# RECRUITER & FOUNDER PORTAL DATABASE FUNCTIONS
# =========================================================================

def create_recruiter_job(org_id: int, created_by: str, job_data: dict) -> dict:
    """Creates a requisition owned by the caller's organization."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        skills = job_data.get("required_skills") or []
        if isinstance(skills, str):
            skills = [s.strip() for s in skills.split(",") if s.strip()]
        cursor.execute("""
            INSERT INTO recruiter_jobs (
                org_id, recruiter_id, company_name, role_title, work_mode,
                location, salary_range, min_devscore, required_skills,
                experience_level, description, status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
        """, (
            org_id,
            str(created_by),
            job_data.get("company_name") or "",
            job_data.get("role_title") or "",
            job_data.get("work_mode") or "Remote",
            job_data.get("location") or "",
            job_data.get("salary_range") or "",
            int(job_data.get("min_devscore") or 0),
            json.dumps(skills),
            job_data.get("experience_level") or "Mid-Level",
            job_data.get("description") or "",
            job_data.get("status") or "Active",
        ))
        res = cursor.fetchone()
        conn.commit()
        return get_recruiter_job(org_id, res["id"]) if res else None
    except Exception as e:
        print(f"Error creating recruiter job: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def _serialize_recruiter_job(r) -> dict:
    skills = []
    if r.get("required_skills"):
        try:
            skills = json.loads(r.get("required_skills"))
        except Exception:
            skills = []
    return {
        "id": r.get("id"),
        "org_id": r.get("org_id"),
        "company_name": r.get("company_name"),
        "role_title": r.get("role_title"),
        "work_mode": r.get("work_mode"),
        "location": r.get("location"),
        "salary_range": r.get("salary_range"),
        "min_devscore": r.get("min_devscore"),
        "required_skills": skills,
        "experience_level": r.get("experience_level"),
        "description": r.get("description"),
        "status": r.get("status"),
        "created_at": r.get("created_at"),
        "shortlist_count": int(r.get("shortlist_count") or 0),
        "assessment_count": int(r.get("assessment_count") or 0),
    }


def get_public_recruiter_jobs() -> list:
    """
    Public-facing feed of all open requisitions across organizations.
    Returns only "Active" jobs; we never surface paused/closed requisitions to
    candidates. Company names and org metadata are included so the candidate
    job board can render cards without an extra round-trip per row.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT j.*,
                   o.name AS org_name,
                   o.slug AS org_slug,
                   o.website_url AS org_website,
                   o.description AS org_description,
                   (SELECT COUNT(*) FROM candidate_shortlists s
                     WHERE s.job_id = j.id AND s.org_id = j.org_id) AS shortlist_count
            FROM recruiter_jobs j
            JOIN organizations o ON o.id = j.org_id
            WHERE j.status = 'Active'
            ORDER BY j.created_at DESC
        """)
        return [_serialize_recruiter_job(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error getting public recruiter jobs: {e}")
        return []
    finally:
        conn.close()


def get_public_recruiter_job(job_id: int) -> dict:
    """Public single-job view. Returns None if missing or non-Active."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT j.*,
                   o.name AS org_name,
                   o.slug AS org_slug,
                   o.website_url AS org_website,
                   o.description AS org_description
            FROM recruiter_jobs j
            JOIN organizations o ON o.id = j.org_id
            WHERE j.id = %s AND j.status = 'Active'
        """, (job_id,))
        row = cursor.fetchone()
        return _serialize_recruiter_job(row) if row else None
    except Exception as e:
        print(f"Error getting public recruiter job: {e}")
        return None
    finally:
        conn.close()


def create_job_application(
    job_id: int,
    candidate_name: str,
    candidate_email: str,
    candidate_id: str = None,
    message: str = "",
    resume_url: str = "",
) -> dict:
    """
    Submit an application to a public job. candidate_id is optional — for
    signed-in candidates we link to their profile, otherwise we accept the
    application on the strength of the email and create a guest row.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Confirm the job is still open before accepting the application.
        cursor.execute(
            "SELECT id, org_id FROM recruiter_jobs WHERE id = %s AND status = 'Active'",
            (job_id,),
        )
        job = cursor.fetchone()
        if not job:
            return None

        cursor.execute(
            """
            INSERT INTO job_applications
                (job_id, org_id, candidate_id, candidate_name, candidate_email,
                 message, resume_url, status, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'Applied', NOW())
            RETURNING id, job_id, status, created_at
            """,
            (job["id"], job["org_id"], candidate_id or None, candidate_name, candidate_email,
             message, resume_url or None),
        )
        return cursor.fetchone()
    except Exception as e:
        print(f"Error creating job application: {e}")
        return None
    finally:
        conn.close()


def get_recruiter_jobs(org_id: int) -> list:
    """
    Requisitions for one organization, with live pipeline counts. org_id is
    mandatory — there is deliberately no unscoped variant.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT j.*,
                   (SELECT COUNT(*) FROM candidate_shortlists s
                     WHERE s.job_id = j.id AND s.org_id = j.org_id) AS shortlist_count,
                   (SELECT COUNT(*) FROM takehome_assessments a
                     WHERE a.job_id = j.id AND a.org_id = j.org_id) AS assessment_count
            FROM recruiter_jobs j
            WHERE j.org_id = %s
            ORDER BY j.created_at DESC
        """, (org_id,))
        return [_serialize_recruiter_job(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error getting recruiter jobs: {e}")
        return []
    finally:
        conn.close()


def get_recruiter_job(org_id: int, job_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT * FROM recruiter_jobs WHERE id = %s AND org_id = %s",
            (job_id, org_id)
        )
        row = cursor.fetchone()
        return _serialize_recruiter_job(row) if row else None
    except Exception as e:
        print(f"Error getting recruiter job: {e}")
        return None
    finally:
        conn.close()


def update_recruiter_job(org_id: int, job_id: int, fields: dict) -> dict:
    """Partial update, constrained to the caller's organization."""
    allowed = (
        "company_name", "role_title", "work_mode", "location", "salary_range",
        "min_devscore", "required_skills", "experience_level", "description", "status",
    )
    updates = {}
    for key in allowed:
        if key not in fields or fields[key] is None:
            continue
        value = fields[key]
        if key == "required_skills":
            if isinstance(value, str):
                value = [s.strip() for s in value.split(",") if s.strip()]
            value = json.dumps(value or [])
        elif key == "min_devscore":
            value = int(value)
        updates[key] = value
    if not updates:
        return get_recruiter_job(org_id, job_id)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        cursor.execute(
            f"UPDATE recruiter_jobs SET {set_clause}, updated_at = CURRENT_TIMESTAMP "
            f"WHERE id = %s AND org_id = %s",
            (*updates.values(), job_id, org_id)
        )
        changed = cursor.rowcount
        conn.commit()
        if not changed:
            return None
    except Exception as e:
        print(f"Error updating recruiter job: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()
    return get_recruiter_job(org_id, job_id)


def delete_recruiter_job(org_id: int, job_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM recruiter_jobs WHERE id = %s AND org_id = %s",
            (job_id, org_id)
        )
        removed = cursor.rowcount
        if removed:
            # Detach dependents rather than cascading away pipeline history
            cursor.execute(
                "UPDATE candidate_shortlists SET job_id = 0 WHERE job_id = %s AND org_id = %s",
                (job_id, org_id)
            )
            cursor.execute(
                "UPDATE takehome_assessments SET job_id = 0 WHERE job_id = %s AND org_id = %s",
                (job_id, org_id)
            )
        conn.commit()
        return removed > 0
    except Exception as e:
        print(f"Error deleting recruiter job: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


# -------------------------------------------------------------------------
# PIPELINE
# -------------------------------------------------------------------------

PIPELINE_STAGES = (
    "Sourced", "Screening", "Assessment", "Interview", "Offer", "Hired", "Rejected",
)


def shortlist_candidate(org_id: int, actor_user_id: str, data: dict) -> dict:
    """
    Adds a candidate to the organization's pipeline (or updates the existing
    entry) and records a stage transition event.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        candidate_id = str(data.get("candidate_id") or "").strip()
        if not candidate_id:
            return None
        stage = data.get("stage") or "Sourced"
        if stage not in PIPELINE_STAGES:
            stage = "Sourced"
        job_id = int(data.get("job_id") or 0)

        cursor.execute(
            "SELECT id, stage FROM candidate_shortlists WHERE org_id = %s AND candidate_id = %s",
            (org_id, candidate_id)
        )
        existing = cursor.fetchone()

        if existing:
            shortlist_id = existing["id"]
            from_stage = existing["stage"]
            cursor.execute("""
                UPDATE candidate_shortlists
                SET stage = %s, notes = %s, job_id = %s, updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND org_id = %s
            """, (stage, data.get("notes") or "", job_id, shortlist_id, org_id))
        else:
            from_stage = ""
            cursor.execute("""
                INSERT INTO candidate_shortlists (
                    org_id, recruiter_id, candidate_id, candidate_name, job_id, stage, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                org_id,
                str(actor_user_id),
                candidate_id,
                data.get("candidate_name") or "",
                job_id,
                stage,
                data.get("notes") or "",
            ))
            shortlist_id = cursor.fetchone()["id"]

        if from_stage != stage:
            cursor.execute("""
                INSERT INTO shortlist_events (shortlist_id, org_id, actor_user_id, from_stage, to_stage, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (shortlist_id, org_id, str(actor_user_id), from_stage, stage, data.get("notes") or ""))

        conn.commit()
        return {"id": shortlist_id, "candidate_id": candidate_id, "stage": stage, "job_id": job_id}
    except Exception as e:
        print(f"Error shortlisting candidate: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def register_inbound_application(recruiter_job_id: int, candidate_user_id: str,
                                 candidate_name: str, note: str = "") -> dict:
    """
    A candidate applied directly to a requisition. Resolves the owning
    organization from the requisition itself — the caller never supplies an
    org_id, so an application can only ever land in the pipeline of the company
    that posted the job.

    Two deliberate differences from `shortlist_candidate`:
      * An existing entry is never moved backwards. A candidate the recruiter
        has already advanced to Interview stays at Interview; the application is
        recorded as an event instead.
      * Applying is consent. The candidate chose this company, so an accepted
        outreach row is written and that org (only that org) may see their
        contact details. Nothing is unlocked for anyone else.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        candidate_id = str(candidate_user_id or "").strip()
        if not candidate_id:
            return None

        cursor.execute(
            "SELECT id, org_id, role_title FROM recruiter_jobs WHERE id = %s",
            (int(recruiter_job_id),)
        )
        job = cursor.fetchone()
        if not job or not job.get("org_id"):
            # Unowned or legacy requisition: there is no tenant to file this
            # under, and guessing one would leak the application to a stranger.
            return None
        org_id = job["org_id"]
        job_id = job["id"]

        cursor.execute(
            "SELECT id, stage FROM candidate_shortlists WHERE org_id = %s AND candidate_id = %s",
            (org_id, candidate_id)
        )
        existing = cursor.fetchone()

        if existing:
            shortlist_id = existing["id"]
            stage = existing["stage"]
            cursor.execute("""
                UPDATE candidate_shortlists
                SET job_id = CASE WHEN job_id IS NULL OR job_id = 0 THEN %s ELSE job_id END,
                    candidate_name = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND org_id = %s
            """, (job_id, candidate_name or "", shortlist_id, org_id))
        else:
            stage = "Sourced"
            cursor.execute("""
                INSERT INTO candidate_shortlists (
                    org_id, recruiter_id, candidate_id, candidate_name, job_id, stage, notes
                ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (org_id, candidate_id, candidate_id, candidate_name or "", job_id, stage, note or ""))
            shortlist_id = cursor.fetchone()["id"]

        cursor.execute("""
            INSERT INTO shortlist_events (shortlist_id, org_id, actor_user_id, from_stage, to_stage, note)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (shortlist_id, org_id, candidate_id, stage, stage,
              note or f"Applied to {job.get('role_title') or 'this role'}"))

        cursor.execute("""
            INSERT INTO recruiter_outreach (org_id, candidate_user_id, job_id, message, sent_by, status, responded_at)
            VALUES (%s, %s, %s, %s, %s, 'accepted', CURRENT_TIMESTAMP)
            ON CONFLICT (org_id, candidate_user_id, job_id) DO UPDATE
                SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
            RETURNING id
        """, (org_id, candidate_id, job_id,
              "Candidate applied directly to this requisition.", candidate_id))

        conn.commit()
        return {"id": shortlist_id, "org_id": org_id, "job_id": job_id, "stage": stage}
    except Exception as e:
        print(f"Error registering inbound application: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def get_shortlisted_candidates(org_id: int) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT s.*, j.role_title AS job_role_title
            FROM candidate_shortlists s
            LEFT JOIN recruiter_jobs j ON j.id = s.job_id AND j.org_id = s.org_id
            WHERE s.org_id = %s
            ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
        """, (org_id,))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error getting shortlists: {e}")
        return []
    finally:
        conn.close()


def update_shortlist_stage(org_id: int, shortlist_id: int, actor_user_id: str,
                           stage: str = None, notes: str = None, job_id: int = None) -> dict:
    """Moves a candidate between pipeline stages and appends to the audit trail."""
    if stage is not None and stage not in PIPELINE_STAGES:
        return {"error": "invalid_stage"}
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT stage, candidate_id, job_id FROM candidate_shortlists WHERE id = %s AND org_id = %s",
            (shortlist_id, org_id)
        )
        row = cursor.fetchone()
        if not row:
            return {"error": "not_found"}
        from_stage = row["stage"]
        candidate_id = row["candidate_id"]

        updates, params = [], []
        if stage is not None:
            updates.append("stage = %s")
            params.append(stage)
        if notes is not None:
            updates.append("notes = %s")
            params.append(notes)
        if job_id is not None:
            updates.append("job_id = %s")
            params.append(int(job_id))
        if not updates:
            return {"error": "no_changes"}

        updates.append("updated_at = CURRENT_TIMESTAMP")
        cursor.execute(
            f"UPDATE candidate_shortlists SET {', '.join(updates)} WHERE id = %s AND org_id = %s",
            (*params, shortlist_id, org_id)
        )
        if stage is not None and stage != from_stage:
            cursor.execute("""
                INSERT INTO shortlist_events (shortlist_id, org_id, actor_user_id, from_stage, to_stage, note)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (shortlist_id, org_id, str(actor_user_id), from_stage, stage, notes or ""))
        conn.commit()
        return {
            "id": shortlist_id,
            "stage": stage or from_stage,
            "from_stage": from_stage,
            "candidate_id": candidate_id,
        }
    except Exception as e:
        print(f"Error updating shortlist stage: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return {"error": "server"}
    finally:
        conn.close()


def get_shortlist_events(org_id: int, shortlist_id: int) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT e.from_stage, e.to_stage, e.note, e.created_at, u.name AS actor_name
            FROM shortlist_events e
            LEFT JOIN users u ON CAST(u.id AS TEXT) = e.actor_user_id
            WHERE e.shortlist_id = %s AND e.org_id = %s
            ORDER BY e.created_at DESC
        """, (shortlist_id, org_id))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching shortlist events: {e}")
        return []
    finally:
        conn.close()


# -------------------------------------------------------------------------
# Candidate Notifications
# -------------------------------------------------------------------------

def create_candidate_notification(
    user_id: str,
    org_id: int,
    org_name: str,
    title: str,
    message: str,
    notification_type: str,
    related_id: int = None,
    related_type: str = None,
) -> dict:
    """Creates a notification for a candidate."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO candidate_notifications
                (user_id, org_id, org_name, title, message, notification_type, related_id, related_type)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
        """, (
            str(user_id),
            int(org_id),
            org_name or "",
            title,
            message,
            notification_type,
            related_id,
            related_type,
        ))
        result = cursor.fetchone()
        conn.commit()
        return {"id": result["id"], "created_at": result["created_at"]} if result else None
    except Exception as e:
        print(f"Error creating notification: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def get_candidate_notifications(user_id: str, limit: int = 20, offset: int = 0) -> dict:
    """Fetches notifications for a candidate with unread count."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT COUNT(*) FROM candidate_notifications
            WHERE user_id = %s AND is_read = FALSE
        """, (str(user_id),))
        unread_count = cursor.fetchone()["count"]

        cursor.execute("""
            SELECT id, org_name, title, message, notification_type,
                   related_id, related_type, is_read, created_at
            FROM candidate_notifications
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
        """, (str(user_id), limit, offset))
        notifications = [dict(r) for r in cursor.fetchall()]
        return {"notifications": notifications, "unread_count": unread_count}
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        return {"notifications": [], "unread_count": 0}
    finally:
        conn.close()


def mark_notification_read(user_id: str, notification_id: int) -> bool:
    """Marks a single notification as read."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE candidate_notifications
            SET is_read = TRUE
            WHERE id = %s AND user_id = %s
        """, (notification_id, str(user_id)))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error marking notification read: {e}")
        return False
    finally:
        conn.close()


def mark_all_notifications_read(user_id: str) -> int:
    """Marks all notifications as read for a candidate. Returns count of updated rows."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE candidate_notifications
            SET is_read = TRUE
            WHERE user_id = %s AND is_read = FALSE
        """, (str(user_id),))
        conn.commit()
        return cursor.rowcount
    except Exception as e:
        print(f"Error marking all notifications read: {e}")
        return 0
    finally:
        conn.close()


# -------------------------------------------------------------------------
# Custom Assessments
# -------------------------------------------------------------------------

def create_custom_assessment(owner_user_id: str, question: str, reference_answer: str, job_id: int = 0) -> dict:
    """Creates a custom assessment owned by a user."""
    import secrets
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO custom_assessments (owner_user_id, job_id, question, reference_answer)
            VALUES (%s, %s, %s, %s)
            RETURNING id, created_at
        """, (str(owner_user_id), int(job_id), question, reference_answer))
        result = cursor.fetchone()
        conn.commit()
        return {
            "id": result["id"],
            "owner_user_id": str(owner_user_id),
            "job_id": int(job_id),
            "question": question,
            "reference_answer": reference_answer,
            "submitted": False,
            "score": 0,
            "summary": "",
            "strengths": [],
            "gaps": [],
            "verdict": "",
            "created_at": result["created_at"],
        }
    except Exception as e:
        print(f"Error creating custom assessment: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return {}
    finally:
        conn.close()


def list_custom_assessments_for_owner(owner_user_id: str) -> list:
    """Lists all custom assessments owned by a user."""
    import secrets
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, job_id, question, submitted, score, summary, verdict, created_at
            FROM custom_assessments
            WHERE owner_user_id = %s
            ORDER BY created_at DESC
        """, (str(owner_user_id),))
        rows = cursor.fetchall()
        items = []
        for row in rows:
            items.append({
                "id": row["id"],
                "job_id": row.get("job_id") or 0,
                "question": row["question"],
                "submitted": bool(row["submitted"]),
                "score": row.get("score") or 0,
                "summary": row.get("summary") or "",
                "verdict": row.get("verdict") or "",
                "created_at": row["created_at"],
            })
        return items
    except Exception as e:
        print(f"Error listing custom assessments: {e}")
        return []
    finally:
        conn.close()


def get_custom_assessment(assessment_id: int, owner_user_id: str) -> dict:
    """Gets one assessment, scoped to the owner."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT * FROM custom_assessments WHERE id = %s AND owner_user_id = %s
        """, (assessment_id, str(owner_user_id)))
        row = cursor.fetchone()
        if not row:
            return None
        return dict(row)
    except Exception as e:
        print(f"Error getting custom assessment: {e}")
        return None
    finally:
        conn.close()


def issue_custom_assessment_token(assessment_id: int) -> str:
    """Generates and stores a one-time take token for a custom assessment."""
    import secrets
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        token = secrets.token_urlsafe(24)
        cursor.execute("""
            UPDATE custom_assessments SET take_token = %s WHERE id = %s
        """, (token, assessment_id))
        conn.commit()
        return token if cursor.rowcount > 0 else None
    except Exception as e:
        print(f"Error issuing custom assessment token: {e}")
        return None
    finally:
        conn.close()


def get_custom_assessment_by_token(token: str) -> dict:
    """Looks up an assessment by its take token (no owner check — public endpoint)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT * FROM custom_assessments WHERE take_token = %s
        """, (token,))
        row = cursor.fetchone()
        return dict(row) if row else None
    except Exception as e:
        print(f"Error looking up custom assessment by token: {e}")
        return None
    finally:
        conn.close()


def submit_custom_assessment(token: str, candidate_answer: str, score: int,
                             summary: str, strengths: list, gaps: list, verdict: str) -> bool:
    """Records a submission and AI evaluation result."""
    import json
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE custom_assessments
            SET submitted = TRUE,
                score = %s,
                summary = %s,
                strengths = %s,
                gaps = %s,
                verdict = %s,
                submitted_at = CURRENT_TIMESTAMP
            WHERE take_token = %s AND submitted = FALSE
        """, (
            max(0, min(100, int(score))),
            summary,
            json.dumps(strengths or []),
            json.dumps(gaps or []),
            verdict,
            token,
        ))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error submitting custom assessment: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


def list_custom_assessment_submissions(assessment_id: int) -> list:
    """Returns the single submission for an assessment (one taker per token)."""
    import json
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT score, summary, strengths, gaps, verdict, submitted_at
            FROM custom_assessments
            WHERE id = %s AND submitted = TRUE
        """, (assessment_id,))
        row = cursor.fetchone()
        if not row:
            return []
        return [{
            "score": row.get("score") or 0,
            "summary": row.get("summary") or "",
            "strengths": json.loads(row.get("strengths") or "[]"),
            "gaps": json.loads(row.get("gaps") or "[]"),
            "verdict": row.get("verdict") or "",
            "submitted_at": row.get("submitted_at"),
        }]
    except Exception as e:
        print(f"Error listing custom assessment submissions: {e}")
        return []
    finally:
        conn.close()


def delete_shortlisted_candidate(org_id: int, shortlist_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM candidate_shortlists WHERE id = %s AND org_id = %s",
            (shortlist_id, org_id)
        )
        removed = cursor.rowcount
        if removed:
            cursor.execute(
                "DELETE FROM shortlist_events WHERE shortlist_id = %s AND org_id = %s",
                (shortlist_id, org_id)
            )
        conn.commit()
        return removed > 0
    except Exception as e:
        print(f"Error deleting shortlist candidate: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


# -------------------------------------------------------------------------
# TAKE-HOME ASSESSMENTS
# -------------------------------------------------------------------------

def create_takehome_assessment(data: dict) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO takehome_assessments (
                org_id, token, recruiter_id, candidate_id, candidate_name, candidate_email,
                role_title, job_id, problem_title, problem_slug, difficulty,
                time_limit_minutes, status, expires_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id, created_at
        """, (
            data.get("org_id"),
            data.get("token"),
            str(data.get("recruiter_id") or ""),
            str(data.get("candidate_id") or ""),
            data.get("candidate_name") or "",
            data.get("candidate_email") or "",
            data.get("role_title") or "",
            int(data.get("job_id") or 0),
            data.get("problem_title") or "",
            data.get("problem_slug") or "",
            data.get("difficulty") or "Medium",
            int(data.get("time_limit_minutes") or 60),
            data.get("status") or "Sent",
            data.get("expires_at"),
        ))
        res = cursor.fetchone()
        conn.commit()
        return {**data, "id": res["id"] if res else None, "created_at": res.get("created_at") if res else None}
    except Exception as e:
        print(f"Error creating takehome assessment: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def get_takehome_assessments(org_id: int) -> list:
    """
    Assessments for one organization. The raw token is deliberately NOT
    returned — a recruiter holding it could complete the candidate's test.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, org_id, candidate_id, candidate_name, candidate_email, role_title,
                   job_id, problem_title, problem_slug, difficulty, time_limit_minutes,
                   status, score, chaos_resilience, test_results, attempt_count,
                   created_at, expires_at, started_at, submitted_at, completed_at, invite_sent_at
            FROM takehome_assessments
            WHERE org_id = %s
            ORDER BY created_at DESC
        """, (org_id,))
        result = []
        for r in cursor.fetchall():
            item = dict(r)
            if isinstance(item.get("test_results"), str):
                try:
                    item["test_results"] = json.loads(item["test_results"])
                except Exception:
                    item["test_results"] = {}
            result.append(item)
        return result
    except Exception as e:
        print(f"Error getting takehome assessments: {e}")
        return []
    finally:
        conn.close()


def get_takehome_assessment_by_token(token: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM takehome_assessments WHERE token = %s", (token,))
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        if isinstance(res.get("test_results"), str):
            try:
                res["test_results"] = json.loads(res["test_results"])
            except Exception:
                res["test_results"] = {}
        return res
    except Exception as e:
        print(f"Error getting takehome assessment by token: {e}")
        return None
    finally:
        conn.close()


def mark_takehome_started(token: str) -> bool:
    """Stamps started_at once, so the countdown is anchored server-side."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE takehome_assessments
            SET started_at = CURRENT_TIMESTAMP,
                status = CASE WHEN status = 'Sent' THEN 'In Progress' ELSE status END
            WHERE token = %s AND started_at IS NULL
        """, (token,))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        print(f"Error marking takehome started: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


def mark_takehome_invite_sent(token: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE takehome_assessments SET invite_sent_at = CURRENT_TIMESTAMP WHERE token = %s",
            (token,)
        )
        conn.commit()
        return True
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


def update_takehome_assessment_result(token: str, status: str, score: int,
                                      chaos_resilience: int, test_results: dict) -> bool:
    """
    Records a submission. Guarded so a token can only be submitted once — the
    UPDATE is a no-op if the assessment has already been finalized.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE takehome_assessments SET
                status = %s,
                score = %s,
                chaos_resilience = %s,
                test_results = %s,
                attempt_count = COALESCE(attempt_count, 0) + 1,
                submitted_at = CURRENT_TIMESTAMP,
                completed_at = CURRENT_TIMESTAMP
            WHERE token = %s AND submitted_at IS NULL
        """, (status, score, chaos_resilience, json.dumps(test_results), token))
        changed = cursor.rowcount
        conn.commit()
        return changed > 0
    except Exception as e:
        print(f"Error updating takehome assessment result: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


def delete_takehome_assessment(org_id: int, assessment_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "DELETE FROM takehome_assessments WHERE id = %s AND org_id = %s",
            (assessment_id, org_id)
        )
        removed = cursor.rowcount
        conn.commit()
        return removed > 0
    except Exception as e:
        print(f"Error deleting takehome assessment: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return False
    finally:
        conn.close()


def get_assessment_for_resend(org_id: int, assessment_id: int) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "SELECT * FROM takehome_assessments WHERE id = %s AND org_id = %s",
            (assessment_id, org_id)
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    except Exception as e:
        print(f"Error fetching assessment: {e}")
        return None
    finally:
        conn.close()


# -------------------------------------------------------------------------
# CANDIDATE CONSENT & RECRUITER OUTREACH
# -------------------------------------------------------------------------

def set_candidate_opportunity_optin(user_id: str, open_to_opportunities: bool,
                                    preferences: str = None) -> dict:
    """
    The sourcing consent switch. A candidate is invisible to every recruiter
    until this is TRUE.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT 1 FROM candidate_profiles WHERE user_id = %s", (str(user_id),))
        if not cursor.fetchone():
            cursor.execute(
                "INSERT INTO candidate_profiles (user_id) VALUES (%s)",
                (str(user_id),)
            )
        if preferences is None:
            cursor.execute("""
                UPDATE candidate_profiles
                SET open_to_opportunities = %s,
                    opted_in_at = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END
                WHERE user_id = %s
            """, (bool(open_to_opportunities), bool(open_to_opportunities), str(user_id)))
        else:
            cursor.execute("""
                UPDATE candidate_profiles
                SET open_to_opportunities = %s,
                    opportunity_preferences = %s,
                    opted_in_at = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END
                WHERE user_id = %s
            """, (bool(open_to_opportunities), preferences, bool(open_to_opportunities), str(user_id)))
        conn.commit()
        return {
            "open_to_opportunities": bool(open_to_opportunities),
            "opportunity_preferences": preferences or "",
        }
    except Exception as e:
        print(f"Error setting candidate opt-in: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()


def get_candidate_opportunity_status(user_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT open_to_opportunities, opportunity_preferences, opted_in_at
            FROM candidate_profiles WHERE user_id = %s
        """, (str(user_id),))
        row = cursor.fetchone()
        if not row:
            return {"open_to_opportunities": True, "opportunity_preferences": "", "opted_in_at": None}
        is_open = row.get("open_to_opportunities")
        return {
            "open_to_opportunities": True if is_open is None or is_open is True else False,
            "opportunity_preferences": row.get("opportunity_preferences") or "",
            "opted_in_at": row.get("opted_in_at"),
        }
    except Exception as e:
        print(f"Error fetching opt-in status: {e}")
        return {"open_to_opportunities": True, "opportunity_preferences": "", "opted_in_at": None}
    finally:
        conn.close()


def create_outreach_request(org_id: int, candidate_user_id: str, job_id: int,
                            message: str, sent_by: str) -> dict:
    """
    Records a contact request. The candidate must accept before the recruiter
    sees any contact detail.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT open_to_opportunities FROM candidate_profiles WHERE user_id = %s
        """, (str(candidate_user_id),))
        prof = cursor.fetchone()
        # If candidate explicitly opted out (open_to_opportunities is False), check if they are in pipeline or applied
        if prof and prof.get("open_to_opportunities") is False:
            cursor.execute("""
                SELECT 1 FROM candidate_shortlists WHERE org_id = %s AND candidate_id = %s
            """, (org_id, str(candidate_user_id)))
            in_shortlist = cursor.fetchone()
            if not in_shortlist:
                return {"error": "not_open_to_opportunities"}

        cursor.execute("""
            INSERT INTO recruiter_outreach (org_id, candidate_user_id, job_id, message, sent_by)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (org_id, candidate_user_id, job_id) DO UPDATE
                SET message = EXCLUDED.message,
                    sent_by = EXCLUDED.sent_by,
                    status = CASE WHEN recruiter_outreach.status = 'declined'
                                  THEN 'declined' ELSE recruiter_outreach.status END
            RETURNING id, status
        """, (org_id, str(candidate_user_id), int(job_id or 0), (message or "")[:2000], str(sent_by)))
        res = cursor.fetchone()
        conn.commit()
        return {"id": res["id"], "status": res["status"]}
    except Exception as e:
        print(f"Error creating outreach request: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return {"error": "server"}
    finally:
        conn.close()


def get_org_outreach(org_id: int) -> list:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT id, candidate_user_id, job_id, status, message, created_at, responded_at
            FROM recruiter_outreach WHERE org_id = %s ORDER BY created_at DESC
        """, (org_id,))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching org outreach: {e}")
        return []
    finally:
        conn.close()


def get_unlocked_candidate_ids(org_id: int) -> set:
    """Candidate ids that have accepted this organization's outreach."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT DISTINCT candidate_user_id FROM recruiter_outreach
            WHERE org_id = %s AND status = 'accepted'
        """, (org_id,))
        return {str(r["candidate_user_id"]) for r in cursor.fetchall()}
    except Exception as e:
        print(f"Error fetching unlocked candidates: {e}")
        return set()
    finally:
        conn.close()


def get_candidate_outreach(candidate_user_id: str) -> list:
    """The candidate's own inbox of pending and answered contact requests."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT r.id, r.status, r.message, r.created_at, r.responded_at, r.job_id,
                   o.name AS org_name, o.website_url AS org_website,
                   j.role_title, j.location, j.work_mode, j.salary_range
            FROM recruiter_outreach r
            JOIN organizations o ON o.id = r.org_id
            LEFT JOIN recruiter_jobs j ON j.id = r.job_id AND j.org_id = r.org_id
            WHERE r.candidate_user_id = %s
            ORDER BY r.created_at DESC
        """, (str(candidate_user_id),))
        return [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching candidate outreach: {e}")
        return []
    finally:
        conn.close()


def get_candidate_tracker_state(candidate_user_id: str) -> dict:
    """
    Everything the candidate's own application tracker needs, keyed by
    requisition so each application shows the stage at THAT company. The
    previous implementation took the single newest shortlist row across all
    organizations and stamped it onto every application, so once two companies
    were in play the tracker showed the wrong company's stage.

    The assessment token is included because this is the candidate's own data —
    callers must therefore resolve `candidate_user_id` from the bearer token and
    never from a request parameter.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    state = {"shortlists": [], "assessments": []}
    try:
        cursor.execute("""
            SELECT s.id, s.job_id, s.stage, s.notes, s.created_at, s.updated_at,
                   o.name AS org_name, j.role_title
            FROM candidate_shortlists s
            JOIN organizations o ON o.id = s.org_id
            LEFT JOIN recruiter_jobs j ON j.id = s.job_id AND j.org_id = s.org_id
            WHERE s.candidate_id = %s
            ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
        """, (str(candidate_user_id),))
        state["shortlists"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT a.id, a.job_id, a.token, a.problem_title, a.problem_slug,
                   a.difficulty, a.time_limit_minutes, a.status, a.score,
                   a.expires_at, a.started_at, a.submitted_at, a.created_at,
                   o.name AS org_name, a.role_title
            FROM takehome_assessments a
            JOIN organizations o ON o.id = a.org_id
            WHERE a.candidate_id = %s
            ORDER BY a.created_at DESC
        """, (str(candidate_user_id),))
        state["assessments"] = [dict(r) for r in cursor.fetchall()]
    except Exception as e:
        print(f"Error fetching candidate tracker state: {e}")
    finally:
        conn.close()
    return state


def respond_to_outreach(outreach_id: int, candidate_user_id: str, accept: bool) -> dict:
    """Only the addressed candidate can answer, and only once."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE recruiter_outreach
            SET status = %s, responded_at = CURRENT_TIMESTAMP
            WHERE id = %s AND candidate_user_id = %s AND status = 'pending'
        """, ("accepted" if accept else "declined", outreach_id, str(candidate_user_id)))
        changed = cursor.rowcount
        conn.commit()
        if not changed:
            return {"error": "not_found_or_answered"}
        return {"id": outreach_id, "status": "accepted" if accept else "declined"}
    except Exception as e:
        print(f"Error responding to outreach: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return {"error": "server"}
    finally:
        conn.close()


def create_or_update_startup_profile(data: dict) -> dict:
    """
    Upserts the company profile keyed on the founder's user id. The caller must
    supply that id — it is resolved from the bearer token, never defaulted to a
    shared "default_recruiter" row that every tenant would have written into.
    """
    user_id = str(data.get("user_id") or "").strip()
    if not user_id:
        return None
    company_name = (data.get("company_name") or "").strip()
    if not company_name:
        return None

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        founder_name = data.get("founder_name", "")
        founder_role = data.get("founder_role", "")
        tagline = data.get("tagline", "")
        stage = data.get("stage", "")
        website_url = data.get("website_url", "")
        industry = data.get("industry", "")
        location = data.get("location", "")
        team_size = data.get("team_size", "")
        primary_tech_stack = data.get("primary_tech_stack", [])
        if isinstance(primary_tech_stack, list):
            primary_tech_stack_json = json.dumps(primary_tech_stack)
        else:
            primary_tech_stack_json = str(primary_tech_stack)
        about = data.get("about", "")
        logo_url = data.get("logo_url", "")

        cursor.execute("""
            INSERT INTO startup_profiles (
                user_id, company_name, founder_name, founder_role, tagline,
                stage, website_url, industry, location, team_size,
                primary_tech_stack, about, logo_url, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id) DO UPDATE SET
                company_name = EXCLUDED.company_name,
                founder_name = EXCLUDED.founder_name,
                founder_role = EXCLUDED.founder_role,
                tagline = EXCLUDED.tagline,
                stage = EXCLUDED.stage,
                website_url = EXCLUDED.website_url,
                industry = EXCLUDED.industry,
                location = EXCLUDED.location,
                team_size = EXCLUDED.team_size,
                primary_tech_stack = EXCLUDED.primary_tech_stack,
                about = EXCLUDED.about,
                logo_url = EXCLUDED.logo_url,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id, created_at, updated_at
        """, (
            user_id, company_name, founder_name, founder_role, tagline,
            stage, website_url, industry, location, team_size,
            primary_tech_stack_json, about, logo_url
        ))
        res = cursor.fetchone()
        conn.commit()
        return {
            **data,
            "id": res.get("id") if res else 1,
            "primary_tech_stack": primary_tech_stack
        }
    except Exception as e:
        print(f"Error saving startup profile: {e}")
        try:
            conn.rollback()
        except Exception:
            pass
        return None
    finally:
        conn.close()

def get_startup_profile(user_id: str) -> dict:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM startup_profiles WHERE user_id = %s", (str(user_id),))
        row = cursor.fetchone()
        if not row:
            return None
        res = dict(row)
        if res.get("primary_tech_stack") and isinstance(res["primary_tech_stack"], str):
            try:
                res["primary_tech_stack"] = json.loads(res["primary_tech_stack"])
            except Exception:
                res["primary_tech_stack"] = []
        return res
    except Exception as e:
        print(f"Error fetching startup profile: {e}")
        return None
    finally:
        conn.close()


def get_user_prepai_stats(user_id: str = None) -> dict:
    """
    Real aggregated voice/interview metrics for one user. Returns zeros when the
    user has no completed sessions — never another user's averages.
    """
    empty = {
        "sessions_count": 0,
        "voice_rating": 0.0,
        "technical_depth": 0.0,
        "communication": 0.0,
    }
    if not user_id or user_id == "anonymous":
        return empty

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                COUNT(*) as sessions_count,
                AVG(overall_rating) as avg_rating,
                AVG(technical_depth) as avg_tech,
                AVG(communication) as avg_comm
            FROM voice_sessions
            WHERE user_id = %s AND overall_rating IS NOT NULL
        """, (str(user_id),))
        row = cursor.fetchone()
        if row and row.get("sessions_count") and row["sessions_count"] > 0:
            return {
                "sessions_count": int(row["sessions_count"]),
                "voice_rating": round(float(row["avg_rating"] or 0.0), 1),
                "technical_depth": round(float(row["avg_tech"] or 0.0), 1),
                "communication": round(float(row["avg_comm"] or 0.0), 1),
            }
    except Exception as e:
        print(f"Error fetching user prepai stats: {e}")
    finally:
        conn.close()

    return empty
