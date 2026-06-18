import os
import json
from typing import Dict, Any, List, Tuple
from groq import Groq
from voice_copilot import db

# Initialize Groq client
groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None

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
        # Seniority Persona Instructions
        persona_instructions = {
            "Junior": (
                "Conduct a friendly but structured interview for a Junior role. "
                "Focus on core programming fundamentals, syntax, basic problem-solving, "
                "language specifics, and basic tool operations. Explain terms if they get stuck."
            ),
            "Mid-Level": (
                "Conduct a standard technical interview for a Mid-Level role. "
                "Focus on API design, concurrency, testing, relational databases, choice of libraries, "
                "and standard engineering practices. Expect clean modular structure."
            ),
            "Senior": (
                "Conduct a rigorous interview for a Senior Developer role. "
                "Focus on system design, database indexing, caching strategies, architectural patterns, "
                "performance optimization, profiling, and complex technical tradeoffs."
            ),
            "Staff Engineer": (
                "Conduct a highly strategic technical screening for a Staff Engineer. "
                "Focus on distributed systems design, multi-region failovers, high availability, "
                "technical leadership, cross-team engineering strategy, and legacy migration risks."
            ),
            "Bar Raiser": (
                "Act as a critical, high-pressure Bar Raiser from a FAANG-tier company. "
                "Do not sugarcoat comments. Deeply stress-test the candidate's implementation details. "
                "Challenge their assumptions, ask about micro-architectural trade-offs, edge-case system failures, "
                "scalability bottlenecks, and disaster recovery processes. If they give a vague answer, call it out."
            )
        }
        
        mode_instruction = persona_instructions.get(self.mode, persona_instructions["Mid-Level"])
        
        # Inject profile context
        candidate_context = f"""
        # Candidate Profile
        - Target Role: {self.role}
        - Interview Seniority Mode: {self.mode}
        
        ## Resume Context
        - Skills: {self.resume_info.get('skills', [])}
        - Technologies: {self.resume_info.get('technologies', [])}
        - Key Projects: {self.resume_info.get('projects', [])}
        
        ## LinkedIn Context
        - Headline: {self.linkedin_info.get('headline', '')}
        - Key Experience: {self.linkedin_info.get('experience', [])}
        
        ## GitHub Repositories (Critical Context - Ask specific code questions!)
        - overall_architecture: {self.github_info.get('overall_architecture', 'MVC')}
        - languages: {self.github_info.get('languages_summary', [])}
        - projects: {self.github_info.get('projects', [])}
        """

        # Dynamic directing
        followup_instruction = ""
        if followup_dir:
            followup_instruction = f"\n**Suggested Focus**: The evaluation suggests focusing on '{followup_dir}'. Ask a question testing this dimension."

        system_prompt = f"""You are an elite, AI-powered Technical Interviewer conducting a live, stateful voice-based mock interview.
Your persona: {mode_instruction}

{candidate_context}

# Strict Interaction Rules
1. **Ask exactly ONE question at a time**. Keep questions concise so they are easy to listen to.
2. **Be conversational and natural**: Candidate will hear your voice via TTS, so avoid bullet points, heavy markdown blocks, or code blocks in your speech text. Write purely conversational text.
3. **Be GitHub-Aware**: You must generate project-specific questions referencing the candidate's actual repositories. Look at the GitHub projects provided. Ask why they chose certain databases, libraries, or architectures (e.g. "I noticed you used Redis in repository X. Why Redis instead of PostgreSQL caching?").
4. **Adaptive Interviewing**: Guide the interview based on previous answers. Check the history and follow up on weak points.{followup_instruction}
5. **Interview Flow**: Start directly with a brief welcome and your first technical question. Do not outline the whole interview.
6. **No scorecard in chat**: Do not output any final ratings or scorecards in this conversation. The evaluation is handled silently behind the scenes.
"""
        return system_prompt

    def generate_next_turn(self) -> str:
        """
        Loads the message history, calls the LLM, and retrieves the next question.
        If the LLM client is offline, generates dynamic, highly contextual fallback questions.
        """
        db_messages = db.get_voice_messages(self.session_id)
        turn_index = len([m for m in db_messages if m["role"] == "assistant"])

        if not client:
            # High-fidelity mock question generator based on candidate profile info
            projects = self.github_info.get('projects') or []
            skills = self.resume_info.get('skills') or []
            languages = self.github_info.get('languages_summary') or []

            # Clean list of projects safely
            proj_names = [p.get('name') for p in projects if p.get('name')]
            proj_1 = proj_names[0] if len(proj_names) > 0 else "your main project"
            proj_2 = proj_names[1] if len(proj_names) > 1 else (proj_names[0] if len(proj_names) > 0 else "your primary system")
            primary_lang = languages[0] if languages else (skills[0] if skills else "Python")
            
            # Formulate structured questions
            fallback_questions = [
                # Turn 0: Intro & Project Architecture
                f"Welcome to your technical screening for the {self.role} position. To start, could you walk me through the architecture of your repository '{proj_1}' if you have one, or explain how you structured your main project? Why did you choose {primary_lang} as the primary language?",
                # Turn 1: Specific Coding & Concurrency
                f"In your repository '{proj_2}' (or your other key projects), how did you handle data mutations and resource concurrency? If you were to write automated test suites for your main files, what specific edge cases would you mock out?",
                # Turn 2: Database and State management
                f"Let's dive into data state. I noticed you list {', '.join(skills[:3])} in your profile. How would you design a caching layer for a high-throughput endpoint in this tech stack to avoid hitting database bottlenecks? What write-through or write-back policies would you choose?",
                # Turn 3: Refactoring and Coding Scenario
                f"Imagine a scenario where your main database schema needs to support a live migration from relational storage to document storage without bringing the system down. Walk me through the refactoring steps you'd implement in your codebase to handle both formats concurrently.",
                # Turn 4: Final System Design / Bottlenecks
                f"For the final technical question: how would you structure the system to handle a sudden 10x spike in API traffic? Explain how you would decouple your services using message queues or pub-sub architectures."
            ]

            # Return question based on current turn index
            q_idx = min(turn_index, len(fallback_questions) - 1)
            return fallback_questions[q_idx]

        # Retrieve messages
        db_messages = db.get_voice_messages(self.session_id)
        
        # Build prompt history
        messages = []
        
        # Find latest hidden evaluation direction to steer the next question
        latest_followup = None
        for msg in reversed(db_messages):
            if msg["role"] == "user" and msg.get("evaluation"):
                latest_followup = msg["evaluation"].get("followup_direction")
                break
                
        # Inject system prompt
        messages.append({"role": "system", "content": self.get_system_prompt(latest_followup)})
        
        for msg in db_messages:
            messages.append({"role": msg["role"], "content": msg["content"]})
            
        try:
            completion = client.chat.completions.create(
                messages=messages,
                model="llama-3.3-70b-versatile",
                temperature=0.8,
                max_tokens=600
            )
            response = completion.choices[0].message.content.strip()
            return response
        except Exception as e:
            print(f"Error generating next turn: {e}")
            fallback_errs = [
                f"Let's discuss coding logic. In your project '{self.github_info.get('projects', [{}])[0].get('name', 'main repo')}', how did you handle asynchronous state propagation? Walk me through the specific logic.",
                "Let's discuss caching and system designs. How would you handle a sudden 10x traffic increase?"
            ]
            return fallback_errs[min(turn_index, len(fallback_errs) - 1)]

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
        
        if not client:
            return default_evaluation
            
        prompt = f"""
        You are a silent FAANG-level interviewer. Evaluate the candidate's response to the interviewer's question.
        
        Interviewer's Question:
        "{question}"
        
        Candidate's Answer:
        "{candidate_answer}"
        
        Evaluate the answer across these metrics (0 to 10 scale):
        1. technical_depth: correctness, depth of explanation, specific library details.
        2. communication: clarity, structure, pacing.
        3. confidence: assertiveness, lack of hesitation.
        4. ownership: understanding of why choices were made in their projects.
        5. system_design: architectural awareness.
        
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
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.1-8b-instant",
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            evaluation = json.loads(completion.choices[0].message.content)
            return evaluation
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
            # Problem solving is inferred from depth and design
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
        
        if not client:
            return default_scorecard
            
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
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model="llama-3.3-70b-versatile",
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            scorecard = json.loads(completion.choices[0].message.content)
            return scorecard
        except Exception as e:
            print(f"Error generating post interview scorecard: {e}")
            return default_scorecard
