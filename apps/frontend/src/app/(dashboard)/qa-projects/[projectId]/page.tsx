'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjectDetail, getReport, getProjectContext, updateProjectContext } from '@/lib/api/qa';
import type { ProjectDetailResponse, TestReportListItem, TestReportDetail, TestBug } from '@/lib/api/qa';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
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
  Brain,
  Shield,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function ScoreChart({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const max = 100;
  const min = 0;
  const height = 120;
  const width = Math.max(scores.length * 40, 200);
  const padding = { top: 10, bottom: 20, left: 30, right: 10 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = scores.map((s, i) => {
    const x = padding.left + (i / (scores.length - 1)) * chartW;
    const y = padding.top + chartH - ((s - min) / (max - min)) * chartH;
    return { x, y, score: s };
  });

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <svg width={width} height={height} className="w-full">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(val => {
        const y = padding.top + chartH - (val / 100) * chartH;
        return (
          <g key={val}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
              stroke="currentColor" strokeOpacity={0.1} strokeDasharray="4,4" />
            <text x={padding.left - 4} y={y + 3} textAnchor="end"
              className="fill-muted-foreground" fontSize={10}>{val}</text>
          </g>
        );
      })}
      {/* Line */}
      <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="2" points={polyline} />
      {/* Dots */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={4} fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
          <text x={p.x} y={p.y - 8} textAnchor="middle"
            className="fill-foreground" fontSize={10} fontWeight={600}>{p.score}%</text>
        </g>
      ))}
    </svg>
  );
}

function ProjectContextSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [description, setDescription] = useState('');
  const [contextNotes, setContextNotes] = useState('');

  // Fetch project context
  const { data: projectContext, isLoading } = useQuery({
    queryKey: ['project-context', projectId],
    queryFn: () => getProjectContext(projectId),
  });

  // Update local state when data is fetched
  React.useEffect(() => {
    if (projectContext) {
      setDescription(projectContext.description || '');
      setContextNotes(projectContext.context_notes || '');
      // Auto-expand if either field has content
      if (projectContext.description || projectContext.context_notes) {
        setIsExpanded(true);
      }
    }
  }, [projectContext]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: { description?: string; context_notes?: string }) =>
      updateProjectContext(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-context', projectId] });
      queryClient.invalidateQueries({ queryKey: ['qa-project', projectId] });
    },
  });

  const handleDescriptionBlur = () => {
    if (description !== (projectContext?.description || '')) {
      updateMutation.mutate({ description });
    }
  };

  const handleContextNotesBlur = () => {
    if (contextNotes !== (projectContext?.context_notes || '')) {
      updateMutation.mutate({ context_notes: contextNotes });
    }
  };

  if (isLoading) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader
        className="cursor-pointer hover:bg-muted/30 transition-colors pb-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Project Context
          </CardTitle>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Description
            </label>
            <Textarea
              placeholder="Brief project description..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              className="text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
              Context Notes
            </label>
            <Textarea
              placeholder="Stack, conventions, important decisions..."
              rows={4}
              value={contextNotes}
              onChange={(e) => setContextNotes(e.target.value)}
              onBlur={handleContextNotesBlur}
              className="text-sm"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function KnowledgeSection({ context, testSummary }: { context: ProjectDetailResponse['context']; testSummary: ProjectDetailResponse['test_summary'] }) {
  const knownIssues = context.known_issues || [];
  const recurringIssues = testSummary.recurring_issues || [];
  const notes = context.notes || [];
  const hasContent = knownIssues.length > 0 || recurringIssues.length > 0 || notes.length > 0 || context.site_description || context.tech_stack;

  if (!hasContent) {
    return (
      <div className="text-center py-12">
        <Brain className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-muted-foreground">No knowledge accumulated yet. Run more tests to build project memory.</p>
      </div>
    );
  }

  // Categorize notes
  const noteCategories: Record<string, string[]> = {};
  notes.forEach(note => {
    const match = note.match(/^\[([^\]]+)\]/);
    const category = match ? match[1] : 'General';
    if (!noteCategories[category]) noteCategories[category] = [];
    noteCategories[category].push(match ? note.replace(/^\[[^\]]+\]\s*/, '') : note);
  });

  return (
    <div className="space-y-6">
      {/* Site Info */}
      {(context.site_description || context.tech_stack) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Globe className="h-4 w-4" /> Site Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {context.site_description && (
              <div>
                <span className="font-medium text-muted-foreground">Description: </span>
                {context.site_description}
              </div>
            )}
            {context.tech_stack && (
              <div>
                <span className="font-medium text-muted-foreground">Tech Stack: </span>
                {context.tech_stack}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Known Issues */}
      {knownIssues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bug className="h-4 w-4 text-red-500" />
              Known Issues
              <Badge variant="destructive" className="ml-auto">{knownIssues.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {knownIssues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recurring Issues */}
      {recurringIssues.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Recurring Issues
              <Badge variant="outline" className="ml-auto text-yellow-600">{recurringIssues.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">Issues that appeared in multiple test runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recurringIssues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Qualitative Notes by Category */}
      {Object.keys(noteCategories).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-500" />
              Qualitative Notes
              <Badge variant="outline" className="ml-auto text-blue-600">{notes.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">Observations extracted from test runs</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(noteCategories).map(([category, catNotes]) => (
                <div key={category}>
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">{category}</h4>
                  <div className="space-y-1.5">
                    {catNotes.map((note, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <span className="text-muted-foreground">•</span>
                        <span>{note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const testTypeLabels: Record<string, string> = {
  'full-audit': 'Full Audit',
  'signup-flow': 'Signup Flow',
  'checkout-flow': 'Checkout Flow',
  'form-validation': 'Form Validation',
  'responsive-check': 'Responsive',
  'custom': 'Custom',
};

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.projectId as string;

  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ['qa-project', projectId],
    queryFn: () => getProjectDetail(projectId),
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">Failed to load project</p>
        <Button variant="outline" className="mt-4" onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const scores = project.test_summary.scores || [];
  const lastScore = scores.length > 0 ? scores[scores.length - 1] : null;
  const completedTests = project.reports.filter(r => r.status === 'completed').length;
  const failedTests = project.reports.filter(r => r.status === 'failed').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/qa-projects')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{project.name}</h1>
            {project.site_url && (
              <a href={project.site_url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                {project.site_url} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => router.push('/dashboard')}>
            Run New Test
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-8 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Latest Score:</span>
            {lastScore !== null ? (
              <Badge variant={lastScore >= 80 ? 'default' : lastScore >= 60 ? 'outline' : 'destructive'}>
                {lastScore}%
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Total Runs:</span>
            <span className="font-medium">{project.total_tests}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            <span>{completedTests} completed</span>
          </div>
          {failedTests > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-3.5 w-3.5 text-red-500" />
              <span>{failedTests} failed</span>
            </div>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Updated {timeAgo(project.updated_at)}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl">
          {/* Project Context Section */}
          <ProjectContextSection projectId={projectId} />

          <Tabs defaultValue="knowledge">
            <TabsList>
              <TabsTrigger value="knowledge">
                <Brain className="h-4 w-4 mr-1.5" /> Knowledge
              </TabsTrigger>
              <TabsTrigger value="tests">
                <FileText className="h-4 w-4 mr-1.5" /> Test History ({project.total_tests})
              </TabsTrigger>
              <TabsTrigger value="trends">
                <TrendingUp className="h-4 w-4 mr-1.5" /> Score Trend
              </TabsTrigger>
            </TabsList>

            <TabsContent value="knowledge" className="mt-4">
              <KnowledgeSection context={project.context} testSummary={project.test_summary} />
            </TabsContent>

            <TabsContent value="tests" className="mt-4">
              {project.reports.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">No test reports yet</p>
                </div>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Viewport</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Pass / Fail / Warn</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {project.reports.map((report: TestReportListItem) => (
                        <TableRow
                          key={report.report_id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/reports/${report.report_id}`)}
                        >
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {testTypeLabels[report.test_type] || report.test_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="capitalize">{report.viewport}</TableCell>
                          <TableCell>
                            {report.score !== null ? (
                              <Badge variant={report.score >= 80 ? 'default' : report.score >= 60 ? 'outline' : 'destructive'}>
                                {report.score}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="text-green-600 font-medium">{report.passed}</span>
                            {' / '}
                            <span className="text-red-600 font-medium">{report.failed}</span>
                            {' / '}
                            <span className="text-yellow-600 font-medium">{report.warnings}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={report.status === 'completed' ? 'default' : report.status === 'failed' ? 'destructive' : 'secondary'}>
                              {report.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(report.created_at)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/reports/${report.report_id}`);
                            }}>View</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="trends" className="mt-4">
              {scores.length < 2 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground">Need at least 2 completed tests to show trends</p>
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Score Trend</CardTitle>
                    <CardDescription>Score progression across test runs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScoreChart scores={scores} />
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
