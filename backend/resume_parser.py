"""
High-Precision Resume Scraper & Entity Extractor for PrepAI Career Agent
Extracts Candidate Name, Email, Phone, LinkedIn, GitHub, and Portfolio URLs
using multi-layer deterministic regex patterns and LLM enhancement.
"""

import re
import os
import json
from typing import Dict, Any, Optional
from dotenv import load_dotenv

load_dotenv()

from llm_client import call_llm_json, GROQ_LIGHT_MODEL


def clean_name_from_filename(filename: str) -> str:
    """Extracts a clean candidate name from resume filename (e.g. Apurve_Karanwal_Resume.pdf or ApurveKaranwal_Resume.pdf -> Apurve Karanwal)."""
    if not filename:
        return ""
    base = os.path.splitext(os.path.basename(filename))[0]
    # Remove common resume keywords
    base = re.sub(r'(?i)(?:[-_]?(?:resume|cv|updated|latest|profile|final|new|\d+))', '', base)
    # Split PascalCase if present (e.g. ApurveKaranwal -> Apurve Karanwal)
    base = re.sub(r'([a-z])([A-Z])', r'\1 \2', base)
    base = base.replace('_', ' ').replace('-', ' ').strip()
    words = [w for w in re.split(r'\s+', base) if len(w) > 1 and w.isalpha()]
    if 1 <= len(words) <= 4:
        return ' '.join(w.capitalize() for w in words)
    return ""


def extract_candidate_entities(resume_text: str, filename: str = "", default_name: str = "", default_email: str = "") -> Dict[str, str]:
    """
    Extracts high-accuracy contact details from raw resume text.
    """
    text = (resume_text or "").strip()
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # 1. Email Extraction
    email = ""
    email_match = re.search(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', text)
    if email_match:
        extracted = email_match.group(0).strip().rstrip('.')
        if "@" in extracted:
            parts = extracted.split("@")
            user_part = parts[0]
            domain_part = parts[1]
            # Strip common icon encoding artifacts (e.g. 'pe' from mail icon font glyph)
            if user_part.startswith("pe") and len(user_part) > 6:
                user_part = user_part[2:]
            email = f"{user_part}@{domain_part}".lower()
    
    if not email and default_email and "@" in default_email and not default_email.endswith("example.com"):
        email = default_email

    # 2. Phone Extraction
    phone = ""
    phone_match = re.search(r'(?:\+?91[\s\-\.]?)?[6-9]\d{4}[\s\-\.]?\d{5}|\+?\d{1,3}[\s\-\.]?\(?\d{2,4}\)?[\s\-\.]?\d{3,4}[\s\-\.]?\d{4}', text)
    if phone_match:
        phone = phone_match.group(0).strip()

    # 3. LinkedIn Extraction
    linkedin_url = ""
    li_match = re.search(r'(?:https?://)?(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_\-\.]+', text, re.I)
    if li_match:
        linkedin_url = li_match.group(0).strip().rstrip('/')
        if not linkedin_url.startswith("http"):
            linkedin_url = "https://" + linkedin_url

    # 4. GitHub Extraction
    github_url = ""
    gh_match = re.search(r'(?:https?://)?(?:www\.)?github\.com/[a-zA-Z0-9_\-\.]+', text, re.I)
    if gh_match:
        github_url = gh_match.group(0).strip().rstrip('/')
        if not github_url.startswith("http"):
            github_url = "https://" + github_url

    # 5. Portfolio Extraction
    portfolio_url = ""
    port_match = re.search(r'(?:https?://)?(?:[a-zA-Z0-9_\-]+\.github\.io(?:/[^\s|]*)?|[a-zA-Z0-9_\-]+\.(?:vercel\.app|xyz|dev|me)(?:/[^\s|]*)?)', text, re.I)
    if port_match:
        portfolio_url = port_match.group(0).strip().rstrip('/')
        if not portfolio_url.startswith("http"):
            portfolio_url = "https://" + portfolio_url

    # 6. Name Extraction
    name_from_file = clean_name_from_filename(filename)
    name = ""

    # Priority 1: If filename has a clean full name (e.g. Apurve_Karanwal_Resume.pdf or ApurveKaranwal_Resume.pdf)
    if name_from_file and len(name_from_file.split()) >= 2:
        name = name_from_file

    # Priority 2: Extract from the first 5 lines of the resume text
    if not name:
        for line in lines[:5]:
            # Look for 2-3 capitalized words at the beginning of the line
            line_clean = re.sub(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', '', line)
            line_clean = re.sub(r'(?:https?://)?(?:www\.)?(?:linkedin|github|twitter|x)\.com/[^\s|]+', '', line_clean, flags=re.I)
            line_clean = re.sub(r'(?:\+?91[\s\-]?)?[6-9]\d{9}', '', line_clean)
            
            # Find name pattern: e.g. "APURVE KARANWAL" or "Vanshika Sangal"
            match = re.match(r'^\s*([A-Za-z]{2,15}(?:\s+[A-Za-z]{2,15}){1,3})', line_clean)
            if match:
                candidate = match.group(1).strip()
                words = candidate.split()
                lower_phrase = candidate.lower()
                if not any(kw in lower_phrase for kw in ['resume', 'curriculum', 'vitae', 'summary', 'experience', 'education', 'skills', 'projects', 'profile', 'contact', 'infrastructure', 'engineer', 'developer']):
                    name = ' '.join(w.capitalize() for w in words)
                    break

    if not name and name_from_file:
        name = name_from_file
    elif not name and default_name and default_name not in ["User", "Candidate"]:
        name = default_name

    # Clean trailing city / country words that get concatenated in PDFs
    for suffix in ["ghaziabad", "ghaziab", "delhi", "noida", "bengaluru", "bangalore", "mumbai", "india", "pune", "gurgaon", "hyderabad"]:
        if name.lower().endswith(suffix) and len(name) > len(suffix) + 3:
            name = name[:-len(suffix)].strip()

    # No invented identity. If the resume and the account both fail to yield a
    # name or an email, the caller gets an empty string and decides what to do —
    # the previous version substituted one real person's name and inbox, so every
    # unparseable resume was attributed to (and emailed to) them.
    if not email and default_email:
        email = default_email

    # If text is available, attempt JSON extraction with LLM
    if text and len(text) > 30:
        try:
            prompt = (
                f"Extract candidate's contact details from this resume text in strict JSON.\n"
                f"Use keys: 'name', 'email', 'phone', 'linkedin_url', 'github_url', 'portfolio_url'.\n"
                f"Resume Text:\n{text[:3000]}"
            )
            parsed = call_llm_json(
                messages=[
                    {"role": "system", "content": "You are a precise resume parser. Output ONLY valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=300
            )
            if parsed:
                if parsed.get("email") and "@" in parsed["email"]:
                    email = parsed["email"].strip().lower()
                if parsed.get("name") and len(parsed["name"].strip()) >= 3:
                    name = parsed["name"].strip()
                if parsed.get("phone"):
                    phone = parsed["phone"].strip()
                if parsed.get("linkedin_url"):
                    linkedin_url = parsed["linkedin_url"].strip()
                if parsed.get("github_url"):
                    github_url = parsed["github_url"].strip()
        except Exception:
            pass

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin_url": linkedin_url,
        "github_url": github_url,
        "portfolio_url": portfolio_url
    }
