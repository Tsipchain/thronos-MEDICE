-- TimescaleDB initialization for ThronomedICE
-- Runs automatically on first container start.

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Convert temp_readings to a hypertable (partitioned by day)
SELECT create_hypertable(
    'temp_readings',
    'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists       => TRUE
);

-- Compress chunks older than 7 days (~10-20x compression ratio)
ALTER TABLE temp_readings SET (
    timescaledb.compress,
    timescaledb.compress_orderby   = 'timestamp DESC',
    timescaledb.compress_segmentby = 'patient_id'
);

SELECT add_compression_policy('temp_readings', compress_after => INTERVAL '7 days');

-- Drop raw readings older than 10 years; fever_events kept forever
SELECT add_retention_policy('temp_readings', drop_after => INTERVAL '10 years');

-- Continuous aggregate: daily fever summary per patient (refreshed hourly)
CREATE MATERIALIZED VIEW daily_fever_summary
WITH (timescaledb.continuous) AS
SELECT
    patient_id,
    time_bucket('1 day'::interval, timestamp) AS day,
    COUNT(*)                                   AS reading_count,
    MAX(temperature)                           AS max_temp,
    ROUND(AVG(temperature)::numeric, 2)        AS avg_temp,
    COUNT(*) FILTER (WHERE temperature >= 38.0) AS fever_readings,
    COUNT(*) FILTER (WHERE temperature >= 39.0) AS high_fever_readings
FROM temp_readings
GROUP BY patient_id, day
WITH NO DATA;

SELECT add_continuous_aggregate_policy(
    'daily_fever_summary',
    start_offset      => INTERVAL '3 days',
    end_offset        => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour'
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_readings_patient_ts
    ON temp_readings (patient_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_readings_fever
    ON temp_readings (patient_id, timestamp DESC)
    WHERE temperature >= 38.0;

CREATE INDEX IF NOT EXISTS idx_fever_events_patient
    ON fever_events (patient_id, start_time DESC);
