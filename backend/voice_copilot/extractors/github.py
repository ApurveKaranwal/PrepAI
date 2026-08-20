import re
import os
import json
import requests
from typing import Dict, Any, List, Optional
from groq import Groq
from config import GROQ_HEAVY_MODEL

# Initialize Groq client
groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None

# Fetch optional GitHub Token to bypass rate limits
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")

def get_github_headers() -> Dict[str, str]:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    return headers

def extract_username_from_url(url: str) -> Optional[str]:
    """
    Extract github username from profile or repo URL.
    """
    url = url.strip()
    if not url:
        return None
    # Matches github.com/username/repo or github.com/username
    match = re.search(r"github\.com/([^/]+)", url, re.IGNORECASE)
    if match:
        username = match.group(1)
        if username in ["orgs", "topics", "search", "trending", "features"]:
            return None
        return username
    return url # Assume it was just the username if no URL match

def analyze_github_profile(github_url: str) -> Dict[str, Any]:
    """
    Main GitHub scraper and analyzer. Fetches profile info, repos,
    READMEs, languages, file lists, and structures the analysis.
    """
    import time
    start_time = time.time()

    username = extract_username_from_url(github_url)
    if not username:
        return {"error": "Invalid GitHub URL or username"}
        
    print(f"Fetching GitHub data for user: {username}")
    
    headers = get_github_headers()
    
    # 1. Fetch User Profile
    user_url = f"https://api.github.com/users/{username}"
    try:
        user_res = requests.get(user_url, headers=headers, timeout=3)
        if user_res.status_code == 404:
            return {"error": f"GitHub user '{username}' not found"}
        user_data = user_res.json()
    except Exception as e:
        return {"error": f"Failed to connect to GitHub API: {str(e)}"}
        
    # 2. Fetch Repositories (Limit to top 8 sorted by updated)
    repos_url = f"https://api.github.com/users/{username}/repos?sort=updated&per_page=8"
    repos = []
    try:
        repos_res = requests.get(repos_url, headers=headers, timeout=3)
        if repos_res.status_code == 200:
            repos = repos_res.json()
    except Exception as e:
        print(f"Failed to fetch repositories: {e}")
        
    # Analyze Repos
    analyzed_repos = []
    global_languages = {}
    total_stars = 0
    total_forks = 0
    
    # Process top 3 repositories in depth (capped at 3 to save API quota and prevent timeouts)
    for repo in repos[:3]:
        # Fast exit if cumulative scraping takes more than 6 seconds (prevent gateway timeout)
        if time.time() - start_time > 6.0:
            print("GitHub detail scraping time limit reached. Returning partial repository data.")
            break

        repo_name = repo["name"]
        description = repo.get("description") or ""
        stars = repo.get("stargazers_count", 0)
        forks = repo.get("forks_count", 0)
        total_stars += stars
        total_forks += forks
        
        # 2a. Fetch Languages
        languages = {}
        lang_url = f"https://api.github.com/repos/{username}/{repo_name}/languages"
        try:
            lang_res = requests.get(lang_url, headers=headers, timeout=2)
            if lang_res.status_code == 200:
                languages = lang_res.json()
                for lang, bytes_count in languages.items():
                    global_languages[lang] = global_languages.get(lang, 0) + bytes_count
        except Exception as e:
            print(f"Failed to fetch languages for {repo_name}: {e}")
            
        # 2b. Fetch README
        readme_content = ""
        readme_url = f"https://api.github.com/repos/{username}/{repo_name}/readme"
        try:
            readme_res = requests.get(readme_url, headers=headers, timeout=2)
            if readme_res.status_code == 200:
                import base64
                readme_data = readme_res.json()
                readme_content = base64.b64decode(readme_data["content"]).decode("utf-8", errors="ignore")
        except Exception as e:
            # Fallback direct raw.githubusercontent.com
            try:
                raw_url = f"https://raw.githubusercontent.com/{username}/{repo_name}/main/README.md"
                raw_res = requests.get(raw_url, timeout=2)
                if raw_res.status_code == 200:
                    readme_content = raw_res.text
            except:
                pass
                
        # 2c. Fetch Repository Contents / Tree (To determine architecture)
        # Scan root files to identify config files
        config_files = []
        contents_url = f"https://api.github.com/repos/{username}/{repo_name}/contents"
        try:
            contents_res = requests.get(contents_url, headers=headers, timeout=2)
            if contents_res.status_code == 200:
                for file_item in contents_res.json():
                    name = file_item["name"]
                    if file_item["type"] == "file":
                        # Check for architectural flags
                        if name.lower() in [
                            "dockerfile", "docker-compose.yml", "package.json", "requirements.txt",
                            "go.mod", "pom.xml", "build.gradle", "tsconfig.json", "webpack.config.js",
                            "gemfile", "cargo.toml", "init.sql", "alembic.ini", "main.py", "app.js", "server.js"
                        ]:
                            config_files.append(name)
        except Exception as e:
            print(f"Failed to fetch contents for {repo_name}: {e}")
            
        analyzed_repos.append({
            "name": repo_name,
            "description": description,
            "stars": stars,
            "forks": forks,
            "languages": list(languages.keys()),
            "config_files": config_files,
            "readme_snippet": readme_content[:1500] if readme_content else ""
        })

    # Sort languages by aggregate byte usage
    sorted_languages = sorted(global_languages.items(), key=lambda x: x[1], reverse=True)
    top_languages = [lang[0] for lang in sorted_languages[:5]]
    
    # 3. Create candidate profile context
    raw_analysis = {
        "username": username,
        "name": user_data.get("name") or username,
        "bio": user_data.get("bio") or "",
        "public_repos": user_data.get("public_repos", 0),
        "followers": user_data.get("followers", 0),
        "top_languages": top_languages,
        "total_stars": total_stars,
        "total_forks": total_forks,
        "repos": analyzed_repos
    }
    
    # Call Groq to generate structured profile insights
    structured_insights = run_llm_analysis(raw_analysis)
    return structured_insights

def run_llm_analysis(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sends raw GitHub scraper results to Llama model to extract tech stacks and architecture.
    """
    default_structure = {
        "username": raw_data["username"],
        "name": raw_data["name"],
        "bio": raw_data["bio"],
        "languages_summary": raw_data["top_languages"],
        "total_stars": raw_data["total_stars"],
        "projects": [],
        "overall_architecture": "Generic Web Architecture"
    }
    
    if not client:
        # Fallback if Groq not configured
        for r in raw_data["repos"]:
            default_structure["projects"].append({
                "name": r["name"],
                "description": r["description"],
                "technologies": r["languages"] + r["config_files"],
                "architecture": "MVC / Standard Layered Architecture",
                "insights": "Scraped without LLM parsing."
            })
        return default_structure
        
    # Truncate large fields to prevent hitting token limits
    trimmed_data = {
        "username": raw_data["username"],
        "name": raw_data["name"],
        "bio": raw_data["bio"],
        "top_languages": raw_data["top_languages"],
        "total_stars": raw_data["total_stars"],
        "repos": []
    }
    for r in raw_data.get("repos", []):
        trimmed_data["repos"].append({
            "name": r["name"],
            "description": r.get("description", ""),
            "languages": r.get("languages", []),
            "config_files": r.get("config_files", []),
            "readme_snippet": r.get("readme_snippet", "")[:500]
        })

    sarvam_key = os.environ.get("SARVAM_API_KEY")
    prompt = f"""You are a technical architect. Analyze this GitHub profile data and produce a JSON summary.

Raw Data:
{json.dumps(trimmed_data, indent=2)}

Return a JSON object with these exact keys:
{{
    "username": "the github username",
    "name": "display name",
    "bio": "bio text",
    "languages_summary": ["top languages"],
    "total_stars": 0,
    "projects": [
        {{
            "name": "repo name",
            "description": "short description",
            "technologies": ["detected techs"],
            "architecture": "architecture style",
            "insights": "one sentence of highlights"
        }}
    ],
    "overall_architecture": "summary of preferred design paradigms"
}}

Output ONLY valid JSON."""

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
                        {"role": "system", "content": "You are a JSON-only response bot. You must respond with valid JSON and nothing else."},
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
        except Exception as err:
            print(f"Sarvam GitHub analysis error: {err}")

    # 2. Try Groq
    if client:
        try:
            completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are a JSON-only response bot. You must respond with valid JSON and nothing else."},
                    {"role": "user", "content": prompt}
                ],
                model=GROQ_HEAVY_MODEL,
                temperature=0.1,
                max_tokens=2048,
                response_format={"type": "json_object"}
            )
            parsed_json = json.loads(completion.choices[0].message.content)
            return parsed_json
        except Exception as e:
            print(f"Error executing GitHub LLM analysis via Groq: {e}")

    # Build manual fallback from repos
    projects = []
    for r in raw_data.get("repos", []):
        techs = r.get("languages", [])
        if "Dockerfile" in r.get("config_files", []): techs.append("Docker")
        if "package.json" in r.get("config_files", []): techs.append("NodeJS")
        if "requirements.txt" in r.get("config_files", []): techs.append("Python")
        
        projects.append({
            "name": r["name"],
            "description": r.get("description", ""),
            "technologies": techs,
            "architecture": "MVC / Layered Pattern",
            "insights": "Extracted via repository metadata."
        })
    default_structure["projects"] = projects
    return default_structure
