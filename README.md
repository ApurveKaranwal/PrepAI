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
