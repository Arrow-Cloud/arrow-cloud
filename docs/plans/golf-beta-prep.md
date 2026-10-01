# In The Golf — Beta Test Prep (mid-October)

Status: **planning**. Branch: `golf-beta-prep`. Target: beta live mid-October 2026, full launch
December (dates per `events/golf/frontend/src/pages/HomePage.tsx`'s timeline section).

This plan covers everything between today's state — a marketing site, a chart-submission portal, and
a working single-image result card gated to two test accounts — and a beta a real player base can
play through without us hand-holding it.

## Context: what actually exists today

Verified on `main` as of 2026-09-30, because the answer to "have we started this?" turned out to be
"more than expected" in one place and "not at all" in two others.

| Piece | State |
|---|---|
| Golf scoring formula | **Done.** `api/src/utils/scoring/golf.ts`, pure/zero-I/O, unit-tested (`api/test/util/scoring/golf.test.ts`), verified against `GolfScoring.lua` |
| Beta courses + pars | **Done.** 18 charts each, every one par'd — see below |
| Golf event backend | **Partial.** SNS→SQS→Lambda→DynamoDB writes `PLAY` + `BEST` items per user. No courses, no pars, no rankings |
| Read API | **Minimal.** One route, `GET /best?userId&chartHash` |
| Result images | **1 of 3.** Single result card, gated to 2 test user IDs |
| Trophies | **Core infra only.** `Trophy`/`UserTrophy` in Postgres; nothing golf-aware |
| Golf website | **2 pages.** Marketing home + chart-submission portal. No read-api client at all |
| Hosting/CDK | **Done.** `GolfBackendStack`, `EventSite-golf` → golf.arrowcloud.dance, legacy redirects |

### The governing constraint (unchanged from the result-images plan)

Event infra is deliberately isolated: golf's backend has **its own DynamoDB table** and reads core
score data **only** over public HTTP (`apiFetch` in `events/golf/backend/src/shared.ts`) — never
Postgres or S3 directly. The point is that a future third-party event author gets the same contract,
so a bug or bad actor in one event can never touch core data or slow the submission path. Two items
below (trophies, ban filtering) push directly against that boundary and need an explicit decision
rather than a quiet workaround.

---

## 1. Courses and pars — mostly done, needs consolidating

**This is further along than expected.** Both beta courses are fully defined and fully par'd:

- `scripts/data/golf-beta-hills-pars.json` — 18 charts, all `challenge`, pars 5–15
- `scripts/data/golf-beta-pines-pars.json` — 18 charts, all `challenge`, pars 3–6
- Chart hashes match `scripts/data/beta-hills.json` / `beta-pines.json` exactly (verified set-equal)
- Pars are already copied into `GOLF_CHARTS` in `api/src/utils/event-result-images.ts`, with
  `courseName: 'Beta Hills' | 'Beta Pines'`
- `events/golf/backend/config.json` carries all 40 hashes (18 + 18 + 4 "Alpha Testing")

So the remaining work here is not assignment — it's that par and course membership live in **three
or four places with no single source of truth**, and the event backend itself knows about neither.

### Work

1. **One source of truth for the course definitions.** Today: two par JSONs (by hash), a hardcoded
   `GOLF_CHARTS` array (by hash, with course name + par), `config.json`'s flat hash list, and a
   `Golf.ini` per pack folder read in-game by `SL-GolfHelpers.lua`. These can and will drift.
   Proposal: a single committed `events/golf/config/courses.json` — course id, display name, order,
   and its 18 holes (hash, title, artist, meter, par, hole number) — that `config.json`'s hash list,
   `GOLF_CHARTS`, and the `Golf.ini` generator are all derived from, ideally with a check that fails
   CI if they disagree.
2. **Give the event backend a course concept.** `score-processor.ts` currently stores strokes against
   a bare `chartHash` and has no idea which course it belongs to or what its par is. Course rankings
   (§2) and the scorecard UI (§5) both need hole→course→par resolution inside golf's own backend.
3. **Hole numbering.** Nothing today assigns hole 1–18 within a course. Real golf ordering matters
   for a scorecard; the par JSONs are in song-folder order, which is probably not the intended play
   order. Needs a deliberate per-course ordering.
4. **Decide the fate of the 4 "Alpha Testing" hashes** still in `config.json` and `GOLF_CHARTS`
   (`7a520534f16d6455`, `065f74f741eb2f9d`, `f3871997119d5052`, `50bcefd78fa82988`). They have no
   course and no par, and `golf-result-image.ts` has a dedicated no-par fallback layout just for
   them. If they're not part of the beta, dropping them deletes a whole branch of layout code.
5. **Sanity-check the par spread.** Hills is 5–15, Pines is 3–6 — consistent with Hills being the
   meter-13 course and Pines meter-8, but it means a bad round on Hills costs far more against par
   than on Pines. If the two courses are ever combined into one overall standing, that asymmetry
   decides who wins. Flagging rather than assuming.

---

## 2. Result images — hole rankings and course rankings (3 per submission)

Target: **3 images per submission** — the existing result card, plus hole (chart) rankings and course
(pack) rankings.

`renderImages` in `api/src/utils/event-result-images.ts` returns `[png]` today; the upload loop
already handles an array (`result/play/{playId}/golf-{i}.png`), so emitting 3 is trivial. **The hard
part is the data, not the rendering.**

### The blocker: golf's DynamoDB layout can't rank

Current keys (`score-processor.ts`):

```
pk = USER#<userId>    sk = BEST#<chartHash>
pk = USER#<userId>    sk = PLAY#<chartHash>#<timestamp>#<playId>
```

Everything is partitioned **by user**. Answering "where does this player rank on this hole?" or
"...on this course?" would require a full table scan. `EventBackendConstruct` already provisions
`gsi1` and `gsi2` (`cdk/lib/event-backend-construct.ts:113-124`) — golf simply never writes the keys.
`events/testevent/backend/src/shared.ts` is the working reference for exactly this.

### Work

1. **Write GSI keys from `score-processor.ts`**, modelled on testevent's `CHARTBEST#<hash>` /
   `LEADERBOARD` pattern — with the sort key **inverted**, since golf is lower-is-better and
   testevent's `scoreToSortKey` assumes higher-is-better. (Zero-padded `strokes`, ascending, is the
   natural form; needs a deliberate width given strokes run into the tens of thousands.)
2. **Maintain a per-user, per-course aggregate item** (`COURSE#<courseId>` → sum of that user's 18
   best hole totals, holes completed, vs-par). This is the course ranking's backing data and the
   scorecard's. Decide what a partial course means: 14 of 18 holes played — ranked with a penalty,
   ranked among other partials, or excluded until complete? This decision shapes both the image and
   the leaderboard page, so it should be made before either is built.
3. **New read-api routes**: hole rankings for a chart, course rankings for a course, and this user's
   standing in both. Prefer **one batched endpoint** returning everything the three images need.
4. **Keep inside the latency budget.** `fetchContext` is called synchronously inside the submission
   response path with a 3000ms timeout, and that budget was already tuned around VPC/NAT egress plus
   satori rendering competing for the event loop (see the comment at
   `api/src/utils/event-result-images.ts:98-105`). Three images' worth of context must be **one**
   call, not three, and must degrade to the existing single card if it times out — the current
   graceful-degradation behaviour is non-negotiable and already caught a real bug once (the
   double-slash 404).
5. **Render the two new images.** `golf-result-image.ts` is the template; `pack-result-image.ts`'s
   `renderLeaderboardPage` + `selectNearbyRankings` (top 2 + you + neighbours + rivals) is the
   closest existing precedent for a rankings page and is worth reusing rather than reinventing.
6. **Ungate.** `GOLF_TEST_USER_IDS` must come out for beta, with `testUserIds` omitted entirely
   (the provider interface already treats absent as "fully rolled out").

---

## 3. Trophies

Goal: players earn trophies as the event progresses.

Core infra already exists and is reusable as-is: `Trophy` (slug, tier, description with `{...}`
interpolation, imageUrl) and `UserTrophy` (metadata JSON for interpolation, displayOrder), plus
notification-on-earn and a `TrophyCase`/`TrophiesSection` UI. `api/src/utils/trophy-assignment.ts`
is the pattern to follow (milestone-based, replaces lower tiers).

**The architectural problem:** trophies live in core Postgres; golf's backend is forbidden from
writing to core Postgres. Golf knows who earned what; core owns the award. That gap needs a
deliberate bridge, and it's the single biggest open design question in this plan.

Options, roughly in order of how well they preserve the isolation boundary:

- **(a) A core-side poller/reconciler.** Core periodically reads golf's public read-api and grants
  trophies. Keeps the boundary perfectly intact (golf stays read-only, no new write surface) and
  generalises to future events. Cost: trophies lag by the poll interval.
- **(b) An authenticated core "event trophy grant" endpoint** golf's Lambda calls. Immediate awards,
  but it hands an event backend a write path into core user data — exactly what the isolation rule
  exists to prevent. Would need a tight allowlist of grantable slugs per event.
- **(c) End-of-event batch script.** Simplest, zero new infra, but no "as the event progresses",
  which is explicitly what was asked for.

(a) looks like the right default, with the poll interval tuned to how fresh an award needs to feel.

### Work

1. Decide the bridge (above).
2. **Define the trophy catalogue** — this is content work and the long-pole item. Candidates worth
   considering: first round completed, a course completed, hole-in-one/ace-count milestones, under
   par on a hole, under par on a full course, beating a specific curator's score, participation.
   Each needs name, slug, tier, description template, and an image asset.
3. Decide whether beta trophies are **beta-exclusive** (and so a permanent collectible marking early
   testers) or a dry run reset before December. This affects whether we're willing to grant them on
   scoring rules the home page itself calls "subject to change after beta testing".
4. Seed rows (`Trophy` is populated manually by convention — "Create these in the DB manually" per
   `trophy-assignment.ts`), and note that seeding is a human-run DB operation, not something this
   branch can do.

---

## 4. Auto-opt-in — no signup, no registration

Every Arrow Cloud user is implicitly in the event; playing a course chart is the only act of
participation.

**Mostly already true**: the score processor acts on any submission matching a golf chart hash, with
no enrollment check anywhere. So this is less "build opt-in" than "make sure nothing assumes
enrollment, and handle what implicit participation drags in":

1. **Ban/shadowban filtering.** Core's pack leaderboards explicitly exclude banned and shadowbanned
   users in SQL. Golf's DynamoDB has no user table and its read-api has no such filter, so a banned
   player would currently appear on a golf leaderboard. Needs resolving — probably golf storing a
   flag at score time from what the public API exposes, or filtering at read time.
2. **Aliases.** Golf stores no alias at all (testevent denormalizes `playerAlias` onto every item).
   Rankings need display names; a rename after the fact shouldn't leave a stale name on the board.
3. **Private/opted-out players.** Confirm there's no existing privacy flag that should keep someone
   off a public event leaderboard even under auto-opt-in.
4. **No enrollment gate in the UI.** Leaderboards and scorecards should render for a logged-out
   visitor; only chart submission needs auth (as it does today).

---

## 5. The whole golf website

Golf today has 2 pages against testevent's 6, and **no read-api client whatsoever** (no
`services/` directory — compare `events/testevent/frontend/src/services/eventApi.ts` and
`eventStateApi.ts`). Testevent is the structural reference; golf's vocabulary and rules replace
testevent's generic scoring throughout.

Keep: `GradientBackground`, `ThemeToggle`, `EventFooter`, the `NavBar eventMode` + `EventLogo`
shell, the translucent `Section` card pattern, and the existing marketing home and submit portal.

### Pages to build

| Page | testevent analogue | Golf framing |
|---|---|---|
| Courses index | `ChartsPage` | The 2 beta courses, each as a card: theme, difficulty, total par, holes played |
| Course detail / scorecard | — (no analogue) | 18 holes with par, your strokes, vs-par per hole, running total. The signature golf view |
| Hole detail | `ChartDetailPage` | One hole: par, full ranking by strokes, your attempts, dispersion |
| Course leaderboard | `LeaderboardPage` | Ranked by total strokes vs par; per course, and possibly an overall |
| Player card | `UserDetailPage` | A player's scorecards across courses, trophies, aces/OB totals |
| Compare | `ComparePage` | Head-to-head scorecards, hole by hole — maps very naturally to golf |

### Work

1. **`services/eventApi.ts` for golf** — the read-api client that doesn't exist yet. Depends on §2's
   routes, so the API shape should be designed once for both the images and the site.
2. The pages above, reusing `DispersionChart` (already built) on hole detail.
3. **Golf vocabulary everywhere**: strokes/par/aces/OB/holes/courses, lower-is-better sorting, real
   golf terms (birdie/bogey — the mapping table already exists in `golf-result-image.ts:118`).
4. Nav additions, and i18n via `FormattedMessage` as the existing golf pages already do (note
   `SubmitChartPage` needed an i18n-lint fix once before — see commit `d916460`).
5. `VITE_GOLF_READ_API_URL` added to `.env.example` alongside the existing submit-api URL.

---

## Phasing toward mid-October

1. **Foundation** — course/par source of truth (§1), course+par awareness in the event backend,
   GSI keys and the course aggregate item (§2.1–2.2). Everything else depends on this.
2. **Read API** — the batched rankings endpoint (§2.3), ban/alias handling (§4.1–4.2).
3. **Images** — 3 per submission, inside the latency budget, then ungate (§2.4–2.6).
4. **Website** — api client, then courses → scorecard → hole detail → leaderboard, with compare and
   player card last (§5).
5. **Trophies** — bridge decision early (it may need infra), catalogue and seeding can land late
   (§3).

Backfill note: GSI keys and course aggregates only exist for scores processed *after* they ship. If
beta testers play before that, their scores need re-deriving from the existing `PLAY`/`BEST` items —
worth sequencing phase 1 before any real play, or writing a one-off backfill.

## Explicitly out of scope

- Changing the golf scoring formula (`calculateGolfStrokes`) — beta exists to evaluate it
- Core Postgres schema changes for golf scores; golf scores stay in golf's own store
- Opening up event authorship to third parties (the isolation boundary anticipates it; this doesn't build it)
- December full-launch features: more courses, ongoing seasons
- The chart-submission portal, which is already built and unrelated to scoring

## Open questions

1. **Trophy bridge**: poller, authenticated grant endpoint, or end-of-event batch? (§3 — recommend the poller.)
2. **Partial courses**: how does a player with 14/18 holes rank? (§2.2 — blocks both the image and the leaderboard.)
3. **Hole order** within each course — who decides the 1–18 sequence? (§1.3)
4. **Is there an overall cross-course standing**, or do the two courses stay separate? The Hills/Pines par asymmetry matters a lot if combined. (§1.5)
5. **Alpha Testing hashes** — keep or drop for beta? (§1.4)
6. **Beta trophies**: permanent collectibles or reset before December? (§3.3)
7. **Exact beta start date**, and is there a defined end, or does beta run until December?
8. **Are the 18+18 charts final**, or can courses still change before beta? Pack names carry a "vE2" suffix, implying revisions.
