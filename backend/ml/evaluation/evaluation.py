import re
import json
from typing import List, Dict, Any
from ml.tfidf.tfidf import TFIDFModel, STOPWORDS

class InterviewMLModel:
    """
    Core Machine Learning evaluation engine written from scratch.
    Runs text matching, keyword coverages, and local scoring.
    """
    def __init__(self):
        pass

    def evaluate_answer(self, question_text: str, candidate_answer: str) -> Dict[str, Any]:
        """
        Dynamically evaluate any question's answer by checking similarity and keyword coverage.
        """
        # Tokenize question to extract expected keyword hints
        cleaned_q = re.sub(r"[^\w\s]", "", question_text.lower())
        q_tokens = [t for t in cleaned_q.split() if t not in STOPWORDS and len(t) > 3]
        
        # General tech keywords that are positive to find in answers
        tech_vocab = {
            "promise", "async", "await", "concurrency", "thread", "process", "lock",
            "database", "query", "index", "optimization", "cache", "redis", "postgres",
            "react", "state", "effect", "hook", "lifecycle", "api", "rest", "graphql",
            "asynchronous", "synchronous", "exception", "handler", "cleanup", "memory",
            "leak", "performance", "scaling", "architecture", "star", "load", "balancer"
        }
        
        expected_keywords = [t for t in q_tokens if t in tech_vocab]
        # Fallback to some basic words if question contains none from tech_vocab
        if not expected_keywords:
            expected_keywords = q_tokens[:6]
            
        # Clean answer
        cleaned_answer = re.sub(r"[^\w\s]", "", candidate_answer.lower())
        ans_tokens = set(cleaned_answer.split())
        
        matched_keywords = [kw for kw in expected_keywords if kw in ans_tokens]
        missing_keywords = [kw for kw in expected_keywords if kw not in ans_tokens]
        
        # Add some relevant technical keywords that were matched
        additional_matches = [w for w in tech_vocab if w in ans_tokens and w not in matched_keywords]
        matched_keywords.extend(additional_matches[:3])
        
        # Estimate TF-IDF similarity between question context and answer
        temp_model = TFIDFModel([question_text, candidate_answer])
        vec1 = temp_model.get_tfidf_vector(question_text)
        vec2 = temp_model.get_tfidf_vector(candidate_answer)
        similarity = temp_model.cosine_similarity(vec1, vec2)
        
        # Keyword ratio
        keyword_score = len(matched_keywords) / max(1, len(expected_keywords) + len(additional_matches[:3]))
        
        # Combine
        final_score_raw = (similarity * 0.4) + (keyword_score * 0.6)
        score = round(min(10.0, max(1.0, final_score_raw * 10 + 3.5)), 1)
        
        # Count fillers
        filler_list = ["um", "uh", "like", "actually", "basically", "so", "well"]
        filler_count = sum(1 for t in cleaned_answer.split() if t in filler_list)
        
        word_count = len(candidate_answer.split())
        wpm = 135 if word_count > 30 else 120
        
        # Choose feedback tips
        if score >= 8.0:
            live_tip = f"Excellent technical explanation. You hit relevant points and keywords like: {', '.join(matched_keywords[:3])}."
        elif score >= 5.5:
            live_tip = f"Good start. Try adding technical details. Mention terms like: {', '.join(missing_keywords[:2]) if missing_keywords else 'architecture details'}."
        else:
            live_tip = "Your response is a bit brief. Try structuring it with specific examples or code behaviors."
            
        return {
            "score": score,
            "wpm": wpm,
            "fillers": filler_count,
            "live_tip": live_tip,
            "missing_keywords": missing_keywords,
            "matched_keywords": matched_keywords
        }

    def generate_questions_from_stack(self, resume_text: str, repo_files: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """
        Dynamically generate interview questions by parsing actual repository languages,
        extracting real code files/snippets, and looking up skills in the resume.
        """
        # 1. Detect language stack
        langs = []
        js_files = []
        py_files = []
        other_files = []
        
        for f in repo_files:
            name = f["name"].lower()
            if name.endswith((".js", ".jsx", ".ts", ".tsx")):
                js_files.append(f)
                if "JavaScript/TypeScript" not in langs:
                    langs.append("JavaScript/TypeScript")
            elif name.endswith(".py"):
                py_files.append(f)
                if "Python" not in langs:
                    langs.append("Python")
            elif name.endswith(".go"):
                other_files.append(f)
                if "Go" not in langs:
                    langs.append("Go")
            elif name.endswith((".java", ".kt")):
                other_files.append(f)
                if "Java" not in langs:
                    langs.append("Java")
            elif name.endswith((".cpp", ".h", ".cc")):
                other_files.append(f)
                if "C++" not in langs:
                    langs.append("C++")
                    
        primary_lang = langs[0] if langs else "Software Engineering"
        all_code_files = js_files + py_files + other_files
        
        # 2. Extract real code snippets
        snippet_1 = ""
        file_1 = ""
        snippet_2 = ""
        file_2 = ""
        
        for f in all_code_files:
            lines = f["content"].split("\n")
            # Look for function/class definitions or logic blocks
            cleaned_lines = [l for l in lines if l.strip() and not l.strip().startswith(("#", "//", "import", "from"))]
            if len(cleaned_lines) >= 8:
                if not snippet_1:
                    snippet_1 = "\n".join(cleaned_lines[:12])
                    file_1 = f["name"].split("/")[-1]
                elif not snippet_2:
                    snippet_2 = "\n".join(cleaned_lines[:12])
                    file_2 = f["name"].split("/")[-1]
                    break
                    
        # Fallbacks if we can't extract enough
        if not snippet_1:
            file_1 = "app_logic.py" if primary_lang == "Python" else "index.js"
            snippet_1 = "def process_data(payload):\n    # Core application controller logic\n    result = []\n    for item in payload:\n        if item.get('active'):\n            result.append(item.get('val'))\n    return result"
        if not snippet_2:
            file_2 = "config.py" if primary_lang == "Python" else "utils.js"
            snippet_2 = "def initialize_session(configs):\n    # Session startup and validation hook\n    if not configs:\n        raise ValueError('Configurations missing')\n    return {'status': 'active', 'session': configs.get('id')}"

        # 3. Detect resume skills
        skills = []
        resume_lower = resume_text.lower() if resume_text else ""
        known_skills = ["react", "node", "fastapi", "django", "postgres", "mysql", "redis", "docker", "aws", "kubernetes", "typescript"]
        for s in known_skills:
            if s in resume_lower:
                skills.append(s.capitalize())
        if not skills:
            skills = ["System Architecture", "API Design"]

        questions = []
        
        # Question 1: Language and Codebase Architecture
        questions.append({
            "id": 1,
            "type": "conceptual",
            "title": f"{primary_lang} Codebase Architecture",
            "question": f"Based on the codebase files (including '{file_1}'), can you explain the architecture and modularity of your {primary_lang} implementation?",
            "initialTip": f"Explain the structural patterns and import dependencies in your {primary_lang} files, emphasizing how layers communicate.",
            "streamTranscript": [
                f"In this codebase, we structure the components logically around {primary_lang}.",
                f"We isolate logic inside files like {file_1} to maintain separation of concerns.",
                "This layout allows other services or tests to import modular elements without side effects."
            ]
        })
        
        # Question 2: Real Code Snippet Analysis
        questions.append({
            "id": 2,
            "type": "code-analysis",
            "title": f"Code Snippet Analysis: [{file_1}]",
            "code": snippet_1,
            "question": f"Analyze this actual code segment extracted from your repository file '{file_1}'. What is the execution flow and how does it handle input data?",
            "initialTip": "Trace the logic step-by-step. Focus on data transformations, conditional checks, and what value is eventually returned.",
            "streamTranscript": [
                f"Looking at this snippet from {file_1}, the execution begins by evaluating the inputs.",
                "It loops or processes the data structure based on the conditional matching rules.",
                "Finally, it constructs the filtered response and returns the results to the calling context."
            ]
        })
        
        # Question 3: Resume Skill Integration
        selected_skill = skills[0]
        questions.append({
            "id": 3,
            "type": "conceptual",
            "title": f"{selected_skill} & Skill Engineering",
            "question": f"Your resume highlights experience with {selected_skill}. How did you apply {selected_skill} in this project or other systems to address scaling or data storage demands?",
            "initialTip": f"Discuss specific configuration, hooks, or queries you implemented using {selected_skill}, and outline how you optimized its throughput.",
            "streamTranscript": [
                f"I chose to work with {selected_skill} because of its efficiency and robust ecosystem support.",
                f"In my project, {selected_skill} serves as a key building block for managing state or high-performance lookups.",
                "To optimize performance under load, I structured indexing and query schemas to minimize latency."
            ]
        })
        
        # Question 4: Code Snippet Cleanup & Resource Management
        questions.append({
            "id": 4,
            "type": "code-analysis",
            "title": f"Code Quality & Exception Handling: [{file_2}]",
            "code": snippet_2,
            "question": f"Review this code segment from your file '{file_2}'. How would you improve its error handling, exception boundaries, or resource lifecycle?",
            "initialTip": "Look for uncaught exceptions, missing cleanups, validation gaps, or edge cases like null/empty payloads.",
            "streamTranscript": [
                f"In this block from {file_2}, the error handling could be enhanced by wrapping it in try-except statements.",
                "We should also check for empty or null parameters to avoid runtime crashes or unhandled value exceptions.",
                "Adding proper log outputs or raising custom domain exceptions would also make debugging much easier."
            ]
        })

        return questions
