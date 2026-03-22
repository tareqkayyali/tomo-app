-- Add unique constraint on health_data for upsert support.
-- Allows wearable sync to write per-metric-per-day without duplicates.
-- First remove any existing duplicates (keep the latest by created_at).
DELETE FROM health_data a USING health_data b
WHERE a.id < b.id
  AND a.user_id = b.user_id
  AND a.date = b.date
  AND a.metric_type = b.metric_type;

CREATE UNIQUE INDEX IF NOT EXISTS uq_health_data_user_date_metric
  ON health_data (user_id, date, metric_type);
