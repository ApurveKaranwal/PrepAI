import os
import json
import asyncio
from typing import Dict, Any, Optional
from groq import Groq
from config import GROQ_LIGHT_MODEL

# Initialize Groq client
groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None

async def scrape_linkedin_profile(url: str) -> Dict[str, Any]:
    """
    Asynchronously scrape a LinkedIn profile using Playwright.
    Handles login walls and block detection.
    """
    url = url.strip()
    if not url:
        return {"status": "error", "reason": "Empty URL"}
        
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("Playwright is not installed. Run 'pip install playwright' and 'playwright install'")
        return {"status": "error", "reason": "Playwright library not installed on backend."}
        
    try:
        async with async_playwright() as p:
            # Launch browser in headless mode with realistic arguments
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-blink-features=AutomationControlled"]
            )
            
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 800}
            )
            
            page = await context.new_page()
            print(f"Navigating to LinkedIn profile: {url}")
            
            try:
                # Go to URL with a generous timeout (20s)
                await page.goto(url, timeout=20000, wait_until="networkidle")
            except Exception as e:
                await browser.close()
                return {"status": "error", "reason": f"Navigation timeout or failure: {str(e)}"}
                
            # Check for login redirect/wall
            current_url = page.url
            if "login" in current_url.lower() or "signup" in current_url.lower() or "authwall" in current_url.lower():
                print("LinkedIn authwall/login redirect detected.")
                await browser.close()
                return {
                    "status": "blocked",
                    "reason": "Scraping blocked by LinkedIn login wall. Profile is not publicly viewable without authentication."
                }
                
            # Extract content from the page
            page_content = await page.content()
            
            # Extract basic text content using selectors
            headline = ""
            name = ""
            experience_text = ""
            education_text = ""
            skills_text = ""
            
            try:
                # Try selectors for public profile layouts
                headline_el = await page.query_selector(".top-card-layout__headline, h2.text-heading-medium")
                if headline_el:
                    headline = (await headline_el.inner_text()).strip()
                    
                name_el = await page.query_selector(".top-card-layout__title, h1.text-heading-xlarge")
                if name_el:
                    name = (await name_el.inner_text()).strip()
                    
                # Scrape sections
                exp_els = await page.query_selector_all(".experience-item, .experience-section, #experience-section")
                if exp_els:
                    experience_text = "\n".join([await el.inner_text() for el in exp_els])
                    
                edu_els = await page.query_selector_all(".education-item, .education-section, #education-section")
                if edu_els:
                    education_text = "\n".join([await el.inner_text() for el in edu_els])
                    
                skill_els = await page.query_selector_all(".skills-item, .skills__list, #skills-section")
                if skill_els:
                    skills_text = "\n".join([await el.inner_text() for el in skill_els])
            except Exception as e:
                print(f"Selector extraction error: {e}")
                
            # Clean up
            await browser.close()
            
            # Compile text
            profile_text = f"Name: {name}\nHeadline: {headline}\n\nExperience:\n{experience_text}\n\nEducation:\n{education_text}\n\nSkills:\n{skills_text}"
            
            if not name and not headline and not experience_text:
                return {
                    "status": "blocked",
                    "reason": "LinkedIn profile loaded, but no visible public elements found. Profile might be private."
                }
                
            return {
                "status": "success",
                "raw_text": profile_text
            }
            
    except Exception as e:
        print(f"Playwright general error: {e}")
        return {"status": "error", "reason": str(e)}

def parse_linkedin_text(raw_text: str) -> Dict[str, Any]:
    """
    Parse scraped or pasted LinkedIn profile text into structured JSON using Groq.
    """
    default_structure = {
        "headline": "",
        "experience": [],
        "skills": [],
        "projects": [],
        "education": []
    }
    
    if not raw_text.strip():
        return default_structure
        
    sarvam_key = os.environ.get("SARVAM_API_KEY")
    prompt = f"""
    You are a LinkedIn profile parser. Your job is to extract details from raw text and structure it into a clean JSON object matching the following structure:
    {{
        "headline": "Job Title / Professional Headline",
        "experience": [
            {{
                "company": "Company Name",
                "title": "Role Title",
                "duration": "Duration (e.g. Jan 2021 - Present)",
                "description": "Key achievements and responsibilities"
            }}
        ],
        "skills": ["skill1", "skill2"],
        "projects": [
            {{
                "name": "Project Name",
                "description": "Short description of the project"
            }}
        ],
        "education": [
            {{
                "institution": "School/University Name",
                "degree": "Degree / Field of Study",
                "duration": "Duration (e.g. 2018 - 2022)"
            }}
        ]
    }}

    LinkedIn raw text:
    {raw_text[:12000]}

    Output ONLY valid JSON.
    """
    
    # 1. Try Sarvam AI
    if sarvam_key:
        try:
            import requests
            resp = requests.post(
                "https://api.sarvam.ai/v1/chat/completions",
                headers={"api-subscription-key": sarvam_key, "Content-Type": "application/json"},
                json={
                    "model": "sarvam-105b-conversations",
                    "messages": [
                        {"role": "system", "content": "You are a JSON-only response bot. Parse the LinkedIn profile into JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.1,
                    "max_tokens": 1500,
                    "response_format": {"type": "json_object"}
                },
                timeout=18
            )
            if resp.status_code == 200:
                raw_json = resp.json()["choices"][0]["message"]["content"].strip()
                if "```json" in raw_json:
                    raw_json = raw_json.split("```json")[1].split("```")[0].strip()
                elif "```" in raw_json:
                    raw_json = raw_json.split("```")[1].split("```")[0].strip()
                return json.loads(raw_json)
        except Exception as e:
            print(f"Sarvam LinkedIn parsing error: {e}")

    # 2. Try Groq
    if client:
        try:
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=GROQ_LIGHT_MODEL,
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            parsed_json = json.loads(completion.choices[0].message.content)
            return parsed_json
        except Exception as e:
            print(f"Error parsing LinkedIn via Groq: {e}")
            
    return {
        "headline": "Professional Developer",
        "experience": [{"company": "N/A", "title": "Developer", "description": "LinkedIn data"}],
        "skills": [],
        "projects": [],
        "education": []
    }
