-- User Sessions Analysis Query
-- A session is defined as a period of play activity both preceded and followed by 2+ hours of inactivity
-- 
-- Parameters:
--   Replace 'USER_ID_HERE' with the actual user ID (UUID)
--
-- Output columns:
--   - session_number: Sequential session identifier
--   - session_start: Timestamp of first play in session
--   - session_end: Timestamp of last play in session
--   - session_duration: Human-readable duration (may be 0 for single-play sessions)
--   - session_duration_minutes: Duration in minutes
--   - play_count: Number of plays in the session
--   - distinct_charts: Number of unique charts played
--   - steps_hit: Total steps hit across all plays in the session (non-Miss judgments)
--   - is_ongoing: TRUE if session has no 2-hour gap after it yet (current/recent session)

WITH user_plays AS (
  SELECT 
    p.id AS play_id,
    p."chartHash",
    p."createdAt",
    pl.data AS leaderboard_data,
    LAG(p."createdAt") OVER (ORDER BY p."createdAt") AS prev_play_at
  FROM "Play" p
  LEFT JOIN "PlayLeaderboard" pl 
    ON pl."playId" = p.id 
    AND pl."leaderboardId" = 3
  WHERE p."userId" = 'USER_ID_HERE'
),
plays_with_gaps AS (
  SELECT 
    play_id,
    "chartHash",
    "createdAt",
    leaderboard_data,
    prev_play_at,
    CASE 
      WHEN prev_play_at IS NULL THEN TRUE
      WHEN EXTRACT(EPOCH FROM ("createdAt" - prev_play_at)) >= 7200 THEN TRUE
      ELSE FALSE
    END AS is_new_session
  FROM user_plays
),
plays_with_session_id AS (
  SELECT 
    play_id,
    "chartHash",
    "createdAt",
    leaderboard_data,
    SUM(CASE WHEN is_new_session THEN 1 ELSE 0 END) OVER (ORDER BY "createdAt") AS session_number
  FROM plays_with_gaps
),
steps_per_play AS (
  SELECT 
    play_id,
    session_number,
    "chartHash",
    "createdAt",
    COALESCE(
      (
        SELECT SUM(v::int)
        FROM json_each_text(leaderboard_data::json->'judgments') AS j(k, v)
        WHERE j.k != 'Miss'
      ),
      0
    ) AS steps_hit
  FROM plays_with_session_id
),
session_aggregates AS (
  SELECT 
    session_number,
    MIN("createdAt") AS session_start,
    MAX("createdAt") AS session_end,
    COUNT(play_id) AS play_count,
    COUNT(DISTINCT "chartHash") AS distinct_charts,
    SUM(steps_hit) AS steps_hit
  FROM steps_per_play
  GROUP BY session_number
)
SELECT 
  sa.session_number,
  sa.session_start,
  sa.session_end,
  CASE 
    WHEN EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)) < 60 
      THEN '< 1 minute'
    WHEN EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)) < 3600 
      THEN ROUND(EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)) / 60)::text || ' minutes'
    ELSE 
      FLOOR(EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)) / 3600)::text || ' hours ' ||
      ROUND(MOD(EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)), 3600) / 60)::text || ' minutes'
  END AS session_duration,
  ROUND(EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)) / 60) AS session_duration_minutes,
  sa.play_count,
  sa.distinct_charts,
  sa.steps_hit,
  CASE 
    WHEN NOW() - sa.session_end < INTERVAL '2 hours' THEN TRUE
    ELSE FALSE
  END AS is_ongoing
FROM session_aggregates sa
WHERE sa.play_count > 1
  AND EXTRACT(EPOCH FROM (sa.session_end - sa.session_start)) >= 180
ORDER BY sa.session_number DESC;
