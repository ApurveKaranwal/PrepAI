import io
import os
import json
import pypdf
from typing import Dict, Any, List
from groq import Groq
from config import GROQ_HEAVY_MODEL

# Initialize Groq client
groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """
    Extract raw text from a PDF byte stream using pypdf.
    """
    try:
        pdf_reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        extracted_pages = []
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                extracted_pages.append(page_text)
        return "\n".join(extracted_pages)
    except Exception as e:
        print(f"Error extracting text from PDF: {e}")
        return ""

def get_rule_based_skills(resume_text: str) -> list:
    import re
    skills_keywords = [
        "python", "javascript", "typescript", "react", "next.js", "nextjs", "vue", "angular", "node.js", "nodejs",
        "express", "fastapi", "django", "flask", "docker", "kubernetes", "aws", "gcp", "azure",
        "sql", "postgresql", "mysql", "mongodb", "redis", "html", "css", "git", "github", "java",
        "c++", "c#", "rust", "go", "golang", "php", "laravel", "machine learning", "deep learning",
        "nlp", "tensorflow", "pytorch", "ci/cd", "graphql", "tailwind", "rest api", "api", "flutter",
        "dart", "swift", "kotlin", "spring boot", "terraform", "jenkins"
    ]
    found_skills = []
    resume_lower = resume_text.lower()
    for kw in skills_keywords:
        pattern = r'\b' + re.escape(kw) + r'\b'
        if re.search(pattern, resume_lower):
            name = kw
            if kw in ["nextjs", "next.js"]:
                name = "Next.js"
            elif kw in ["nodejs", "node.js"]:
                name = "Node.js"
            elif kw in ["machine learning"]:
                name = "Machine Learning"
            elif kw in ["deep learning"]:
                name = "Deep Learning"
            elif kw in ["rest api"]:
                name = "REST API"
            elif kw in ["ci/cd"]:
                name = "CI/CD"
            elif kw in ["spring boot"]:
                name = "Spring Boot"
            elif kw in ["sql", "html", "css", "aws", "gcp", "api", "nlp", "mern"]:
                name = kw.upper()
            else:
                name = kw.title()
            found_skills.append(name)
            
    # Try parsing text lines
    for line in resume_text.split("\n"):
        line_l = line.lower()
        if "skills:" in line_l or "key skills:" in line_l:
            try:
                parts = [s.strip() for s in line.split(":", 1)[1].split(",")]
                for p in parts:
                    if p and len(p) < 25 and p.title() not in found_skills:
                        found_skills.append(p.title())
            except Exception:
                pass
        if "languages:" in line_l or "technologies:" in line_l:
            try:
                parts = [t.strip() for t in line.split(":", 1)[1].split(",")]
                for p in parts:
                    if p and len(p) < 25 and p.title() not in found_skills:
                        found_skills.append(p.title())
            except Exception:
                pass
                    
    seen = set()
    unique_skills = []
    for s in found_skills:
        if s.lower() not in seen:
            seen.add(s.lower())
            unique_skills.append(s)
    return unique_skills[:12]

def parse_resume_content(resume_text: str) -> Dict[str, Any]:
    """
    Parse raw resume text into a structured JSON profile using Groq LLM.
    """
    default_structure = {
        "skills": [],
        "experience": [],
        "education": [],
        "projects": [],
        "technologies": [],
        "certifications": []
    }
    
    if not resume_text.strip():
        return default_structure
        
    # Pre-extract rule-based skills in case LLM fails or returns empty skills
    fallback_skills = get_rule_based_skills(resume_text)
    default_structure["skills"] = fallback_skills if fallback_skills else ["Software Engineering"]
    default_structure["technologies"] = fallback_skills if fallback_skills else ["Python", "JavaScript"]

    if not client:
        print("Groq API client not set, using rule-based resume parsing fallback.")
        return default_structure

    try:
        prompt = f"""Extract resume details from the text below into a JSON object with these keys:
{{
    "skills": ["skill1", "skill2"],
    "experience": [
        {{
            "company": "Company Name",
            "title": "Job Title",
            "duration": "Duration",
            "description": "Short summary"
        }}
    ],
    "education": [
        {{
            "institution": "University Name",
            "degree": "Degree",
            "field_of_study": "Field",
            "graduation_year": "Year"
        }}
    ],
    "projects": [
        {{
            "name": "Project Name",
            "description": "Short summary",
            "technologies": ["tech1", "tech2"]
        }}
    ],
    "technologies": ["tech1", "tech2"],
    "certifications": ["cert1", "cert2"]
}}

Resume text:
{resume_text[:8000]}

Output ONLY valid JSON."""
        
        completion = client.chat.completions.create(
            messages=[
                {"role": "system", "content": "You are a JSON-only response bot. Parse the resume and return structured JSON. Do not include any text outside the JSON object."},
                {"role": "user", "content": prompt}
            ],
            model=GROQ_HEAVY_MODEL,
            temperature=0.1,
            max_tokens=2048,
            response_format={"type": "json_object"}
        )
        
        parsed_json = json.loads(completion.choices[0].message.content)
        if not parsed_json.get("skills") or len(parsed_json.get("skills")) == 0:
            parsed_json["skills"] = fallback_skills if fallback_skills else ["Software Engineering"]
        return parsed_json
    except Exception as e:
        print(f"Error parsing resume via Groq: {e}. Falling back to rule-based parsed skills.")
        return default_structure
