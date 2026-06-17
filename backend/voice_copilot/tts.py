import os
import base64
import requests
from typing import Dict, Any, Optional

class TextToSpeechService:
    """
    Unified TTS service interface supporting local Kokoro TTS
    and cloud APIs (Sarvam AI / OpenAI TTS) as a fallback.
    """
    def __init__(self, use_local: bool = False):
        self.use_local = use_local
        self.local_tts = None
        self.sarvam_api_key = os.environ.get("SARVAM_API_KEY")
        self.openai_api_key = os.environ.get("OPENAI_API_KEY")
        
        if self.use_local:
            try:
                # Stub for local Kokoro/XTTS import
                # Since these libraries have heavy C++ dependencies, we attempt importing dynamically
                import kokoro
                print("Local Kokoro TTS loaded successfully.")
                self.local_tts = kokoro
            except ImportError:
                print("Kokoro TTS library not installed. Defaulting to cloud API.")
                self.use_local = False

    def text_to_speech_base64(self, text: str, language_code: str = "en-IN") -> Optional[str]:
        """
        Convert text to audio and return it as a base64-encoded string.
        """
        if not text.strip():
            return None

        # 1. Local execution
        if self.use_local and self.local_tts:
            try:
                # Hypothetical Kokoro pipeline execution
                # pipeline = self.local_tts.Pipeline('en')
                # generator = pipeline(text, voice='af_bella', speed=1, split_pattern=r'\n')
                # For compatibility, we'd encode its output numpy array/wav to base64
                pass
            except Exception as e:
                print(f"Local Kokoro TTS execution failed: {e}")

        # 2. Cloud Fallback (Sarvam AI API - preferred since key is in .env)
        if self.sarvam_api_key:
            try:
                tts_url = "https://api.sarvam.ai/text-to-speech"
                headers = {
                    "api-subscription-key": self.sarvam_api_key,
                    "Content-Type": "application/json"
                }
                payload = {
                    "text": text,
                    "target_language_code": language_code,
                    "speaker": "shubh",
                    "model": "bulbul:v3"
                }
                response = requests.post(tts_url, json=payload, headers=headers, timeout=10)
                if response.status_code == 200:
                    audios = response.json().get("audios", [])
                    if audios:
                        return audios[0] # Returns base64 encoded audio string
            except Exception as e:
                print(f"Sarvam AI TTS API failed: {e}")

        # 3. Cloud Fallback (OpenAI TTS API)
        if self.openai_api_key:
            try:
                headers = {
                    "Authorization": f"Bearer {self.openai_api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "tts-1",
                    "input": text,
                    "voice": "alloy",
                    "response_format": "mp3"
                }
                response = requests.post("https://api.openai.com/v1/audio/speech", json=payload, headers=headers, timeout=10)
                if response.status_code == 200:
                    audio_b64 = base64.b64encode(response.content).decode("utf-8")
                    return audio_b64
            except Exception as e:
                print(f"OpenAI TTS API failed: {e}")

        # If everything fails, return None (Frontend can use client-side Web Speech API)
        print("All backend TTS services failed. Falling back to client-side synthesis.")
        return None
