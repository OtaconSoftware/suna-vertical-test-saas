"""
Background worker for automatic thread summary generation.

Checks for threads that have been inactive for >30 minutes and generates
summaries automatically.
"""

import asyncio
from datetime import datetime, timezone, timedelta

import structlog

from core.utils.logger import logger
from core.services.supabase import DBConnection

_db = DBConnection()


async def run_summary_generation_worker(interval_minutes: int = 10):
    """
    Background worker that periodically checks for inactive threads
    and generates summaries.
    """
    logger.info(f"🤖 Starting thread summary generation worker (interval: {interval_minutes}m)")

    while True:
        try:
            await generate_summaries_for_inactive_threads()
        except Exception as e:
            logger.error(f"Error in summary generation worker: {e}", exc_info=True)

        await asyncio.sleep(interval_minutes * 60)


async def generate_summaries_for_inactive_threads(inactivity_minutes: int = 30):
    """
    Find threads inactive for >30 minutes without summaries and generate them.
    """
    try:
        client = await _db.client
        cutoff_time = (datetime.now(timezone.utc) - timedelta(minutes=inactivity_minutes)).isoformat()

        # Find threads that:
        # 1. Have a project_id (belong to a project)
        # 2. Were updated before cutoff_time
        # 3. Don't have a summary yet
        # We do this in two queries since Supabase doesn't support complex LEFT JOIN anti-pattern well

        # Get all thread_ids that already have summaries
        existing_result = await client.table('thread_summaries') \
            .select('thread_id') \
            .execute()
        existing_thread_ids = set(row['thread_id'] for row in (existing_result.data or []))

        # Get inactive threads with project_id
        threads_result = await client.table('threads') \
            .select('thread_id, project_id, agent_id') \
            .not_.is_('project_id', 'null') \
            .lt('updated_at', cutoff_time) \
            .order('updated_at', desc=True) \
            .limit(100) \
            .execute()

        if not threads_result.data:
            logger.debug("No inactive threads found that need summaries")
            return

        # Filter out threads that already have summaries
        candidates = [
            t for t in threads_result.data
            if t['thread_id'] not in existing_thread_ids
        ]

        if not candidates:
            logger.debug("All inactive threads already have summaries")
            return

        # Check which threads have at least 2 messages
        threads_to_summarize = []
        for thread in candidates[:50]:  # Limit to 50 per run
            msg_result = await client.table('messages') \
                .select('message_id', count='exact') \
                .eq('thread_id', thread['thread_id']) \
                .limit(2) \
                .execute()

            if msg_result.count and msg_result.count >= 2:
                threads_to_summarize.append(thread)

        if not threads_to_summarize:
            logger.debug("No threads with enough messages to summarize")
            return

        logger.info(f"Found {len(threads_to_summarize)} threads that need summaries")

        # Generate summaries in parallel (batch of 5 at a time)
        batch_size = 5
        for i in range(0, len(threads_to_summarize), batch_size):
            batch = threads_to_summarize[i:i + batch_size]
            tasks = [
                _generate_summary_task(
                    thread_id=row["thread_id"],
                    project_id=row["project_id"],
                    agent_id=row.get("agent_id"),
                )
                for row in batch
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            success_count = sum(1 for r in results if not isinstance(r, Exception))
            logger.info(f"Batch completed: {success_count}/{len(batch)} summaries generated")

        logger.info(f"✅ Summary generation complete for {len(threads_to_summarize)} threads")

    except Exception as e:
        logger.error(f"Failed to generate summaries for inactive threads: {e}", exc_info=True)


async def _generate_summary_task(
    thread_id: str, project_id: str, agent_id: str = None
):
    """Generate a summary for a single thread."""
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(thread_id=thread_id, project_id=project_id)

    try:
        from core.threads.summary_service import generate_thread_summary

        logger.debug(f"Generating summary for thread {thread_id}")

        summary = await generate_thread_summary(
            thread_id=thread_id,
            project_id=project_id,
            agent_id=agent_id,
            is_auto=True,
        )

        logger.info(f"✅ Generated summary for thread {thread_id}")
        return summary

    except Exception as e:
        logger.error(f"Failed to generate summary for thread {thread_id}: {e}")
        raise


async def on_thread_completed(thread_id: str, project_id: str, agent_id: str = None):
    """Generate summary immediately when a thread is marked as completed."""
    logger.info(f"Thread {thread_id} marked as completed, generating summary")
    try:
        await _generate_summary_task(thread_id, project_id, agent_id)
    except Exception as e:
        logger.error(f"Failed to generate summary on thread completion: {e}")


def start_summary_worker(interval_minutes: int = 10):
    """Start the summary generation worker as a background task."""
    asyncio.create_task(run_summary_generation_worker(interval_minutes))
    logger.info("Summary generation worker started")
