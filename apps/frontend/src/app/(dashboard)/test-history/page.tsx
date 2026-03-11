'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getReports } from '@/lib/api/qa';
import type { TestReportListItem } from '@/lib/api/qa';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardCheck,
  ExternalLink,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  Filter
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

const testTypeLabels: Record<string, string> = {
  'full-audit': 'Full Audit',
  'signup-flow': 'Signup Flow',
  'checkout-flow': 'Checkout Flow',
  'form-validation': 'Form Validation',
  'responsive-check': 'Responsive',
  'custom': 'Custom',
};

export default function TestHistoryPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey: ['qa-reports', 'all'],
    queryFn: () => getReports({ limit: 100 }),
  });

  const getScoreBadgeVariant = (score: number | null) => {
    if (score === null) return 'secondary';
    if (score >= 80) return 'default';
    if (score >= 60) return 'outline';
    return 'destructive';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="secondary">Running</Badge>;
      case 'completed':
        return <Badge variant="default">Completed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Apply filters
  const filteredReports = reports.filter((report) => {
    if (statusFilter !== 'all' && report.status !== statusFilter) return false;
    if (typeFilter !== 'all' && report.test_type !== typeFilter) return false;
    return true;
  });

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
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4 mr-1", isLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => router.push('/dashboard')}>
            <Plus className="h-4 w-4 mr-1" />
            New Test
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b bg-muted/30">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Test Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="full-audit">Full Audit</SelectItem>
              <SelectItem value="signup-flow">Signup Flow</SelectItem>
              <SelectItem value="checkout-flow">Checkout Flow</SelectItem>
              <SelectItem value="form-validation">Form Validation</SelectItem>
              <SelectItem value="responsive-check">Responsive</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {(statusFilter !== 'all' || typeFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-destructive">Failed to load test history</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="text-center py-20">
            <ClipboardCheck className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {reports.length === 0 ? 'No tests yet' : 'No tests match filters'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {reports.length === 0
                ? 'Run your first QA test to see results here'
                : 'Try adjusting your filters'
              }
            </p>
            {reports.length === 0 && (
              <Button onClick={() => router.push('/dashboard')}>Run a Test 🧪</Button>
            )}
          </div>
        ) : (
          <div className="max-w-6xl">
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>URL</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Viewport</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Pass/Fail/Warn</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredReports.map((report: TestReportListItem) => (
                    <TableRow
                      key={report.report_id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/reports/${report.report_id}`)}
                    >
                      <TableCell className="font-medium max-w-xs">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{new URL(report.test_url).hostname}</span>
                          <a
                            href={report.test_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0"
                          >
                            <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {testTypeLabels[report.test_type] || report.test_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">
                        {report.viewport}
                      </TableCell>
                      <TableCell>
                        {report.score !== null ? (
                          <Badge variant={getScoreBadgeVariant(report.score)}>
                            {report.score}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span className="text-green-600 font-medium">{report.passed}</span>
                        {' / '}
                        <span className="text-red-600 font-medium">{report.failed}</span>
                        {' / '}
                        <span className="text-yellow-600 font-medium">{report.warnings}</span>
                      </TableCell>
                      <TableCell>{getStatusBadge(report.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-1 text-xs">
                          <Clock className="h-3 w-3" />
                          {timeAgo(report.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/reports/${report.report_id}`);
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
