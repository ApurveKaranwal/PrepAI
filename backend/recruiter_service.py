"""
=============================================================================
PREPFLOW RECRUITER & TALENT INTELLIGENCE SERVICE
=============================================================================
Sources candidates from verified platform data only.

Two rules govern this module and must not be relaxed:

1. NO FABRICATED DATA. Every number returned to a recruiter is either read from
   the database or computed from database values by `profile_aggregator.
   calculate_devscore`. A platform the candidate has not connected is reported
   as `{"connected": false}` — never as an invented statistic. There are no
   synthetic "benchmark" candidates.

2. CONTACT DETAILS ARE CONSENT-GATED. A candidate is only sourceable after
   setting `open_to_opportunities`. Even then, recruiters see an anonymized
   profile; name, email, resume text and profile links unlock only once that
   candidate has accepted that specific organization's outreach request.

Free-text search deliberately matches headline, stack and location but NOT name
or email: allowing that would turn the search box into an oracle for "is this
specific person job hunting", which the consent model exists to prevent.
=============================================================================
"""

import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone

from database import (
    get_db_connection,
    get_unlocked_candidate_ids,
    create_takehome_assessment,
)
from profile_aggregator import calculate_devscore

# DevScore bands — kept identical to profile_aggregator.calculate_devscore so a
# recruiter's tier filter means the same thing as the candidate's badge.
TIER_BANDS = {
    "Titan / Elite Staff": (900, 1000),
    "Distinguished Senior": (750, 899),
    "Proficient Mid-Level": (600, 749),
    "Active Developer": (400, 599),
    "Apprentice / Growing": (0, 399),
}

TAKEHOME_PROBLEMS = {
    "lru-cache-ttl": "Concurrent LRU Cache with Expirable Keys (TTL)",
    "two-sum-sorted": "Two Sum (Sorted & Memory-Optimized)",
    "trapping-rain-water": "Trapping Rain Water (Two-Pointer Linear)",
    "rate-limiter": "Token Bucket Distributed Rate Limiter",
    "graph-chaos": "Fault-Tolerant Network Routing under Adversarial Partitions",
    "stream-median": "Streaming Median Tracker with Sliding Window",
}

TAKEHOME_DEFAULT_TTL_DAYS = int(os.environ.get("TAKEHOME_TTL_DAYS", "7"))

MAX_PAGE_SIZE = 50


def _parse_json_field(raw, default=None):
    if not raw:
        return default if default is not None else {}
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(raw)
    except Exception:
        return default if default is not None else {}


def _anonymous_handle(user_id: str) -> str:
    """
    Stable pseudonym for an un-unlocked candidate. Derived from a digest so it
    is consistent across page loads without exposing the row id (which would
    leak both user count and signup order).
    """
    digest = hashlib.sha256(f"prepflow-candidate:{user_id}".encode("utf-8")).hexdigest()
    return f"Candidate {digest[:6].upper()}"


def _parse_stack(raw) -> list:
    parsed = _parse_json_field(raw, default=[])
    if isinstance(parsed, list):
        return [str(s).strip() for s in parsed if str(s).strip()]
    if isinstance(raw, str) and raw.strip():
        return [s.strip() for s in raw.split(",") if s.strip()]
    return []


def _parse_location(raw) -> str:
    """cities is stored as either a JSON array or a plain string."""
    if not raw:
        return ""
    parsed = _parse_json_field(raw, default=None)
    if isinstance(parsed, list):
        return ", ".join(str(c) for c in parsed if c)
    return str(raw)


def _build_platform_stats(row: dict, voice: dict) -> dict:
    """
    Verified platform telemetry. An unconnected platform reports connected=False
    with no numbers so the UI can render an honest "not connected" placeholder.
    """
    lc_handle = (row.get("leetcode_handle") or "").strip()
    lc_stats = _parse_json_field(row.get("leetcode_stats"), default={})
    leetcode = {"connected": False, "handle": ""}
    if lc_handle and lc_stats:
        leetcode = {
            "connected": True,
            "handle": lc_handle,
            "total_solved": lc_stats.get("total_solved", 0),
            "easy_solved": lc_stats.get("easy_solved", 0),
            "medium_solved": lc_stats.get("medium_solved", 0),
            "hard_solved": lc_stats.get("hard_solved", 0),
            "contest_rating": lc_stats.get("contest_rating", 0),
        }

    cf_handle = (row.get("codeforces_handle") or "").strip()
    cf_stats = _parse_json_field(row.get("codeforces_stats"), default={})
    codeforces = {"connected": False, "handle": ""}
    if cf_handle and cf_stats:
        codeforces = {
            "connected": True,
            "handle": cf_handle,
            "rating": cf_stats.get("rating", 0),
            "max_rating": cf_stats.get("max_rating", 0),
            "rank": cf_stats.get("rank", ""),
            "solved_count": cf_stats.get("solved_count", 0),
        }

    gh_url = (row.get("github_url") or "").strip()
    gh_stats = _parse_json_field(row.get("github_stats"), default={})
    github = {"connected": False, "username": ""}
    if gh_url and gh_stats:
        github = {
            "connected": True,
            "username": gh_stats.get("username") or gh_url.rstrip("/").split("/")[-1],
            "public_repos": gh_stats.get("public_repos", 0),
            "stars_total": gh_stats.get("stars_total", 0),
            "primary_languages": gh_stats.get("primary_languages", []),
            "github_strength": gh_stats.get("github_strength", 0),
            "open_source_score": gh_stats.get("open_source_score", 0),
        }

    sessions_count = int(voice.get("sessions_count") or 0)
    prepai = {
        "connected": sessions_count > 0,
        "sessions_count": sessions_count,
        "voice_rating": round(float(voice.get("avg_rating") or 0.0), 1) if sessions_count else 0.0,
        "technical_depth": round(float(voice.get("avg_tech") or 0.0), 1) if sessions_count else 0.0,
        "communication": round(float(voice.get("avg_comm") or 0.0), 1) if sessions_count else 0.0,
    }

    return {"leetcode": leetcode, "codeforces": codeforces, "github": github, "prepai": prepai}


def _resolve_score(row: dict, platform_stats: dict) -> dict:
    """
    Uses the score the candidate's own profile page shows when it exists, and
    otherwise recomputes it with the same function — so a recruiter and a
    candidate never see two different numbers for the same person.
    """
    stored = int(row.get("devscore") or 0)
    stored_breakdown = _parse_json_field(row.get("devscore_breakdown"), default={})
    if stored > 0 and stored_breakdown:
        tier, percentile = _tier_for(stored)
        return {
            "devscore": stored,
            "breakdown": stored_breakdown,
            "tier": stored_breakdown.get("tier") or tier,
            "percentile": stored_breakdown.get("percentile") or percentile,
            "badges": stored_breakdown.get("badges") or [],
            "source": "synced",
        }

    computed = calculate_devscore(
        leetcode=platform_stats["leetcode"],
        codeforces=platform_stats["codeforces"],
        github=platform_stats["github"],
        prepai={
            "voice_rating": platform_stats["prepai"]["voice_rating"],
            "sessions_count": platform_stats["prepai"]["sessions_count"],
            "technical_depth": platform_stats["prepai"]["technical_depth"],
        },
    )
    return {
        "devscore": computed["devscore"],
        "breakdown": computed["breakdown"],
        "tier": computed["tier"],
        "percentile": computed["percentile"],
        "badges": computed["badges"],
        "source": "computed",
    }


def _tier_for(devscore: int):
    if devscore >= 900:
        return "Titan / Elite Staff", "Top 1%"
    if devscore >= 750:
        return "Distinguished Senior", "Top 5%"
    if devscore >= 600:
        return "Proficient Mid-Level", "Top 20%"
    if devscore >= 400:
        return "Active Developer", "Top 50%"
    return "Apprentice / Growing", "Baseline"


def _serialize_candidate(row: dict, voice: dict, assessment: dict,
                         pipeline: dict, unlocked: bool) -> dict:
    """
    Builds the recruiter-facing candidate record. The `unlocked` flag is the only
    thing that adds identifying data, and it is derived server-side from an
    accepted outreach row — never from anything the client sends.
    """
    uid = str(row.get("user_id"))
    platform_stats = _build_platform_stats(row, voice)
    score = _resolve_score(row, platform_stats)
    stack = _parse_stack(row.get("tech_stack_preferences"))
    role = (row.get("job_type") or "Software Engineer").strip()
    location = _parse_location(row.get("cities"))
    work_mode = (row.get("work_mode") or "").strip()

    headline = role
    if stack:
        headline = f"{role} • {stack[0]}"

    candidate = {
        "id": uid,
        "display_name": _anonymous_handle(uid),
        "headline": headline,
        "role": role,
        "location": location,
        "work_mode": work_mode,
        "notice_period": row.get("notice_period") or "",
        "expected_salary": row.get("salary_expectations") or "",
        "opportunity_preferences": row.get("opportunity_preferences") or "",
        "primary_stack": stack,
        "devscore": score["devscore"],
        "devscore_source": score["source"],
        "breakdown": score["breakdown"],
        "tier": score["tier"],
        "percentile": score["percentile"],
        "badges": score["badges"],
        "platform_stats": platform_stats,
        "has_resume": bool(row.get("resume_text")),
        "contact_unlocked": unlocked,
        # Pipeline state for the requesting organization only
        "shortlist_id": pipeline.get("id") if pipeline else None,
        "stage": pipeline.get("stage") if pipeline else None,
        "in_pipeline": bool(pipeline),
        "outreach_status": pipeline.get("outreach_status") if pipeline else None,
    }

    if assessment:
        candidate["assessment"] = {
            "status": assessment.get("status"),
            "score": assessment.get("score"),
            "chaos_resilience": assessment.get("chaos_resilience"),
            "problem_title": assessment.get("problem_title"),
            "completed_at": assessment.get("completed_at"),
        }
    else:
        candidate["assessment"] = None

    if unlocked:
        candidate.update({
            "name": row.get("name") or "",
            "display_name": row.get("name") or _anonymous_handle(uid),
            "email": row.get("email") or "",
            "resume_name": row.get("resume_name") or "",
            "github_url": row.get("github_url") or "",
            "linkedin_url": row.get("linkedin_url") or "",
            "portfolio_url": row.get("portfolio_url") or "",
        })

    return candidate


def search_candidate_talent(
    org_id: int,
    query: str = "",
    min_devscore: int = 0,
    primary_stack: str = "All",
    tier: str = "All",
    limit: int = 20,
    offset: int = 0,
) -> dict:
    """
    Paginated, consent-filtered candidate search. All filtering happens in SQL so
    that `total` and `has_more` are correct and the result set never grows with
    the size of the users table.

    Returns {"items": [...], "total": int, "has_more": bool}.
    """
    limit = max(1, min(int(limit or 20), MAX_PAGE_SIZE))
    offset = max(0, int(offset or 0))

    where = ["cp.open_to_opportunities = TRUE"]
    params = []

    if min_devscore and int(min_devscore) > 0:
        where.append("COALESCE(cp.devscore, 0) >= %s")
        params.append(int(min_devscore))

    if tier and tier != "All" and tier in TIER_BANDS:
        low, high = TIER_BANDS[tier]
        where.append("COALESCE(cp.devscore, 0) BETWEEN %s AND %s")
        params.extend([low, high])

    if primary_stack and primary_stack != "All":
        where.append("cp.tech_stack_preferences ILIKE %s")
        params.append(f"%{primary_stack}%")

    if query and query.strip():
        # Headline / stack / location only — never name or email. See module docstring.
        pattern = f"%{query.strip()}%"
        where.append(
            "(cp.job_type ILIKE %s OR cp.tech_stack_preferences ILIKE %s "
            "OR cp.cities ILIKE %s OR cp.opportunity_preferences ILIKE %s)"
        )
        params.extend([pattern, pattern, pattern, pattern])

    where_sql = " AND ".join(where)

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM candidate_profiles cp
            JOIN users u ON CAST(u.id AS TEXT) = cp.user_id
            WHERE {where_sql}
            """,
            tuple(params),
        )
        total_row = cursor.fetchone()
        total = int(total_row["total"] if total_row else 0)

        if total == 0 or offset >= total:
            return {"items": [], "total": total, "has_more": False}

        cursor.execute(
            f"""
            SELECT
                u.id AS user_id, u.name, u.email,
                cp.job_type, cp.work_mode, cp.cities, cp.salary_expectations,
                cp.notice_period, cp.tech_stack_preferences,
                cp.github_url, cp.github_stats, cp.linkedin_url, cp.portfolio_url,
                cp.resume_name, cp.resume_text,
                cp.leetcode_handle, cp.leetcode_stats,
                cp.codeforces_handle, cp.codeforces_stats,
                cp.devscore, cp.devscore_breakdown,
                cp.opportunity_preferences, cp.opted_in_at
            FROM candidate_profiles cp
            JOIN users u ON CAST(u.id AS TEXT) = cp.user_id
            WHERE {where_sql}
            ORDER BY COALESCE(cp.devscore, 0) DESC, u.id ASC
            LIMIT %s OFFSET %s
            """,
            tuple(params) + (limit, offset),
        )
        rows = cursor.fetchall()
        if not rows:
            return {"items": [], "total": total, "has_more": False}

        page_ids = [str(r["user_id"]) for r in rows]
        placeholders = ", ".join(["%s"] * len(page_ids))

        # Voice interview telemetry, restricted to this page
        cursor.execute(
            f"""
            SELECT CAST(user_id AS TEXT) AS user_id,
                   COUNT(*) AS sessions_count,
                   AVG(overall_rating) AS avg_rating,
                   AVG(technical_depth) AS avg_tech,
                   AVG(communication) AS avg_comm
            FROM voice_sessions
            WHERE overall_rating IS NOT NULL AND CAST(user_id AS TEXT) IN ({placeholders})
            GROUP BY CAST(user_id AS TEXT)
            """,
            tuple(page_ids),
        )
        voice_map = {str(r["user_id"]): dict(r) for r in cursor.fetchall()}

        # This organization's own pipeline state and assessment results
        cursor.execute(
            f"""
            SELECT s.id, s.candidate_id, s.stage, s.job_id
            FROM candidate_shortlists s
            WHERE s.org_id = %s AND s.candidate_id IN ({placeholders})
            """,
            (org_id, *page_ids),
        )
        pipeline_map = {str(r["candidate_id"]): dict(r) for r in cursor.fetchall()}

        cursor.execute(
            f"""
            SELECT candidate_id, status, score, chaos_resilience, problem_title, completed_at
            FROM takehome_assessments
            WHERE org_id = %s AND candidate_id IN ({placeholders})
            ORDER BY created_at DESC
            """,
            (org_id, *page_ids),
        )
        assessment_map = {}
        for r in cursor.fetchall():
            key = str(r["candidate_id"])
            if key not in assessment_map:  # most recent wins
                assessment_map[key] = dict(r)

        cursor.execute(
            f"""
            SELECT candidate_user_id, status
            FROM recruiter_outreach
            WHERE org_id = %s AND candidate_user_id IN ({placeholders})
            """,
            (org_id, *page_ids),
        )
        outreach_map = {str(r["candidate_user_id"]): r["status"] for r in cursor.fetchall()}
    except Exception as e:
        print(f"Error running candidate search: {e}")
        return {"items": [], "total": 0, "has_more": False, "error": "search_failed"}
    finally:
        conn.close()

    unlocked_ids = get_unlocked_candidate_ids(org_id)

    items = []
    for row in rows:
        uid = str(row["user_id"])
        pipeline = pipeline_map.get(uid, {})
        if uid in outreach_map:
            pipeline = {**pipeline, "outreach_status": outreach_map[uid]}
        items.append(_serialize_candidate(
            row=dict(row),
            voice=voice_map.get(uid, {}),
            assessment=assessment_map.get(uid),
            pipeline=pipeline,
            unlocked=uid in unlocked_ids,
        ))

    return {
        "items": items,
        "total": total,
        "has_more": (offset + len(items)) < total,
    }


def get_candidate_detail(org_id: int, candidate_id: str) -> dict:
    """
    Full dossier for one candidate. Applies the same consent gate as search:
    without an accepted outreach row this returns the anonymized record with
    `contact_unlocked: false` and no contact fields at all.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT
                u.id AS user_id, u.name, u.email,
                cp.job_type, cp.work_mode, cp.cities, cp.salary_expectations,
                cp.notice_period, cp.tech_stack_preferences,
                cp.github_url, cp.github_stats, cp.linkedin_url, cp.portfolio_url,
                cp.resume_name, cp.resume_text,
                cp.leetcode_handle, cp.leetcode_stats,
                cp.codeforces_handle, cp.codeforces_stats,
                cp.devscore, cp.devscore_breakdown,
                cp.opportunity_preferences, cp.open_to_opportunities
            FROM candidate_profiles cp
            JOIN users u ON CAST(u.id AS TEXT) = cp.user_id
            WHERE cp.user_id = %s
        """, (str(candidate_id),))
        row = cursor.fetchone()
        if not row:
            return None
        # Keep detail consistent with search. Returning an error dictionary is
        # truthy, so callers could treat a non-sourceable profile as a valid
        # candidate and still shortlist it.
        if not row.get("open_to_opportunities"):
            return None

        cursor.execute("""
            SELECT COUNT(*) AS sessions_count,
                   AVG(overall_rating) AS avg_rating,
                   AVG(technical_depth) AS avg_tech,
                   AVG(communication) AS avg_comm
            FROM voice_sessions
            WHERE CAST(user_id AS TEXT) = %s AND overall_rating IS NOT NULL
        """, (str(candidate_id),))
        voice = dict(cursor.fetchone() or {})

        cursor.execute("""
            SELECT id, stage, job_id FROM candidate_shortlists
            WHERE org_id = %s AND candidate_id = %s
        """, (org_id, str(candidate_id)))
        pipeline_row = cursor.fetchone()
        pipeline = dict(pipeline_row) if pipeline_row else {}

        cursor.execute("""
            SELECT status, score, chaos_resilience, problem_title, completed_at
            FROM takehome_assessments
            WHERE org_id = %s AND candidate_id = %s
            ORDER BY created_at DESC LIMIT 1
        """, (org_id, str(candidate_id)))
        assessment_row = cursor.fetchone()

        cursor.execute("""
            SELECT status FROM recruiter_outreach
            WHERE org_id = %s AND candidate_user_id = %s
            ORDER BY created_at DESC LIMIT 1
        """, (org_id, str(candidate_id)))
        outreach_row = cursor.fetchone()
        if outreach_row:
            pipeline["outreach_status"] = outreach_row["status"]
    except Exception as e:
        print(f"Error fetching candidate detail: {e}")
        return None
    finally:
        conn.close()

    unlocked = str(candidate_id) in get_unlocked_candidate_ids(org_id)
    candidate = _serialize_candidate(
        row=dict(row),
        voice=voice,
        assessment=dict(assessment_row) if assessment_row else None,
        pipeline=pipeline,
        unlocked=unlocked,
    )
    if unlocked:
        candidate["resume_text"] = row.get("resume_text") or ""
    return candidate


def dispatch_takehome_assessment(
    org_id: int,
    sent_by: str,
    candidate_id: str,
    candidate_name: str,
    candidate_email: str,
    role_title: str,
    job_id: int = 0,
    problem_slug: str = "lru-cache-ttl",
    difficulty: str = "Medium",
    time_limit_minutes: int = 60,
    ttl_days: int = None,
) -> dict:
    """
    Creates a take-home assessment with a 256-bit URL-safe token and a hard
    expiry. The token is the candidate's only credential for the sandbox, so it
    must not be guessable and must not be shown to the recruiter.
    """
    token = secrets.token_urlsafe(32)
    ttl = TAKEHOME_DEFAULT_TTL_DAYS if ttl_days is None else int(ttl_days)
    expires_at = datetime.now(timezone.utc) + timedelta(days=max(1, ttl))

    record = {
        "org_id": org_id,
        "token": token,
        "recruiter_id": str(sent_by),
        "candidate_id": str(candidate_id),
        "candidate_name": candidate_name or "",
        "candidate_email": candidate_email or "",
        "role_title": role_title or "",
        "job_id": int(job_id or 0),
        "problem_title": TAKEHOME_PROBLEMS.get(problem_slug, "Algorithm & Concurrency Challenge"),
        "problem_slug": problem_slug,
        "difficulty": difficulty or "Medium",
        "time_limit_minutes": int(time_limit_minutes or 60),
        "status": "Sent",
        "expires_at": expires_at,
    }

    created = create_takehome_assessment(record)
    if not created:
        return None
    created["expires_at"] = expires_at.isoformat()
    return created


def build_invite_url(token: str) -> str:
    """Absolute invite link for emails; falls back to a relative path locally."""
    base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    path = f"/takehome/{token}"
    return f"{base}{path}" if base else path
