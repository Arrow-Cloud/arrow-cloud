-- Identify which PlayLeaderboard entries carry `musicRate` in their `data` JSON, and where the
-- cutoff is. Plays at or before the cutoff have to be reprocessed from the raw S3 payload to
-- populate the rate-eligible leaderboards (18 = ITG Rate, 19 = EX Rate); plays after it can be
-- derived from their existing ITG (3) / EX (2) entries.
--
-- Global leaderboard ids (see api/src/utils/leaderboard/index.ts):
--   2 = EX, 3 = ITG, 4 = HardEX, 18 = ITG (Rate Eligible), 19 = EX (Rate Eligible)

-- 1. Coverage summary: per leaderboard, how many entries have / lack musicRate, and the play id
--    and time range for each. If musicRate is "reliably" present the max_play_id of the
--    missing bucket should be well below the min_play_id of the present bucket.
SELECT
  "leaderboardId",
  (data->>'musicRate') IS NOT NULL AS has_music_rate,
  COUNT(*)                         AS entries,
  MIN("playId")                    AS min_play_id,
  MAX("playId")                    AS max_play_id,
  MIN("createdAt")                 AS first_created,
  MAX("createdAt")                 AS last_created
FROM "PlayLeaderboard"
WHERE "leaderboardId" IN (2, 3, 4, 18, 19)
GROUP BY 1, 2
ORDER BY 1, 2;

-- 2. Day-by-day view around the transition, so you can see whether it was a clean switch or a
--    ragged overlap (e.g. multiple Lambda versions live at once). Uses Play.createdAt rather than
--    PlayLeaderboard.createdAt so reprocessed entries don't skew the timeline.
WITH first_present AS (
  SELECT MIN(p."createdAt") AS ts
  FROM "PlayLeaderboard" pl
  JOIN "Play" p ON p.id = pl."playId"
  WHERE pl."leaderboardId" IN (2, 3, 4)
    AND (pl.data->>'musicRate') IS NOT NULL
)
SELECT
  date_trunc('day', p."createdAt")                                         AS day,
  COUNT(*) FILTER (WHERE (pl.data->>'musicRate') IS NULL)                  AS missing,
  COUNT(*) FILTER (WHERE (pl.data->>'musicRate') IS NOT NULL)              AS present,
  MIN(p.id) FILTER (WHERE (pl.data->>'musicRate') IS NULL)                 AS min_missing_play_id,
  MAX(p.id) FILTER (WHERE (pl.data->>'musicRate') IS NULL)                 AS max_missing_play_id
FROM "PlayLeaderboard" pl
JOIN "Play" p ON p.id = pl."playId"
WHERE pl."leaderboardId" IN (2, 3, 4)
  AND p."createdAt" >= (SELECT ts FROM first_present) - INTERVAL '14 days'
GROUP BY 1
ORDER BY 1;

-- 3. The cutoff: the last play whose standard-leaderboard entry lacks musicRate. Every play with
--    id <= cutoff_play_id must be reprocessed from S3; everything above it has musicRate in
--    PlayLeaderboard.data and can be copied to 18/19 without touching S3.
SELECT
  MAX(pl."playId")   AS cutoff_play_id,
  MAX(p."createdAt") AS cutoff_play_created_at
FROM "PlayLeaderboard" pl
JOIN "Play" p ON p.id = pl."playId"
WHERE pl."leaderboardId" IN (2, 3, 4)
  AND (pl.data->>'musicRate') IS NULL;

-- 4. Size of the reprocess job: plays that do NOT yet have a rate-leaderboard entry carrying
--    musicRate. This is the candidate set for the S3-backed pass (it includes plays that will turn
--    out to be ineligible, e.g. failed or autoplay - those are correctly skipped at process time).
SELECT
  COUNT(*)                                                 AS plays_to_reprocess,
  MIN(p.id)                                                AS min_play_id,
  MAX(p.id)                                                AS max_play_id,
  COUNT(*) FILTER (WHERE p."rawTimingDataUrl" IS NULL
                      OR p."rawTimingDataUrl" = '')        AS plays_without_payload
FROM "Play" p
WHERE NOT EXISTS (
  SELECT 1
  FROM "PlayLeaderboard" pl
  WHERE pl."playId" = p.id
    AND pl."leaderboardId" IN (18, 19)
    AND (pl.data->>'musicRate') IS NOT NULL
);
