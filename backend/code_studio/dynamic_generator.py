"""
Candidate-Tailored Problem Generator for PrepAI Code Studio
Extracts candidate's GitHub repositories and resume skills to dynamically synthesize
bespoke real-world coding challenges using Groq LLaMA-3.3-70B.
"""

import os
import json
import uuid
from typing import Dict, Any, List
from groq import Groq
from config import GROQ_HEAVY_MODEL

groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None


def generate_candidate_tailored_problem(
    github_info: Dict[str, Any],
    resume_skills: List[str],
    difficulty: str = "Medium",
    target_language: str = "python"
) -> Dict[str, Any]:
    """
    Synthesizes a realistic coding challenge inspired by candidate's actual projects.
    """
    projects = github_info.get("projects", [])
    proj_names = [p.get("name") for p in projects if p.get("name")]
    primary_proj = proj_names[0] if proj_names else "Distributed Service / API"
    
    languages = github_info.get("languages_summary", [])
    skills_str = ", ".join(resume_skills[:5]) if resume_skills else "Python, APIs, Caching, Databases"

    if client:
        prompt = f"""You are a Principal Engineer creating a custom, bespoke technical coding interview challenge for a candidate based on their background.

Candidate Background:
- GitHub Repositories: {proj_names[:3]}
- Known Languages & Skills: {languages}, {skills_str}
- Target Difficulty: {difficulty}
- Target Programming Language: {target_language}

Create a practical, highly engaging technical coding problem inspired by the architecture or domain of their project "{primary_proj}".
The problem should test algorithmic thinking, concurrency, data structures, or backend logic.

Return a STRICT JSON object matching this exact schema:
{{
    "id": "github-tailored-{uuid.uuid4().hex[:8]}",
    "title": "Clear Problem Title (e.g. Distributed Task Scheduler with Dependency Resolution)",
    "track": "GitHub-Tailored",
    "difficulty": "{difficulty}",
    "tags": ["Tag1", "Tag2", "Tag3"],
    "description": "Full Markdown problem description with constraints, input/output specifications, and examples.",
    "entry_point": "function_name_to_call",
    "starter_code": {{
        "python": "def function_name_to_call(...):\\n    # starter\\n    pass\\n",
        "javascript": "function function_name_to_call(...) {{\\n    // starter\\n}}\\n"
    }},
    "test_cases": [
        {{
            "input": {{...arguments...}},
            "expected": ...expected return value...,
            "description": "Short explanation of test scenario"
        }},
        {{
            "input": {{...arguments...}},
            "expected": ...expected return value...,
            "description": "Short explanation of test scenario"
        }},
        {{
            "input": {{...arguments...}},
            "expected": ...expected return value...,
            "description": "Edge case scenario"
        }},
        {{
            "input": {{...arguments...}},
            "expected": ...expected return value...,
            "description": "Scale/Boundary scenario"
        }}
    ],
    "hints": [
        "First step hint",
        "Data structure hint",
        "Optimization hint"
    ],
    "optimal_time": "O(N)",
    "optimal_space": "O(N)"
}}
Return ONLY valid JSON.
"""
        try:
            response = client.chat.completions.create(
                model=GROQ_HEAVY_MODEL,
                messages=[
                    {"role": "system", "content": "You are a Principal Technical Interviewer generating bespoke coding problems. Return only JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.4,
                response_format={"type": "json_object"}
            )
            parsed = json.loads(response.choices[0].message.content)
            return parsed
        except Exception as e:
            print(f"Error generating GitHub tailored problem: {e}")

    # Fallback tailored problem
    return {
        "id": f"github-tailored-{uuid.uuid4().hex[:8]}",
        "title": f"Asynchronous Event Queue Dispatcher for {primary_proj}",
        "track": "GitHub-Tailored",
        "difficulty": difficulty,
        "tags": ["Event Queue", "System Design", "Algorithms"],
        "description": f"""In your repository `{primary_proj}`, services need to process incoming events according to priority levels while deduplicating events with identical idempotency keys.

Implement `process_event_stream(events: list) -> list`:
- Each event is `{{'id': str, 'priority': int, 'payload': str}}` (higher integer = higher priority).
- If multiple events share the same `id`, process only the first one observed.
- Return the list of payloads in order of processed execution (highest priority first, preserving arrival order for equal priority).
""",
        "entry_point": "process_event_stream",
        "starter_code": {
            "cpp": """#include <vector>
#include <string>

struct Event {
    std::string id;
    int priority;
    std::string payload;
};

std::vector<std::string> process_event_stream(const std::vector<Event>& events) {
    // Write your code here
    return {};
}
""",
            "java": """import java.util.*;

public class Solution {
    public static class Event {
        public String id;
        public int priority;
        public String payload;
    }
    public List<String> process_event_stream(List<Event> events) {
        // Write your code here
        return new ArrayList<>();
    }
}
""",
            "python": """def process_event_stream(events: list) -> list:
    # Write your code here
    pass
""",
            "javascript": """function process_event_stream(events) {
    // Write your code here
    return [];
}
"""
        },
        "reference_solution": {
            "cpp": """#include <vector>
#include <string>
#include <unordered_set>
#include <algorithm>

struct Event {
    std::string id;
    int priority;
    std::string payload;
};

std::vector<std::string> process_event_stream(const std::vector<Event>& events) {
    std::unordered_set<std::string> seen;
    std::vector<Event> unique_events;
    for (const auto& e : events) {
        if (seen.find(e.id) == seen.end()) {
            seen.insert(e.id);
            unique_events.push_back(e);
        }
    }
    std::stable_sort(unique_events.begin(), unique_events.end(), [](const Event& a, const Event& b) {
        return a.priority > b.priority;
    });
    std::vector<std::string> payloads;
    for (const auto& e : unique_events) payloads.push_back(e.payload);
    return payloads;
}
""",
            "java": """import java.util.*;

public class Solution {
    public static class Event {
        public String id;
        public int priority;
        public String payload;
    }
    public List<String> process_event_stream(List<Event> events) {
        Set<String> seen = new HashSet<>();
        List<Event> uniqueEvents = new ArrayList<>();
        for (Event e : events) {
            if (!seen.contains(e.id)) {
                seen.add(e.id);
                uniqueEvents.add(e);
            }
        }
        uniqueEvents.sort((a, b) -> Integer.compare(b.priority, a.priority));
        List<String> payloads = new ArrayList<>();
        for (Event e : uniqueEvents) payloads.add(e.payload);
        return payloads;
    }
}
""",
            "python": """def process_event_stream(events: list) -> list:
    seen_ids = set()
    unique_events = []
    for e in events:
        eid = e.get("id")
        if eid not in seen_ids:
            seen_ids.add(eid)
            unique_events.append(e)
            
    unique_events.sort(key=lambda x: x.get("priority", 0), reverse=True)
    return [e.get("payload") for e in unique_events]
""",
            "javascript": """function process_event_stream(events) {
    const seen = new Set();
    const unique = [];
    for (const e of events) {
        if (!seen.has(e.id)) {
            seen.add(e.id);
            unique.push(e);
        }
    }
    unique.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return unique.map(e => e.payload);
}
"""
        },
        "test_cases": [
            {
                "input": {
                    "events": [
                        {"id": "e1", "priority": 1, "payload": "A"},
                        {"id": "e2", "priority": 3, "payload": "B"},
                        {"id": "e1", "priority": 5, "payload": "Duplicate A (Ignored)"},
                        {"id": "e3", "priority": 2, "payload": "C"}
                    ]
                },
                "expected": ["B", "C", "A"],
                "description": "Deduplicate e1 and sort by priority (3 -> 2 -> 1)"
            },
            {
                "input": {
                    "events": [
                        {"id": "a", "priority": 2, "payload": "First 2"},
                        {"id": "b", "priority": 2, "payload": "Second 2"}
                    ]
                },
                "expected": ["First 2", "Second 2"],
                "description": "Preserve arrival order for equal priorities"
            }
        ],
        "hints": [
            "Use a Hash Set to track seen event IDs in $O(1)$ time.",
            "Use a stable sort or bucket queue to maintain arrival order for equal priorities."
        ],
        "optimal_time": "O(N log N)",
        "optimal_space": "O(N)"
    }
