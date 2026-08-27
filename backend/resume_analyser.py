"""
=============================================================================
RESUME ANALYSER
=============================================================================
Deterministic + LLM-hybrid resume analysis engine.

Numbers come from this module. The LLM only writes narrative text (summary,
pros, cons, suggestions, bullet rewrites). If the LLM is unreachable the full
numeric report still renders — the score, the issues list, the per-section
breakdown, the keyword gap and the bullet-strength ranking never depend on it.

This mirrors the architecture in `profile_aggregator.py`: every score is
derived from text features the function can point to, with no invented
floors. A resume with no Experience section scores 0 on the parts of the
report that depend on it, not 50.
"""

import re
from collections import Counter
from typing import Dict, List, Any, Optional, Tuple

from llm_client import call_llm_json


# -----------------------------------------------------------------------------
# Role keyword clusters
# -----------------------------------------------------------------------------
# A detected role cluster is the target the resume is being scored against.
# Each cluster has three tiers:
#   core   — must-haves for the role; missing core keywords lower Skills
#            Relevance meaningfully and show up as "critical" missing-keyword
#            issues in the report.
#   bonus  — differentiators; missing these is a "recommended" issue.
#   soft   — leadership / communication / domain thinking; matches here pad
#            the soft-skill bucket of the Skills Relevance score.
#
# An unrecognized job_role falls back to "fullstack". The cluster map is
# intentionally bounded — easier to extend with confidence than to ship a
# brittle 200-keyword soup.

ROLE_KEYWORD_CLUSTERS: Dict[str, Dict[str, List[str]]] = {
    "backend": {
        "core": ["python", "fastapi", "django", "flask", "express", "node.js",
                 "postgresql", "mysql", "mongodb", "redis", "docker",
                 "kubernetes", "ci/cd", "git", "rest api", "sql"],
        "bonus": ["graphql", "grpc", "microservices", "rabbitmq", "kafka",
                  "terraform", "aws", "gcp", "azure", "linux", "nginx",
                  "elasticsearch", "kafka", "celery", "gunicorn", "pytest"],
        "soft": ["api design", "database optimization", "authentication",
                 "oauth", "jwt", "scalability", "system design"],
    },
    "frontend": {
        "core": ["javascript", "typescript", "react", "vue", "angular", "html",
                 "css", "tailwind", "sass", "webpack", "vite", "git"],
        "bonus": ["next.js", "nuxt", "graphql", "responsive design",
                  "accessibility", "pwa", "jest", "react testing library",
                  "storybook", "design system"],
        "soft": ["ui/ux", "design systems", "component architecture",
                 "state management", "accessibility (a11y)"],
    },
    "fullstack": {
        "core": ["python", "javascript", "react", "postgresql", "docker",
                 "git", "rest api", "sql", "node.js", "typescript"],
        "bonus": ["next.js", "mongodb", "redis", "aws", "ci/cd", "docker",
                  "kubernetes", "graphql", "tailwind"],
        "soft": ["end-to-end ownership", "api design", "system design",
                 "product thinking"],
    },
    "devops": {
        "core": ["docker", "kubernetes", "jenkins", "terraform", "ansible",
                 "linux", "ci/cd", "git", "aws", "monitoring"],
        "bonus": ["helm", "argocd", "prometheus", "grafana", "elk stack",
                  "splunk", "vault", "github actions", "gitlab ci",
                  "cloudformation"],
        "soft": ["infrastructure as code", "observability", "incident response",
                 "sre", "reliability"],
    },
    "ml/ai": {
        "core": ["python", "pytorch", "tensorflow", "scikit-learn", "pandas",
                 "numpy", "jupyter", "mlops", "machine learning"],
        "bonus": ["transformers", "llm", "nlp", "computer vision",
                  "deep learning", "spark", "airflow", "vertex ai",
                  "sagemaker", "huggingface"],
        "soft": ["model evaluation", "a/b testing", "feature engineering",
                 "data pipelines", "research"],
    },
    "data": {
        "core": ["sql", "python", "pandas", "numpy", "postgresql", "mysql",
                 "tableau", "power bi", "data analysis"],
        "bonus": ["spark", "airflow", "dbt", "snowflake", "bigquery",
                  "redshift", "kafka", "etl", "elt", "data modeling",
                  "looker"],
        "soft": ["data storytelling", "statistics", "a/b testing",
                 "kpi definition", "business analysis"],
    },
    "mobile": {
        "core": ["ios", "android", "swift", "kotlin", "react native",
                 "flutter", "dart", "java", "mobile"],
        "bonus": ["swiftui", "jetpack compose", "firebase", "graphql",
                  "realm", "sqlite", "app store", "google play",
                  "crashlytics"],
        "soft": ["mobile-first design", "app store optimization",
                 "crash analytics", "offline-first"],
    },
    "security": {
        "core": ["oauth", "jwt", "ssl/tls", "penetration testing", "owasp",
                 "siem", "firewall", "security"],
        "bonus": ["sast", "dast", "vault", "keycloak", "zero trust",
                  "soc 2", "gdpr", "iso 27001", "burp suite", "nessus"],
        "soft": ["threat modeling", "security audits", "incident response",
                 "compliance"],
    },
    "cloud": {
        "core": ["aws", "gcp", "azure", "terraform", "docker", "kubernetes",
                 "linux", "cloud"],
        "bonus": ["lambda", "cloudformation", "gke", "eks", "aks", "vpc",
                  "iam", "route53", "cloudwatch", "cost optimization",
                  "finops"],
        "soft": ["multi-cloud architecture", "finops", "vendor management",
                 "disaster recovery"],
    },
    "embedded": {
        "core": ["c", "c++", "rust", "rtos", "arm", "gpio", "uart", "spi",
                 "i2c", "embedded linux", "embedded"],
        "bonus": ["freertos", "zephyr", "bare metal", "can bus", "mcu",
                  "fpga", "verilog", "jtag", "oscilloscope"],
        "soft": ["hardware-software co-design", "power analysis",
                 "real-time constraints", "schematics"],
    },
    "systems": {
        "core": ["c", "c++", "rust", "linux", "systems programming",
                 "memory management", "concurrency", "algorithms"],
        "bonus": ["distributed systems", "consensus algorithms", "raft",
                  "paxos", "load balancing", "caching", "nginx", "envoy",
                  "kernel"],
        "soft": ["performance tuning", "profiling", "bottleneck analysis",
                 "low-level debugging"],
    },
    "qa": {
        "core": ["selenium", "playwright", "cypress", "jest", "pytest",
                 "junit", "testng", "ci/cd", "testing"],
        "bonus": ["automation frameworks", "bdd", "cucumber",
                  "performance testing", "jmeter", "load testing",
                  "security testing", "k6"],
        "soft": ["test strategy", "test planning", "bug tracking",
                 "root cause analysis", "quality advocacy"],
    },
    "product": {
        "core": ["product management", "roadmapping", "stakeholder management",
                 "agile", "scrum"],
        "bonus": ["user research", "a/b testing", "data analysis", "sql",
                  "figma", "jira", "amplitude", "mixpanel"],
        "soft": ["cross-functional leadership", "communication",
                 "prioritization", "okr", "product strategy"],
    },
}

DEFAULT_CLUSTER = "fullstack"

# Flat set used by the skill extractor to know what counts as a technical
# token. Built lazily on first use.
_ALL_TECH_TOKENS: Optional[set] = None


def _all_tech_tokens() -> set:
    """Flattened set of every keyword across every cluster. Lowercase."""
    global _ALL_TECH_TOKENS
    if _ALL_TECH_TOKENS is None:
        toks: set = set()
        for cluster in ROLE_KEYWORD_CLUSTERS.values():
            for tier in ("core", "bonus", "soft"):
                for kw in cluster.get(tier, []):
                    toks.add(kw.lower())
        _ALL_TECH_TOKENS = toks
    return _ALL_TECH_TOKENS


# -----------------------------------------------------------------------------
# Section detection
# -----------------------------------------------------------------------------
# Header lines are matched as standalone lines (whitespace only around them,
# optionally a trailing colon). Common variants are folded into one canonical
# section name so the rest of the report talks about "skills" not "skills &
# technologies".

SECTION_PATTERNS: Dict[str, List[str]] = {
    "summary": [
        r"(?im)^\s*(?:summary|profile|objective|professional\s+summary|"
        r"career\s+objective|about\s+me|overview)\s*:?\s*$",
    ],
    "experience": [
        r"(?im)^\s*(?:experience|work\s+experience|professional\s+experience|"
        r"employment|work\s+history|professional\s+background)\s*:?\s*$",
    ],
    "education": [
        r"(?im)^\s*(?:education|academic|qualifications?|degrees?|"
        r"university|coursework)\s*:?\s*$",
    ],
    "skills": [
        r"(?im)^\s*(?:skills|technical\s+skills|technologies|tools|"
        r"languages|tech\s+stack|tech\s+skills|competencies|"
        r"skills\s*(?:&|and)\s*technologies)\s*:?\s*$",
    ],
    "projects": [
        r"(?im)^\s*(?:projects?|portfolio|personal\s+projects?|"
        r"open\s+source|side\s+projects?|selected\s+projects?)\s*:?\s*$",
    ],
    "certifications": [
        r"(?im)^\s*(?:certifications?|certificates?|credentials?|"
        r"licenses?|accreditations?|awards?)\s*:?\s*$",
    ],
    "publications": [
        r"(?im)^\s*(?:publications|papers|talks|speaking)\s*:?\s*$",
    ],
}


def detect_sections(text: str) -> Dict[str, str]:
    """
    Find canonical sections in the resume by header line, and return the body
    of each section up to the next recognized header. Headers that don't match
    any pattern are kept as raw content (so the first chunk of the document
    — usually a contact block — is also reachable).
    """
    lines = text.splitlines()
    section_starts: List[Tuple[int, str]] = []

    for idx, line in enumerate(lines):
        for canonical, patterns in SECTION_PATTERNS.items():
            for pat in patterns:
                if re.match(pat, line):
                    section_starts.append((idx, canonical))
                    break
            else:
                continue
            break

    if not section_starts:
        return {"_unknown": text}

    # First chunk (anything before the first recognized header) is treated as
    # an implicit "header" block — usually name, contact, summary.
    sections: Dict[str, str] = {}
    if section_starts[0][0] > 0:
        sections["_header"] = "\n".join(lines[: section_starts[0][0]])

    for i, (start, name) in enumerate(section_starts):
        end = section_starts[i + 1][0] if i + 1 < len(section_starts) else len(lines)
        body = "\n".join(lines[start + 1 : end]).strip()
        # If the same canonical name appears twice (e.g. "Skills" near the top
        # and again at the bottom), concatenate.
        if name in sections:
            sections[name] = sections[name] + "\n" + body
        else:
            sections[name] = body

    return sections


def extract_experience_bullets(experience_text: str) -> List[str]:
    """
    Pull bullet lines out of the experience block. Bullets are lines that
    start with a bullet glyph or a hyphen/en-dash after optional whitespace,
    or that look like a sentence starting with an action verb.
    """
    if not experience_text:
        return []

    bullets: List[str] = []
    for raw in experience_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        # Drop lines that look like a role header (contain an em-dash, a
        # date range, or are all-caps).
        if re.search(r"\d{4}\s*[-–—]\s*(\d{4}|present|current)", line, re.I):
            continue
        if re.match(r"^[A-Z][A-Z\s&,.\-]{2,}$", line):
            continue
        # Bullet glyphs.
        if line[:2] in ("•", "‣", "◦", "·", "–", "—", "-", "*", "►", "→"):
            cleaned = re.sub(r"^[\s•‣◦·–—\-*►→]+", "", line).strip()
            if cleaned and len(cleaned) > 8:
                bullets.append(cleaned)
            continue
        # Otherwise only keep short lines that read like a sentence.
        if 20 <= len(line) <= 220 and line.endswith((".", ";")):
            bullets.append(line)

    return bullets


# -----------------------------------------------------------------------------
# Heuristics: action verbs, filler, leadership signals
# -----------------------------------------------------------------------------

ACTION_VERBS: List[str] = [
    "architected", "built", "designed", "developed", "implemented",
    "led", "optimized", "reduced", "increased", "deployed", "launched",
    "created", "scaled", "migrated", "streamlined", "automated",
    "orchestrated", "engineered", "shipped", "delivered", "accelerated",
    "transformed", "spearheaded", "founded", "drove", "established",
    "introduced", "pioneered", "refactored", "revamped", "modernized",
    "consolidated", "integrated", "overhauled", "rebuilt", "reengineered",
    "mentored", "coached", "managed", "supervised", "coordinated",
    "collaborated", "partnered", "negotiated", "resolved", "investigated",
    "diagnosed", "analyzed", "audited", "instrumented", "monitored",
]

FILLER_PHRASES: List[str] = [
    "responsible for", "worked on", "helped with", "involved in",
    "assisted with", "assisted in", "participated in", "some experience",
    "various tasks", "multiple projects", "in charge of", "tasked with",
    "duties included", "duties include", "handled", "took part in",
]

LEADERSHIP_KEYWORDS: List[str] = [
    "led", "lead", "leading", "managed", "managing", "mentored",
    "mentoring", "coached", "coaching", "supervised", "team of",
    "tech lead", "principal", "staff engineer", "engineering manager",
    "head of", "director", "vp", "founded", "co-founder", "cofounder",
    "drove", "drove adoption", "championed", "initiated",
]

OUTCOME_WORDS: List[str] = [
    "resulting", "improving", "achieving", "reducing", "increasing",
    "boosting", "lowering", "raising", "cutting", "saving", "growing",
    "accelerating", "enabling", "unlocking", "delivering", "exceeding",
]

SOFT_SKILL_TOKENS: List[str] = [
    "leadership", "mentoring", "communication", "presentation",
    "public speaking", "teamwork", "collaboration", "problem solving",
    "problem-solving", "analytical", "critical thinking", "ownership",
    "autonomy", "cross-functional", "stakeholder management", "okrs",
    "okr", "product thinking", "design thinking", "time management",
    "mentorship",
]


# -----------------------------------------------------------------------------
# Layout / contact heuristics
# -----------------------------------------------------------------------------

EMAIL_RE = re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+")
PHONE_RE = re.compile(
    r"(?:\+?91[\s\-\.]?)?[6-9]\d{4}[\s\-\.]?\d{5}"
    r"|\+?\d{1,3}[\s\-\.]?\(?\d{2,4}\)?[\s\-\.]?\d{3,4}[\s\-\.]?\d{4}"
)
URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)


def detect_contact_info(text: str) -> Dict[str, bool]:
    return {
        "email": bool(EMAIL_RE.search(text)),
        "phone": bool(PHONE_RE.search(text)),
        "url": bool(URL_RE.search(text)),
    }


def analyze_layout(text: str) -> Dict[str, Any]:
    """
    Heuristics that flag layout antipatterns which confuse ATS parsers.
    A multi-column PDF that pypdf flattens tends to leave short interleaved
    fragments — line lengths alternate rapidly, and the rightmost fragments
    often show up as orphans.
    """
    lines = [len(l) for l in text.splitlines() if l.strip()]
    if len(lines) < 10:
        return {"multi_column": False, "density_variance": 0.0, "line_count": len(lines)}

    # If the median line length is below 30 but the max is above 90, the
    # document is most likely multi-column. Cheap, but reliable enough.
    sorted_lens = sorted(lines)
    median = sorted_lens[len(sorted_lens) // 2]
    maximum = max(lines)
    multi_column = median < 30 and maximum > 90 and (maximum / max(median, 1)) > 4.0

    mean = sum(lines) / len(lines)
    variance = sum((l - mean) ** 2 for l in lines) / len(lines)
    return {
        "multi_column": multi_column,
        "density_variance": round(variance, 1),
        "line_count": len(lines),
    }


def estimate_page_count(text: str) -> float:
    """
    Rough page estimate based on a 350-word single-spaced page. Resume pages
    are denser than prose, so this underestimates slightly, which is fine —
    we only care about "1 page" vs ">2 pages" thresholds.
    """
    words = len(text.split())
    return round(max(0.5, words / 350.0), 1)


def estimate_years_experience(experience_text: str) -> int:
    """
    Sum date ranges that look like job durations. A range is two 4-digit
    years separated by a dash; "present"/"current" becomes the current year.
    """
    if not experience_text:
        return 0
    year = 2026
    total = 0
    pattern = re.compile(
        r"(\d{4})\s*[-–—]\s*(\d{4}|(?:present|current|now))",
        re.I,
    )
    for match in pattern.finditer(experience_text):
        start = int(match.group(1))
        end = year if match.group(2).lower() in ("present", "current", "now") else int(match.group(2))
        if 1980 <= start <= end <= year + 1:
            total += max(0, end - start)
    return total


def extract_role_titles(experience_text: str) -> List[str]:
    """
    Pull lines that look like a job title (capitalized phrase on its own
    line, often followed by a company and date range).
    """
    if not experience_text:
        return []
    titles: List[str] = []
    for raw in experience_text.splitlines():
        line = raw.strip()
        if not line or len(line) > 80:
            continue
        if re.search(r"\d{4}", line):
            continue
        words = line.split()
        if 1 <= len(words) <= 8 and line[:1].isupper():
            titles.append(line)
    return titles


def extract_companies(experience_text: str) -> List[str]:
    """
    Look for the same date-range line and grab the text before the date —
    most resumes write `Title @ Company | 2020 – 2023` or `Title — Company`.
    """
    if not experience_text:
        return []
    companies: List[str] = []
    for raw in experience_text.splitlines():
        if not re.search(r"\d{4}\s*[-–—]\s*(\d{4}|present|current)", raw, re.I):
            continue
        # Try to strip a leading "Title @ " or "Title - " pattern.
        m = re.search(r"(?:@\s*|–\s*|—\s*|\|\s*)([A-Z][\w&.,'\- ]{1,40})", raw)
        if m:
            companies.append(m.group(1).strip())
    return companies


def count_leadership_signals(text: str) -> int:
    text_lower = text.lower()
    return sum(1 for kw in LEADERSHIP_KEYWORDS if kw in text_lower)


# -----------------------------------------------------------------------------
# Skill extraction
# -----------------------------------------------------------------------------

def extract_skills_from_text(text: str) -> Dict[str, List[str]]:
    """
    Pull skills out of the resume. Three buckets:
      technical      — tools, languages, frameworks, databases, platforms
      certifications — AWS Certified, CKA, etc.
      soft           — leadership, communication, etc.

    We check every known keyword from every role cluster (case-insensitive
    substring search), and we also run a few certification patterns.
    """
    text_lower = text.lower()
    technical: List[str] = []
    for token in sorted(_all_tech_tokens()):
        if token in text_lower and token not in SOFT_SKILL_TOKENS:
            # Avoid counting a soft-skill token as a tech skill.
            technical.append(token)

    # Deduplicate while preserving order.
    seen: set = set()
    technical = [t for t in technical if not (t in seen or seen.add(t))]

    cert_patterns = [
        r"\bAWS\s+Certified\s+[A-Za-z0-9 \-+]+",
        r"\bAzure\s+(?:Certified|[A-Za-z]+ Administrator|[A-Za-z]+ Developer|[A-Za-z]+ Architect)\b[^\n,;]*",
        r"\bGCP?\s+(?:Certified|Professional|Associate)\s+[A-Za-z0-9 \-+]+",
        r"\b(?:CKA|CKAD|CKS|OCP|OCJP|OCEJWCD|CCNA|CCNP|CCIE)\b",
        r"\bPMP\s+Certified\b",
        r"\bCISSP\b",
        r"\bCertified\s+Kubernetes\s+(?:Administrator|Application Developer|Security Specialist)\b",
    ]
    certifications: List[str] = []
    for pat in cert_patterns:
        for m in re.finditer(pat, text, re.I):
            cert = m.group(0).strip()
            if cert and cert not in certifications:
                certifications.append(cert)

    soft: List[str] = []
    for kw in SOFT_SKILL_TOKENS:
        if kw.lower() in text_lower:
            soft.append(kw)

    return {
        "technical": technical,
        "certifications": certifications,
        "soft": soft,
        "all": technical + certifications + soft,
    }


# -----------------------------------------------------------------------------
# Role cluster detection
# -----------------------------------------------------------------------------

def detect_role_cluster(job_role: str) -> str:
    role_lower = (job_role or "").lower()
    # Direct match against cluster names first.
    for cluster in ROLE_KEYWORD_CLUSTERS:
        if cluster in role_lower:
            return cluster
    # Keyword hints inside the role string.
    hints = {
        "backend": ["backend", "back-end", "api engineer", "platform engineer"],
        "frontend": ["frontend", "front-end", "ui engineer", "web engineer"],
        "fullstack": ["fullstack", "full-stack", "full stack"],
        "devops": ["devops", "sre", "site reliability", "platform engineer"],
        "ml/ai": ["machine learning", " ml ", "ai engineer", "deep learning", "nlp", "computer vision", "data scientist"],
        "data": ["data engineer", "data analyst", "analytics", "bi "],
        "mobile": ["ios", "android", "mobile", "react native", "flutter"],
        "security": ["security", "infosec", "appsec", "cyber"],
        "cloud": ["cloud engineer", "cloud architect"],
        "embedded": ["embedded", "firmware", "rtos"],
        "systems": ["systems engineer", "systems programmer", "kernel"],
        "qa": ["qa", "quality assurance", "test engineer", "sdet"],
        "product": ["product manager", "product owner", "pm "],
    }
    for cluster, words in hints.items():
        for w in words:
            if w in role_lower or w.strip() in role_lower:
                return cluster
    return DEFAULT_CLUSTER


# -----------------------------------------------------------------------------
# Composite + dimension scoring
# -----------------------------------------------------------------------------

WEIGHTS: Dict[str, float] = {
    "ats_compatibility": 0.15,
    "impact_metrics": 0.20,
    "bullet_quality": 0.18,
    "skills_relevance": 0.18,
    "experience_depth": 0.12,
    "section_completeness": 0.07,
    "format_readability": 0.05,
    "brevity": 0.05,
}


def _clamp(n: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, n))


def _keyword_in_text(keyword: str, text_lower: str) -> bool:
    """Substring match that also handles common plural/spacing variants."""
    kw = keyword.lower().strip()
    if not kw:
        return False
    if kw in text_lower:
        return True
    # Try with a trailing "s" so "python" matches "pythons" (rare) and
    # "javascript" matches "javascripts" (also rare). Skip if the keyword
    # already ends in "s" to avoid false positives.
    if not kw.endswith("s") and (kw + "s") in text_lower:
        return True
    # Try splitting on space and matching all tokens individually.
    parts = kw.split()
    if len(parts) > 1 and all(p in text_lower for p in parts):
        return True
    return False


def score_ats_compatibility(
    text: str,
    section_names: List[str],
    contact_info: Dict[str, bool],
    layout_flags: Dict[str, Any],
) -> int:
    score = 0.0
    # 30 max for contact info (10 each).
    score += sum(10.0 for v in contact_info.values() if v)
    # 35 max for standard sections (7 each across the 5 most important).
    canonical = {"summary", "experience", "education", "skills", "projects"}
    score += min(35.0, 7.0 * sum(1 for s in section_names if s in canonical))
    # Penalties.
    if layout_flags.get("multi_column"):
        score -= 12.0
    variance = float(layout_flags.get("density_variance") or 0.0)
    if variance > 4000:
        score -= 5.0
    return int(round(_clamp(score)))


def score_impact_metrics(experience_bullets: List[str], text: str) -> int:
    if not experience_bullets:
        return 0
    total = len(experience_bullets)
    quantified = sum(
        1 for b in experience_bullets if re.search(r"\b\d+[%\$kKmMxX]?\b", b)
    )
    metric_score = (quantified / total) * 60.0

    text_lower = text.lower()
    diversity = 0
    if re.search(r"\d+\s*%", text):
        diversity += 6
    if re.search(r"\$[\d,]+|usd|inr|eur|\$\s?\d", text_lower):
        diversity += 6
    if re.search(r"\b\d+[xX]\b", text):
        diversity += 4
    if re.search(r"\b\d+[kK]\b|\b\d{4,}\b", text):
        diversity += 4
    if re.search(r"rank(ed)?\s*#?\d|first place|top\s*#?\d|winner|gold|champion", text_lower):
        diversity += 4
    diversity_score = min(20.0, diversity)

    scale = 0
    if re.search(r"\b\d+[+\-]?\s*(million|billion|m|bn)\b", text_lower):
        scale += 6
    if re.search(r"\b\d+[+\-]?\s*(users?|customers?|clients?)\b", text_lower):
        scale += 6
    if re.search(r"\b\d+[+\-]?\s*(requests?|qps|rps)\s*(/|per)?\s*(s|sec|second|minute)?", text_lower):
        scale += 5
    if re.search(r"\b\d+(\.\d+)?\s*(gb|tb|mb|kb)\b", text_lower):
        scale += 3
    if re.search(r"\b(latency|throughput|uptime|sla)\b", text_lower):
        scale += 3
    scale_score = min(20.0, scale)

    return int(round(_clamp(metric_score + diversity_score + scale_score)))


def score_bullet_quality(experience_bullets: List[str], text: str) -> int:
    if not experience_bullets:
        return 0
    total = len(experience_bullets)
    text_lower = text.lower()

    # Action verb density (35 max).
    bullets_with_verb = sum(
        1
        for b in experience_bullets
        if any(re.search(rf"\b{re.escape(v)}\b", b.lower()) for v in ACTION_VERBS)
    )
    verb_score = (bullets_with_verb / total) * 35.0

    # STAR structure: bullet that mentions context ("for", "across", "within")
    # and an outcome word.
    star_count = 0
    for b in experience_bullets:
        b_lower = b.lower()
        has_context = any(w in b_lower for w in [" for ", " across ", " within ", " in ", " via "])
        has_outcome = any(w in b_lower for w in OUTCOME_WORDS)
        if has_context and has_outcome:
            star_count += 1
    star_score = min(30.0, (star_count / total) * 30.0)

    # Bullet length (20 max). Ideal is 40-180 chars.
    length_score = 0.0
    for b in experience_bullets:
        L = len(b)
        if 40 <= L <= 180:
            length_score += 20.0 / total
        elif 20 <= L <= 220:
            length_score += 10.0 / total
        else:
            length_score += 2.0 / total
    length_score = min(20.0, length_score)

    # Filler penalty (15 max). -5 per filler instance in the experience block.
    filler_hits = sum(1 for f in FILLER_PHRASES if f in text_lower)
    filler_score = max(0.0, 15.0 - 5.0 * filler_hits)

    return int(round(_clamp(verb_score + star_score + length_score + filler_score)))


def score_skills_relevance(
    text_lower: str, role_cluster: str, extracted_skills: List[str]
) -> int:
    cluster = ROLE_KEYWORD_CLUSTERS.get(role_cluster, ROLE_KEYWORD_CLUSTERS[DEFAULT_CLUSTER])
    core_pool = cluster["core"]
    bonus_pool = cluster["bonus"]
    soft_pool = cluster["soft"]

    matched_core = sum(1 for kw in core_pool if _keyword_in_text(kw, text_lower))
    matched_bonus = sum(1 for kw in bonus_pool if _keyword_in_text(kw, text_lower))
    matched_soft = sum(1 for kw in soft_pool if _keyword_in_text(kw, text_lower))

    core_score = (matched_core / max(1, len(core_pool))) * 70.0
    bonus_score = (matched_bonus / max(1, len(bonus_pool))) * 20.0
    soft_score = 10.0 if matched_soft >= 2 else 5.0 if matched_soft == 1 else 0.0

    return int(round(_clamp(core_score + bonus_score + soft_score)))


def score_experience_depth(
    text: str,
    experience_years: int,
    role_titles: List[str],
    companies: List[str],
    leadership_signals: int,
) -> int:
    years_score = 0.0
    if experience_years >= 10:
        years_score = 40.0
    elif experience_years >= 8:
        years_score = 38.0
    elif experience_years >= 6:
        years_score = 32.0
    elif experience_years >= 4:
        years_score = 25.0
    else:
        years_score = max(0.0, min(15.0, experience_years * 3.75))

    unique_titles = len({t.lower() for t in role_titles})
    if unique_titles >= 3:
        progression_score = 25.0
    elif unique_titles == 2:
        progression_score = 15.0
    elif unique_titles == 1:
        progression_score = 8.0
    else:
        progression_score = 0.0

    unique_companies = len({c.lower() for c in companies})
    if unique_companies >= 3:
        company_score = 15.0
    elif unique_companies == 2:
        company_score = 10.0
    elif unique_companies == 1:
        company_score = 5.0
    else:
        company_score = 0.0

    leadership_score = min(20.0, leadership_signals * 5.0)

    return int(round(_clamp(years_score + progression_score + company_score + leadership_score)))


def score_section_completeness(sections: Dict[str, str]) -> int:
    score = 0.0
    if sections.get("summary") and len(sections["summary"].strip()) >= 50:
        score += 15.0
    exp = sections.get("experience", "")
    if exp and len(exp.strip()) >= 200:
        score += 25.0
    elif exp and len(exp.strip()) >= 50:
        score += 12.0
    if sections.get("education") and len(sections["education"].strip()) >= 30:
        score += 15.0
    skills = sections.get("skills", "")
    if skills:
        skill_lines = [l for l in skills.splitlines() if l.strip()]
        if len(skill_lines) >= 6:
            score += 20.0
        elif len(skill_lines) >= 3:
            score += 12.0
        elif len(skill_lines) >= 1:
            score += 6.0
    if sections.get("projects") and len(sections["projects"].strip()) >= 30:
        score += 15.0
    if sections.get("certifications") and len(sections["certifications"].strip()) >= 10:
        score += 10.0
    return int(round(_clamp(score)))


def score_format_readability(
    text: str,
    sections: Dict[str, str],
    layout_flags: Dict[str, Any],
) -> int:
    word_count = len(text.split())
    if word_count <= 0:
        return 0

    # Page-length (20 max).
    pages = word_count / 350.0
    if pages <= 1.2:
        page_score = 20.0
    elif pages <= 1.7:
        page_score = 16.0
    elif pages <= 2.2:
        page_score = 12.0
    elif pages <= 3.0:
        page_score = 6.0
    else:
        page_score = 0.0

    # Density variance (30 max). High variance hints at column soup.
    variance = float(layout_flags.get("density_variance") or 0.0)
    if variance < 800:
        density_score = 30.0
    elif variance < 2000:
        density_score = 24.0
    elif variance < 4000:
        density_score = 16.0
    elif variance < 8000:
        density_score = 8.0
    else:
        density_score = 0.0

    # Section ordering (25 max). Header → Summary → Experience → Education
    # → Skills → Projects is the canonical order. We just check that the
    # sections appear in something resembling that order, not that they
    # match perfectly.
    order = ["summary", "experience", "education", "skills", "projects"]
    present = [s for s in order if s in sections]
    if not present:
        order_score = 0.0
    elif present == sorted(present, key=lambda s: order.index(s)):
        order_score = 25.0
    else:
        order_score = 15.0

    # Jargon wall (15 max). A line whose average word length is over 7 is
    # a candidate jargon wall. We penalize, not zero out — a single heavy
    # paragraph in a research resume is normal.
    jargon_lines = 0
    for line in text.splitlines():
        words = re.findall(r"[A-Za-z]{3,}", line)
        if len(words) >= 8:
            avg = sum(len(w) for w in words) / len(words)
            if avg > 7.0:
                jargon_lines += 1
    jargon_score = max(0.0, 15.0 - 3.0 * jargon_lines)

    # Consistent bullet formatting (10 max). 10 if 90% of bullets start with
    # the same character, 5 if mixed, 0 if no bullets.
    bullet_starts = []
    for line in text.splitlines():
        s = line.lstrip()
        if s and s[0] in "•‣◦·–—-*►→":
            bullet_starts.append(s[0])
    if not bullet_starts:
        consistency_score = 5.0  # No bullets, neutral.
    else:
        most_common_ratio = Counter(bullet_starts).most_common(1)[0][1] / len(bullet_starts)
        if most_common_ratio >= 0.9:
            consistency_score = 10.0
        elif most_common_ratio >= 0.6:
            consistency_score = 5.0
        else:
            consistency_score = 0.0

    return int(round(_clamp(page_score + density_score + order_score + jargon_score + consistency_score)))


def score_brevity(experience_bullets: List[str], text: str, sections: Dict[str, str]) -> int:
    if not text:
        return 0

    # Word efficiency on bullets (40 max).
    if experience_bullets:
        avg_words = sum(len(b.split()) for b in experience_bullets) / len(experience_bullets)
        if avg_words <= 15:
            efficiency_score = 40.0
        elif avg_words <= 25:
            efficiency_score = 30.0
        elif avg_words <= 35:
            efficiency_score = 20.0
        elif avg_words <= 50:
            efficiency_score = 10.0
        else:
            efficiency_score = 0.0
    else:
        efficiency_score = 0.0

    # No redundant sections (30 max). If the same section is duplicated,
    # subtract 15. If two adjacent sections seem to overlap (Skills & Tech
    # AND Skills), subtract 10.
    redundancy_score = 30.0
    seen: Dict[str, int] = {}
    for s in sections:
        seen[s] = seen.get(s, 0) + 1
    for name, count in seen.items():
        if count > 1 and not name.startswith("_"):
            redundancy_score -= 15.0
    if "skills" in seen and seen["skills"] > 1:
        redundancy_score -= 5.0

    # Content density (30 max). Ratio of "meaningful" tokens (alpha words
    # longer than 2 chars) to total tokens. This is a rough proxy — what we
    # really want to know is whether the document is mostly signal or
    # mostly noise.
    tokens = re.findall(r"\w+", text)
    if not tokens:
        density_score = 0.0
    else:
        meaningful = sum(1 for t in tokens if len(t) > 2 and t.isalpha())
        density_score = min(30.0, (meaningful / len(tokens)) * 35.0)

    return int(round(_clamp(efficiency_score + redundancy_score + density_score)))


def compute_composite(dimension_scores: Dict[str, int]) -> int:
    score = sum(WEIGHTS[k] * float(dimension_scores.get(k, 0)) for k in WEIGHTS)
    return int(round(_clamp(score)))


# -----------------------------------------------------------------------------
# Missing keyword detection
# -----------------------------------------------------------------------------

def detect_missing_keywords(
    text_lower: str, role_cluster: str
) -> List[Dict[str, Any]]:
    cluster = ROLE_KEYWORD_CLUSTERS.get(role_cluster, ROLE_KEYWORD_CLUSTERS[DEFAULT_CLUSTER])
    missing: List[Dict[str, Any]] = []
    for category in ("core", "bonus"):
        for kw in cluster.get(category, []):
            if not _keyword_in_text(kw, text_lower):
                severity = "critical" if category == "core" else "recommended"
                missing.append(
                    {
                        "keyword": kw,
                        "category": category,
                        "severity": severity,
                        "fix": (
                            f"Add '{kw}' to your Skills section, or describe a "
                            f"project / bullet that demonstrates it."
                        ),
                    }
                )
    return missing[:18]


def detect_matched_keywords(
    text_lower: str, role_cluster: str
) -> List[Dict[str, Any]]:
    cluster = ROLE_KEYWORD_CLUSTERS.get(role_cluster, ROLE_KEYWORD_CLUSTERS[DEFAULT_CLUSTER])
    matched: List[Dict[str, Any]] = []
    for category in ("core", "bonus"):
        for kw in cluster.get(category, []):
            count = text_lower.count(kw.lower())
            if count > 0:
                matched.append(
                    {
                        "keyword": kw,
                        "category": category,
                        "frequency": count,
                    }
                )
    return matched


# -----------------------------------------------------------------------------
# Bullet strength scoring
# -----------------------------------------------------------------------------

def score_bullet_strength(bullet: str) -> Tuple[int, List[str]]:
    """
    Score a single bullet 0-100 and return the reasons it didn't score higher.
    Used both for the "weakest bullets" panel and as input to the LLM
    rewriter so it knows what to fix.
    """
    score = 0
    reasons: List[str] = []
    b_lower = bullet.lower()
    if any(re.search(rf"\b{re.escape(v)}\b", b_lower) for v in ACTION_VERBS):
        score += 20
    else:
        reasons.append("no action verb")
    if re.search(r"\b\d+[%\$kKmMxX]?\b", bullet):
        score += 30
    else:
        reasons.append("no quantified metric")
    if any(w in b_lower for w in [" for ", " across ", " within ", " in ", " via "]):
        score += 15
    else:
        reasons.append("no scope / context")
    if any(w in b_lower for w in OUTCOME_WORDS):
        score += 25
    else:
        reasons.append("no outcome language")
    # Penalize filler phrases.
    if any(f in b_lower for f in FILLER_PHRASES):
        score -= 10
        reasons.append("uses filler language")
    # Penalize overshort bullets.
    if len(bullet.split()) < 8:
        score -= 15
        reasons.append("too short")
    return max(0, min(100, score)), reasons


def get_weakest_bullets(experience_bullets: List[str], limit: int = 3) -> List[Dict[str, Any]]:
    scored: List[Dict[str, Any]] = []
    for bullet in experience_bullets:
        s, reasons = score_bullet_strength(bullet)
        scored.append({"bullet": bullet, "score": s, "reasons": reasons})
    scored.sort(key=lambda d: (d["score"], len(d["bullet"])))
    return scored[:limit]


# -----------------------------------------------------------------------------
# Issues engine
# -----------------------------------------------------------------------------

def generate_issues(
    dimension_scores: Dict[str, int],
    sections: Dict[str, str],
    experience_bullets: List[str],
    missing_keywords: List[Dict[str, Any]],
    contact_info: Dict[str, bool],
    page_estimate: float,
    leadership_signals: int,
    role_cluster: str,
) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []

    # --- CRITICAL ----------------------------------------------------------
    if not any(contact_info.values()):
        issues.append(
            {
                "severity": "critical",
                "dimension": "ats_compatibility",
                "message": "No contact information detected.",
                "evidence": "email={} phone={} url={}".format(
                    contact_info["email"], contact_info["phone"], contact_info["url"]
                ),
                "fix": "Add your name, email, and phone number at the top of your resume.",
            }
        )

    if "experience" not in sections or not experience_bullets:
        issues.append(
            {
                "severity": "critical",
                "dimension": "section_completeness",
                "message": "No work experience section detected.",
                "evidence": "section_present={} bullet_count={}".format(
                    "experience" in sections, len(experience_bullets)
                ),
                "fix": "Add a Work Experience section with at least 2 entries, each with 3-5 bullet points.",
            }
        )

    critical_missing = [m for m in missing_keywords if m["severity"] == "critical"]
    if len(critical_missing) >= 5:
        issues.append(
            {
                "severity": "critical",
                "dimension": "skills_relevance",
                "message": (
                    f"Missing {len(critical_missing)} core {role_cluster} "
                    f"technologies from your Skills section."
                ),
                "evidence": "missing_core=" + ", ".join(
                    m["keyword"] for m in critical_missing[:6]
                ),
                "fix": (
                    "Review the keyword gap below and add at least the core "
                    "tools (Languages, Frameworks, Databases) for this role."
                ),
            }
        )

    if experience_bullets:
        quantified = sum(
            1 for b in experience_bullets if re.search(r"\b\d+[%\$kKmMxX]?\b", b)
        )
        if quantified == 0:
            issues.append(
                {
                    "severity": "critical",
                    "dimension": "impact_metrics",
                    "message": f"None of your {len(experience_bullets)} experience bullets include a quantified metric.",
                    "evidence": f"quantified=0, total={len(experience_bullets)}",
                    "fix": (
                        "Rewrite every experience bullet with the pattern "
                        "Action Verb + Context + Quantified Result "
                        "(e.g. 'Reduced API latency by 40% for 2M monthly users')."
                    ),
                }
            )
        elif quantified / max(1, len(experience_bullets)) < 0.4:
            issues.append(
                {
                    "severity": "critical",
                    "dimension": "impact_metrics",
                    "message": (
                        f"Only {quantified} of {len(experience_bullets)} "
                        f"experience bullets have a quantified metric."
                    ),
                    "evidence": f"quantified={quantified}, total={len(experience_bullets)}",
                    "fix": (
                        "Aim for at least 60% of your bullets to carry a "
                        "specific number (%, $, x, count, time saved)."
                    ),
                }
            )

    # --- RECOMMENDED -------------------------------------------------------
    if experience_bullets:
        weak = sum(
            1
            for b in experience_bullets
            if not any(re.search(rf"\b{re.escape(v)}\b", b.lower()) for v in ACTION_VERBS)
        )
        if weak >= 1:
            issues.append(
                {
                    "severity": "recommended",
                    "dimension": "bullet_quality",
                    "message": (
                        f"{weak} of {len(experience_bullets)} experience bullets "
                        f"start without a strong action verb."
                    ),
                    "evidence": f"weak={weak}, total={len(experience_bullets)}",
                    "fix": (
                        "Lead each bullet with Architected, Built, Scaled, "
                        "Optimized, Led, Delivered or similar."
                    ),
                }
            )

    if "summary" not in sections or len(sections.get("summary", "").strip()) < 50:
        issues.append(
            {
                "severity": "recommended",
                "dimension": "section_completeness",
                "message": "No professional summary detected.",
                "evidence": "summary_chars=" + str(len(sections.get("summary", "").strip())),
                "fix": (
                    "Add a 3-4 line summary at the top: who you are, what you "
                    "do, and what you're targeting next."
                ),
            }
        )

    recommended_missing = [m for m in missing_keywords if m["severity"] == "recommended"]
    if recommended_missing:
        issues.append(
            {
                "severity": "recommended",
                "dimension": "skills_relevance",
                "message": (
                    f"Missing {len(recommended_missing)} recommended "
                    f"{role_cluster} tools and platforms."
                ),
                "evidence": "missing_bonus=" + ", ".join(
                    m["keyword"] for m in recommended_missing[:6]
                ),
                "fix": (
                    "Differentiators (CI/CD, cloud, monitoring) help your "
                    "resume rank above candidates with only the core skills."
                ),
            }
        )

    if experience_bullets:
        avg_len = sum(len(b.split()) for b in experience_bullets) / len(experience_bullets)
        if avg_len < 12:
            issues.append(
                {
                    "severity": "recommended",
                    "dimension": "brevity",
                    "message": (
                        f"Experience bullets average {avg_len:.0f} words — "
                        f"too short to convey scope."
                    ),
                    "evidence": f"avg_words={avg_len:.1f}",
                    "fix": (
                        "Expand each bullet to 18-30 words. Add the team "
                        "size, the scale of the system, and the impact."
                    ),
                }
            )
        elif avg_len > 40:
            issues.append(
                {
                    "severity": "recommended",
                    "dimension": "brevity",
                    "message": (
                        f"Experience bullets average {avg_len:.0f} words — "
                        f"too long, will be skipped by recruiters."
                    ),
                    "evidence": f"avg_words={avg_len:.1f}",
                    "fix": (
                        "Trim each bullet to a single strong statement. "
                        "Move secondary details to the project description."
                    ),
                }
            )

    # --- NICE-TO-HAVE ------------------------------------------------------
    if "projects" not in sections:
        issues.append(
            {
                "severity": "nice",
                "dimension": "section_completeness",
                "message": "No projects section detected.",
                "evidence": "has_projects=false",
                "fix": (
                    "Add 2-3 projects: name, stack, what it does, what you "
                    "learned. Especially useful if your work experience is "
                    "short or off-domain."
                ),
            }
        )

    if leadership_signals == 0:
        issues.append(
            {
                "severity": "nice",
                "dimension": "experience_depth",
                "message": "No leadership signals detected.",
                "evidence": "leadership_mentions=0",
                "fix": (
                    "Describe team size, mentees, or initiatives you drove. "
                    "Even small signals (e.g. 'mentored 2 junior engineers') "
                    "stand out."
                ),
            }
        )

    if page_estimate > 2.0:
        issues.append(
            {
                "severity": "nice",
                "dimension": "brevity",
                "message": f"Resume is approximately {page_estimate} pages long.",
                "evidence": f"page_estimate={page_estimate}",
                "fix": (
                    "Two pages is acceptable for senior candidates. Beyond "
                    "that, cut older or less relevant experience."
                ),
            }
        )

    severity_order = {"critical": 0, "recommended": 1, "nice": 2}
    issues.sort(key=lambda i: (severity_order[i["severity"]], i["dimension"]))
    return issues


# -----------------------------------------------------------------------------
# Per-section scoring
# -----------------------------------------------------------------------------

def score_section_deep_dive(
    sections: Dict[str, str],
    experience_bullets: List[str],
    extracted_skills: Dict[str, List[str]],
    experience_years: int,
) -> Dict[str, Dict[str, Any]]:
    """
    Micro-scores for each canonical section, plus a short status string and
    a deterministic two-line feedback. The frontend renders this as five
    cards in the per-section deep-dive row.
    """
    out: Dict[str, Dict[str, Any]] = {}

    # Summary
    summary = sections.get("summary", "").strip()
    summary_score = 0
    summary_feedback = "No professional summary detected."
    summary_present = bool(summary)
    if summary:
        L = len(summary)
        if L >= 200:
            summary_score = 15
            summary_feedback = (
                "Summary is present and detailed. Make sure it mentions your "
                "target role by name."
            )
        elif L >= 80:
            summary_score = 10
            summary_feedback = "Summary is present but could be more specific."
        else:
            summary_score = 5
            summary_feedback = "Summary is too short to differentiate you."
    out["summary"] = {
        "score": summary_score,
        "max": 15,
        "present": summary_present,
        "quality": "present" if summary_score >= 10 else ("weak" if summary_score > 0 else "missing"),
        "feedback": summary_feedback,
    }

    # Experience
    exp = sections.get("experience", "").strip()
    if experience_bullets:
        quantified_ratio = sum(
            1 for b in experience_bullets if re.search(r"\b\d+[%\$kKmMxX]?\b", b)
        ) / max(1, len(experience_bullets))
        if exp and len(exp) >= 200:
            exp_score = 25 if quantified_ratio >= 0.5 else 18
            exp_quality = "strong" if quantified_ratio >= 0.5 else "fair"
            exp_feedback = (
                f"{len(experience_bullets)} bullets across "
                f"{experience_years}+ years. {int(quantified_ratio * 100)}% "
                f"are quantified."
            )
        else:
            exp_score = 12
            exp_quality = "weak"
            exp_feedback = "Experience section is present but sparse."
    else:
        exp_score = 0
        exp_quality = "missing"
        exp_feedback = "No experience section detected."
    out["experience"] = {
        "score": exp_score,
        "max": 25,
        "present": bool(experience_bullets),
        "quality": exp_quality,
        "bullet_count": len(experience_bullets),
        "quantified_ratio": round(quantified_ratio, 2) if experience_bullets else 0,
        "feedback": exp_feedback,
    }

    # Education
    edu = sections.get("education", "").strip()
    if edu:
        edu_score = 15
        edu_feedback = "Education section is present."
        # If the text contains a degree keyword, mention it.
        degree_match = re.search(
            r"\b(B\.?(?:Tech|S|E|A)|M\.?(?:Tech|S|E|A)|Ph\.?D|MBA|Bachelor|Master|Doctor)\b",
            edu,
            re.I,
        )
        if degree_match:
            edu_feedback += f" Detected degree: {degree_match.group(0)}."
    else:
        edu_score = 0
        edu_feedback = "No education section detected."
    out["education"] = {
        "score": edu_score,
        "max": 15,
        "present": bool(edu),
        "quality": "present" if edu_score >= 10 else ("weak" if edu_score > 0 else "missing"),
        "feedback": edu_feedback,
    }

    # Skills
    skills = extracted_skills.get("technical", [])
    if len(skills) >= 8:
        skills_score = 20
        skills_quality = "strong"
        skills_feedback = f"{len(skills)} technical skills detected — solid coverage."
    elif len(skills) >= 4:
        skills_score = 14
        skills_quality = "fair"
        skills_feedback = f"{len(skills)} skills listed. Consider adding 3-5 more role-relevant ones."
    elif len(skills) >= 1:
        skills_score = 6
        skills_quality = "weak"
        skills_feedback = f"Only {len(skills)} skill detected. Expand your Skills section."
    else:
        skills_score = 0
        skills_quality = "missing"
        skills_feedback = "No skills section detected."
    out["skills"] = {
        "score": skills_score,
        "max": 20,
        "present": bool(skills),
        "quality": skills_quality,
        "skill_count": len(skills),
        "skills": skills[:20],
        "feedback": skills_feedback,
    }

    # Projects
    proj = sections.get("projects", "").strip()
    if proj and len(proj) >= 200:
        proj_score = 15
        proj_quality = "present"
        proj_feedback = "Projects section present and detailed."
    elif proj:
        proj_score = 8
        proj_quality = "weak"
        proj_feedback = "Projects section is sparse. Add 2-3 with stack + impact."
    else:
        proj_score = 0
        proj_quality = "missing"
        proj_feedback = "No projects section detected."
    out["projects"] = {
        "score": proj_score,
        "max": 15,
        "present": bool(proj),
        "quality": proj_quality,
        "feedback": proj_feedback,
    }

    return out


# -----------------------------------------------------------------------------
# LLM narrative
# -----------------------------------------------------------------------------

def _template_narrative(
    overall_summary: str,
    pros: List[str],
    cons: List[str],
    experience_feedback: str,
    suggestions: List[Dict[str, Any]],
    bullet_rewrites: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Used when the LLM is unavailable. Honest, no fabrication."""
    return {
        "overall_summary": overall_summary,
        "pros": pros,
        "cons": cons,
        "experience_feedback": experience_feedback,
        "suggestions": suggestions,
        "bullet_rewrites": bullet_rewrites,
    }


def generate_llm_narrative(
    resume_text: str,
    job_role: str,
    role_cluster: str,
    composite_score: int,
    dimension_scores: Dict[str, int],
    issues: List[Dict[str, Any]],
    weakest_bullets: List[Dict[str, Any]],
    matched_keywords: List[Dict[str, Any]],
    missing_keywords: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    LLM writes qualitative content only. Numbers come from deterministic
    code, so if the LLM is down we still return a usable narrative from
    the issues and weakest-bullets data already on hand.
    """
    compact = re.sub(r"\s+", " ", resume_text[:2500]).strip()

    crit = [i for i in issues if i["severity"] == "critical"][:5]
    recs = [i for i in issues if i["severity"] == "recommended"][:5]
    nice = [i for i in issues if i["severity"] == "nice"][:3]

    prompt = (
        "You are a senior technical recruiter and ATS resume coach.\n"
        "You are given a deterministic analysis of a candidate's resume. "
        "The numbers and evidence are correct — do NOT invent, change, or "
        "estimate any scores. Write ONLY the qualitative text below.\n\n"
        f"Target role: {job_role}\n"
        f"Role cluster: {role_cluster}\n"
        f"Composite score (0-100, computed deterministically): {composite_score}\n"
        f"Dimension scores: {dimension_scores}\n\n"
        "Critical issues (real evidence below each):\n"
        + "\n".join(f"  - {i['message']} [evidence: {i['evidence']}]" for i in crit)
        + "\n\nRecommended issues:\n"
        + "\n".join(f"  - {i['message']} [evidence: {i['evidence']}]" for i in recs)
        + "\n\nNice-to-have issues:\n"
        + "\n".join(f"  - {i['message']} [evidence: {i['evidence']}]" for i in nice)
        + "\n\nMatched keywords: "
        + ", ".join(m["keyword"] for m in matched_keywords[:12])
        + "\nMissing keywords: "
        + ", ".join(m["keyword"] for m in missing_keywords[:12])
        + "\n\nWeakest bullets (rewrite these for the target role):\n"
        + "\n".join(
            f"  - ORIGINAL: {w['bullet']}\n    WHY WEAK: {', '.join(w['reasons']) or 'general'}"
            for w in weakest_bullets
        )
        + "\n\nResume text (first 2500 chars):\n"
        + compact
        + "\n\nReturn ONLY this JSON, no commentary outside the JSON:\n"
        "{\n"
        '  "overall_summary": "2-3 sentence fit assessment. Reference the composite score and the strongest dimension. Do not invent facts.",\n'
        '  "pros": ["3-5 specific strengths with reference to what is in the resume", "..."],\n'
        '  "cons": ["3-5 specific weaknesses grounded in the issues list", "..."],\n'
        '  "experience_feedback": "2-3 sentences on bullet quality: action verbs, quantified impact, STAR structure.",\n'
        '  "suggestions": [\n'
        '    {"priority": 1, "text": "Concrete, actionable next step tied to a specific issue", "dimension": "impact_metrics"},\n'
        '    ...up to 5\n'
        "  ],\n"
        '  "bullet_rewrites": [\n'
        '    {"original": "exact original", "optimized": "rewritten version using existing facts only - do not invent new metrics, technologies, or company claims", "explanation": "1 sentence on what changed"},\n'
        '    ...up to 3\n'
        "  ]\n"
        "}"
    )

    fallback = _template_narrative(
        overall_summary=(
            f"Resume scored {composite_score}/100 against the {job_role} target. "
            "Review the issues list and dimension breakdown for the full picture."
        ),
        pros=[],
        cons=[],
        experience_feedback=(
            "Review the experience bullets in the rewrite section below — "
            "each is annotated with the reason it scored low."
        ),
        suggestions=[
            {"priority": i + 1, "text": issue["fix"], "dimension": issue["dimension"]}
            for i, issue in enumerate((crit + recs)[:5])
        ],
        bullet_rewrites=[],
    )

    parsed = call_llm_json(
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_tokens=1400,
        default=fallback,
    )

    if not isinstance(parsed, dict):
        return fallback

    # Defensive: ensure all expected keys exist; if LLM dropped one, use the
    # template value for that field rather than crashing the report.
    for key, default in fallback.items():
        parsed.setdefault(key, default)

    # Cap list lengths so a runaway LLM doesn't blow up the response.
    parsed["pros"] = list(parsed.get("pros", []))[:6]
    parsed["cons"] = list(parsed.get("cons", []))[:6]
    parsed["suggestions"] = list(parsed.get("suggestions", []))[:6]
    parsed["bullet_rewrites"] = list(parsed.get("bullet_rewrites", []))[:3]

    return parsed


# -----------------------------------------------------------------------------
# Main orchestrator
# -----------------------------------------------------------------------------

def analyze_resume_full(
    resume_text: str,
    job_role: str,
    filename: str = "",
) -> Dict[str, Any]:
    """
    Run the full analysis pipeline and return a complete structured report.
    This is the only public entry point the HTTP layer should call.
    """
    text = (resume_text or "").strip()
    text_lower = text.lower()
    word_count = len(text.split())

    # 1. Section detection
    sections = detect_sections(text)
    section_names = [k for k in sections.keys() if not k.startswith("_")]

    # 2. Contact + layout
    contact_info = detect_contact_info(text)
    layout_flags = analyze_layout(text)

    # 3. Experience parsing
    experience_bullets = extract_experience_bullets(sections.get("experience", ""))
    experience_years = estimate_years_experience(sections.get("experience", ""))
    role_titles = extract_role_titles(sections.get("experience", ""))
    companies = extract_companies(sections.get("experience", ""))
    leadership_signals = count_leadership_signals(text)

    # 4. Skills extraction
    extracted_skills = extract_skills_from_text(text)

    # 5. Role cluster
    role_cluster = detect_role_cluster(job_role)

    # 6. Dimension scoring
    dimension_scores = {
        "ats_compatibility": score_ats_compatibility(text, section_names, contact_info, layout_flags),
        "impact_metrics": score_impact_metrics(experience_bullets, text),
        "bullet_quality": score_bullet_quality(experience_bullets, text),
        "skills_relevance": score_skills_relevance(text_lower, role_cluster, extracted_skills["all"]),
        "experience_depth": score_experience_depth(
            text, experience_years, role_titles, companies, leadership_signals
        ),
        "section_completeness": score_section_completeness(sections),
        "format_readability": score_format_readability(text, sections, layout_flags),
        "brevity": score_brevity(experience_bullets, text, sections),
    }

    # 7. Composite
    composite = compute_composite(dimension_scores)

    # 8. Keyword gap
    matched_keywords = detect_matched_keywords(text_lower, role_cluster)
    missing_keywords = detect_missing_keywords(text_lower, role_cluster)

    # 9. Issues
    page_estimate = estimate_page_count(text)
    issues = generate_issues(
        dimension_scores=dimension_scores,
        sections=sections,
        experience_bullets=experience_bullets,
        missing_keywords=missing_keywords,
        contact_info=contact_info,
        page_estimate=page_estimate,
        leadership_signals=leadership_signals,
        role_cluster=role_cluster,
    )

    # 10. Weakest bullets
    weakest_bullets = get_weakest_bullets(experience_bullets, limit=3)

    # 11. Per-section deep dive
    section_scores = score_section_deep_dive(
        sections, experience_bullets, extracted_skills, experience_years
    )

    # 12. LLM narrative
    narrative = generate_llm_narrative(
        resume_text=text,
        job_role=job_role,
        role_cluster=role_cluster,
        composite_score=composite,
        dimension_scores=dimension_scores,
        issues=issues,
        weakest_bullets=weakest_bullets,
        matched_keywords=matched_keywords,
        missing_keywords=missing_keywords,
    )

    return {
        # Top-level composite
        "composite_score": composite,
        # Per-dimension scores with the weights that produced them
        "dimension_scores": dimension_scores,
        "dimension_weights": dict(WEIGHTS),
        # JD-aware keyword match
        "role_cluster": role_cluster,
        "matched_keywords": matched_keywords,
        "missing_keywords": missing_keywords,
        # Issues list with severity
        "issues": issues,
        # Weakest bullets + per-section deep dive
        "weakest_bullets": weakest_bullets,
        "section_scores": section_scores,
        # Skills extracted
        "skills_extracted": extracted_skills,
        # Stats
        "stats": {
            "word_count": word_count,
            "bullet_count": len(experience_bullets),
            "section_count": len(section_names),
            "page_estimate": page_estimate,
            "experience_years": experience_years,
        },
        # LLM narrative
        "overall_summary": narrative["overall_summary"],
        "pros": narrative["pros"],
        "cons": narrative["cons"],
        "experience_feedback": narrative["experience_feedback"],
        "suggestions": narrative["suggestions"],
        "bullet_rewrites": narrative["bullet_rewrites"],
        # Whether the qualitative layer was LLM-generated or templated
        "narrative_source": "llm" if narrative.get("pros") else "template",
    }
