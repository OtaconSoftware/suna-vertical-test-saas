'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getProjects } from '@/lib/api/qa';
import type { ProjectListItem } from '@/lib/api/qa';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FolderKanban,
  ExternalLink,
  Clock,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Bug,
  FileText,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

function ScoreTrend({ scores }: { scores: number[] }) {
  if (scores.length === 0) return <span className="text-muted-foreground text-sm">No data</span>;
  if (scores.length === 1) return <Badge variant="outline">{scores[0]}%</Badge>;

  const last = scores[scores.length - 1];
  const prev = scores[scores.length - 2];
  const diff = last - prev;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  const color = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground';

  return (
    <div className="flex items-center gap-2">
      <Badge variant={last >= 80 ? 'default' : last >= 60 ? 'outline' : 'destructive'}>
        {last}%
      </Badge>
      <div className={cn('flex items-center gap-0.5 text-xs', color)}>
        <Icon className="h-3 w-3" />
        <span>{diff > 0 ? '+' : ''}{diff}%</span>
      </div>
    </div>
  );
}

function MiniSparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min || 1;
  const height = 24;
  const width = scores.length * 8;

  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((s - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  const lastScore = scores[scores.length - 1];
  const color = lastScore >= 80 ? '#22c55e' : lastScore >= 60 ? '#eab308' : '#ef4444';

  return (
    <svg width={width} height={height} className="ml-2">
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={points} />
    </svg>
  );
}

export default function QAProjectsPage() {
  const router = useRouter();
  const { data: projects = [], isLoading, error, refetch } = useQuery({
    queryKey: ['qa-projects'],
    queryFn: () => getProjects({ limit: 100 }),
  });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-6 w-6 text-foreground" />
          <div>
            <h1 className="text-xl font-semibold">Projects</h1>
            <p className="text-sm text-muted-foreground">QA projects with accumulated knowledge</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-1', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-destructive">Failed to load projects</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20">
            <FolderKanban className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Run a QA test to automatically create a project
            </p>
            <Button onClick={() => router.push('/dashboard')}>Run a Test 🧪</Button>
          </div>
        ) : (
          <div className="max-w-5xl grid gap-4">
            {projects.map((project: ProjectListItem) => (
              <Card
                key={project.project_id}
                className="cursor-pointer hover:border-foreground/20 transition-colors"
                onClick={() => router.push(`/qa-projects/${project.project_id}`)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <div>
                        <CardTitle className="text-base">{project.name}</CardTitle>
                        {project.site_url && (
                          <a
                            href={project.site_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5"
                          >
                            {project.site_url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <ScoreTrend scores={project.scores} />
                      <MiniSparkline scores={project.scores} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      <span>{project.total_tests} test{project.total_tests !== 1 ? 's' : ''}</span>
                    </div>
                    {project.known_issues.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Bug className="h-3.5 w-3.5 text-red-500" />
                        <span>{project.known_issues.length} known issue{project.known_issues.length !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {project.recurring_issues.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                        <span>{project.recurring_issues.length} recurring</span>
                      </div>
                    )}
                    {project.notes_count > 0 && (
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-blue-500" />
                        <span>{project.notes_count} note{project.notes_count !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{timeAgo(project.updated_at)}</span>
                    </div>
                  </div>

                  {project.known_issues.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {project.known_issues.slice(0, 5).map((issue, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs font-normal text-red-600 border-red-200">
                          {issue}
                        </Badge>
                      ))}
                      {project.known_issues.length > 5 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{project.known_issues.length - 5} more
                        </Badge>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
