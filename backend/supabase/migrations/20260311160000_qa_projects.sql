-- Extend projects table to support QA testing with site URLs
ALTER TABLE projects ADD COLUMN IF NOT EXISTS site_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'general';

-- Create test_reports table to store QA test results
CREATE TABLE test_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES threads(thread_id) ON DELETE SET NULL,
    project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
    account_id UUID NOT NULL REFERENCES basejump.accounts(id) ON DELETE CASCADE,
    test_url TEXT NOT NULL,
    test_type TEXT NOT NULL,
    viewport TEXT DEFAULT 'desktop',
    status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
    score INTEGER, -- 0-100 approval percentage
    total_tests INTEGER DEFAULT 0,
    passed INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    warnings INTEGER DEFAULT 0,
    bugs JSONB DEFAULT '[]'::jsonb,
    raw_report TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_test_reports_account_id ON test_reports(account_id);
CREATE INDEX idx_test_reports_project_id ON test_reports(project_id);
CREATE INDEX idx_test_reports_thread_id ON test_reports(thread_id);
CREATE INDEX idx_test_reports_status ON test_reports(status);
CREATE INDEX idx_test_reports_created_at ON test_reports(created_at);

-- Enable Row Level Security
ALTER TABLE test_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own account's test reports
CREATE POLICY test_reports_select ON test_reports FOR SELECT
    USING (basejump.has_role_on_account(account_id) = true);
CREATE POLICY test_reports_insert ON test_reports FOR INSERT
    WITH CHECK (basejump.has_role_on_account(account_id) = true);
CREATE POLICY test_reports_update ON test_reports FOR UPDATE
    USING (basejump.has_role_on_account(account_id) = true);
CREATE POLICY test_reports_delete ON test_reports FOR DELETE
    USING (basejump.has_role_on_account(account_id) = true);

-- Trigger to automatically update updated_at timestamp
CREATE TRIGGER update_test_reports_updated_at
    BEFORE UPDATE ON test_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE test_reports TO authenticated, service_role;

-- Comments for documentation
COMMENT ON TABLE test_reports IS 'Stores QA test execution results with structured bug reports';
COMMENT ON COLUMN test_reports.report_id IS 'Unique identifier for the test report';
COMMENT ON COLUMN test_reports.thread_id IS 'Reference to the agent thread that executed this test';
COMMENT ON COLUMN test_reports.project_id IS 'Optional: associates test with a project';
COMMENT ON COLUMN test_reports.account_id IS 'User account that owns this test report';
COMMENT ON COLUMN test_reports.test_url IS 'URL that was tested';
COMMENT ON COLUMN test_reports.test_type IS 'Type of test: full-audit, signup-flow, checkout-flow, form-validation, responsive-check, custom';
COMMENT ON COLUMN test_reports.viewport IS 'Viewport size used: desktop, mobile, or both';
COMMENT ON COLUMN test_reports.status IS 'Test execution status: running, completed, or failed';
COMMENT ON COLUMN test_reports.score IS 'Overall test score (0-100) calculated as passed/total_tests * 100';
COMMENT ON COLUMN test_reports.bugs IS 'Array of structured bug objects with name, status, severity, description, expected, actual, screenshot_url';
COMMENT ON COLUMN test_reports.raw_report IS 'Full unstructured report text from the agent';
COMMENT ON COLUMN projects.site_url IS 'URL of the site associated with this project (for QA projects)';
COMMENT ON COLUMN projects.project_type IS 'Type of project: general or qa';
