import os
import json
import requests
from typing import Dict, Any, List, Optional
from groq import Groq
from voice_copilot import db
from config import GROQ_HEAVY_MODEL, GROQ_LIGHT_MODEL

# Initialize API credentials
sarvam_api_key = os.environ.get("SARVAM_API_KEY")
groq_api_key = os.environ.get("GROQ_API_KEY")
openai_api_key = os.environ.get("OPENAI_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None


def call_llm(messages: List[Dict[str, str]], temperature: float = 0.7, max_tokens: int = 450, json_mode: bool = False) -> Optional[str]:
    """
    Unified multi-provider LLM caller with Sarvam AI 105B, Groq, and OpenAI fallbacks.
    """
    # 1. Primary Provider: Sarvam AI 105B Conversations
    if sarvam_api_key:
        try:
            payload = {
                "model": "sarvam-105b-conversations",
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            
            resp = requests.post(
                "https://api.sarvam.ai/v1/chat/completions",
                headers={
                    "api-subscription-key": sarvam_api_key,
                    "Content-Type": "application/json"
                },
                json=payload,
                timeout=18
            )
            if resp.status_code == 200:
                res_data = resp.json()
                if "choices" in res_data and len(res_data["choices"]) > 0:
                    text = res_data["choices"][0]["message"]["content"].strip()
                    if text:
                        return text
            else:
                print(f"Sarvam LLM returned status {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"Sarvam LLM error: {e}")

    # 2. Secondary Provider: Groq API
    if client:
        try:
            kwargs = {
                "messages": messages,
                "model": GROQ_LIGHT_MODEL if json_mode else GROQ_HEAVY_MODEL,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            completion = client.chat.completions.create(**kwargs)
            text = completion.choices[0].message.content.strip()
            if text:
                return text
        except Exception as e:
            print(f"Groq LLM error: {e}")

    # 3. Tertiary Provider: OpenAI API
    if openai_api_key:
        try:
            headers = {
                "Authorization": f"Bearer {openai_api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4o-mini",
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
            resp = requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=15)
            if resp.status_code == 200:
                text = resp.json()["choices"][0]["message"]["content"].strip()
                if text:
                    return text
        except Exception as e:
            print(f"OpenAI LLM error: {e}")

    return None


class InterviewAgent:
    """
    Main Interview Copilot Agent. Manages persona-specific behavior,
    project-specific grilling, real-time hidden evaluations, and
    post-interview comprehensive scoring.
    """
    def __init__(self, session_id: int):
        self.session_id = session_id
        self.session = db.get_voice_session(session_id)
        if not self.session:
            raise ValueError(f"Session ID {session_id} not found in database.")
            
        self.role = self.session.get("role", "Software Engineer")
        self.mode = self.session.get("interview_mode", "Mid-Level")
        self.language = self.session.get("language", "en-IN")
        
        lang_names = {
            "en-IN": "English (Indian Accent)",
            "hi-IN": "Hindi (हिन्दी)",
            "ta-IN": "Tamil (தமிழ்)",
            "te-IN": "Telugu (తెలుగు)",
            "kn-IN": "Kannada (ಕನ್ನಡ)",
            "ml-IN": "Malayalam (മലയാളം)",
            "mr-IN": "Marathi (मराठी)",
            "gu-IN": "Gujarati (ગુજરાતી)",
            "bn-IN": "Bengali (বাংলা)",
            "pa-IN": "Punjabi (ਪੰਜਾਬੀ)",
            "od-IN": "Odia (ଓଡ଼ିଆ)"
        }
        self.language_name = lang_names.get(self.language, "English")
        
        # Load candidate profile details
        profile = self.session.get("profile_summary") or {}
        self.resume_info = profile.get("resume", {})
        self.github_info = profile.get("github", {})
        self.linkedin_info = profile.get("linkedin", {})

    def get_system_prompt(self, followup_dir: str = None) -> str:
        """
        Dynamically construct the system prompt based on the interview mode,
        candidate profile, and the next suggested followup direction.
        """
        persona_instructions = {
            "Junior": (
                "Conduct a structured technical interview for a Junior role. "
                "Probe data structures, language fundamentals, error handling, and clean code hygiene."
            ),
            "Mid-Level": (
                "Conduct a rigorous technical interview for a Mid-Level role. "
                "Focus on API design, concurrency, database indexing, caching strategies, and unit/integration testing."
            ),
            "Senior": (
                "Conduct a high-caliber technical interview for a Senior Developer role. "
                "Focus on distributed systems design, data consistency, caching invalidation, failure modes, and performance bottlenecks."
            ),
            "Staff Engineer": (
                "Conduct an executive-tier systems architecture screening for a Staff Engineer. "
                "Focus on multi-region reliability, distributed transaction guarantees, zero-downtime migrations, and technical trade-offs."
            ),
            "Bar Raiser": (
                "Act as a critical, high-pressure Bar Raiser from a FAANG-tier company. "
                "Deeply stress-test every architectural decision. Challenge assumptions, probe edge cases, and call out vague statements."
            )
        }
        
        mode_instruction = persona_instructions.get(self.mode, persona_instructions["Mid-Level"])
        
        candidate_context = f"""
        # Candidate Profile
        - Target Role: {self.role}
        - Interview Seniority: {self.mode}
        
        ## Resume Context
        - Skills: {self.resume_info.get('skills', [])}
        - Technologies: {self.resume_info.get('technologies', [])}
        - Key Projects: {self.resume_info.get('projects', [])}
        
        ## GitHub Repositories
        - Architecture: {self.github_info.get('overall_architecture', 'MVC')}
        - Languages: {self.github_info.get('languages_summary', [])}
        - Projects: {self.github_info.get('projects', [])}
        """

        followup_instruction = ""
        if followup_dir:
            followup_instruction = f"\n**Suggested Technical Direction**: Focus on testing: '{followup_dir}'."

        system_prompt = f"""You are a Principal / Staff Technical Interviewer at a top-tier tech company (Google/Meta/Stripe).
Your persona: {mode_instruction}

{candidate_context}

# Core Interview Directives:
1. **Never ask shallow or generic questions.** Every question MUST be substantive, intellectually rigorous, and directly test real-world systems architecture, edge cases, and engineering trade-offs.
2. **Deeply anchor on the candidate's last answer**:
   - Critically evaluate what the candidate just answered.
   - Challenge their architectural assumptions, failure modes, race conditions, scaling bottlenecks, and consistency guarantees.
   - For example, if they mention Redis, ask how they handle cache stampedes, eviction policies, or replication lag. If they mention WebSockets, probe connection pooling, backpressure, and load balancing across worker nodes.
3. **Ask exactly ONE question per turn**:
   - Frame your question in 2 to 3 concise, natural spoken sentences.
   - Do NOT use markdown bolding (**), asterisks, bullet points, numbered lists, or code blocks, as your output is spoken directly via Text-To-Speech.
4. **Adaptive Grilling**: Steer into their technical choices, scrutinize their trade-offs, and test the depth of their engineering craft.{followup_instruction}
5. **Language**: You MUST conduct the interview and ask your question ONLY in **{self.language_name}**.
6. **Professional Tone**: Maintain an engaging, respectful, high-standards peer-level engineering dialogue.
"""
        return system_prompt

    def generate_next_turn(self) -> str:
        """
        Loads the message history, calls the LLM, and retrieves the next question.
        Uses Sarvam AI 105B, Groq, or OpenAI, with smart answer-aware fallbacks.
        """
        db_messages = db.get_voice_messages(self.session_id)
        turn_index = len([m for m in db_messages if m["role"] == "assistant"])

        # If 5 questions have already been asked, conclude the interview
        if turn_index >= 5:
            conclusion_prompt = [
                {"role": "system", "content": f"You are a professional technical interviewer. The technical screening has concluded. Write a natural, polite 1-2 sentence statement thanking the candidate, stating the interview is complete, and that their evaluation scorecard is being generated. You MUST speak purely in **{self.language_name}** without bullet points."},
                {"role": "user", "content": "Generate the conclusion statement."}
            ]
            res = call_llm(conclusion_prompt, temperature=0.6, max_tokens=150)
            if res:
                return res
            
            conclusions = {
                "en-IN": "Thank you! That concludes our technical screening. I will now analyze your responses and prepare your comprehensive scorecard.",
                "hi-IN": "धन्यवाद! यह हमारी तकनीकी स्क्रीनिंग को पूरा करता है। अब मैं आपके उत्तरों का विश्लेषण करूँगा और आपका स्कोरकार्ड तैयार करूँगा।",
                "ta-IN": "நன்றி! இது எங்கள் தொழில்நுட்ப திரையிடலை நிறைவு செய்கிறது. நான் இப்போது உங்கள் செயல்திறனை பகுப்பாய்வு செய்து உங்கள் மதிப்பெண் அட்டையை தயார் செய்வேன்.",
                "te-IN": "ధన్యవాదాలు! ఇది మా సాంకేతిక స్క్రీనింగ్‌ను పూర్తి చేస్తుంది. నేను ఇప్పుడు మీ పనితీరును విశ్లేషించి, మీ స్కోర్‌కార్డ్‌ను సిద్ధం చేస్తాను.",
                "kn-IN": "ಧನ್ಯವಾದಗಳು! ಇದು ನಮ್ಮ ತಾಂತ್ರಿಕ ಸ್ಕ್ರೀನಿಂಗ್ ಅನ್ನು ಪೂರ್ಣಗೊಳಿಸುತ್ತದೆ. ನಾನು ಈಗ ನಿಮ್ಮ ಕಾರ್ಯಕ್ಷಮತೆಯನ್ನು ವಿಶ್ಲೇಷಿಸುತ್ತೇನೆ ಮತ್ತು ನಿಮ್ಮ ಸ್ಕೋರ್ಕಾರ್ಡ್ ಅನ್ನು ಸಿದ್ಧಪಡಿಸುತ್ತೇನೆ.",
                "ml-IN": "നന്ദി! ഇതോടെ നമ്മുടെ സാങ്കേതിക അഭിമുഖം അവസാനിച്ചിരിക്കുന്നു. ഞാൻ ഇപ്പോൾ നിങ്ങളുടെ പ്രകടനം വിലയിരുത്തി സ്കോർകാർഡ് തയ്യാറാക്കുന്നതാണ്.",
                "mr-IN": "धन्यवाद! हे आमचे तांत्रिक स्क्रीनिंग पूर्ण करते. मी आता तुमच्या कामगिरीचे विश्लेषण करेन आणि तुमचे स्कोरकार्ड तयार करेन.",
                "gu-IN": "આભાર! આ સાથે આપણું ટેકનિકલ સ્ક્રીનિંગ પૂર્ણ થાય છે. હું હવે તમારા પ્રદર્શનનું વિશ્લેષણ કરીશ અને તમારું સ્કોરકાર્ડ તૈયાર કરીશ.",
                "bn-IN": "ধন্যবাদ! এর সাথেই আমাদের টেকনিক্যাল স্ক্রিনিং সমাপ্ত হলো। আমি এখন আপনার পারফরম্যান্স বিশ্লেষণ করব এবং আপনার স্কোরকার্ড প্রস্তুত করব।",
                "pa-IN": "ਧੰਨਵਾਦ! ਇਹ ਸਾਡੀ ਤਕਨੀਕੀ ਸਕ੍ਰੀਨਿੰਗ ਨੂੰ ਪੂਰਾ ਕਰਦਾ ਹੈ। ਮੈਂ ਹੁਣ ਤੁਹਾਡੇ ਪ੍ਰਦਰਸ਼ਨ ਦਾ ਵਿਸ਼ਲੇਸ਼ਣ ਕਰਾਂਗਾ ਅਤੇ ਤੁਹਾਡਾ ਸਕੋਰਕਾਰਡ ਤਿਆਰ ਕਰਾਂਗਾ।",
                "od-IN": "ଧନ୍ୟବାଦ! ଏହା ଆମର ବୈଷୟିକ ସ୍କ୍ରିନିଂକୁ ସମାପ୍ତ କରେ। ମୁଁ ଏବେ ଆପଣଙ୍କ ପ୍ରଦର୍ଶନର ବିଶ୍ଳେଷଣ କରି ଆପଣଙ୍କ ସ୍କୋରକାର୍ଡ ପ୍ରସ୍ତୁତ କରିବି।"
            }
            return conclusions.get(self.language, conclusions["en-IN"])

        # Build prompt history from database
        messages = []
        
        # Find latest hidden evaluation direction to steer the next question
        latest_followup = None
        last_user_answer = ""
        for msg in reversed(db_messages):
            if msg["role"] == "user":
                if not last_user_answer:
                    last_user_answer = msg.get("content", "")
                if msg.get("evaluation"):
                    latest_followup = msg["evaluation"].get("followup_direction")
                    break
                    
        # Inject system prompt
        messages.append({"role": "system", "content": self.get_system_prompt(latest_followup)})
        
        for msg in db_messages:
            messages.append({"role": msg["role"], "content": msg["content"]})
            
        # Call LLM (Sarvam 105B / Groq / OpenAI)
        response = call_llm(messages, temperature=0.75, max_tokens=350)
        if response:
            return response

        # Adaptive Contextual Fallback based on candidate's real answer and projects
        return self._generate_adaptive_fallback(turn_index, last_user_answer)

    def _generate_adaptive_fallback(self, turn_index: int, last_answer: str) -> str:
        """
        Generates rich, context-aware technical grilling questions if LLM APIs are offline.
        """
        projects = self.github_info.get('projects') or []
        proj_names = [p.get('name') for p in projects if p.get('name')]
        proj_1 = proj_names[0] if len(proj_names) > 0 else "your primary system"
        skills = self.resume_info.get('skills') or ["FastAPI", "PostgreSQL", "Redis"]
        ans_lower = last_answer.lower() if last_answer else ""

        # Dynamic question anchored directly on candidate's answer keywords
        if any(k in ans_lower for k in ["redis", "cache", "caching", "ttl", "invalidation"]):
            return "You mentioned implementing caching. How do you handle cache invalidation across distributed nodes, and what specific strategy prevents cache stampedes during sudden traffic spikes?"
        
        if any(k in ans_lower for k in ["postgres", "sql", "database", "query", "schema", "table"]):
            return "Regarding your database choices: how do you structure your database indexing for high-frequency queries, and how do you ensure zero-downtime schema migrations under live production writes?"
        
        if any(k in ans_lower for k in ["websocket", "socket", "real-time", "pubsub", "pub/sub", "async"]):
            return "Following up on your real-time architecture: how do you detect and clean up zombie connections when a client drops abruptly without sending a TCP disconnect packet?"
        
        if any(k in ans_lower for k in ["concurrency", "lock", "locking", "mutex", "thread", "race"]):
            return "You touched on concurrency handling. Did you choose optimistic or pessimistic locking, and how does your architecture prevent distributed deadlocks under high contention?"

        if any(k in ans_lower for k in ["auth", "jwt", "token", "security", "permission"]):
            return "Let's explore your authentication layer. How do you handle stateless JWT token revocation, and how do you mitigate timing attacks during credential verification?"

        # Turn-based fallback
        fallbacks = [
            f"Welcome to your technical screening for the {self.role} position. To start, walk me through the high-level architecture of '{proj_1}'. Why did you choose this architecture, and what were the primary scaling trade-offs?",
            f"Let's dive into data integrity. In your system, how do you handle concurrent state mutations, and what happens if a downstream dependency fails during an in-flight write operation?",
            f"I noticed you use {skills[0] if skills else 'distributed services'}. How would you design a distributed rate limiter for this system to throttle abusers while preventing false positives for bursty traffic?",
            "Imagine your main database schema needs to support a live migration to a new storage format without taking the system offline. Walk me through the step-by-step rollout strategy.",
            "For the final systems question: how would you architect this infrastructure to handle a sudden 10x traffic spike with zero message loss and graceful degradation under partial outages?"
        ]
        return fallbacks[min(turn_index, len(fallbacks) - 1)]

    def run_hidden_evaluation(self, question: str, candidate_answer: str) -> Dict[str, Any]:
        """
        Evaluates the candidate's answer silently across 5 technical metrics
        and determines the next followup direction.
        """
        default_evaluation = {
            "technical_depth": 5.0,
            "communication": 5.0,
            "confidence": 5.0,
            "ownership": 5.0,
            "system_design": 5.0,
            "followup_direction": "backend"
        }
        
        prompt = f"""
        You are a silent FAANG-level interviewer. Evaluate the candidate's response to the interviewer's question.
        
        Interviewer's Question:
        "{question}"
        
        Candidate's Answer:
        "{candidate_answer}"
        
        Evaluate the answer across these metrics (0 to 10 scale):
        1. technical_depth: correctness, depth of explanation, specific library/systems details.
        2. communication: clarity, structure, pacing.
        3. confidence: assertiveness, lack of hesitation.
        4. ownership: understanding of why choices were made in their projects.
        5. system_design: architectural awareness and trade-off justification.
        
        Determine the next `followup_direction` based on where the candidate was weakest or what naturally follows:
        "backend" | "architecture" | "debugging" | "scalability"
        
        Return EXACTLY a JSON object matching this structure:
        {{
            "technical_depth": <float 0-10>,
            "communication": <float 0-10>,
            "confidence": <float 0-10>,
            "ownership": <float 0-10>,
            "system_design": <float 0-10>,
            "followup_direction": "backend|architecture|debugging|scalability"
        }}
        
        Output ONLY valid JSON. Return nothing else.
        """
        
        try:
            res = call_llm([{"role": "user", "content": prompt}], temperature=0.2, max_tokens=300, json_mode=True)
            if res:
                # Extract json object safely if markdown code fences exist
                json_str = res
                if "```json" in json_str:
                    json_str = json_str.split("```json")[1].split("```")[0].strip()
                elif "```" in json_str:
                    json_str = json_str.split("```")[1].split("```")[0].strip()
                return json.loads(json_str)
        except Exception as e:
            print(f"Error running hidden evaluation: {e}")
            
        return default_evaluation

    def generate_post_interview_scorecard(self) -> Dict[str, Any]:
        """
        Reviews the full interview history, aggregates evaluations,
        and generates a detailed candidate report.
        """
        db_messages = db.get_voice_messages(self.session_id)
        
        # Compile transcript
        transcript = []
        evals = []
        for m in db_messages:
            role_label = "Interviewer" if m["role"] == "assistant" else "Candidate"
            transcript.append(f"{role_label}: {m['content']}")
            if m.get("evaluation"):
                evals.append(m["evaluation"])
                
        full_transcript_text = "\n".join(transcript)
        
        # Calculate base average scores from hidden evaluations
        scores = {
            "technical_depth": 0.0,
            "communication": 0.0,
            "problem_solving": 0.0,
            "system_design": 0.0,
            "ownership": 0.0
        }
        
        if evals:
            scores["technical_depth"] = round(sum(e.get("technical_depth", 0.0) for e in evals) / len(evals), 1)
            scores["communication"] = round(sum(e.get("communication", 0.0) for e in evals) / len(evals), 1)
            scores["system_design"] = round(sum(e.get("system_design", 0.0) for e in evals) / len(evals), 1)
            scores["ownership"] = round(sum(e.get("ownership", 0.0) for e in evals) / len(evals), 1)
            scores["problem_solving"] = round((scores["technical_depth"] + scores["system_design"]) / 2, 1)
        else:
            scores = {"technical_depth": 5.0, "communication": 5.0, "problem_solving": 5.0, "system_design": 5.0, "ownership": 5.0}

        default_scorecard = {
            "scores": scores,
            "overall_rating": round(sum(scores.values()) / len(scores), 1),
            "strengths": ["Clear communication style", "Familiarity with modern stacks"],
            "weaknesses": ["Could expand more on distributed failure modes"],
            "missed_concepts": ["Load balancing, rate limiting"],
            "learning_resources": ["Read 'Designing Data-Intensive Applications' Chapter 3"],
            "hiring_recommendation": "Hire"
        }
        
        prompt = f"""
        You are a Senior Bar Raiser and Hiring Committee Lead.
        Review the full transcript of this technical mock interview for the role of "{self.role}" at a "{self.mode}" seniority.
        
        Interview Transcript:
        {full_transcript_text[:16000]}
        
        Hidden Evaluations averages:
        {json.dumps(scores)}
        
        Generate a comprehensive, post-interview performance scorecard.
        Output EXACTLY the following JSON schema:
        {{
            "scores": {{
                "technical_depth": <float 0-10>,
                "communication": <float 0-10>,
                "problem_solving": <float 0-10>,
                "system_design": <float 0-10>,
                "ownership": <float 0-10>
            }},
            "overall_rating": <float 0-10>,
            "strengths": ["detailed strength 1", "detailed strength 2"],
            "weaknesses": ["detailed weakness 1", "detailed weakness 2"],
            "missed_concepts": ["concept 1 they failed to mention or got wrong", "concept 2"],
            "learning_resources": ["resource 1 with short description", "resource 2"],
            "hiring_recommendation": "Strong Hire | Hire | Leaning No | No Hire"
        }}
        
        Output ONLY valid JSON. Return nothing else.
        """
        
        try:
            res = call_llm([{"role": "user", "content": prompt}], temperature=0.2, max_tokens=600, json_mode=True)
            if res:
                json_str = res
                if "```json" in json_str:
                    json_str = json_str.split("```json")[1].split("```")[0].strip()
                elif "```" in json_str:
                    json_str = json_str.split("```")[1].split("```")[0].strip()
                return json.loads(json_str)
        except Exception as e:
            print(f"Error generating post interview scorecard: {e}")
            
        return default_scorecard
