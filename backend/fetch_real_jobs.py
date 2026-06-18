import urllib.request
import json
import sqlite3
import re
import os
import html

# Common tech skills to match
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
    """Remove HTML tags and unescape HTML entities."""
    if not raw_html:
        return ""
    clean_text = re.sub(r'<[^<]+?>', ' ', raw_html)
    return html.unescape(clean_text).strip()

def parse_work_mode(title, location, desc, workplace_type=None):
    """Infer work mode (Remote, Hybrid, Onsite)."""
    if workplace_type:
        wp_type = str(workplace_type).lower()
        if "remote" in wp_type:
            return "Remote"
        elif "hybrid" in wp_type:
            return "Hybrid"
        elif "onsite" in wp_type or "on-site" in wp_type:
            return "Onsite"
            
    text = (title + " " + location + " " + desc).lower()
    if "remote" in text or "work from home" in text:
        return "Remote"
    elif "hybrid" in text:
        return "Hybrid"
    else:
        return "Onsite"

def parse_experience(title, desc):
    """Find experience required from title and description."""
    title_lower = title.lower()
    if "junior" in title_lower or "associate" in title_lower:
        return "1-3 years"
    if "senior" in title_lower or "sr." in title_lower:
        return "5+ years"
    if "staff" in title_lower or "principal" in title_lower or "lead" in title_lower:
        return "8+ years"
        
    # Regex search in description
    matches = re.findall(r'(\d+[\s\-\+]*(?:\d+)?\s*years?)', desc.lower())
    if matches:
        return matches[0].strip()
        
    return "3+ years"

def parse_salary(desc, title):
    """Look for salary ranges in the description, or default to a realistic market standard."""
    # Look for patterns like $120,000 - $180,000 or $120k - $180k
    salary_patterns = [
        r'(\$[0-9]{3},[0-9]{3}\s*(?:-|to)\s*\$[0-9]{3},[0-9]{3})',
        r'(\$[0-9]{2,3}k\s*(?:-|to)\s*\$[0-9]{2,3}k)',
        r'(\$[0-9]{2,3},[0-9]{3}\s*(?:-|to)\s*\$[0-9]{2,3},[0-9]{3})'
    ]
    for pattern in salary_patterns:
        match = re.search(pattern, desc, re.IGNORECASE)
        if match:
            return match.group(1)
            
    # Default fallback based on seniority
    title_lower = title.lower()
    if "junior" in title_lower or "associate" in title_lower:
        return "$80,000 - $110,000"
    if "senior" in title_lower or "sr." in title_lower:
        return "$160,000 - $210,000"
    if "staff" in title_lower or "principal" in title_lower or "lead" in title_lower:
        return "$200,000 - $260,000"
        
    return "$120,000 - $160,000"

def extract_skills(title, desc):
    """Find tech stack keywords matching our list."""
    matched = []
    text = (title + " " + desc).lower()
    for skill in TECH_SKILLS:
        skill_lower = skill.lower()
        # Ensure whole word matching for short skills (e.g. Go, GCP)
        if len(skill) <= 3:
            pattern = rf'\b{re.escape(skill_lower)}\b'
            if re.search(pattern, text):
                matched.append(skill)
        else:
            if skill_lower in text:
                # Map Golang to Go if needed or keep both
                if skill == "Golang" and "Go" not in matched:
                    matched.append("Go")
                matched.append(skill)
                
    # Unique and sorted
    matched = list(set(matched))
    if not matched:
        matched = ["Git", "System Design", "Agile"]
    return matched

def fetch_greenhouse_jobs(company):
    print(f"Fetching Greenhouse jobs for: {company}...")
    jobs_list = []
    try:
        url = f'https://boards-api.greenhouse.io/v1/boards/{company}/jobs'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            jobs = data.get("jobs", [])
            
        dev_jobs = [j for j in jobs if any(kw in j.get('title', '').lower() for kw in ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist'])]
        
        # Limit to first 12 developer jobs to avoid hitting API rate limits or taking too long
        for j in dev_jobs[:12]:
            job_id = j['id']
            try:
                # Fetch detailed job description
                detail_url = f'https://boards-api.greenhouse.io/v1/boards/{company}/jobs/{job_id}?questions=true'
                req_det = urllib.request.Request(detail_url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req_det) as resp_det:
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
                    "description": desc[:3000],  # Truncate descriptions to save DB space
                    "source": f"{company.capitalize()} Careers",
                    "url": job_detail.get("absolute_url"),
                    "ats_type": "Greenhouse"
                })
                print(f"  Successfully fetched: {title} ({company})")
            except Exception as e:
                print(f"  Error fetching detail for Greenhouse job {job_id}: {e}")
    except Exception as e:
        print(f"Error fetching Greenhouse board for {company}: {e}")
    return jobs_list

def fetch_ashby_jobs(company):
    print(f"Fetching Ashby jobs for: {company}...")
    jobs_list = []
    try:
        url = f'https://api.ashbyhq.com/posting-api/job-board/{company}'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            jobs = data.get("jobs", [])
            
        dev_jobs = [j for j in jobs if any(kw in j.get('title', '').lower() for kw in ['engineer', 'developer', 'programmer', 'architect', 'tech lead', 'scientist'])]
        
        # Take up to 15 dev jobs
        for j in dev_jobs[:15]:
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
            print(f"  Successfully fetched: {title} ({company})")
    except Exception as e:
        print(f"Error fetching Ashby board for {company}: {e}")
    return jobs_list

def main():
    db_path = os.path.join(os.path.dirname(__file__), "interviews.db")
    print("Database target path:", db_path)
    
    # 1. Fetch real jobs from Greenhouse
    greenhouse_companies = ['vercel', 'figma', 'reddit', 'samsara']
    all_jobs = []
    for comp in greenhouse_companies:
        all_jobs.extend(fetch_greenhouse_jobs(comp))
        
    # 2. Fetch real jobs from Ashby
    ashby_companies = ['ramp', 'workos']
    for comp in ashby_companies:
        all_jobs.extend(fetch_ashby_jobs(comp))
        
    print(f"\nFetched total of {len(all_jobs)} real developer jobs.")
    
    if not all_jobs:
        print("No jobs fetched! Exiting without modifying database.")
        return
        
    # 3. Store into interviews.db
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check current jobs count
    cursor.execute("SELECT count(*) FROM jobs")
    old_count = cursor.fetchone()[0]
    print(f"Current jobs in database: {old_count}")
    
    # Clear existing jobs (and by cascade, applications - but they are fake)
    print("Clearing old jobs table...")
    cursor.execute("DELETE FROM jobs")
    
    # Insert new ones
    print("Inserting new real jobs...")
    inserted_count = 0
    for job in all_jobs:
        try:
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
            inserted_count += 1
        except Exception as e:
            print(f"  Failed to insert job: {job['title']} from {job['company']}: {e}")
            
    conn.commit()
    print(f"\nDone! Successfully updated database. Inserted {inserted_count} real jobs.")
    
    # Query database to confirm
    cursor.execute("SELECT count(*) FROM jobs")
    new_count = cursor.fetchone()[0]
    print(f"New jobs count in database: {new_count}")
    
    conn.close()

if __name__ == "__main__":
    main()
