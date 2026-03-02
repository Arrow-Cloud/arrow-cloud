-- Session Details Query
-- Shows all plays within a single session with chart info and EX scores
-- 
-- Parameters:
--   Replace SESSION_ID_HERE with the actual session ID (integer)
--
-- Leaderboard IDs:
--   2 = GLOBAL_EX
--   3 = GLOBAL_MONEY (ITG)
--   4 = GLOBAL_HARD_EX

WITH session AS (
  SELECT 
    us.id,
    us."userId",
    us."startedAt",
    us."endedAt",
    us."playCount",
    us."distinctCharts",
    us."stepsHit",
    u.alias
  FROM "UserSession" us
  JOIN "User" u ON u.id = us."userId"
  WHERE us.id = SESSION_ID_HERE
)
SELECT 
  s.id AS session_id,
  s.alias,
  s."startedAt" AS session_start,
  s."endedAt" AS session_end,
  s."playCount" AS session_play_count,
  s."distinctCharts" AS session_distinct_charts,
  s."stepsHit" AS session_total_steps,
  
  -- Play details
  p.id AS play_id,
  p."createdAt" AS played_at,
  
  -- Chart details
  c.hash AS chart_hash,
  COALESCE(c."songName", sf.title) AS song_name,
  COALESCE(c.artist, sf.artist) AS artist,
  c."stepsType",
  c.difficulty,
  COALESCE(c.meter, c.rating) AS meter,
  c.stepartist,
  pk.name AS pack_name,
  
  -- EX Score (leaderboard 2)
  pl_ex.data->>'score' AS ex_score,
  pl_ex.data->>'grade' AS ex_grade,
  
  -- ITG Score (leaderboard 3) 
  pl_itg.data->>'score' AS itg_score,
  pl_itg.data->>'grade' AS itg_grade,
  
  -- Judgments from ITG (most complete judgment set)
  pl_itg.data->'judgments'->>'Fantastic (23ms)' AS fantastics,
  pl_itg.data->'judgments'->>'Excellent' AS excellents,
  pl_itg.data->'judgments'->>'Great' AS greats,
  pl_itg.data->'judgments'->>'Decent' AS decents,
  pl_itg.data->'judgments'->>'Way Off' AS way_offs,
  pl_itg.data->'judgments'->>'Miss' AS misses

FROM session s
JOIN "Play" p ON p."userId" = s."userId"
  AND p."createdAt" >= s."startedAt"
  AND p."createdAt" <= s."endedAt"
JOIN "Chart" c ON c.hash = p."chartHash"
LEFT JOIN "SimfileChart" sc ON sc."chartHash" = c.hash
LEFT JOIN "Simfile" sf ON sf.id = sc."simfileId"
LEFT JOIN "Pack" pk ON pk.id = sf."packId"
LEFT JOIN "PlayLeaderboard" pl_ex ON pl_ex."playId" = p.id AND pl_ex."leaderboardId" = 2
LEFT JOIN "PlayLeaderboard" pl_itg ON pl_itg."playId" = p.id AND pl_itg."leaderboardId" = 3
ORDER BY p."createdAt" ASC;
s