# In The Golf — Beta Test Prep (mid-October)

Status: **planning — design decisions resolved** (see Decisions below). Branch: `golf-beta-prep`.
Target: beta live mid-October 2026 with a fixed end date before the December full launch (timeline
section in `events/golf/frontend/src/pages/HomePage.tsx`).

This plan covers everything between today's state — a marketing site, a chart-submission portal, and
a working single-image result card gated to two test accounts — and a beta a real player base can
play through without us hand-holding it.

## Decisions

Resolved 2026-09-30. Each is expanded in the section noted.

| # | Decision | Where |
|---|---|---|
| 1 | Trophies are granted by a **core-side poller** reading golf's public read-api — golf stays strictly read-only | §3 |
| 2 | Course boards list **completed rounds first by lowest strokes, then partials by holes played, tie-broken on strokes** | §2.2 |
| 3 | **Per-course boards only** — no combined cross-course standing | §2.2 |
| 4 | Beta trophies are **permanent and beta-exclusive** | §3.3 |
| 5 | Hole order stays the **current alphabetical song-folder order** | §1.3 |
| 6 | The 4 Alpha Testing charts become a **hidden dev-only course** | §1.4 |
| 7 | Beta starts mid-October and **closes on a fixed end date** before December (exact dates still needed) | §6 |
| 8 | Courses **may still change** before beta — config must tolerate revisions | §1.6 |

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
below push directly against that boundary: trophies (resolved — a core-side poller keeps golf
read-only, §3) and ban filtering (still needs a mechanism, §4.1).

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
3. **Hole numbering — keep the current order.** *Decided:* holes are numbered 1–18 in the existing
   alphabetical song-folder order, as the par JSONs and CSVs already are. Hole numbers are stable
   positional labels so players and the scorecard can refer to "hole 7", not a curated routing — so
   no pacing is implied and nothing needs to be collected from curators to ship. The ordering lives
   in the course config (§1.1) as explicit indices rather than being re-derived by sorting at read
   time, so it stays fixed even if a song is renamed, and can be re-routed later without a data
   migration.
4. **Alpha Testing charts become a hidden course.** *Decided:* the 4 par-less hashes
   (`7a520534f16d6455`, `065f74f741eb2f9d`, `f3871997119d5052`, `50bcefd78fa82988`) stay, reframed as
   a dev-only course so the whole pipeline can be exercised end-to-end without touching real beta
   boards. Consequences to build for: the course config needs a `hidden: true` flag; the site must
   omit hidden courses from every listing and leaderboard; hidden courses must be excluded from
   trophies and from any event-wide totals; and `golf-result-image.ts`'s no-par fallback layout
   stays alive, so it needs to keep working rather than being deleted as dead code.
5. **Par spread — no longer a correctness risk.** Hills is 5–15 and Pines is 3–6, consistent with
   Hills being the meter-13 course and Pines meter-8. This only mattered if the two were ever summed
   into one standing; with per-course boards only (§2.2) the asymmetry is purely cosmetic. Worth
   re-reading if an overall board is ever revisited.
6. **Tolerate course revisions.** *Decided:* the 36 charts are **not** locked — songs may be added,
   removed, or re-charted before beta (the packs already carry a `vE2` suffix). So the course config
   can't be treated as immutable: the hash/par regeneration path (`scripts/get-pack-hashes.ts` →
   `scripts/assign-golf-pars.ts` → course config) needs to stay a repeatable one-command flow rather
   than a one-time manual copy into `GOLF_CHARTS`, and re-running it must preserve pars for charts
   whose hash didn't change. A re-chart changes the hash, which silently orphans every score on the
   old one — see the open question on what happens to those scores.

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
2. **Maintain a per-user, per-course aggregate item** (`COURSE#<courseId>` → sum of that user's best
   hole totals, holes completed, vs-par). This is the backing data for both the course-ranking image
   and the scorecard.

   **Course ranking sort order** *(decided)*:

   - **Completed rounds first** (all 18 holes), ascending by total strokes — lowest wins.
   - **Then partial rounds**, descending by holes completed, ties broken ascending by total strokes.

   ```
   dimo        9.02
   wafles     10.28
   topher      6.53  (thru 16)
   snap        9.12  (thru 16)
   heavymode   7.01  (thru 15)
   ```

   Note what this example makes explicit: a partial player's raw total is *lower* than a completed
   player's simply because they've played fewer holes (topher's 6.53 beats wafles' 10.28 but ranks
   below it). That's exactly why holes-completed is the primary key for partials and why partials can
   never outrank a completed round — totals across different hole counts aren't comparable. Any
   implementation that sorts the whole board on strokes alone is wrong.

   Mechanically this is two queries against the same ranked index (complete, then partial) rather
   than one, or a single composite sort key encoding `completed-flag | hole-count-descending |
   strokes-ascending`. The composite key is preferable — it keeps the read a single ranged query and
   keeps the ordering rule in one place instead of split across two call sites.

   **Per-course boards only** *(decided)* — there is no combined cross-course standing, so no
   normalisation across courses is needed and the Hills/Pines par asymmetry doesn't come into play.
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

**Decided: a core-side poller.** Core periodically reads golf's public read-api and grants trophies
itself. Golf never writes to core, no new write surface into user data is created, and the same
mechanism works for any future event — a third-party event author gets trophies for free without
being handed credentials. The cost is that awards lag by the poll interval.

Rejected: an authenticated grant endpoint golf calls (immediate, but hands an event backend a write
path into core user data, which is the exact thing the isolation rule exists to prevent), and an
end-of-event batch (no awards *during* the event, which is the whole point).

### Work

1. **Build the poller.** Scheduled Lambda in core, reading golf's read-api and granting via the
   existing `Trophy`/`UserTrophy` path. Open: poll interval. Design notes:
   - Needs an **idempotent** grant — `UserTrophy` already has a `@@unique([userId, trophyId])`, so a
     re-grant is a no-op, but the notification must not re-fire on every poll.
   - Reads must be **bounded** — a full scan of every player's standing every interval won't scale;
     prefer a read-api route that returns only what changed since a cursor/timestamp.
   - Hidden courses (§1.4) must be excluded from trophy evaluation.
   - `events/testevent/backend/src/scheduled-processor.ts` is prior art for a scheduled event Lambda,
     though note it lives on the event side — this poller belongs on the core side.
2. **Define the trophy catalogue** — this is content work and the long-pole item. Candidates worth
   considering: first round completed, a course completed, hole-in-one/ace-count milestones, under
   par on a hole, under par on a full course, beating a specific curator's score, participation.
   Each needs name, slug, tier, description template, and an image asset.
3. **Permanent and beta-exclusive** *(decided)*: beta trophies stay on profiles forever and are never
   grantable again, marking the early testers. Two consequences. First, each beta trophy needs a slug
   distinct from any December equivalent (e.g. `golf_beta_*`) so the launch event can't re-award it.
   Second, since the home page itself says stroke values are "subject to change after beta testing",
   the catalogue should lean on **participation and milestones** (rounds completed, courses finished,
   aces) over absolute stroke thresholds or final rankings — a permanent trophy pinned to a scoring
   constant we're about to retune would misrepresent what the player actually did.
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

## 6. Schedule and lifecycle

**Decided:** beta opens mid-October and **closes on a fixed end date** before the December full
launch, rather than running continuously into it. Exact dates still needed (see open questions) — so
nothing in this phase should hardcode a date; the start/end belong in config the way
`NewPackLeaderboardsCard`'s expiry does, not scattered through components.

A fixed close is a real feature, not just a date, and it has to be built:

1. **Final standings freeze.** At close, each course's board becomes the official beta result.
   Decide whether submissions after the close are rejected outright, or accepted but not ranked
   (gentler for a player mid-round when the clock runs out).
2. **Trophy finalisation.** Any trophy contingent on a final standing can only be granted after the
   freeze, so the poller (§3) needs a terminal run — and then needs to stop, so it isn't polling a
   dead event into December.
3. **The site after close.** The boards and scorecards should stay readable as an archive rather than
   404ing, with a clear "beta complete" state instead of looking like a live event nobody is playing.
4. **Relationship to December.** Whether December starts from an empty slate or inherits beta scores
   is a launch-planning question, but the answer affects whether beta data needs to survive in a
   migratable shape. Worth deciding before we design the DynamoDB items, not after.

---

## Phasing toward mid-October

1. **Foundation** — course config as the single source of truth, with `hidden` and hole indices
   (§1.1, §1.3–1.4); course+par awareness in the event backend (§1.2); GSI keys and the course
   aggregate item with the composite complete/holes/strokes sort key (§2.1–2.2). Everything else
   depends on this, and the sort key is the piece most expensive to get wrong — it's baked into
   written items, so changing it later means a backfill.
2. **Read API** — the batched rankings endpoint (§2.3), ban/alias handling (§4.1–4.2). Design the
   response shape once for both the result images and the website, since both consume it.
3. **Images** — 3 per submission, inside the 3000ms budget, then ungate (§2.4–2.6). The Alpha Testing
   course (§1.4) is the natural end-to-end test target before ungating.
4. **Website** — api client, then courses → scorecard → hole detail → leaderboard, with compare and
   player card last (§5).
5. **Trophies** — poller infra can start any time after phase 2 (it only needs the read-api);
   catalogue content and DB seeding can land late (§3).
6. **Close-out** — standings freeze, terminal trophy run, archive state (§6). Needed by the end date,
   not by launch, so it can trail the beta opening — but not be forgotten.

Backfill note: GSI keys and course aggregates only exist for scores processed *after* they ship. If
beta testers play before that, their scores need re-deriving from the existing `PLAY`/`BEST` items —
worth sequencing phase 1 before any real play, or writing a one-off backfill. The same applies to any
change to the composite sort key, which is the strongest argument for settling §2.2's encoding before
phase 1 ships rather than iterating on it later.

## Explicitly out of scope

- Changing the golf scoring formula (`calculateGolfStrokes`) — beta exists to evaluate it
- Core Postgres schema changes for golf scores; golf scores stay in golf's own store
- Opening up event authorship to third parties (the isolation boundary anticipates it; this doesn't build it)
- December full-launch features: more courses, ongoing seasons
- The chart-submission portal, which is already built and unrelated to scoring

## Open questions

The eight original design questions are resolved (see Decisions). What's left is a mix of dates,
tuning values, and one mechanism — none of which blocks starting phase 1.

**Needed before beta ships:**

1. **Exact beta start and end dates.** Drives the standings freeze, the poller's terminal run, and
   any announcement card expiry. (§6)
2. **Ban/shadowban mechanism.** Decided *that* banned players must not appear; not decided *how*.
   Golf's store has no user table, so either the score processor records a flag at write time from
   what the public API exposes, or the read-api filters at read time against a core lookup. The first
   is cheaper but goes stale when someone is banned after the fact. (§4.1)
3. **Trophy catalogue** — the actual list of earnable trophies, with names, tiers, descriptions, and
   images. Content work, and the long pole in §3; leaning participation/milestone per §3.3.
4. **Scores on a replaced chart.** Since courses may still change (§1.6), a re-chart produces a new
   hash and orphans every score on the old one. Do those scores get discarded, remapped to the new
   hash, or does a mid-beta re-chart simply get ruled out once the event opens?

**Tuning, can be decided during implementation:**

5. **Trophy poll interval** — how fresh an award needs to feel against how much polling we want. (§3)
6. **Post-close submissions** — rejected, or accepted but unranked? (§6.1)
7. **December inheritance** — does the full launch start fresh or carry beta scores forward? Affects
   whether beta's DynamoDB items need to be migratable. (§6.4)
