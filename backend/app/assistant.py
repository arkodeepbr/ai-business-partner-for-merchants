"""Optional OpenAI-compatible answer generation over tenant-scoped, read-only facts."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import Settings


class AssistantProviderError(RuntimeError):
    """The configured AI provider could not return a usable answer."""


def generate_grounded_answer(question: str, facts: dict, settings: Settings) -> str:
    if not settings.assistant_configured:
        raise AssistantProviderError("assistant_provider_not_configured")

    base_url = settings.ai_api_base_url.rstrip("/")
    endpoint = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"
    payload = {
        "model": settings.ai_model,
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Saathi, a careful business assistant for an Indian merchant. "
                    "Use only the JSON facts supplied in this request. Never invent amounts, "
                    "transactions, eligibility, dates, or causes. If the facts do not answer "
                    "the question, say what is missing. Explain calculations in plain language. "
                    "You have read-only access: never claim to have sent, paid, ordered, filed, "
                    "changed, or submitted anything. For such requests, explain that this build "
                    "cannot execute that action and that the merchant's explicit approval and "
                    "an approved integration would be required. Reply in the language used by "
                    "the merchant, briefly."
                ),
            },
            {"role": "user", "content": f"Question: {question}\nAuthorized facts: {json.dumps(facts, ensure_ascii=False, default=str)}"},
        ],
    }
    request = Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.ai_api_key.get_secret_value()}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=12) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AssistantProviderError("assistant_provider_unavailable") from exc

    try:
        answer = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AssistantProviderError("assistant_provider_invalid_response") from exc
    if not isinstance(answer, str) or not answer.strip():
        raise AssistantProviderError("assistant_provider_invalid_response")
    return answer.strip()[:4000]


def generate_conversational_answer(messages: list[dict[str, str]], user_name: str, locale: str, settings: Settings) -> str:
    if not settings.assistant_configured:
        raise AssistantProviderError("assistant_provider_not_configured")
    language = {"en": "English", "hi": "Hindi", "kn": "Kannada"}.get(locale, "English")
    safe_messages = messages[-12:]
    for item in safe_messages:
        if item.get("role") not in {"user", "assistant"} or not isinstance(item.get("content"), str):
            raise AssistantProviderError("invalid_chat_history")
    base_url = settings.ai_api_base_url.rstrip("/")
    endpoint = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"
    payload = {
        "model": settings.ai_model,
        "temperature": 0.45,
        "messages": [
            {"role": "system", "content": (
                "You are Saathi, a warm, capable AI business partner for small merchants in India. "
                f"The signed-in user's first name is {user_name[:80] or 'Merchant'}. The UI language preference is {language}, "
                "but always detect the language of the latest user message and answer in that same language. "
                "Match the script too: if the user writes Hindi in Latin letters, answer in Romanized Hindi; "
                "if they write Hindi in Devanagari, use Devanagari; if they write Kannada, answer in Kannada. "
                "Understand informal transliteration and mixed-language messages, and mirror the user's language mix. "
                "Answer greetings and general questions "
                "naturally (you are Saathi, a merchant-focused AI partner). Keep useful focus on sales, "
                "cash flow, settlements, stock, customers, credit and tax when relevant. You have no live "
                "merchant data unless provided in this conversation: never invent sales, transactions, "
                "eligibility, or account changes. You cannot execute payments or external actions; say so "
                "plainly and suggest the next step. Be concise, friendly, and practical."
            )},
            *safe_messages,
        ],
    }
    request = Request(endpoint, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), headers={
        "Authorization": f"Bearer {settings.ai_api_key.get_secret_value()}",
        "Content-Type": "application/json",
    }, method="POST")
    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AssistantProviderError("assistant_provider_unavailable") from exc
    try:
        answer = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AssistantProviderError("assistant_provider_invalid_response") from exc
    if not isinstance(answer, str) or not answer.strip():
        raise AssistantProviderError("assistant_provider_invalid_response")
    return answer.strip()[:4000]
