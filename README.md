# PrepAI: AI-Powered Technical Interview Simulator

PrepAI is an elite, interactive technical interview platform that scrapes your GitHub repository and parses your resume to conduct a realistic, two-phase mock interview customized to your actual implementation.

---

## 🛠️ Local Setup & Installation

### 1. Clone the Repository
```bash
git clone <your-repo-url>
cd interview_platform
```

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
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create an environment configuration file named **`.env`** directly in the `backend/` directory:
   ```env
   # Paste your Groq Console API Key (obtained from https://console.groq.com/)
   GROQ_API_KEY=your_groq_api_key_here

   # Paste your Sarvam AI Subscription Key (obtained from https://dashboard.sarvam.ai/)
   SARVAM_API_KEY=your_sarvam_api_key_here
   ```
5. Start the backend server on port `8001` (to bypass Windows socket conflicts on `8000`):
   ```bash
   uvicorn main:app --reload --port 8001
   ```

### 3. Frontend Setup (Next.js)
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Create a local environment file named **`.env.local`** directly in the `frontend/` directory:
   ```env
   # Set the API backend URL to target port 8001
   NEXT_PUBLIC_BACKEND_URL=http://localhost:8001
   ```
4. Run the frontend development server:
   ```bash
   npm run dev
   ```
5. Open your browser and navigate to [http://localhost:3000](http://localhost:3000).

---

## 🔒 Security & Git Configuration
To prevent sensitive keys and databases from being publicized, a root `.gitignore` file has been configured. The following files are kept locally and will not be pushed to GitHub:
* `backend/.env` (API Keys)
* `backend/interviews.db` (Local SQLite database)
* `frontend/.env.local` (Local Frontend configs)
* `backend/__pycache__/` and `.next/` folders (compiled bytecode/build output)

---

## 🚀 Features Added Today (Teammate Summary)
Here is a list of major features and visual updates implemented today:

### 1. Stateful "Bar Raiser" Interview Engine (LLM History)
* **Active Conversation Memory**: Implemented an SQLite schema that stores full chat logs. The backend forwards the full conversation history to `llama-3.3-70b-versatile` on every turn, allowing the AI to ask relevant follow-up questions instead of static pre-generated prompts.
* **Anti-Vagueness Enforcement**: The interviewer analyzes candidate answers and blocks progression if they are vague or attempt to skip technical details, demanding clarification before proceeding.
* **Indefinite Interview Loops**: Removed the 4-question hard limit. The interviewer now converses dynamically and ends the interview only when it reaches a natural conclusion, generating a final evaluation scorecard.

### 2. Minimalist UI Layout & Bloatware Cleanup
* **Useless Button Stripping**: Removed all mock simulated equalizers, vocal indicators, word pacing gauges, and fake audio record streams.
* **Focused Workspace**: Redesigned the screen as a clean chat panel with syntax-highlighted code block rendering for previous question logs.
* **Compact Camera Monitor**: Tucked the live webcam feed into a neat sidebar widget. OpenCV eye-gaze and focus tracking remain active in the background.
* **Keyboard Shortcuts**: Added `Ctrl + Enter` (or `Cmd + Enter`) support for submitting answers.

### 3. Multilingual STT & TTS Integration (Sarvam AI)
* **Automatic Voice Playback (TTS)**: Select from **10 Indic languages** (Hindi, Bengali, Tamil, Telugu, Kannada, Marathi, Gujarati, Malayalam, Punjabi, or English) and toggle the Read Aloud speaker. The backend translates and speaks questions using Sarvam's **Bulbul v3** model.
* **Real Audio Recording (STT)**: Record your response naturally in your preferred language. The backend forwards the WebM stream to Sarvam's **Saaras v3** model in `translate` mode, which automatically transcribes and translates the speech to English text, placing it directly into the chat input.
