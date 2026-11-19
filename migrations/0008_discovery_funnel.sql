ALTER TABLE job_discovery_runs ADD COLUMN hard_filtered_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_discovery_runs ADD COLUMN model_excluded_count INTEGER NOT NULL DEFAULT 0;
