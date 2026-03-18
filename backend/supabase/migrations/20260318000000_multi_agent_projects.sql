BEGIN;

-- Add context_notes to projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS context_notes TEXT;
COMMENT ON COLUMN projects.context_notes IS 'Free-form notes about project context, stack, conventions, etc.';

-- Add agent_id to messages table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(agent_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_messages_agent_id ON messages(agent_id);
COMMENT ON COLUMN messages.agent_id IS 'Agent that generated this message. For future multi-agent support.';

-- Create thread_summaries table
CREATE TABLE IF NOT EXISTS thread_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(agent_id) ON DELETE SET NULL,
    summary_text TEXT NOT NULL,
    is_auto BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for efficient project summary retrieval
CREATE INDEX IF NOT EXISTS idx_thread_summaries_project ON thread_summaries(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_summaries_thread ON thread_summaries(thread_id);

-- Enable RLS on thread_summaries
ALTER TABLE thread_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for thread_summaries (same pattern as other tables)
CREATE POLICY thread_summary_select_policy ON thread_summaries
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = thread_summaries.project_id
            AND (
                projects.is_public = TRUE OR
                basejump.has_role_on_account(projects.account_id) = true
            )
        )
    );

CREATE POLICY thread_summary_insert_policy ON thread_summaries
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = thread_summaries.project_id
            AND basejump.has_role_on_account(projects.account_id) = true
        )
    );

CREATE POLICY thread_summary_update_policy ON thread_summaries
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = thread_summaries.project_id
            AND basejump.has_role_on_account(projects.account_id) = true
        )
    );

CREATE POLICY thread_summary_delete_policy ON thread_summaries
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM projects
            WHERE projects.project_id = thread_summaries.project_id
            AND basejump.has_role_on_account(projects.account_id) = true
        )
    );

-- Grant permissions
GRANT ALL PRIVILEGES ON TABLE thread_summaries TO authenticated, service_role;

COMMIT;
