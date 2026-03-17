'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getReport } from '@/lib/api/qa';
import type { TestBug } from '@/lib/api/qa';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ChevronDown, CheckCircle2, XCircle, AlertTriangle, ArrowLeft,
  ExternalLink, Lightbulb, Shield, Eye, Zap, Globe, FileCode,
  BarChart3, Bug, Info
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

// ── Helpers ──────────────────────────────────────────

function categoriseBug(bug: TestBug): string {
  const n = (bug.name + ' ' + bug.description).toLowerCase();
  if (n.includes('load') || n.includes('navigation') || n.includes('navigat') || n.includes('page load')) return 'Navigation & Pages';
  if (n.includes('404') || n.includes('link') || n.includes('broken')) return 'Broken Links';
  if (n.includes('403') || n.includes('access') || n.includes('auth') || n.includes('login')) return 'Authentication & Access';
  if (n.includes('javascript') || n.includes('console') || n.includes('error')) return 'JavaScript Errors';
  if (n.includes('visual') || n.includes('screenshot') || n.includes('css') || n.includes('layout')) return 'Visual & Layout';
  if (n.includes('placeholder') || n.includes('lorem') || n.includes('content')) return 'Content Quality';
  if (n.includes('performance') || n.includes('speed') || n.includes('slow')) return 'Performance';
  if (n.includes('seo') || n.includes('meta') || n.includes('sitemap')) return 'SEO';
  if (n.includes('responsive') || n.includes('mobile')) return 'Responsive';
  if (n.includes('form') || n.includes('input') || n.includes('validation')) return 'Forms & Input';
  return 'General';
}

function getCategoryIcon(cat: string) {
  switch (cat) {
    case 'Navigation & Pages': return <Globe className="h-4 w-4" />;
    case 'Broken Links': return <FileCode className="h-4 w-4" />;
    case 'Authentication & Access': return <Shield className="h-4 w-4" />;
    case 'JavaScript Errors': return <Bug className="h-4 w-4" />;
    case 'Visual & Layout': return <Eye className="h-4 w-4" />;
    case 'Performance': return <Zap className="h-4 w-4" />;
    default: return <Info className="h-4 w-4" />;
  }
}

function getRecommendation(bug: TestBug): string | null {
  if (bug.status === 'PASS') return null;
  const n = bug.name.toLowerCase();
  const d = bug.description.toLowerCase();

  if (n.includes('403') || n.includes('access denied'))
    return 'Check server permissions and .htaccess rules. Ensure the page is publicly accessible or requires proper authentication flow. If behind a login, add credentials to the test config.';
  if (n.includes('404') || n.includes('not found') || d.includes('404'))
    return 'Audit all internal links. Use a site crawler to find broken references. Check for typos in URLs and ensure redirects are configured for moved pages.';
  if (n.includes('javascript') || n.includes('console error'))
    return 'Open browser DevTools → Console tab to identify the error source. Common causes: missing dependencies, undefined variables, or CORS issues. Fix the root JS error and add error boundaries for graceful degradation.';
  if (n.includes('placeholder'))
    return 'Search the codebase for "lorem ipsum", "TODO", "placeholder", and "TBD" text. Replace with actual content before production deployment.';
  if (n.includes('performance') || n.includes('slow'))
    return 'Optimize images (WebP/AVIF), enable lazy loading, minify CSS/JS, use CDN caching, and consider code splitting for large bundles.';
  if (n.includes('responsive') || n.includes('mobile'))
    return 'Test with Chrome DevTools device emulator. Check viewport meta tag, use relative units (rem/%), and audit media queries for breakpoints.';
  if (n.includes('seo') || n.includes('meta'))
    return 'Add missing meta tags (title, description, og:image). Ensure each page has a unique title and canonical URL. Check robots.txt and sitemap.xml.';
  if (n.includes('form') || n.includes('validation'))
    return 'Add both client-side and server-side validation. Show clear error messages, mark required fields, and test edge cases (empty, too long, special chars).';

  return 'Investigate the root cause by checking server logs and browser DevTools. Reproduce the issue consistently, then apply a targeted fix.';
}

// ── Score Ring ─────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" strokeWidth="8" className="text-muted/20" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

// ── Severity Bar ──────────────────────────────────────

function SeverityBar({ bugs }: { bugs: TestBug[] }) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  bugs.filter(b => b.status !== 'PASS').forEach(b => {
    if (b.severity in counts) counts[b.severity as keyof typeof counts]++;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const segments = [
    { key: 'Critical', color: 'bg-red-600', count: counts.Critical },
    { key: 'High', color: 'bg-orange-500', count: counts.High },
    { key: 'Medium', color: 'bg-yellow-500', count: counts.Medium },
    { key: 'Low', color: 'bg-blue-400', count: counts.Low },
  ].filter(s => s.count > 0);

  return (
    <div className="space-y-2">
      <div className="flex h-3 rounded-full overflow-hidden">
        {segments.map(s => (
          <div key={s.key} className={cn(s.color, 'transition-all')}
            style={{ width: `${(s.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        {segments.map(s => (
          <div key={s.key} className="flex items-center gap-1">
            <div className={cn('w-2 h-2 rounded-full', s.color)} />
            {s.key}: {s.count}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['qa-report', reportId],
    queryFn: () => getReport(reportId),
    enabled: !!reportId,
  });

  const toggleTest = (index: number) => {
    setExpandedTests(prev => {
      const next = new Set(prev);
      if (next.has(index)) { next.delete(index); } else { next.add(index); }
      return next;
    });
  };

  const expandAllFailed = () => {
    if (!report?.bugs) return;
    const failed = new Set<number>();
    report.bugs.forEach((b: TestBug, i: number) => {
      if (b.status !== 'PASS') failed.add(i);
    });
    setExpandedTests(failed);
  };

  // Group bugs by category
  const grouped = useMemo(() => {
    if (!report?.bugs) return {};
    const map: Record<string, { bugs: TestBug[]; indices: number[] }> = {};
    report.bugs.forEach((bug: TestBug, i: number) => {
      const cat = categoriseBug(bug);
      if (!map[cat]) map[cat] = { bugs: [], indices: [] };
      map[cat].bugs.push(bug);
      map[cat].indices.push(i);
    });
    return map;
  }, [report?.bugs]);

  // Failed bugs only
  const failedBugs = useMemo(() => {
    if (!report?.bugs) return [];
    return report.bugs
      .map((b: TestBug, i: number) => ({ bug: b, index: i }))
      .filter(({ bug }: { bug: TestBug }) => bug.status !== 'PASS');
  }, [report?.bugs]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS': return <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />;
      case 'FAIL': return <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />;
      case 'WARNING': return <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />;
      default: return null;
    }
  };

  const getSeverityBadge = (severity: string) => {
    const variant = severity === 'Critical' || severity === 'High' ? 'destructive'
      : severity === 'Medium' ? 'outline' : 'secondary';
    return <Badge variant={variant as any}>{severity}</Badge>;
  };

  // ── Loading / Error ──────────────────────────────────

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48" />
          <Skeleton className="h-48 md:col-span-2" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="container mx-auto py-8 max-w-5xl">
        <Card>
          <CardHeader>
            <CardTitle>Error Loading Report</CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : 'Report not found'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">QA Test Report</h1>
          <div className="flex items-center gap-2 mt-1 text-muted-foreground text-sm">
            <a href={report.test_url} target="_blank" rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1">
              {report.test_url} <ExternalLink className="h-3 w-3" />
            </a>
            <span>•</span>
            <span>{new Date(report.created_at).toLocaleString()}</span>
            <span>•</span>
            <span className="capitalize">{report.test_type.replace(/-/g, ' ')}</span>
          </div>
        </div>
      </div>

      {/* Score + Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Score Ring Card */}
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            {report.score !== null ? (
              <ScoreRing score={report.score} />
            ) : (
              <div className="text-4xl font-bold text-muted-foreground">—</div>
            )}
            <p className="text-sm text-muted-foreground mt-3 capitalize">
              {report.viewport} • {report.test_type.replace(/-/g, ' ')}
            </p>
          </CardContent>
        </Card>

        {/* Stats + Severity Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-3 border rounded-lg">
                <div className="text-2xl font-bold">{report.total_tests}</div>
                <div className="text-xs text-muted-foreground">Total</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-green-50 dark:bg-green-950/30">
                <div className="text-2xl font-bold text-green-600">{report.passed}</div>
                <div className="text-xs text-muted-foreground">Passed</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-red-50 dark:bg-red-950/30">
                <div className="text-2xl font-bold text-red-600">{report.failed}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </div>
              <div className="text-center p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950/30">
                <div className="text-2xl font-bold text-yellow-600">{report.warnings}</div>
                <div className="text-xs text-muted-foreground">Warnings</div>
              </div>
            </div>
            {report.bugs && <SeverityBar bugs={report.bugs} />}
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Issues / All Tests / Raw */}
      <Tabs defaultValue="issues" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="issues" className="gap-1.5">
              <Bug className="h-4 w-4" /> Issues ({failedBugs.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1.5">
              <BarChart3 className="h-4 w-4" /> All Tests ({report.total_tests})
            </TabsTrigger>
            {report.raw_report && (
              <TabsTrigger value="raw" className="gap-1.5">
                <FileCode className="h-4 w-4" /> Raw Log
              </TabsTrigger>
            )}
          </TabsList>
          {failedBugs.length > 0 && (
            <Button variant="outline" size="sm" onClick={expandAllFailed}>
              Expand All Issues
            </Button>
          )}
        </div>

        {/* ── Issues Tab ────────────────────────────────── */}
        <TabsContent value="issues" className="space-y-4">
          {failedBugs.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold">All Tests Passed!</h3>
                <p className="text-sm text-muted-foreground">No issues found during this test run.</p>
              </CardContent>
            </Card>
          ) : (
            failedBugs.map(({ bug, index }: { bug: TestBug; index: number }) => {
              const rec = getRecommendation(bug);
              return (
                <Collapsible key={index} open={expandedTests.has(index)}
                  onOpenChange={() => toggleTest(index)}>
                  <Card className={cn(
                    "border-l-4 transition-colors",
                    bug.status === 'FAIL' && "border-l-red-600",
                    bug.status === 'WARNING' && "border-l-yellow-600"
                  )}>
                    <CollapsibleTrigger className="w-full">
                      <CardHeader className="hover:bg-muted/50 transition-colors py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {getStatusIcon(bug.status)}
                            <div className="text-left">
                              <CardTitle className="text-base">{bug.name}</CardTitle>
                              <CardDescription className="text-xs mt-0.5">
                                {categoriseBug(bug)}
                              </CardDescription>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(bug.severity)}
                            <ChevronDown className={cn(
                              "h-4 w-4 transition-transform",
                              expandedTests.has(index) && "rotate-180"
                            )} />
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-4">
                        <Separator />
                        {bug.description && (
                          <div>
                            <div className="text-sm font-medium mb-1">Description</div>
                            <div className="text-sm text-muted-foreground">{bug.description}</div>
                          </div>
                        )}
                        {bug.expected && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <div className="text-sm font-medium mb-1">Expected</div>
                              <div className="text-sm text-muted-foreground bg-green-50 dark:bg-green-950/20 p-2 rounded border border-green-200 dark:border-green-900">
                                {bug.expected}
                              </div>
                            </div>
                            {bug.actual && (
                              <div>
                                <div className="text-sm font-medium mb-1">Actual</div>
                                <div className="text-sm text-muted-foreground bg-red-50 dark:bg-red-950/20 p-2 rounded border border-red-200 dark:border-red-900">
                                  {bug.actual}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {bug.screenshot_url && (
                          <div>
                            <div className="text-sm font-medium mb-2">Screenshot</div>
                            <img src={bug.screenshot_url} alt="Test screenshot"
                              className="border rounded-lg max-w-full max-h-96 object-contain" />
                          </div>
                        )}
                        {rec && (
                          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
                            <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">
                              <Lightbulb className="h-4 w-4" />
                              Recommended Fix
                            </div>
                            <div className="text-sm text-blue-600 dark:text-blue-300">
                              {rec}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </TabsContent>

        {/* ── All Tests Tab (grouped by category) ───────── */}
        <TabsContent value="all" className="space-y-6">
          {Object.entries(grouped).map(([category, { bugs, indices }]) => {
            const passed = bugs.filter((b: TestBug) => b.status === 'PASS').length;
            const total = bugs.length;
            return (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(category)}
                      <CardTitle className="text-base">{category}</CardTitle>
                    </div>
                    <Badge variant={passed === total ? 'default' : 'outline'}>
                      {passed}/{total} passed
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {bugs.map((bug: TestBug, j: number) => {
                    const globalIndex = indices[j];
                    return (
                      <Collapsible key={globalIndex} open={expandedTests.has(globalIndex)}
                        onOpenChange={() => toggleTest(globalIndex)}>
                        <CollapsibleTrigger className="w-full">
                          <div className={cn(
                            "flex items-center justify-between p-2.5 rounded-md hover:bg-muted/50 transition-colors",
                            bug.status === 'FAIL' && "bg-red-50/50 dark:bg-red-950/10",
                            bug.status === 'WARNING' && "bg-yellow-50/50 dark:bg-yellow-950/10"
                          )}>
                            <div className="flex items-center gap-2.5">
                              {getStatusIcon(bug.status)}
                              <span className="text-sm">{bug.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {bug.status !== 'PASS' && getSeverityBadge(bug.severity)}
                              <ChevronDown className={cn(
                                "h-3.5 w-3.5 text-muted-foreground transition-transform",
                                expandedTests.has(globalIndex) && "rotate-180"
                              )} />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-8 mr-2 mb-2 p-3 bg-muted/30 rounded-md space-y-2 text-sm">
                            <p className="text-muted-foreground">{bug.description}</p>
                            {bug.status !== 'PASS' && bug.expected && (
                              <div className="grid grid-cols-2 gap-2">
                                <div><span className="font-medium">Expected:</span> {bug.expected}</div>
                                <div><span className="font-medium">Actual:</span> {bug.actual}</div>
                              </div>
                            )}
                            {bug.status !== 'PASS' && getRecommendation(bug) && (
                              <div className="flex items-start gap-2 text-blue-600 dark:text-blue-400">
                                <Lightbulb className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <span>{getRecommendation(bug)}</span>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ── Raw Log Tab ───────────────────────────────── */}
        {report.raw_report && (
          <TabsContent value="raw">
            <Card>
              <CardContent className="pt-6">
                <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[600px] overflow-y-auto">
                  {report.raw_report}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Actions */}
      <div className="flex gap-2 pb-8">
        {report.thread_id && (
          <Button variant="outline"
            onClick={() => router.push(`/projects/${report.project_id}/thread/${report.thread_id}`)}>
            View Test Thread
          </Button>
        )}
        <Button variant="outline" onClick={() => router.push('/test-history')}>
          All Test History
        </Button>
        {report.project_id && (
          <Button variant="outline"
            onClick={() => router.push(`/qa-projects/${report.project_id}`)}>
            View Project
          </Button>
        )}
      </div>
    </div>
  );
}
