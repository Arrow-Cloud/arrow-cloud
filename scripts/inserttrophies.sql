INSERT INTO "Trophy" (name, description, tier, "imageUrl", "createdAt", "updatedAt")
VALUES
  ('Blue Shift Participant', 'Submitted at least one score in Blue Shift', 'common', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Completionist', 'Submitted a score for all 65 charts in Blue Shift', 'common', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Completionist II', 'Passed all 65 charts in Blue Shift', 'rare', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Completionist III', 'Got 85% EX or better on all 65 charts in Blue Shift', 'epic', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Completionist IV', 'Got 96% Money or better on all 65 charts in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Phase Top 50', 'Finished top 50 in at least one phase leaderboard in Blue Shift', 'rare', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Phase Top 25', 'Finished top 25 in at least one phase leaderboard in Blue Shift', 'epic', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Phase Top 5', 'Finished top 5 in at least one phase leaderboard in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Overall Top 50', 'Finished {placement} in Blue Shift', 'rare', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Overall Top 25', 'Finished {placement} in Blue Shift', 'epic', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Overall Top 5', 'Finished {placement} in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Single Song Podium', 'Achieved {n_finishes} in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Quadder I', 'Quadded {n_charts} in Blue Shift', 'rare', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Quadder II', 'Quadded {n_charts} in Blue Shift', 'epic', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Quadder III', 'Quadded {n_charts} in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Quinter I', 'Quinted {n_charts} in Blue Shift', 'epic', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Quinter II', 'Quinted {n_charts} in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Hexer', 'Hex-starred {n_charts} in Blue Shift', 'legendary', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW()),
  ('Blue Shift Grinder', 'Played {song} {n_times} in Blue Shift', 'rare', 's3://arrow-cloud-assets/trophies/blue-shift-participant.png', NOW(), NOW())
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  tier = EXCLUDED.tier,
  "updatedAt" = NOW();