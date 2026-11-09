"""Prompt construction and response guardrails for POST /forecast/explain.

Step 1 (the context dict) comes from explain_context.py; Step 3 (the raw
Azure OpenAI call) comes from llm_client.py. This module owns Step 2
(building the prompt from that context) and Step 4 (validating/repairing
the LLM's structured response before anything reaches the API caller).
"""

import json
import logging
import re
from typing import Any, Optional

from src.genai.llm_client import call_chat_json