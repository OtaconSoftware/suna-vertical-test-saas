'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  severity?: string;
  description?: string;
  expected?: string;
  actual?: string;
  screenshot?: string;
}

interface QAReportData {
  totalTests: number;
  passed: number;
  failed: number;
  warnings: number;
  results: TestResult[];
}

function parseQAReport(messages: string[]): QAReportData | null {
  const fullText = messages.join('\n');

  // Find report block
  const reportMatch = fullText.match(/---QA_REPORT_START---([\s\S]*?)---QA_REPORT_END---/);
  if (!reportMatch) {
    // Try fallback: look for "## Test Summary" pattern
    const summaryMatch = fullText.match(/## Test Summary[\s\S]*?## Test Results([\s\S]*?)$/);
    if (!summaryMatch) return null;
  }

  const reportText = reportMatch ? reportMatch[1] : fullText;

  // Parse summary
  const totalMatch = reportText.match(/Total Tests:\s*(\d+)/i);
  const passedMatch = reportText.match(/Passed:\s*(\d+)/i);
  const failedMatch = reportText.match(/Failed:\s*(\d+)/i);
  const warningsMatch = reportText.match(/Warnings?:\s*(\d+)/i);

  // Parse individual test results
  const testBlocks = reportText.split(/### Test:\s*/);
  const results: TestResult[] = [];

  for (const block of testBlocks.slice(1)) {
    const lines = block.trim().split('\n');
    const name = lines[0]?.trim() || 'Unknown Test';

    const statusMatch = block.match(/\*\*Status\*\*:\s*(PASS|FAIL|WARNING)/i);
    const severityMatch = block.match(/\*\*Severity\*\*:\s*(Critical|High|Medium|Low)/i);
    const descMatch = block.match(/\*\*Description\*\*:\s*(.+)/i);
    const expectedMatch = block.match(/\*\*Expected\*\*:\s*(.+)/i);
    const actualMatch = block.match(/\*\*Actual\*\*:\s*(.+)/i);
    const screenshotMatch = block.match(/\*\*Screenshot\*\*:\s*(.+)/i);

    results.push({
      name,
      status: (statusMatch?.[1]?.toUpperCase() as TestResult['status']) || 'WARNING',
      severity: severityMatch?.[1],
      description: descMatch?.[1],
      expected: expectedMatch?.[1],
      actual: actualMatch?.[1],
      screenshot: screenshotMatch?.[1],
    });
  }

  return {
    totalTests: totalMatch ? parseInt(totalMatch[1]) : results.length,
    passed: passedMatch ? parseInt(passedMatch[1]) : results.filter(r => r.status === 'PASS').length,
    failed: failedMatch ? parseInt(failedMatch[1]) : results.filter(r => r.status === 'FAIL').length,
    warnings: warningsMatch ? parseInt(warningsMatch[1]) : results.filter(r => r.status === 'WARNING').length,
    results,
  };
}

const statusConfig = {
  PASS: { icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-500/10', badge: 'bg-green-500/20 text-green-700 dark:text-green-300' },
  FAIL: { icon: XCircle, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/10', badge: 'bg-red-500/20 text-red-700 dark:text-red-300' },
  WARNING: { icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-500/10', badge: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-300' },
};

function TestResultCard({ result }: { result: TestResult }) {
  const [open, setOpen] = useState(false);
  const config = statusConfig[result.status];
  const Icon = config.icon;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div className={cn(
          'flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors',
          'hover:bg-accent/50 border border-border/50'
        )}>
          <Icon className={cn('h-5 w-5 flex-shrink-0', config.color)} />
          <span className="flex-1 text-sm font-medium truncate">{result.name}</span>
          {result.severity && (
            <Badge variant="outline" className="text-xs">{result.severity}</Badge>
          )}
          <Badge className={cn('text-xs', config.badge)}>{result.status}</Badge>
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 py-3 space-y-2 text-sm text-muted-foreground border-x border-b border-border/50 rounded-b-lg -mt-1">
        {result.description && <p><span className="font-medium text-foreground">Description:</span> {result.description}</p>}
        {result.expected && <p><span className="font-medium text-foreground">Expected:</span> {result.expected}</p>}
        {result.actual && <p><span className="font-medium text-foreground">Actual:</span> {result.actual}</p>}
        {result.screenshot && <p><span className="font-medium text-foreground">Screenshot:</span> {result.screenshot}</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function QAReport({ messages }: { messages: string[] }) {
  const report = useMemo(() => parseQAReport(messages), [messages]);

  if (!report || report.results.length === 0) {
    return null;
  }

  const total = report.totalTests || report.results.length;
  const passPercent = total > 0 ? (report.passed / total) * 100 : 0;
  const failPercent = total > 0 ? (report.failed / total) * 100 : 0;
  const warnPercent = total > 0 ? (report.warnings / total) * 100 : 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">QA Test Report</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary bar */}
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{total} tests</span>
          <span className="text-green-600 dark:text-green-400 font-medium">✓ {report.passed} passed</span>
          <span className="text-red-600 dark:text-red-400 font-medium">✗ {report.failed} failed</span>
          {report.warnings > 0 && (
            <span className="text-yellow-600 dark:text-yellow-400 font-medium">⚠ {report.warnings} warnings</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden flex">
          {passPercent > 0 && <div className="bg-green-500 transition-all" style={{ width: `${passPercent}%` }} />}
          {failPercent > 0 && <div className="bg-red-500 transition-all" style={{ width: `${failPercent}%` }} />}
          {warnPercent > 0 && <div className="bg-yellow-500 transition-all" style={{ width: `${warnPercent}%` }} />}
        </div>

        {/* Test results */}
        <div className="space-y-2">
          {report.results.map((result, i) => (
            <TestResultCard key={i} result={result} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
