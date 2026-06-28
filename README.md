# PrepAI: AI-Powered Technical Interview Simulator and Career Co-Pilot

PrepAI is an advanced, enterprise-grade technical interview simulation and career management system. The platform analyzes candidate profiles, parses PDF resumes, scrapes target GitHub repositories, and coordinates stateful technical mock interviews across various seniority levels. Additionally, it features an automated job discovery matching engine, a prep roadmap planner, an AI-driven outreach sequence generator, and a browser automation auto-apply pipeline.

---

## System Architecture

PrepAI consists of two primary architectural systems coordinated by a FastAPI backend and displayed on a Next.js single-page application.

### 1. AI Career Agent

The AI Career Agent coordinates job matching, preparatory roadmaps, and human-in-the-loop application submissions. It operates via the following workflow:

![AI Career Agent System Architecture](docs/images/career_agent_architecture.png)

1. **Information Extraction**: Candidate uploads a PDF resume and provides target career preferences. The system parses the document, extracting technical skills, programming languages, and projects.
2. **Background Web Scraping**: The system periodically crawls Greenhouse and Ashby job boards of leading technology companies, populating a unified Postgres jobs database.
3. **Similarity Engine**: Candidates are matched against scraped positions using a from-scratch Term Frequency-Inverse Document Frequency (TF-IDF) similarity vectorizer.
4. **Outreach & Applying**: The system generates tailored networking outreach packages (cold emails, LinkedIn connection requests, follow-ups) using large language models. The Playwright-based browser automation agent can fill out job board application forms, solve simple questionnaires, and handle submissions.

### 2. AI Voice Copilot

The AI Voice Copilot conducts stateful, real-time audio mock interviews. The speech processing pipeline and execution loop are structured as follows:

![AI Voice Copilot Workflow Diagram](docs/images/voice_copilot_architecture.png)

1. **Stateful Connection**: The frontend establishes a WebSocket connection with the backend, allowing bi-directional streaming of speech audio data and real-time state synchronization.
2. **Speech-to-Text (STT) Service**: User audio chunks are sent via WebSocket or REST, processed, and transcribed. The system utilizes Sarvam AI STT (optimized for Indian accents and code-mixed inputs) or Groq Whisper-large-v3, with an option to run local Faster-Whisper.
3. **Interview LLM Agent**: The transcript is forwarded to the InterviewAgent. Using candidate details (resume, LinkedIn profile, and active GitHub repository code snippets) and selected seniority persona instructions, the LLM generates the next single, conversational interview question.
4. **Text-to-Speech (TTS) Service**: The question text is synthesized into a natural-sounding audio stream using Sarvam bulbul:v3, OpenAI TTS, or local Kokoro TTS, and played back to the user.
5. **Real-time Evaluation Engine**: While the interview progresses, a silent evaluation thread checks user responses for technical keyword coverage, WPM, and filler words, updating candidate scoring logs dynamically.

---

## Machine Learning Infrastructure and Data Processing

PrepAI implements custom, from-scratch Machine Learning models to govern text processing, similarity matching, and candidate response scoring, avoiding dependency on heavy external frameworks.

### Data Flow Diagram for Custom ML Engine

![Custom ML Engine Data Flow Diagram](docs/images/scratch_ml_models_flow.png)

### 1. Term Frequency-Inverse Document Frequency (TF-IDF) Engine

The TF-IDF model, located in `backend/ml/tfidf/tfidf.py`, is built entirely from scratch. It mathematically evaluates the relevance of job postings to candidate resumes.

#### Stopword Filtration and Tokenization
Raw text is cleaned of punctuation, converted to lowercase, and split into individual word tokens. Grammatical noise (stop words such as "the", "and", "under") is removed using an internal vocabulary filter to retain only high-value semantic terms.

#### Term Frequency (TF) Calculation
The relative frequency of a term $t$ in a document $d$ is computed as:

$$\text{TF}(t, d) = \frac{\text{Frequency of } t \text{ in } d}{\text{Total number of terms in } d}$$

#### Inverse Document Frequency (IDF) Calculation
To ensure common words do not dominate the calculations, terms are weighted using Inverse Document Frequency. The model implements logarithmic smoothing to prevent division-by-zero errors when a term is not in the corpus:

$$\text{IDF}(t) = \ln\left(\frac{1 + N}{1 + \text{DF}(t)}\right) + 1$$

Where:
* $N$ is the total document count in the matching corpus.
* $\text{DF}(t)$ is the document frequency (the number of documents containing term $t$).

#### Cosine Similarity Score Computation
Documents are represented as multidimensional vectors in the term space. The cosine similarity between candidate resume vector $V_1$ and job description vector $V_2$ determines the matching alignment score:

$$\text{Similarity}(V_1, V_2) = \frac{V_1 \cdot V_2}{\|V_1\| \|V_2\|} = \frac{\sum_{i=1}^{n} V_{1i} V_{2i}}{\sqrt{\sum_{i=1}^{n} V_{1i}^2} \sqrt{\sum_{i=1}^{n} V_{2i}^2}}$$

The result sits in the range $[0.0, 1.0]$, representing the exact alignment of skills and technologies.

### 2. Live Interview Evaluation Model

The evaluation engine, located in `backend/ml/evaluation/evaluation.py`, assesses the verbal answers transcribed during the Voice Copilot sessions.

#### Process Sequence
1. **Keyword Extraction**: The system tokenizes the question and filters tokens against a specialized technical database containing standard engineering concepts (e.g. concurrency, caching, indexing). This constructs a set of expected keywords for the specific context.
2. **Answer Alignment Analysis**: The candidate's response is compared against the expected keywords. Additional positive technical concepts present in the answer are extracted and added to the score.
3. **Similarity Assessment**: The system runs a local TF-IDF similarity calculation between the question text and the candidate's answer to evaluate if the response remains conceptually aligned.
4. **Scoring Formulation**: The final rating is a weighted combination of cosine similarity (40%) and expected technical keyword coverage (60%):
   $$\text{Raw Score} = (0.4 \times \text{Similarity}) + (0.6 \times \text{Keyword Ratio})$$
   The raw score is mapped to a standard corporate grading scale $[1.0, 10.0]$:
   $$\text{Final Score} = \min(10.0, \max(1.0, \text{Raw Score} \times 10 + 3.5))$$
5. **Speech Metrics Analysis**:
   * **Filler Word Tracking**: Scans for verbal fillers ("um", "uh", "like", "actually", "basically", "so") to assess speech confidence.
   * **Words Per Minute (WPM)**: Monitors speech rate to flag overly slow or rapid speech patterns.
   * **Adaptive Feedback Selection**: Compares the score against threshold limits, dynamically returning constructive, live coaching tips (e.g., advising candidates to cover missing keywords or structure their examples).
6. **Codebase-Specific Question Generation**:
   The engine reads the candidate's GitHub repository structure, extracts real code snippets from files containing logic (e.g., python or javascript functions), identifies the candidate's skills from the resume, and dynamically formulates customized, codebase-specific interview questions.

---

## Database Schema and Persistence Layer

PrepAI utilizes Neon Postgres as its primary persistence layer. To prevent database access failures across the codebase, a wrapper layer in `backend/database.py` maps database rows to dictionary-style rows.

### Core Database Models

```mermaid
erDiagram
    users ||--o{ candidate_profiles : "owns"
    users {
        int id PK
        string email UNIQUE
        string password
        string name
        timestamp created_at
    }
    candidate_profiles {
        string user_id PK, FK
        string job_type
        string work_mode
        string countries
        string cities
        string salary_expectations
        string notice_period
        string tech_stack_preferences
        string company_size_preference
        string startup_vs_enterprise
        string visa_sponsorship
        string resume_name
        string resume_text
        string github_url
        string linkedin_url
        string github_stats
        string linkedin_data
        string company_type_preference
        string portfolio_url
        timestamp created_at
    }
    jobs ||--o{ applications : "linked_to"
    jobs {
        int id PK
        string title
        string company
        string location
        string work_mode
        string salary
        string experience_required
        string skills_required
        string description
        string source
        string url UNIQUE
        string ats_type
        timestamp created_at
    }
    applications {
        int id PK
        string user_id
        int job_id FK
        string status
        string custom_responses
        string submission_logs
        timestamp created_at
        timestamp updated_at
    }
    voice_sessions ||--o{ voice_messages : "contains"
    voice_sessions {
        int id PK
        int user_id
        string github_url
        string linkedin_url
        string resume_name
        string resume_text
        string role
        string interview_mode
        string language
        string profile_summary
        real technical_depth
        real communication
        real problem_solving
        real system_design
        real ownership
        real overall_rating
        string strengths
        string weaknesses
        string missed_concepts
        string learning_resources
        string hiring_recommendation
        int duration_seconds
        timestamp created_at
    }
    voice_messages {
        int id PK
        int session_id FK
        string role
        string content
        string audio_path
        string evaluation
        timestamp created_at
    }
```

### PostgreSQL Migration Logic
The database initializer (`init_db`) executes checks using metadata tables (`information_schema.columns` and `information_schema.table_constraints`). Alterations are only applied if columns or constraints do not exist, ensuring schema updates execute safely without failing database initialization.

---

## Technology Stack

### Frontend
* **Core framework**: Next.js 16 (App Router, Turbopack)
* **User Interface**: React 19, Vanilla CSS
* **Icons & Visuals**: Lucide React
* **Authentication**: Firebase Authentication
* **State Management**: React State Hooks, WebSocket API

### Backend
* **API Framework**: FastAPI (Uvicorn web server)
* **Language**: Python 3
* **Database Driver**: Psycopg2 (Neon serverless PostgreSQL integration)
* **AI Orchestration**: Groq Client, Llama-3.3-70b-versatile, Llama-3.1-8b-instant
* **Speech Engine**: Sarvam AI API (saaras:v3, bulbul:v3), OpenAI API (tts-1), or local Faster-Whisper/Kokoro TTS libraries
* **Document Parsing**: PyPDF
* **Automation**: Playwright (Headless Chromium browser orchestration)

---

## Local Setup and Installation

### Prerequisites
* Python 3.9 or higher
* Node.js 18 or higher
* Neon Postgres account and database connection string

### 1. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Set up a Python virtual environment and activate it:
   ```bash
   python -m venv venv
   # Windows (PowerShell):
   .\venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` configuration file in the `backend/` directory:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
   GROQ_API_KEY=your_groq_api_key_here
   SARVAM_API_KEY=your_sarvam_api_key_here
   OPENAI_API_KEY=your_openai_api_key_here
   ```
5. Run database initialization and seed default developer jobs:
   ```bash
   python -c "import database; database.init_db()"
   ```
6. Start the FastAPI server on port 8001:
   ```bash
   uvicorn main:app --reload --port 8001
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create a `.env.local` configuration file in the `frontend/` directory:
   ```env
   NEXT_PUBLIC_BACKEND_URL=http://localhost:8001
   ```
4. Start the Next.js development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to [http://localhost:3000](http://localhost:3000).

---

## Git and Security Policy

The root `.gitignore` file is pre-configured to ensure API keys, local databases, and temporary configuration files are excluded from remote version control:
* `backend/.env` (Backend credentials)
* `frontend/.env.local` (Local frontend configurations)
* Build artifacts (`.next/`, `__pycache__/`, `.open-next/`)
* Scraped database transaction logs
