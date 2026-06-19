import os
import io
from typing import Optional
from groq import Groq

# Initialize Groq client
groq_api_key = os.environ.get("GROQ_API_KEY")
client = Groq(api_key=groq_api_key) if groq_api_key else None
sarvam_api_key = os.environ.get("SARVAM_API_KEY")

class SpeechToTextService:
    """
    Unified STT interface using Groq Whisper-large-v3 and Sarvam AI STT
    with extension point for local Faster-Whisper.
    """
    def __init__(self, use_local: bool = False):
        self.use_local = use_local
        self.local_model = None
        
        if self.use_local:
            try:
                from faster_whisper import WhisperModel
                print("Loading local Faster-Whisper model...")
                # Use tiny/base on CPU, large on CUDA if available
                device = "cuda" if os.environ.get("CUDA_VISIBLE_DEVICES") else "cpu"
                self.local_model = WhisperModel("base", device=device, compute_type="float32")
                print("Local Faster-Whisper loaded successfully.")
            except ImportError:
                print("faster-whisper not installed. Falling back to Groq API.")
                self.use_local = False

    def transcribe(self, audio_bytes: bytes, file_format: str = "webm", language: Optional[str] = None) -> str:
        """
        Transcribe audio bytes using local model, Sarvam AI STT, or Groq API.
        """
        if not audio_bytes:
            return ""
            
        if self.use_local and self.local_model:
            try:
                # Local faster-whisper expects a file path or file-like object
                audio_file = io.BytesIO(audio_bytes)
                segments, info = self.local_model.transcribe(audio_file, beam_size=5)
                transcript = " ".join([segment.text for segment in segments])
                return transcript.strip()
            except Exception as e:
                print(f"Local STT failed, falling back to API: {e}")
                
        # 1. API-based STT via Sarvam AI (preferred for Indian accents & code-mixing)
        if sarvam_api_key:
            try:
                import requests
                url = "https://api.sarvam.ai/speech-to-text"
                headers = {
                    "api-subscription-key": sarvam_api_key
                }
                file_name = f"recording.{file_format}"
                files = {
                    "file": (file_name, audio_bytes, f"audio/{file_format}")
                }
                data = {
                    "model": "saaras:v3"
                }
                # Sarvam accepts full BCP-47 language code (e.g. hi-IN)
                if language:
                    data["language_code"] = language
                
                response = requests.post(url, headers=headers, files=files, data=data, timeout=10)
                if response.status_code == 200:
                    resp_json = response.json()
                    transcript = resp_json.get("transcript", "").strip()
                    if transcript:
                        return transcript
            except Exception as e:
                print(f"Sarvam AI STT transcription failed: {e}. Falling back to Groq Whisper.")

        # 2. Fallback API-based STT via Groq Whisper
        if not client:
            print("Groq client not initialized for STT.")
            return "[Error: STT credentials missing]"
            
        try:
            # File-like object with a name and content-type is expected by Groq API
            file_name = f"recording.{file_format}"
            audio_file = (file_name, audio_bytes, f"audio/{file_format}")
            
            # Map BCP-47 code (e.g. "hi-IN" to "hi")
            iso_lang = language[:2] if language else None
            
            kwargs = {
                "file": audio_file,
                "model": "whisper-large-v3",
                "response_format": "json"
            }
            if iso_lang:
                kwargs["language"] = iso_lang
                
            transcription = client.audio.transcriptions.create(**kwargs)
            return transcription.text.strip()
        except Exception as e:
            print(f"Groq Whisper transcription failed: {e}")
            return "[Transcription failed]"
