"""
Thread summary service for multi-agent project context.

Generates and caches thread summaries to provide context to agents
working on the same project.
"""

import asyncio
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime

from backend.core.supabase_client import get_supabase_client
from backend.core.cache import get_cache
from backend.core.llm.llm_provider import LLMProvider
from backend.core.threads.repo import ThreadRepository
from backend.core.projects.repo import ProjectRepository


class ThreadSummaryService:
    """Service for generating and managing thread summaries."""

    SUMMARY_CACHE_PREFIX = "thread_summary:"
    SUMMARY_CACHE_TTL = 600  # 10 minutes
    MAX_SUMMARIES = 5
    SUMMARY_MODEL = "otacon/haiku"

    def __init__(self, supabase=None, cache=None):
        """Initialize the summary service."""
        self.supabase = supabase or get_supabase_client()
        self.cache = cache or get_cache()
        self.thread_repo = ThreadRepository(supabase=self.supabase)

    async def generate_thread_summary(
        self,
        thread_id: UUID,
        project_id: UUID,
        agent_id: Optional[UUID] = None,
        is_auto: bool = True,
    ) -> Dict[str, Any]:
        """
        Generate a summary for a thread using Haiku.

        Args:
            thread_id: UUID of the thread
            project_id: UUID of the project
            agent_id: UUID of the agent (optional)
            is_auto: Whether this is an automatic summary

        Returns:
            The created summary record
        """
        # Get thread messages
        messages = await self.thread_repo.get_messages(str(thread_id))

        if not messages:
            raise ValueError(f"No messages found for thread {thread_id}")

        # Format messages for summarization
        conversation = self._format_messages_for_summary(messages)

        # Generate summary using Haiku
        summary_text = await self._generate_summary_with_llm(conversation)

        # Save to database
        summary_record = self._save_summary(
            thread_id=thread_id,
            project_id=project_id,
            agent_id=agent_id,
            summary_text=summary_text,
            is_auto=is_auto,
        )

        # Invalidate cache
        cache_key = f"{self.SUMMARY_CACHE_PREFIX}{thread_id}"
        await self.cache.delete(cache_key)

        return summary_record

    async def get_project_summaries(
        self, project_id: UUID, limit: int = MAX_SUMMARIES
    ) -> List[Dict[str, Any]]:
        """
        Get recent thread summaries for a project.

        Args:
            project_id: UUID of the project
            limit: Maximum number of summaries to return

        Returns:
            List of summary records with thread and agent info
        """
        result = (
            self.supabase.table("thread_summaries")
            .select(
                """
                *,
                threads!inner(thread_id, created_at, updated_at),
                agents(agent_id, name)
            """
            )
            .eq("project_id", str(project_id))
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        return result.data

    async def get_or_generate_summary(
        self, thread_id: UUID, project_id: UUID
    ) -> Optional[str]:
        """
        Get cached summary or generate on-the-fly.

        Checks DB first, then generates if missing and caches in Redis.

        Args:
            thread_id: UUID of the thread
            project_id: UUID of the project

        Returns:
            Summary text or None if generation fails
        """
        # Check cache first
        cache_key = f"{self.SUMMARY_CACHE_PREFIX}{thread_id}"
        cached = await self.cache.get(cache_key)
        if cached:
            return cached

        # Check database
        result = (
            self.supabase.table("thread_summaries")
            .select("summary_text")
            .eq("thread_id", str(thread_id))
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if result.data:
            summary_text = result.data[0]["summary_text"]
            # Cache it
            await self.cache.set(cache_key, summary_text, ttl=self.SUMMARY_CACHE_TTL)
            return summary_text

        # Generate on-the-fly (don't save to DB for on-the-fly generation)
        try:
            messages = await self.thread_repo.get_messages(str(thread_id))
            if not messages:
                return None

            conversation = self._format_messages_for_summary(messages)
            summary_text = await self._generate_summary_with_llm(conversation)

            # Cache for 10 minutes
            await self.cache.set(cache_key, summary_text, ttl=self.SUMMARY_CACHE_TTL)

            return summary_text
        except Exception as e:
            print(f"Error generating on-the-fly summary for thread {thread_id}: {e}")
            return None

    def _format_messages_for_summary(self, messages: List[Dict[str, Any]]) -> str:
        """
        Format thread messages into a readable conversation.

        Args:
            messages: List of message dictionaries

        Returns:
            Formatted conversation string
        """
        lines = []
        for msg in messages:
            role = msg.get("type", "unknown")
            content = msg.get("content", {})

            # Handle different message formats
            if isinstance(content, str):
                text = content
            elif isinstance(content, dict):
                # Extract text from various content structures
                text = content.get("text", "") or content.get("content", "")
                if isinstance(text, list) and text:
                    # Handle list of content blocks
                    text = " ".join([str(item.get("text", "")) for item in text if isinstance(item, dict)])
            else:
                text = str(content)

            if text:
                lines.append(f"{role.upper()}: {text[:500]}")  # Limit length

        return "\n\n".join(lines)

    async def _generate_summary_with_llm(self, conversation: str) -> str:
        """
        Generate summary using Haiku model.

        Args:
            conversation: Formatted conversation string

        Returns:
            Generated summary text
        """
        prompt = f"""Summarize this thread conversation concisely. Include:
- What was done
- Key decisions made
- Results achieved
- Open issues or next steps

Maximum 200 words.

Conversation:
{conversation}

Summary:"""

        # Use LLMProvider to generate summary
        llm_provider = LLMProvider()

        messages = [{"role": "user", "content": prompt}]

        response = await llm_provider.generate_completion(
            model=self.SUMMARY_MODEL,
            messages=messages,
            max_tokens=300,
            temperature=0.3,
        )

        # Extract text from response
        summary = response.get("content", [{}])[0].get("text", "")
        return summary.strip()

    def _save_summary(
        self,
        thread_id: UUID,
        project_id: UUID,
        agent_id: Optional[UUID],
        summary_text: str,
        is_auto: bool,
    ) -> Dict[str, Any]:
        """
        Save summary to database.

        Args:
            thread_id: UUID of the thread
            project_id: UUID of the project
            agent_id: UUID of the agent (optional)
            summary_text: Generated summary
            is_auto: Whether this is an automatic summary

        Returns:
            Created summary record
        """
        data = {
            "thread_id": str(thread_id),
            "project_id": str(project_id),
            "summary_text": summary_text,
            "is_auto": is_auto,
        }

        if agent_id:
            data["agent_id"] = str(agent_id)

        result = self.supabase.table("thread_summaries").insert(data).execute()

        return result.data[0] if result.data else {}


# Singleton instance
_summary_service: Optional[ThreadSummaryService] = None


def get_summary_service() -> ThreadSummaryService:
    """Get or create the singleton summary service instance."""
    global _summary_service
    if _summary_service is None:
        _summary_service = ThreadSummaryService()
    return _summary_service
