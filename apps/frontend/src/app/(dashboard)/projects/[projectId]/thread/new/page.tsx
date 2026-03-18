'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ThreadComponent } from '@/components/thread/ThreadComponent';
import { createThreadInProject } from '@/lib/api/threads';
import { useSelectedAgentId } from '@/stores/agent-selection-store';

export default function NewThreadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const unwrappedParams = React.use(params);
  const { projectId } = unwrappedParams;
  const router = useRouter();
  const selectedAgentId = useSelectedAgentId();

  // Generate a stable temporary ID for display
  const tempThreadId = useMemo(() => crypto.randomUUID(), []);

  // Pre-created thread ID (stored but not used until submit)
  const preCreatedThreadId = useRef<string | null>(null);
  const creationStarted = useRef(false);

  // Pre-create thread on mount (in background, don't affect UI)
  // Pass the selected agent_id if available
  useEffect(() => {
    if (creationStarted.current) return;
    creationStarted.current = true;

    async function preCreateThread() {
      try {
        const result = await createThreadInProject(projectId, selectedAgentId);
        preCreatedThreadId.current = result.thread_id;
        console.log('[NewThreadPage] Pre-created thread:', result.thread_id, 'with agent:', selectedAgentId);
      } catch (error) {
        console.error('[NewThreadPage] Failed to pre-create thread:', error);
      }
    }

    preCreateThread();
  }, [projectId, selectedAgentId]);

  // Always show the empty state UI with tempThreadId
  // The real thread ID is used behind the scenes when submitting
  return (
    <ThreadComponent
      projectId={projectId}
      threadId={tempThreadId}
      isNew
      preCreatedThreadId={preCreatedThreadId}
    />
  );
}
