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
import { ChevronDown, CheckCircle2, XCircle, AlertTriangle, ArrowLeft, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

export default function ReportDetailPage() {
  const params = useParams();
  const router = useRouter();
  const reportId = params.reportId as string;
  const [showRawReport, setShowRawReport] = useState(false);
  const [expandedTests, setExpandedTests] = useState<Set<number>>(new Set());

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['qa-report', reportId],
    queryFn: () => getReport(reportId),
    enabled: !!reportId,
  });

  const toggleTest = (index: number) => {
    const newExpanded = new Set(expandedTests);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedTests(newExpanded);
  };

  const getScoreBadgeVariant = (score: number | null) => {
    if (score === null) return 'secondary';
    if (score >= 80) return 'default';
    if (score >= 60) return 'outline';
    return 'destructive';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASS':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'FAIL':
        return <XCircle className="h-5 w-5 text-red-600" />;
      case 'WARNING':
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getSeverityBadgeVariant = (severity: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (severity) {
      case 'Critical':
        return 'destructive';
      case 'High':
        return 'destructive';
      case 'Medium':
        return 'outline';
      case 'Low':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6 max-w-5xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
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
            <Button onClick={() => router.push('/dashboard')}>
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Test Report</h1>
          <div className="flex items-center gap-2 mt-1 text-muted-foreground">
            <a
              href={report.test_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline flex items-center gap-1"
            >
              {report.test_url}
              <ExternalLink className="h-3 w-3" />
            </a>
            <span>•</span>
            <span>{new Date(report.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Score Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Overall Score</CardTitle>
              <CardDescription className="capitalize">
                {report.test_type.replace('-', ' ')} • {report.viewport}
              </CardDescription>
            </div>
            {report.score !== null && (
              <div className="text-center">
                <Badge
                  variant={getScoreBadgeVariant(report.score)}
                  className="text-3xl px-6 py-2 font-bold"
                >
                  {report.score}%
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold">{report.total_tests}</div>
              <div className="text-sm text-muted-foreground">Total Tests</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-600">{report.passed}</div>
              <div className="text-sm text-muted-foreground">Passed</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-red-50 dark:bg-red-950">
              <div className="text-2xl font-bold text-red-600">{report.failed}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
            <div className="text-center p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-950">
              <div className="text-2xl font-bold text-yellow-600">{report.warnings}</div>
              <div className="text-sm text-muted-foreground">Warnings</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Results */}
      {report.bugs && report.bugs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              {report.bugs.length} test{report.bugs.length !== 1 ? 's' : ''} executed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.bugs.map((bug: TestBug, index: number) => (
              <Collapsible
                key={index}
                open={expandedTests.has(index)}
                onOpenChange={() => toggleTest(index)}
              >
                <Card className={cn(
                  "border-l-4 transition-colors",
                  bug.status === 'PASS' && "border-l-green-600",
                  bug.status === 'FAIL' && "border-l-red-600",
                  bug.status === 'WARNING' && "border-l-yellow-600"
                )}>
                  <CollapsibleTrigger className="w-full">
                    <CardHeader className="hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(bug.status)}
                          <div className="text-left">
                            <CardTitle className="text-base">{bug.name}</CardTitle>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityBadgeVariant(bug.severity)}>
                            {bug.severity}
                          </Badge>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition-transform",
                              expandedTests.has(index) && "rotate-180"
                            )}
                          />
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-4">
                      <Separator />

                      <div>
                        <div className="text-sm font-medium mb-1">Description</div>
                        <div className="text-sm text-muted-foreground">{bug.description}</div>
                      </div>

                      {bug.expected && (
                        <div>
                          <div className="text-sm font-medium mb-1">Expected</div>
                          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                            {bug.expected}
                          </div>
                        </div>
                      )}

                      {bug.actual && (
                        <div>
                          <div className="text-sm font-medium mb-1">Actual</div>
                          <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                            {bug.actual}
                          </div>
                        </div>
                      )}

                      {bug.screenshot_url && (
                        <div>
                          <div className="text-sm font-medium mb-2">Screenshot</div>
                          <img
                            src={bug.screenshot_url}
                            alt="Test screenshot"
                            className="border rounded-lg max-w-full"
                          />
                        </div>
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Raw Report */}
      {report.raw_report && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Raw Report</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRawReport(!showRawReport)}
              >
                {showRawReport ? 'Hide' : 'Show'}
              </Button>
            </div>
          </CardHeader>
          {showRawReport && (
            <CardContent>
              <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">
                {report.raw_report}
              </pre>
            </CardContent>
          )}
        </Card>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {report.thread_id && (
          <Button
            variant="outline"
            onClick={() => router.push(`/projects/${report.project_id}/thread/${report.thread_id}`)}
          >
            View Thread
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => router.push('/test-history')}
        >
          View All Tests
        </Button>
      </div>
    </div>
  );
}
