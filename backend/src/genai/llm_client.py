"""Azure OpenAI client, shared by POST /forecast/explain and POST /chat.

Reads credentials from environment variables (loaded from .env locally via
python-dotenv) -- never hardcode a key here. See .env.example for the
required variable names.
"""

from typing import Any, List, Optional
from openai import AzureOpenAI
from openai.types.chat import ChatCompletionMessage

from src.config.settings import get_settings

_client: Optional[AzureOpenAI] = None


class LLMConfigError(RuntimeError):
    """Raised when required Azure OpenAI environment variables are missing."""


def get_client() -> AzureOpenAI:
    """Return a cached AzureOpenAI client, or raise LLMConfigError if unconfigured."""
    global _client

    s = get_settings()

    endpoint = s.azure_openai_endpoint
    api_key = s.azure_openai_api_key
    deployment = s.azure_openai_deployment_name

    is_placeholder = (
        "your-resource-name" in endpoint
        or "your-azure-openai-api-key" in api_key
        or "your-gpt-deployment" in deployment
    )

    if not endpoint or not api_key or not deployment or is_placeholder:
        missing = []
        if not endpoint or "your-resource-name" in endpoint:
            missing.append("AZURE_OPENAI_ENDPOINT")
        if not api_key or "your-azure-openai-api-key" in api_key:
            missing.append("AZURE_OPENAI_API_KEY")
        if not deployment or "your-gpt-deployment" in deployment:
            missing.append("AZURE_OPENAI_DEPLOYMENT_NAME")
        raise LLMConfigError(f"Missing or placeholder Azure OpenAI environment variable(s): {', '.join(missing)}")

    if _client is None:
        _client = AzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=s.azure_openai_api_version,
        )

    return _client


def call_chat_json(system_prompt: str, user_message: str) -> str:
    """Call the configured Azure OpenAI deployment in JSON mode.

    Returns the raw response content (a JSON string, per response_format).
    Raises LLMConfigError if credentials are missing; propagates the
    underlying openai SDK's exceptions on network/API failures so the caller
    can translate those into a clean HTTP error.
    """
    s = get_settings()
    client = get_client()

    response = client.chat.completions.create(
        model=s.azure_openai_deployment_name,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
    )

    content = response.choices[0].message.content
    return content or "{}"


def call_chat(
    messages: List[dict[str, Any]],
    tools: Optional[list[dict[str, Any]]] = None,
    json_mode: bool = False,
) -> ChatCompletionMessage:
    """General-purpose chat completion call, optionally with tool definitions
    and/or JSON-mode output. Used by the /chat tool-calling flow, where the
    caller needs the raw assistant message (to inspect .tool_calls), not
    just its .content -- unlike call_chat_json, which is JSON-mode only and
    used exclusively by /forecast/explain.

    Raises LLMConfigError if credentials are missing; propagates the
    underlying openai SDK's exceptions on network/API failures.
    """
    s = get_settings()
    client = get_client()

    kwargs: dict[str, Any] = {
        "model": s.azure_openai_deployment_name,
        "messages": messages,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"

    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Quick manual test for the Azure OpenAI client.")
    parser.add_argument("--name", default="World", help="Name to greet in the test prompt")
    args = parser.parse_args()

    reply = call_chat_json(
        'You are a helpful assistant. Respond with JSON in this exact shape: {"message": "..."}.',
        f"Say hello to {args.name} in one short sentence.",
    )
    print(reply)
