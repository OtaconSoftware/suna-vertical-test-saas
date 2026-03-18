"""
Background worker for automatic thread summary generation.

Checks for threads that have been inactive for >30 minutes and generates
summaries automatically.
"""

import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

from core.utils.logger import logger, structlog
from core.services.supabase import DBConnection

_db = DBConnection()


async def run_summary_generation_worker(interval_minutes: int = 10):
    """
    Background worker that periodically checks for inactive threads and generates summaries.

    Args:
        interval_minutes: How often to run the check (default 10 minutes)
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

    Args:
        inactivity_minutes: Minimum inactivity time before generating summary
    """
    from core.utils.init_helpers import initialize

    await initialize()

    try:
        client = await _db.client

        # Find threads that:
        # 1. Have been updated more than X minutes ago
        # 2. Don't have a summary yet
        # 3. Have at least 2 messages (user + assistant)
        cutoff_time = datetime.now(timezone.utc) - timedelta(minutes=inactivity_minutes)

        query = """
        SELECT
            t.thread_id,
            t.project_id,
            t.agent_id,
            t.updated_at,
            COUNT(m.message_id) as message_count
        FROM threads t
        LEFT JOIN messages m ON t.thread_id = m.thread_id
        LEFT JOIN thread_summaries ts ON t.thread_id = ts.thread_id
        WHERE t.updated_at < :cutoff_time
            AND ts.id IS NULL
            AND t.project_id IS NOT NULL
        GROUP BY t.thread_id, t.project_id, t.agent_id, t.updated_at
        HAVING COUNT(m.message_id) >= 2
        ORDER BY t.updated_at DESC
        LIMIT 50
        """

        from core.services.db import execute

        rows = await execute(query, {"cutoff_time": cutoff_time})

        if not rows:
            logger.debug("No inactive threads found that need summaries")
            return

        logger.info(f"Found {len(rows)} threads that need summaries")

        # Generate summaries in parallel (batch of 5 at a time)
        batch_size = 5
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            tasks = [
                generate_thread_summary_task(
                    thread_id=str(row["thread_id"]),
                    project_id=str(row["project_id"]),
                    agent_id=str(row["agent_id"]) if row.get("agent_id") else None,
                )
                for row in batch
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Log results
            success_count = sum(1 for r in results if not isinstance(r, Exception))
            logger.info(f"Batch completed: {success_count}/{len(batch)} summaries generated")

        logger.info(f"✅ Summary generation complete for {len(rows)} threads")

    except Exception as e:
        logger.error(f"Failed to generate summaries for inactive threads: {e}", exc_info=True)


async def generate_thread_summary_task(
    thread_id: str, project_id: str, agent_id: str = None
) -> Dict[str, Any]:
    """
    Generate a summary for a single thread.

    Args:
        thread_id: UUID of the thread
        project_id: UUID of the project
        agent_id: UUID of the agent (optional)

    Returns:
        Generated summary record
    """
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(thread_id=thread_id, project_id=project_id)

    try:
        from core.threads.summary_service import get_summary_service

        logger.debug(f"Generating summary for thread {thread_id}")

        summary_service = get_summary_service()
        summary = await summary_service.generate_thread_summary(
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


# Optional: Function to be called when a thread is marked as completed
async def on_thread_completed(thread_id: str, project_id: str, agent_id: str = None):
    """
    Generate summary immediately when a thread is marked as completed.

    Args:
        thread_id: UUID of the thread
        project_id: UUID of the project
        agent_id: UUID of the agent (optional)
    """
    logger.info(f"Thread {thread_id} marked as completed, generating summary")

    try:
        await generate_thread_summary_task(thread_id, project_id, agent_id)
    except Exception as e:
        logger.error(f"Failed to generate summary on thread completion: {e}")


# Function to start the worker
def start_summary_worker(interval_minutes: int = 10):
    """
    Start the summary generation worker as a background task.

    Args:
        interval_minutes: How often to check for inactive threads
    """
    asyncio.create_task(run_summary_generation_worker(interval_minutes))
    logger.info("Summary generation worker started")
