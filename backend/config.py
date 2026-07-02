import os

# Centralized Model Identifiers for Groq API
# Standard active Groq models:
# - Heavy Model: llama-3.3-70b-versatile
# - Light Model: llama-3.1-8b-instant

GROQ_HEAVY_MODEL = os.environ.get("GROQ_HEAVY_MODEL", "llama-3.3-70b-versatile")
GROQ_LIGHT_MODEL = os.environ.get("GROQ_LIGHT_MODEL", "llama-3.1-8b-instant")
