ALTER TABLE "application_stage_history" ADD COLUMN "rejection_source" text;--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejection_source" text;
--> statement-breakpoint
-- Append the new terminal stage without changing existing IDs or decisions.
INSERT INTO job_stages (workspace_id, job_id, name, "order", color, email_config)
SELECT j.workspace_id, j.id, 'Rejected by client', coalesce(max(s."order"), -1) + 1,
       '#FECACA', '{"candidateUpdatesEnabled":false}'
FROM jobs j LEFT JOIN job_stages s ON s.job_id = j.id
WHERE NOT EXISTS (SELECT 1 FROM job_stages r WHERE r.job_id = j.id AND lower(trim(r.name)) = 'rejected by client')
GROUP BY j.workspace_id, j.id
HAVING count(s.id) > 0;
