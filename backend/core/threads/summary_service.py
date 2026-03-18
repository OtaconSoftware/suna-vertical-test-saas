"""
Thread summary service for multi-agent project context.

Generates and caches thread summaries to provide context to agents
working on the same project.
"""

import json
from typing import Optional, List, Dict, Any

from core.services.supabase import DBConnection
from core.services.llm import make_llm_api_call
from core.utils.cache import Cache
from core.utils.logger import logger

_db = DBConnection()

SUMMARY_CACHE_PREFIX = "thread_summary"
SUMMARY_CACHE_TTL = 600  # 10 minutes
MAX_SUMMARIES = 5
SUMMARY_MODEL = "otacon/haiku"


async def generate_thread_summary(
    thread_id: str,
    project_id: str,
    agent_id: Optional[str] = None,
    is_auto: bool = True,
) -> Dict[str, Any]:
    """
    Generate a summary for a thread using Haiku.

    Returns the created summary record.
    """
    client = await _db.client

    # Get thread messages
    result = await client.table('messages') \
        .select('type, content, created_at') \
        .eq('thread_id', thread_id) \
        .order('created_at') \
        .execute()

    messages = result.data if result.data else []

    if not messages:
        raise ValueError(f"No messages found for thread {thread_id}")

    # Format messages for summarization
    conversation = _format_messages_for_summary(messages)

    # Generate summary using Haiku
    summary_text = await _generate_summary_with_llm(conversation)

    # Save to database
    data = {
        "thread_id": thread_id,
        "project_id": project_id,
        "summary_text": summary_text,
        "is_auto": is_auto,
    }
    if agent_id:
        data["agent_id"] = agent_id

    save_result = await client.table('thread_summaries').insert(data).execute()

    # Invalidate cache
    cache_key = f"{SUMMARY_CACHE_PREFIX}:{thread_id}"
    await Cache.invalidate(cache_key)

    return save_result.data[0] if save_result.data else {}


async def get_project_summaries(
    project_id: str, limit: int = MAX_SUMMARIES
) -> List[Dict[str, Any]]:
    """
    Get recent thread summaries for a project.
    """
    client = await _db.client

    result = await client.table('thread_summaries') \
        .select('*, threads!inner(thread_id, created_at, updated_at), agents(agent_id, name)') \
        .eq('project_id', project_id) \
        .order('created_at', desc=True) \
        .limit(limit) \
        .execute()

    return result.data if result.data else []


async def get_or_generate_summary(
    thread_id: str, project_id: str
) -> Optional[str]:
    """
    Get cached summary or generate on-the-fly.

    Checks Redis cache -> DB -> generate on-the-fly (cached 10min).
    """
    # Check cache first
    cache_key = f"{SUMMARY_CACHE_PREFIX}:{thread_id}"
    cached = await Cache.get(cache_key)
    if cached:
        return cached

    client = await _db.client

    # Check database
    result = await client.table('thread_summaries') \
        .select('summary_text') \
        .eq('thread_id', thread_id) \
        .order('created_at', desc=True) \
        .limit(1) \
        .execute()

    if result.data:
        summary_text = result.data[0]["summary_text"]
        await Cache.set(cache_key, summary_text, ttl=SUMMARY_CACHE_TTL)
        return summary_text

    # Generate on-the-fly (don't save to DB for on-the-fly generation)
    try:
        msg_result = await client.table('messages') \
            .select('type, content, created_at') \
            .eq('thread_id', thread_id) \
            .order('created_at') \
            .execute()

        messages = msg_result.data if msg_result.data else []
        if not messages:
            return None

        conversation = _format_messages_for_summary(messages)
        summary_text = await _generate_summary_with_llm(conversation)

        # Cache for 10 minutes
        await Cache.set(cache_key, summary_text, ttl=SUMMARY_CACHE_TTL)

        return summary_text
    except Exception as e:
        logger.warning(f"Error generating on-the-fly summary for thread {thread_id}: {e}")
        return None


def _format_messages_for_summary(messages: List[Dict[str, Any]]) -> str:
    """Format thread messages into a readable conversation."""
    lines = []
    for msg in messages:
        role = msg.get("type", "unknown")
        content = msg.get("content", {})

        if isinstance(content, str):
            text = content
        elif isinstance(content, dict):
            text = content.get("text", "") or content.get("content", "")
            if isinstance(text, list) and text:
                text = " ".join([str(item.get("text", "")) for item in text if isinstance(item, dict)])
        else:
            text = str(content)

        if text and len(text.strip()) > 0:
            lines.append(f"{role.upper()}: {text[:500]}")

    return "\n\n".join(lines)


async def _generate_summary_with_llm(conversation: str) -> str:
    """Generate summary using Haiku model via make_llm_api_call."""
    prompt = f"""Summarize this thread conversation concisely. Include:
- What was done
- Key decisions made
- Results achieved  
- Open issues or next steps

Maximum 200 words.

Conversation:
{conversation[:8000]}

Summary:"""

    messages = [{"role": "user", "content": prompt}]

    response = await make_llm_api_call(
        model_name=SUMMARY_MODEL,
        messages=messages,
        max_tokens=300,
        temperature=0.3,
        stream=False,
    )

    # Extract text from response
    if hasattr(response, 'choices') and response.choices:
        return response.choices[0].message.content.strip()

    return str(response).strip()
