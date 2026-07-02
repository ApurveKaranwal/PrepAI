import io
import os
import json
import pypdf
from typing import Dict, Any, List
from groq import Groq
from config import GROQ_LIGHT_MODEL

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
        
    if not client:
        # Minimal rule-based fallback if Groq API is not set
        print("Groq API key not set, using rule-based resume parsing.")
        # Basic parsing heuristics
        skills = []
        techs = []
        for line in resume_text.split("\n"):
            line_l = line.lower()
            if "skills:" in line_l or "key skills:" in line_l:
                skills.extend([s.strip() for s in line.split(":", 1)[1].split(",")])
            if "languages:" in line_l or "technologies:" in line_l:
                techs.extend([t.strip() for t in line.split(":", 1)[1].split(",")])
        return {
            "skills": list(set(skills)) if skills else ["Software Engineering"],
            "experience": [{"company": "N/A", "title": "Software Engineer", "duration": "N/A", "description": "Extracted from raw text"}],
            "education": [],
            "projects": [],
            "technologies": list(set(techs)) if techs else ["Python", "JavaScript"],
            "certifications": []
        }

    try:
        prompt = f"""
        You are an advanced ATS resume parser. Your job is to extract resume details from raw text and structure it into a clean JSON object matching the following structure:
        {{
            "skills": ["skill1", "skill2"],
            "experience": [
                {{
                    "company": "Company Name",
                    "title": "Job Title",
                    "duration": "Duration (e.g., Jun 2022 - Present)",
                    "description": "Short summary of responsibilities and impact"
                }}
            ],
            "education": [
                {{
                    "institution": "University/Institution Name",
                    "degree": "Degree (e.g., Bachelor of Science)",
                    "field_of_study": "Field (e.g., Computer Science)",
                    "graduation_year": "Year (e.g., 2024)"
                }}
            ],
            "projects": [
                {{
                    "name": "Project Name",
                    "description": "Short summary of the project",
                    "technologies": ["tech1", "tech2"]
                }}
            ],
            "technologies": ["tech1", "tech2", "language1"],
            "certifications": ["cert1", "cert2"]
        }}

        Resume text:
        {resume_text[:12000]}

        Output ONLY valid JSON. Do not include markdown code block syntax (like ```json ... ```) or any extra conversational text.
        """
        
        completion = client.chat.completions.create(
            messages=[{"role": "user", "content": prompt}],
            model=GROQ_LIGHT_MODEL,
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        parsed_json = json.loads(completion.choices[0].message.content)
        return parsed_json
    except Exception as e:
        print(f"Error parsing resume via Groq: {e}")
        return default_structure
