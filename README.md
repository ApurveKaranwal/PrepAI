# PrepAI: AI-Powered Technical Interview Simulator & Career Agent

<div align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2-black?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js Badge" />
  <img src="https://img.shields.io/badge/FastAPI-0.110-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI Badge" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS Badge" />
  <img src="https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite Badge" />
  <img src="https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python Badge" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License Badge" />
</div>

---

## 🚀 Hero Overview

**PrepAI** is an elite, interactive, multimodal technical interview simulator and career copilot. Unlike standard mock interview platforms that rely on generic, static questions, PrepAI **scrapes your public GitHub repositories** and **parses your PDF resume** to conduct a hyper-personalized, context-aware screening based on your actual codebase implementations.

Equipped with a real-time **WebSocket Multimodal Voice Copilot** (featuring Indic accent speech synthesis), **gaze tracking computer vision checks**, an **ATS Resume Scorer & Bullet Point Rewriter**, and a **Playwright Job Search & Auto-Apply Agent**, PrepAI is a production-grade documentation, testing, and interview playground designed to prepare engineers for FAANG-tier hiring bars.

---

## 💡 Problem Statement

Software engineering interviews have evolved beyond generic algorithms, yet preparation tools have lagged behind:
* **The LeetCode Trap**: Candidates memorize patterns rather than understanding how to debug concurrency, refactoring, or architectural choices in real production environments.
* **Lack of Real-world Grilling**: Modern interviewers probe *past projects*. Candidates struggle to articulate architectural design decisions on code they wrote months ago.
* **High-pressure Voice & Vision**: Live coding interviews test vocal clarity, pacing, avoidance of filler words (um, uh, like), and maintaining focus (screen gaze) under pressure.
* **The Manual Application Grind**: Engineers waste hundreds of hours manually looking up jobs and copying details across applicant tracking systems (Greenhouse, Lever, Ashby).

**PrepAI solves these gaps** by combining code interrogation, voice dialogue, eye-gaze compliance tracking, ATS optimization, and browser application automation under a unified developer dashboard.

---

## 🎨 Technology Stack

PrepAI is architected as a high-performance monorepo splitting client and server workloads:

| Layer | Technologies Used | Description |
| :--- | :--- | :--- |
| **Frontend Core** | React 19, Next.js 16 (App Router), TypeScript | Responsive dashboard interface, persistent local storage caches, stateful views. |
| **Styling** | Tailwind CSS v4, Lucide Icons | Ultra-modern user interface with dark palettes, sleek glassmorphism panels, and transitions. |
| **Charts** | Recharts | Visual progress tracking, gaze performance charts, speaking pace (WPM) tracker. |
| **Backend API** | FastAPI, Uvicorn | High-throughput async ASGI web server handling REST endpoints and real-time streaming sockets. |
| **Database** | SQLite3, PostgreSQL wrappers (`psycopg2`) | Unified database interface layer executing schemas for authentication, session transcripts, and matches. |
| **Generative LLM** | Groq API (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) | Orchestrates deep codebase analysis, ATS scoring, resume rewrites, and conversational replies. |
| **Voice Services** | Sarvam AI (`bulbul:v3` TTS, `saaras:v3` STT) | Live Indian regional dialect translation, text-to-speech audio, and voice-to-text transcriptions. |
| **Computer Vision** | OpenCV (`opencv-python-headless`) | Real-time face and eye detection Haar Cascade tracking checks sent from client video stream. |
| **Automation** | Playwright (Async Python API) | Web scraper crawling Greenhouse/Ashby boards and visually filling applicant forms. |

---

## 🏗️ Architecture Overview

The diagram below outlines the runtime lifecycle of an interview session, detailing the routing of video frames, audio inputs, and LLM evaluations:

```mermaid
sequenceDiagram
    autonumber
    actor Candidate as Candidate (Browser)
    participant FE as Next.js Frontend
    participant BE as FastAPI Backend
    participant DB as interviews.db (SQLite)
    participant Groq as Groq LLM API
    participant Sarvam as Sarvam AI Engine
    participant CV as OpenCV Gaze Engine

    Candidate->>FE: Onboard (Upload Resume & Enter GitHub Link)
    FE->>BE: POST /api/ingest (Details)
    BE->>BE: Download GitHub repository ZIP & extract source code files
    BE->>Groq: Generate codebase-specific Phase 1 grilling question
    Groq-->>BE: Return Question & Buggy Code Snippet (JSON)
    BE->>DB: Create session record & write first question
    BE-->>FE: Return JSON (Session ID + Question + Code block)
    FE-->>Candidate: Render Dashboard and Code Editor
    
    rect rgb(20, 20, 30)
        Note right of Candidate: Active Voice Copilot Stream
        FE->>BE: WebSocket Connection established (/api/voice-copilot/stream/{id})
        FE->>CV: Capture webcam stream frames
        FE->>BE: POST /api/vision/gaze (Image binary data)
        BE->>CV: Run face & eye Haar Cascades detector
        CV-->>FE: Return Gaze status (looking_at_screen: True/False)
        Candidate->>FE: Speak response into microphone (audio stream)
        FE->>BE: Send audio chunks over WebSocket
        BE->>Sarvam: Transcribe spoken audio via saaras:v3
        Sarvam-->>BE: Return text transcript
        BE->>Groq: Analyze answer content & generate next interview question
        Groq-->>BE: Return evaluation + next question text
        BE->>Sarvam: Convert text question to speech via bulbul:v3
        Sarvam-->>BE: Return base64 synthesized audio file
        BE->>DB: Save assistant question & candidate text answers
        BE-->>FE: Stream next question text and audio base64 over WebSocket
        FE-->>Candidate: Play voice audio and display text on screen
    end

    Candidate->>FE: End Interview Session
    FE->>BE: POST /api/end-session
    BE->>DB: Score analytics (WPM, gaze compliance, filler word counts)
    BE-->>FE: Return Scorecard JSON
    FE-->>Candidate: Redirect to Performance Analytics dashboard
```

---

## 📂 Repository Directory Layout

The repository is structured as a standard monorepo dividing core frontend assets from API backend scripts:

```text
interview_platform/
├── backend/                       # FastAPI ASGI Backend Server
│   ├── voice_copilot/             # WebSocket and audio streaming pipeline
│   │   ├── extractors/            # Data extractors for resume PDF, GitHub, and LinkedIn
│   │   ├── agent.py               # InterviewAgent LLM system prompts and personas
│   │   ├── db.py                  # Voice sessions DB interface
│   │   ├── router.py              # WebSocket and Voice onboarding endpoints
│   │   ├── stt.py                 # Sarvam Speech-to-Text handler
│   │   └── tts.py                 # Sarvam Text-to-Speech handler
│   ├── browser_agent.py           # Playwright automation script (Greenhouse/Lever/Ashby)
│   ├── career_agent.py            # AI matching and career onboard router
│   ├── database.py                # Main DB schemas, users table, and seed jobs data
│   ├── fetch_real_jobs.py         # Greenhouse/Ashby job board crawler
│   ├── main.py                    # Server config, OpenCV gaze endpoint, and REST router
│   ├── ml_model.py                # Scratch-built TF-IDF Vectorizer & Cosine Similarity
│   └── requirements.txt           # Python backend dependencies list
│
├── frontend/                      # Next.js App Router Client App
│   ├── app/
│   │   ├── globals.css            # Base stylesheet containing Tailwind system tokens
│   │   ├── layout.tsx             # Root template loading fonts and providers
│   │   └── page.tsx               # Client state tab controller (Dashboard, Arena, Analytics)
│   ├── components/                # Modular UI Components
│   │   ├── analytics/             # Performance scoring charts (Recharts)
│   │   ├── auth/                  # Email/Password and Google OAuth sign-in panels
│   │   ├── career/                # Job list, match scores, and application panels
│   │   ├── dashboard/             # Onboarding stats, recent history list, entry grids
│   │   ├── interview/             # Code Interrogation workspace and Voice Copilot stream
│   │   ├── navigation/            # Responsive sidebar links
│   │   └── resume/                # ATS Scanner and STAR method rewrite logs
│   ├── lib/                       # SDK wrappers, Firebase client configs
│   └── package.json               # Frontend dependencies list
│
├── LICENSE                        # MIT License
├── package.json                   # Root package task workspace scripts
└── README.md                      # Project documentation portal
```

---

## 🛠️ Local Setup & Installation

Follow these steps to run PrepAI locally on your system.

### 📋 Prerequisites
* **Python**: Version `3.10` or higher installed. Check your version with `python --version`.
* **Node.js**: Version `18` or higher installed. Check your version with `node --version`.
* **OpenCV**: System dependencies for image rendering. On Linux, ensure `libgl1-mesa-glx` is installed.

---

### 1. Clone the Repository
```bash
git clone https://github.com/ApurveKaranwal/interview_platform.git
cd interview_platform
```

---

### 2. Backend Setup (FastAPI)
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create a Python virtual environment and activate it:
   ```bash
   python -m venv venv
   # On Windows (PowerShell):
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create an environment configuration file named **`.env`** directly in the `backend/` directory:
   ```env
   # Paste your Groq Console API Key (obtained from https://console.groq.com/)
   GROQ_API_KEY=your_groq_api_key_here

   # Paste your Sarvam AI Subscription Key (obtained from https://dashboard.sarvam.ai/)
   SARVAM_API_KEY=your_sarvam_api_key_here

   # (Optional) PostgreSQL Connection string. If empty, local SQLite interviews.db is used automatically.
   # DATABASE_URL=postgresql://user:password@localhost:5432/prepai
   ```
5. Seed the default database jobs (Optionally crawls boards for real developer roles):
   ```bash
   python fetch_real_jobs.py
   ```
6. Start the backend server on port `8001` (to bypass local socket conflicts):
   ```bash
   uvicorn main:app --reload --port 8001
   ```

---

### 3. Frontend Setup (Next.js)
1. In a new terminal window, navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the required Node packages:
   ```bash
   npm install
   ```
3. Create a local environment file named **`.env.local`** directly in the `frontend/` directory:
   ```env
   # Set the API backend URL to target port 8001
   NEXT_PUBLIC_BACKEND_URL=http://localhost:8001

   # Paste your Firebase Client Config Keys
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to [http://localhost:3000](http://localhost:3000).

---

## 🔑 Environment Variables Reference

### Backend Config (`backend/.env`)
| Variable | Description | Required? | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| `GROQ_API_KEY` | Key for Groq Llama inference models. | Recommended | Falls back to scratch-built TF-IDF Cosine Similarity engine. |
| `SARVAM_API_KEY` | Key for speech services on Sarvam AI. | Required for Voice | WebSocket voice audio translation and playback will fail. |
| `DATABASE_URL` | PostgreSQL connection string. | Optional | Automatically reads/writes to local SQLite `backend/interviews.db`. |

### Frontend Config (`frontend/.env.local`)
| Variable | Description | Required? | Default Value |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_BACKEND_URL` | Target address of the active FastAPI backend. | Yes | `http://localhost:8001` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web Client key for Firebase SDK authentication. | Yes | *N/A* |

---

## 📡 REST API & WebSockets Reference

### 1. Ingestion & Core Interviews
* **`POST /api/ingest`**:
  * **Payload**: Multipart Form (`resume`: PDF File (Optional), `github_url`: string)
  * **Response**: Returns unique `session_id`, parsed role, and the first technical question.
* **`POST /api/submit-answer`**:
  * **Payload**: JSON (`session_id`: int, `question_id`: int, `answer`: string)
  * **Response**: Returns analyzed score, WPM, filler word count, and next question payload.
* **`POST /api/end-session`**:
  * **Payload**: JSON (`session_id`: int, `duration_seconds`: int, `total_frames`: int, `away_frames`: int)
  * **Response**: Triggers session aggregation and writes scorecards to the database.

### 2. Gaze Tracking
* **`POST /api/vision/gaze`**:
  * **Payload**: Multipart Form (`frame`: image binary data)
  * **Response**: JSON indicating if the face/eyes are focusing on screen:
    ```json
    { "looking_at_screen": true }
    ```

### 3. Voice Copilot (WebSocket)
* **`WS /api/voice-copilot/stream/{session_id}`**:
  * Establishes real-time connection. Accepts audio packet chunks (PCM/WebM), streams transcribing STT, hooks into the LLM logic, synthesizes synthesized TTS voice, and returns:
    ```json
    {
      "type": "audio",
      "audio_base64": "...",
      "text": "The next verbal question from the interviewer."
    }
    ```

### 4. AI Career Agent
* **`POST /api/career/onboard`**:
  * **Payload**: Form fields detailing job preferences, notice periods, tech stacks, and resume files.
* **`GET /api/career/jobs`**:
  * **Response**: Lists matching job listings sorted by computed similarity scores.

---

## 🗄️ Database Schemas

PrepAI uses the following structured relational tables inside `interviews.db`:

### `users`
Tracks candidate credential log-ins:
* `id` (INTEGER, Primary Key)
* `email` (TEXT, Unique)
* `password` (TEXT, Hashed)
* `name` (TEXT)
* `created_at` (TEXT)

### `voice_sessions`
Stores telemetry, evaluations, and target parameters for conversational voice interviews:
* `id` (INTEGER, Primary Key)
* `github_url` (TEXT)
* `linkedin_url` (TEXT)
* `resume_text` (TEXT)
* `role` (TEXT)
* `interview_mode` (TEXT)
* `language` (TEXT)
* `technical_depth` (REAL)
* `communication` (REAL)
* `problem_solving` (REAL)
* `system_design` (REAL)
* `ownership` (REAL)
* `overall_rating` (REAL)
* `strengths` / `weaknesses` / `missed_concepts` / `learning_resources` (TEXT, JSON Lists)
* `duration_seconds` (INTEGER)

### `candidate_profiles`
Main onboarded parameters matching jobs:
* `user_id` (TEXT, Primary Key)
* `tech_stack_preferences` / `countries` / `cities` (TEXT, JSON lists)
* `salary_expectations` (TEXT)
* `github_stats` / `linkedin_data` (TEXT, JSON objects)

---

## 📸 Interface Showcases

<details>
<summary>💻 Dashboard & Code Arena</summary>

### CodeArena Workspace
Shows the repository code tree, text editor, immediate terminal output reviews, and AI feedback panels side-by-side.
*(To update this screenshot, replace this placeholder with `public/assets/dashboard.png`)*
</details>

<details>
<summary>🎙️ Voice Copilot & Vision Gaze Tracking</summary>

### Live WebSocket Screen
VAD-enabled voice conversation workspace showing active webcam feeds, eye gazes overlay, and audio visualizers.
*(To update this screenshot, replace this placeholder with `public/assets/voice_copilot.png`)*
</details>

<details>
<summary>📈 Performance Scorecard & Analytics</summary>

### Performance analytics
Interactive Recharts line and bar graphs documenting ratings, duration counts, WPM fluctuations, and filler word stats.
*(To update this screenshot, replace this placeholder with `public/assets/analytics.png`)*
</details>

---

## 🛠️ Key Functionalities Explained

### 1. Scratch-Built TF-IDF & Cosine Similarity Engine
When API rate limits are hit or the Groq key is absent, `ml_model.py` dynamically handles string distance logic:
$$\text{TF}(t, d) = \frac{\text{Count of } t \text{ in } d}{\text{Total terms in } d}$$
$$\text{IDF}(t, D) = \log\left(\frac{1 + |D|}{1 + |\{d \in D : t \in d\}|}\right) + 1$$
$$\text{Score} = (\text{Cosine Similarity} \times 0.4) + (\text{Keyword Match Ratio} \times 0.6)$$

### 2. Intelligent Custom Form Parsing
`browser_agent.py` automatically scrapes ATS job boards, filters boilerplate sections (demographic surveys, standard options), maps required textareas and selectors, and injects user profile data into target fields.

---

## 🤝 Contributing Guidelines

We welcome contributions from the open-source community!
1. **Fork the Repository** and checkout a new branch: `feature/your-feature-name`.
2. **Coding Standards**:
   * Frontend: Ensure components utilize Tailwind CSS v4 variables without inline layout tweaks. Run `npm run lint`.
   * Backend: Format Python scripts using PEP8 rules.
3. **Commit Messages**: Follow standard semantic commits:
   * `feat: add support for local PDF resume parsing`
   * `fix: resolve WebSocket reconnect timeout loops`
4. **Pull Requests**: Explain what changes were introduced and target the `main` branch.

---

## 📜 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Authors & Team
* **Apurve Karanwal** - Creator & Core Maintainer - [GitHub](https://github.com/ApurveKaranwal)

---

## 📬 Contact & Support
For bugs, queries, or collaboration reach out to the project team:
* **Email**: apurve.karanwal@example.com
* **Issues Page**: [https://github.com/ApurveKaranwal/interview_platform/issues](https://github.com/ApurveKaranwal/interview_platform/issues)
