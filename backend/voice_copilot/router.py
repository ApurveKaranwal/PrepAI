import os
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, Form, HTTPException
from typing import Optional
from pydantic import BaseModel

from voice_copilot import db
from voice_copilot.extractors.resume import extract_text_from_pdf, parse_resume_content
from voice_copilot.extractors.linkedin import scrape_linkedin_profile, parse_linkedin_text
from voice_copilot.extractors.github import analyze_github_profile
from voice_copilot.stt import SpeechToTextService
from voice_copilot.tts import TextToSpeechService
from voice_copilot.agent import InterviewAgent

router = APIRouter()

# Schema for REST endpoints
class StartSessionRequest(BaseModel):
    session_id: int

class EndSessionRequest(BaseModel):
    session_id: int
    duration_seconds: int

@router.post("/onboard")
async def onboard_candidate(
    resume: Optional[UploadFile] = File(None),
    github_url: str = Form(...),
    linkedin_url: Optional[str] = Form(None),
    linkedin_text: Optional[str] = Form(None),
    linkedin_pdf: Optional[UploadFile] = File(None),
    interview_mode: str = Form("Mid-Level")
):
    """
    Onboard candidate: Scrape Resume PDF, LinkedIn, and GitHub.
    Construct Candidate Profile and initialize database session.
    """
    print(f"Onboarding Voice Copilot. GitHub: {github_url}, LinkedIn URL: {linkedin_url}, Mode: {interview_mode}")
    
    # 1. Parse Resume PDF
    resume_text = ""
    resume_name = None
    resume_profile = {}
    if resume:
        try:
            resume_name = resume.filename
            pdf_bytes = await resume.read()
            resume_text = extract_text_from_pdf(pdf_bytes)
            print(f"Extracted Resume text. Length: {len(resume_text)}")
            if resume_text:
                resume_profile = parse_resume_content(resume_text)
        except Exception as e:
            print(f"Failed to parse resume PDF: {e}")
            
    # 2. Parse LinkedIn Profile
    linkedin_profile = {}
    linkedin_raw = ""
    
    # 2.1 First, try extracting from LinkedIn PDF if uploaded
    if linkedin_pdf:
        try:
            pdf_bytes = await linkedin_pdf.read()
            linkedin_raw = extract_text_from_pdf(pdf_bytes)
            print(f"Extracted LinkedIn PDF text. Length: {len(linkedin_raw)}")
        except Exception as e:
            print(f"Failed to parse LinkedIn PDF: {e}")

    # 2.2 Next, try scraping if URL is provided and we don't have text yet
    if not linkedin_raw and linkedin_url and "linkedin.com" in linkedin_url.lower():
        try:
            scrape_res = await scrape_linkedin_profile(linkedin_url)
            if scrape_res.get("status") == "success":
                linkedin_raw = scrape_res.get("raw_text", "")
            else:
                print(f"LinkedIn scraping issue: {scrape_res.get('reason')}")
        except Exception as e:
            print(f"Error scraping LinkedIn: {e}")
            
    # 2.3 Finally, fall back to manually pasted text
    if not linkedin_raw and linkedin_text and linkedin_text.strip():
        linkedin_raw = linkedin_text
        
    if linkedin_raw:
        linkedin_profile = parse_linkedin_text(linkedin_raw)
        
    # 3. Scrape and analyze GitHub
    github_profile = {}
    if github_url:
        try:
            github_profile = analyze_github_profile(github_url)
        except Exception as e:
            print(f"Error scraping GitHub: {e}")
            github_profile = {"error": str(e)}

    # Determine job role title from Resume profile or default
    role = "Software Engineer"
    if resume_profile and isinstance(resume_profile.get("skills"), list):
        skills = [str(s).lower() for s in resume_profile.get("skills", []) if s]
        if any(keyword in skills for keyword in ["backend", "fastapi", "django", "node", "express", "sql"]):
            role = "Backend Engineer"
        elif any(keyword in skills for keyword in ["frontend", "react", "nextjs", "vue", "css"]):
            role = "Frontend Developer"
        elif any(keyword in skills for keyword in ["fullstack", "full-stack", "mern"]):
            role = "Fullstack Engineer"
        elif any(keyword in skills for keyword in ["devops", "kubernetes", "docker", "aws"]):
            role = "DevOps Engineer"

    # 4. Construct final structured profile
    profile_summary = {
        "resume": resume_profile,
        "github": github_profile,
        "linkedin": linkedin_profile
    }
    
    # 5. Create database record
    session_id = db.create_voice_session(
        github_url=github_url,
        linkedin_url=linkedin_url or "",
        resume_name=resume_name,
        resume_text=resume_text,
        role=role,
        interview_mode=interview_mode
    )
    
    db.update_voice_profile(session_id, profile_summary)
    
    print(f"Voice session created successfully. Session ID: {session_id}")
    
    return {
        "status": "success",
        "session_id": session_id,
        "profile_summary": profile_summary,
        "role": role
    }

@router.post("/start")
async def start_voice_session(req: StartSessionRequest):
    """
    Starts the session and returns the initial interviewer question text and audio.
    """
    session_id = req.session_id
    session = db.get_voice_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    try:
        agent = InterviewAgent(session_id)
        # Generate welcoming question
        first_question = agent.generate_next_turn()
        
        # Save question to DB
        db.save_voice_message(session_id, "assistant", first_question)
        
        # Synthesize audio
        tts = TextToSpeechService()
        audio_b64 = tts.text_to_speech_base64(first_question)
        
        return {
            "status": "success",
            "question": first_question,
            "audio_base64": audio_b64
        }
    except Exception as e:
        print(f"Failed to start voice session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/end")
async def end_voice_session_api(req: EndSessionRequest):
    """
    Concludes the voice interview session and generates the final scorecard.
    """
    session_id = req.session_id
    duration = req.duration_seconds
    
    session = db.get_voice_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    try:
        agent = InterviewAgent(session_id)
        scorecard = agent.generate_post_interview_scorecard()
        
        # Save scorecard to DB
        db.end_voice_session(
            session_id=session_id,
            duration_seconds=duration,
            scores=scorecard.get("scores", {}),
            strengths=scorecard.get("strengths", []),
            weaknesses=scorecard.get("weaknesses", []),
            missed_concepts=scorecard.get("missed_concepts", []),
            learning_resources=scorecard.get("learning_resources", []),
            hiring_recommendation=scorecard.get("hiring_recommendation", "Hire"),
            overall_rating=scorecard.get("overall_rating", 5.0)
        )
        
        return {
            "status": "success",
            "scorecard": scorecard
        }
    except Exception as e:
        print(f"Failed to end voice session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sessions/{session_id}")
async def get_session_details(session_id: int):
    session = db.get_voice_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.get_voice_messages(session_id)
    return {
        "status": "success",
        "session": session,
        "messages": messages
    }

@router.get("/history")
async def get_voice_history_api():
    history = db.get_voice_history()
    return {
        "status": "success",
        "history": history
    }


@router.websocket("/stream/{session_id}")
async def voice_websocket_stream(websocket: WebSocket, session_id: int):
    """
    WebSocket endpoint for real-time voice streaming.
    Handles:
    - User audio chunk streaming
    - Silence/Speech VAD triggers
    - Text-to-Speech playback streaming
    - Interrupt handling
    """
    await websocket.accept()
    print(f"WebSocket connected for session: {session_id}")
    
    stt_service = SpeechToTextService()
    tts_service = TextToSpeechService()
    
    try:
        agent = InterviewAgent(session_id)
    except Exception as e:
        await websocket.send_json({"type": "error", "message": f"Session initialization failed: {e}"})
        await websocket.close()
        return

    # Keep track of active audio buffer
    audio_buffer = bytearray()
    
    # State tracking
    is_agent_speaking = False
    
    try:
        while True:
            # Receive text or binary message
            message = await websocket.receive()
            
            if "bytes" in message:
                # Accumulate raw audio frames from browser microphone
                audio_buffer.extend(message["bytes"])
                
            elif "text" in message:
                data = json.loads(message["text"])
                msg_type = data.get("type")
                
                if msg_type == "start_speaking":
                    # User started speaking. Interrupt current AI TTS streaming!
                    print("User speech onset detected. Interrupting interviewer TTS.")
                    audio_buffer.clear() # Discard any stray audio buffer
                    is_agent_speaking = False
                    await websocket.send_json({"type": "interrupt"})
                    
                elif msg_type == "silence":
                    # VAD detected silence. Transcribe the buffered audio and generate answer!
                    if not audio_buffer:
                        continue
                        
                    print(f"VAD silence detected. Transcribing {len(audio_buffer)} bytes...")
                    
                    # Convert accumulated audio buffer to bytes
                    audio_bytes = bytes(audio_buffer)
                    audio_buffer.clear() # Reset buffer for next round
                    
                    # 1. Transcribe speech
                    user_transcript = stt_service.transcribe(audio_bytes)
                    print(f"STT Transcript: {user_transcript}")
                    
                    if not user_transcript.strip() or "[Transcription failed]" in user_transcript:
                        await websocket.send_json({"type": "transcript", "role": "user", "text": "..."})
                        continue
                        
                    # Send STT transcript to frontend
                    await websocket.send_json({"type": "transcript", "role": "user", "text": user_transcript})
                    
                    # Fetch latest questions to perform evaluation
                    history = db.get_voice_messages(session_id)
                    last_question = ""
                    for msg in reversed(history):
                        if msg["role"] == "assistant":
                            last_question = msg["content"]
                            break
                            
                    # 2. Run hidden evaluation on answer
                    evaluation = agent.run_hidden_evaluation(last_question, user_transcript)
                    
                    # Save user response with evaluation to database
                    db.save_voice_message(session_id, "user", user_transcript, evaluation=evaluation)
                    
                    # Send feedback notification (silent evaluation triggers)
                    await websocket.send_json({"type": "evaluation", "metrics": evaluation})
                    
                    # 3. Generate Next Question
                    await websocket.send_json({"type": "status", "status": "thinking"})
                    next_question = agent.generate_next_turn()
                    print(f"Next Agent Question: {next_question}")
                    
                    # Send transcript of the question
                    await websocket.send_json({"type": "transcript", "role": "assistant", "text": next_question})
                    
                    # Save agent question to DB
                    db.save_voice_message(session_id, "assistant", next_question)
                    
                    # 4. Generate TTS and stream it back
                    await websocket.send_json({"type": "status", "status": "speaking"})
                    is_agent_speaking = True
                    
                    audio_b64 = tts_service.text_to_speech_base64(next_question)
                    if audio_b64 and is_agent_speaking:
                        # Stream the audio response back in a single chunk or let client play it
                        await websocket.send_json({"type": "audio", "audio": audio_b64})
                    
                    await websocket.send_json({"type": "status", "status": "listening"})
                    is_agent_speaking = False
                    
                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})
                    
    except WebSocketDisconnect:
        print(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        print(f"Error in WebSocket handler: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except:
            pass
