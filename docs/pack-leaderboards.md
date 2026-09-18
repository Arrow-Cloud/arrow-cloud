# Pack Leaderboards

Per-pack "overall" leaderboards: for each difficulty slot (Medium/Hard/Expert) and each scoring
system (H.EX/EX/ITG/ITG Rate/EX Rate), every player's best score on every chart in the slot is
converted to curved points and summed. Core logic lives in `api/src/utils/pack-leaderboard.ts`.

## How it flows

1. A score submission publishes a `score-submitted` SNS event.
2. The `pack-leaderboard` SQS consumer (`api/src/pack-leaderboard.ts`) calls
   `getEligiblePacksForChart` - if the chart is in an eligible pack *and* in one of that pack's
   leaderboard difficulty slots, it recalculates the whole pack via `calculatePackLeaderboards` and
   uploads `json/pack-leaderboards/<packId>.json` to the assets bucket.
3. The pack page (`GET /packs/:id` → `frontend/src/components/leaderboards/PackLeaderboard.tsx`)
   and the streamer widget (`api/src/controllers/widget.ts`) read that JSON.
4. The same submission also synchronously renders result-card images (`computePackResultImages`)
   for the in-game results screen.

## Onboarding a new pack

- Add the pack ID to `ELIGIBLE_PACK_IDS` in **both** `api/src/utils/pack-leaderboard.ts` and
  `frontend/src/utils/widgetConfig.ts` (the frontend copy filters the widget's pack picker).
- If the pack only runs leaderboards for some difficulty slots (e.g. THC4 is Hard/Expert only),
  add it to `PACK_LEADERBOARD_DIFFICULTY_OVERRIDES` in both files too. Excluded slots are simply
  absent from the pack's JSON; the pack page derives its difficulty tabs from what's present, and
  the widget config UI only offers the pack's slots.
- Charts that must not count when played on CMOD: flag them with
  `npx ts-node scripts/set-cmod-ineligible-charts.ts <hash...>` (a human runs this). Flagged
  charts drop CMOD plays from the ranking rather than the whole chart.
- Optional home page promo: `frontend/src/pages/home/components/NewPackLeaderboardsCard.tsx`
  (banner + YouTube trailer, self-expiring).
- `npx tsx scripts/calculate-pack-leaderboard.ts <packId> [--user <userId>]` computes a pack
  locally for sanity-checking without touching S3.
