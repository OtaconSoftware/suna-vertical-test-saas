'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ClipboardCheck, 
  ExternalLink, 
  Clock, 
  Loader2,
  Plus,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestThread {
  thread_id: string;
  project_id: string;
  created_at: string;
  name: string;
  metadata: Record<string, any>;
}

function getTestInfo(thread: TestThread) {
  const meta = thread.metadata || {};
  return {
    url: meta.test_url || 'Unknown URL',
    testType: meta.test_type || 'unknown',
    viewport: meta.viewport || 'desktop',
  };
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

const testTypeLabels: Record<string, string> = {
  'full-audit': 'Full Audit',
  'signup-flow': 'Signup Flow',
  'checkout-flow': 'Checkout Flow',
  'form-validation': 'Form Validation',
  'responsive-check': 'Responsive',
  'custom': 'Custom',
};

export default function TestHistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [threads, setThreads] = useState<TestThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTests = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('threads')
        .select('thread_id, project_id, created_at, name, metadata')
        .eq('account_id', user.id)
        .not('metadata->qa_test', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (fetchError) throw fetchError;
      setThreads(data || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load test history';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, [user]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Test History</h1>
            <p className="text-sm text-muted-foreground">All your QA test runs</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchTests} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => router.push('/')}>
            <Plus className="h-4 w-4 mr-1" />
            New Test
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && threads.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchTests}>Try again</Button>
          </div>
        ) : threads.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">No tests yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Run your first QA test to see results here</p>
            <Button onClick={() => router.push('/')}>Run a Test 🧪</Button>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {threads.map((thread) => {
              const info = getTestInfo(thread);
              return (
                <Card
                  key={thread.thread_id}
                  className="cursor-pointer transition-colors hover:bg-accent/30"
                  onClick={() => router.push(`/projects/${thread.project_id}/thread/${thread.thread_id}`)}
                >
                  <CardContent className="flex items-center gap-4 py-4 px-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{info.url}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {testTypeLabels[info.testType] || info.testType}
                        </Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {info.viewport}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {timeAgo(thread.created_at)}
                        </span>
                      </div>
                    </div>
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
