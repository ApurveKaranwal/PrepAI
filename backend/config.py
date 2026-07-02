import os

# Centralized Model Identifiers for Groq API
# Replaces deprecated Llama models:
# - llama-3.3-70b-versatile -> openai/gpt-oss-120b
# - llama-3.1-8b-instant -> qwen/qwen3.6-27b

GROQ_HEAVY_MODEL = os.environ.get("GROQ_HEAVY_MODEL", "openai/gpt-oss-120b")
GROQ_LIGHT_MODEL = os.environ.get("GROQ_LIGHT_MODEL", "qwen/qwen3.6-27b")
