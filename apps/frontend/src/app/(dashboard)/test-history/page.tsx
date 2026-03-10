'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { OtaconLoader } from '@/components/ui/otacon-loader';
import { useThreads } from '@/hooks/threads/use-threads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ClipboardCheck, ExternalLink, ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getTestTypeLabel(metadata: any): string {
  const testType = metadata?.test_type;
  const labels: Record<string, string> = {
    'full-audit': 'Full Audit',
    'signup-flow': 'Signup Flow',
    'checkout-flow': 'Checkout Flow',
    'form-validation': 'Form Validation',
    'responsive-check': 'Responsive',
    'custom': 'Custom',
  };
  return labels[testType] || 'QA Test';
}

function getTestUrl(metadata: any): string | null {
  return metadata?.test_url || null;
}

export default function TestHistoryPage() {
  const router = useRouter();

  const { data: threadsResponse, isLoading } = useThreads({
    page: 1,
    limit: 200,
  });

  // Filter QA test threads
  const qaThreads = useMemo(() => {
    if (!threadsResponse?.threads) return [];
    return threadsResponse.threads
      .filter(t => t.metadata?.qa_test === true)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [threadsResponse]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <OtaconLoader size="md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Test History</h1>
            {qaThreads.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {qaThreads.length} tests
              </Badge>
            )}
          </div>
          <Button size="sm" asChild>
            <Link href="/dashboard">
              <Plus className="h-4 w-4 mr-1" />
              New Test
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {qaThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h2 className="text-lg font-medium mb-2">No tests yet</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Run your first QA test to see results here.
            </p>
            <Button asChild>
              <Link href="/dashboard">Run a Test 🧪</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {qaThreads.map((thread) => {
              const testUrl = getTestUrl(thread.metadata);
              const testType = getTestTypeLabel(thread.metadata);
              const isRunning = thread.metadata?.status === 'running';

              return (
                <Card
                  key={thread.thread_id}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-accent/50 border-border/50',
                    isRunning && 'border-blue-500/30'
                  )}
                  onClick={() => router.push(`/projects/${thread.project_id}/thread/${thread.thread_id}`)}
                >
                  <CardContent className="flex items-center gap-4 py-4 px-5">
                    {/* Status indicator */}
                    <div className={cn(
                      'h-2.5 w-2.5 rounded-full flex-shrink-0',
                      isRunning ? 'bg-blue-500 animate-pulse' : 'bg-green-500'
                    )} />

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {testUrl && (
                          <span className="text-sm font-medium truncate">
                            {testUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                          </span>
                        )}
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {testType}
                        </Badge>
                        {isRunning && (
                          <Badge className="text-xs bg-blue-500/20 text-blue-600 dark:text-blue-400 flex-shrink-0">
                            Running
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(thread.created_at)}
                        {thread.metadata?.viewport && (
                          <span> · {thread.metadata.viewport}</span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
