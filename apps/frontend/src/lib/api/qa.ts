import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// Type definitions matching backend models

export interface TestCredentials {
  email?: string;
  password?: string;
}

export interface StartTestRequest {
  url: string;
  test_type: 'full-audit' | 'signup-flow' | 'checkout-flow' | 'form-validation' | 'responsive-check' | 'custom';
  specs?: string;
  viewport?: 'desktop' | 'mobile' | 'both';
  credentials?: TestCredentials;
  project_id?: string;
}

export interface StartTestResponse {
  thread_id: string;
  project_id: string;
  agent_run_id: string;
  report_id: string;
}

export interface TestReportListItem {
  report_id: string;
  thread_id: string | null;
  project_id: string | null;
  test_url: string;
  test_type: string;
  viewport: string;
  status: 'running' | 'completed' | 'failed';
  score: number | null;
  total_tests: number;
  passed: number;
  failed: number;
  warnings: number;
  created_at: string;
  updated_at: string;
}

export interface TestBug {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  description: string;
  expected: string;
  actual: string;
  screenshot_url?: string | null;
}

export interface TestReportDetail {
  report_id: string;
  thread_id: string | null;
  project_id: string | null;
  account_id: string;
  test_url: string;
  test_type: string;
  viewport: string;
  status: 'running' | 'completed' | 'failed';
  score: number | null;
  total_tests: number;
  passed: number;
  failed: number;
  warnings: number;
  bugs: TestBug[];
  raw_report: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpdateReportRequest {
  project_id?: string | null;
}

/**
 * Start a new QA test
 */
export async function startTest(request: StartTestRequest): Promise<StartTestResponse> {
  const response = await backendApi.post<StartTestResponse>('/qa/start-test', request, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'start test', resource: request.url });
    throw new Error(response.error.message || 'Failed to start test');
  }

  if (!response.data) {
    throw new Error('No response data from start test');
  }

  return response.data;
}

/**
 * Get list of test reports with optional filtering
 */
export async function getReports(options?: {
  project_id?: string;
  limit?: number;
  offset?: number;
}): Promise<TestReportListItem[]> {
  const params = new URLSearchParams();

  if (options?.project_id) {
    params.append('project_id', options.project_id);
  }
  if (options?.limit) {
    params.append('limit', options.limit.toString());
  }
  if (options?.offset) {
    params.append('offset', options.offset.toString());
  }

  const url = `/qa/reports${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await backendApi.get<TestReportListItem[]>(url, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'fetch test reports' });
    throw new Error(response.error.message || 'Failed to fetch test reports');
  }

  return response.data || [];
}

/**
 * Get detailed test report by ID
 */
export async function getReport(reportId: string): Promise<TestReportDetail> {
  const response = await backendApi.get<TestReportDetail>(`/qa/reports/${reportId}`, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'fetch test report', resource: reportId });
    throw new Error(response.error.message || 'Failed to fetch test report');
  }

  if (!response.data) {
    throw new Error('Test report not found');
  }

  return response.data;
}

/**
 * Assign or unassign a test report to/from a project
 */
export async function assignProject(
  reportId: string,
  projectId: string | null
): Promise<{ message: string }> {
  const response = await backendApi.patch<{ message: string }>(
    `/qa/reports/${reportId}`,
    { project_id: projectId },
    { showErrors: true }
  );

  if (response.error) {
    handleApiError(response.error, { operation: 'update test report', resource: reportId });
    throw new Error(response.error.message || 'Failed to update test report');
  }

  if (!response.data) {
    throw new Error('No response from update');
  }

  return response.data;
}

/**
 * Get all test reports for a specific project
 */
export async function getProjectReports(
  projectId: string,
  options?: {
    limit?: number;
    offset?: number;
  }
): Promise<TestReportListItem[]> {
  const params = new URLSearchParams();

  if (options?.limit) {
    params.append('limit', options.limit.toString());
  }
  if (options?.offset) {
    params.append('offset', options.offset.toString());
  }

  const url = `/projects/${projectId}/reports${params.toString() ? `?${params.toString()}` : ''}`;

  const response = await backendApi.get<TestReportListItem[]>(url, {
    showErrors: true,
  });

  if (response.error) {
    handleApiError(response.error, { operation: 'fetch project reports', resource: projectId });
    throw new Error(response.error.message || 'Failed to fetch project reports');
  }

  return response.data || [];
}


// ═══════════════════════════════════════════════════════
// PROJECTS
// ═══════════════════════════════════════════════════════

export interface ProjectListItem {
  project_id: string;
  name: string;
  site_url: string | null;
  total_tests: number;
  last_score: number | null;
  scores: number[];
  known_issues: string[];
  recurring_issues: string[];
  notes_count: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectDetailResponse {
  project_id: string;
  name: string;
  site_url: string | null;
  description: string | null;
  context: {
    site_url?: string;
    domain?: string;
    site_description?: string;
    tech_stack?: string;
    notes?: string[];
    known_issues?: string[];
  };
  test_summary: {
    total_runs?: number;
    scores?: number[];
    recurring_issues?: string[];
  };
  total_tests: number;
  reports: TestReportListItem[];
  created_at: string;
  updated_at: string;
}

/**
 * List all QA projects
 */
export async function getProjects(options?: {
  limit?: number;
  offset?: number;
}): Promise<ProjectListItem[]> {
  const params = new URLSearchParams();
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());
  const qs = params.toString();
  const url = `/qa/projects${qs ? `?${qs}` : ''}`;
  const response = await backendApi.get<ProjectListItem[]>(url, { showErrors: true });
  if (response.error) {
    handleApiError(response.error, { operation: 'fetch projects' });
    throw new Error(response.error.message || 'Failed to fetch projects');
  }
  return response.data || [];
}

/**
 * Get project detail with reports and knowledge
 */
export async function getProjectDetail(projectId: string): Promise<ProjectDetailResponse> {
  const response = await backendApi.get<ProjectDetailResponse>(`/qa/projects/${projectId}`, { showErrors: true });
  if (response.error) {
    handleApiError(response.error, { operation: 'fetch project detail', resource: projectId });
    throw new Error(response.error.message || 'Failed to fetch project detail');
  }
  if (!response.data) throw new Error('Project not found');
  return response.data;
}
