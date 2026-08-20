import os
import json
import re
import requests
from typing import Dict, Any, List, Optional
from groq import Groq

# Model configurations
GROQ_HEAVY_MODEL = os.environ.get("GROQ_HEAVY_MODEL", "llama-3.3-70b-versatile")
GROQ_LIGHT_MODEL = os.environ.get("GROQ_LIGHT_MODEL", "llama-3.1-8b-instant")


def _clean_json_text(text: str) -> str:
    """Strip markdown backticks and whitespace to extract raw JSON string."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def call_llm(
    messages: List[Dict[str, str]],
    temperature: float = 0.7,
    max_tokens: int = 1000,
    json_mode: bool = False,
    model: Optional[str] = None
) -> Optional[str]:
    """
    Unified multi-provider LLM caller with Sarvam AI 105B, Groq, and OpenAI fallbacks.
    Guarantees zero downtime by cascading across available API providers.
    """
    sarvam_api_key = os.environ.get("SARVAM_API_KEY")
    groq_api_key = os.environ.get("GROQ_API_KEY")
    openai_api_key = os.environ.get("OPENAI_API_KEY")

    # 1. Primary Provider: Sarvam AI 105B Conversations
    if sarvam_api_key:
        try:
            payload = {
                "model": model or "sarvam-105b-conversations",
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
                timeout=45
            )
            if resp.status_code == 200:
                res_data = resp.json()
                if "choices" in res_data and len(res_data["choices"]) > 0:
                    text = res_data["choices"][0]["message"]["content"].strip()
                    if text:
                        return text
            else:
                print(f"[LLM] Sarvam returned status {resp.status_code}: {resp.text[:200]}")
        except Exception as e:
            print(f"[LLM] Sarvam call error: {e}")

    # 2. Secondary Provider: Groq API
    if groq_api_key:
        try:
            client = Groq(api_key=groq_api_key)
            kwargs = {
                "messages": messages,
                "model": model or (GROQ_LIGHT_MODEL if json_mode else GROQ_HEAVY_MODEL),
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
            print(f"[LLM] Groq call error: {e}")

    # 3. Tertiary Provider: OpenAI API
    if openai_api_key:
        try:
            import openai
            client = openai.OpenAI(api_key=openai_api_key)
            kwargs = {
                "messages": messages,
                "model": model or "gpt-4o-mini",
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
            print(f"[LLM] OpenAI call error: {e}")

    return None


def call_llm_json(
    messages: List[Dict[str, str]],
    temperature: float = 0.5,
    max_tokens: int = 1200,
    default: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Calls LLM with json_mode=True and safely parses the returned JSON object.
    Falls back to `default` if generation or parsing fails.
    """
    raw = call_llm(messages, temperature=temperature, max_tokens=max_tokens, json_mode=True)
    if not raw:
        return default or {}

    try:
        clean = _clean_json_text(raw)
        return json.loads(clean)
    except Exception as e:
        print(f"[LLM] JSON parse error: {e} | Raw text: {raw[:300]}")
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except Exception:
                pass
        return default or {}
