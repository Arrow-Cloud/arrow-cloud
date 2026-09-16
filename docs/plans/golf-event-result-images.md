# Custom Event Result Images — Golf (Isolated-Infra Pattern)

## Context

The post-submission result-image feature (satori/resvg-rendered PNGs, returned synchronously in
`POST /v1/chart/{chartHash}/play`'s response as `resultImages: string[]`) currently only supports
pack leaderboards. The goal is to extend it to **custom events**, starting with "golf" (bespoke
stroke-count scoring, lower = better). Golf's actual scoring/leaderboard backend doesn't exist yet —
the user's private branch (`private/SECRET-ac-offseason-1`) only has a chart-*submission* portal for
golf (players uploading their own charts to the event pack), unrelated to gameplay scoring.

**The governing constraint** (this is the part the first pass of this plan got wrong): event
infrastructure is deliberately **async and uses entirely separate storage** from core score
processing (`events/testevent/` is the reference implementation of this: SNS→SQS→the event's own
Lambda→the event's own DynamoDB table, via the reusable `EventBackendConstruct` CDK construct on
the private branch). This isolation is intentional — the plan is to eventually open up custom-event
authorship to others, so a bug, slowdown, or bad actor in one event's processing must never be able
to touch core Postgres tables or block/slow the main score-submission request path. Confirmed
directly in the branch: `GolfBackendStack` is deployed as its own **top-level CloudFormation stack**
(unlike `testevent`, which nests its `EventBackendConstruct` inside `ApiStack`), and nothing in
`api-stack.ts` wires golf's infra back into `apiLambda`. My first draft of this plan violated the
constraint by proposing a new Postgres `Leaderboard`/`PlayLeaderboard` row written synchronously
from `chart.ts` — scrapped.

Also confirmed with the user: **not every event gets result images** — that's a capability the user
grants manually, per event, not something generic to the event system. So this is not an extension
of `api/src/utils/events/base.ts`'s `EventConfig`/`EventRegistry` (which is Postgres-coupled,
synchronous-by-construction, and — on reflection — looks like the *old* generation of this system,
used only by the dormant Blue Shift configs; it stays untouched). It's a small, separate,
hand-curated mechanism.

User-confirmed decisions:
- Golf scores **are persisted**, but entirely within golf's own isolated DynamoDB store, via its
  own async Lambda — never in core Postgres.
- For the synchronous result image to show anything beyond "your score just now" (rank, previous
  best), `chart.ts` makes a **short-timeout HTTP call to the event's own read-api** (a Lambda
  Function URL — the exact "Read API" feature `EventBackendConstruct` already supports and
  `testevent` already implements) to fetch that context. If it's slow or down, the image still
  renders, just without that context — this call can never block or fail the core submission.
- Real golf chart hash(es): TBD, placeholder for now.
- Testing gated to the same two test-account userIds as the pack-leaderboard rollout
  (`27cfc687-8d10-4132-bd29-da3b4ef54dfb`, `3ac37479-c87f-459c-b3aa-c17e95c1a0d8`).

## Architecture

Three cleanly-separated pieces:

1. **Golf's own async backend** (isolated compute + storage, following `events/testevent/`'s
   already-proven shape exactly) — computes and persists strokes/standings from the same
   `score-submitted` SNS event every other consumer (pack-leaderboard, testevent) already
   subscribes to, filtered to golf's chart hashes. Nothing here is reachable from or able to affect
   `chart.ts`/Postgres.
2. **A pure, zero-I/O scoring function**, shared as *source code* (a plain TS module with no
   `PrismaClient`/AWS SDK dependency), imported at build time by both golf's own Lambda and the core
   API — not a runtime dependency between the two deployed units, just avoiding hand-duplicating the
   stroke formula. Monorepo-local relative imports across `events/golf/backend/` and `api/src/` are
   fine here since each has its own independent bundler entry (confirmed via `api/webpack.config.js`
   already doing this same "separate bundle per Lambda" pattern for the 9 existing `api/` entries).
3. **A small, explicit, manually-curated registry in the core API** (not `EventConfig`/
   `EventRegistry`) that `chart.ts` consults after publishing the SNS event: for a chart hash on the
   list, compute this play's own score locally (the pure function from #2, zero I/O), make a
   bounded/short-timeout HTTP call to that event's read-api for rank/context, render + upload an
   image, and append the URL to `resultImages` — all best-effort, never blocking or failing the
   submission response.

```
chart.ts (sync, core, per-request)
  |
  |-- publish SNS event (fire-and-forget, already happens today, unchanged)
  |
  |-- [NEW] for each registered event-result-image provider whose chartHashes include this chart
  |     and whose test-user gate passes:
  |       - compute this play's own score (pure fn, no I/O)
  |       - GET <event read-api URL>/rank?... (short timeout, e.g. 300ms; failure = degrade, no context)
  |       - render + upload image, push URL into resultImages
  |
  |-- respond (resultImages includes pack images + any event images)

score-submitted SNS topic
  |
  |-- (existing, unchanged) pack-leaderboard SQS consumer -> S3 JSON (streamer widget)
  |-- (existing, unchanged) testevent score-processor -> testevent's own DynamoDB
  |-- [NEW] golf score-processor (SQS, filtered to golf chartHashes) -> golf's own DynamoDB
        - independently re-derives strokes from rawTimingDataUrl (same pure fn from #2)
        - writes PLAY + BEST records, recomputes standings (mirrors testevent's score-processor.ts)

golf read-api (Lambda Function URL, GET, public)
  |-- reads golf's own DynamoDB only
  |-- serves both golf's own frontend micro-site AND chart.ts's bounded sync read (#3 above)
```

## Golf scoring rule (verified against the actual submission payload)

`GolfScoring.lua` (client-side HUD overlay, reference only) gives the rule; I verified server-side
feasibility by reading `api/src/utils/scoring/index.ts` directly. `PlaySubmission.timingData` contains
**only tap-note** entries (`[courseOffset, offset: number|'Miss', ...unused]`); mines/holds/rolls are
**pre-aggregated counts** in `submission.radar` (`Holds: [heldCount, totalHolds]`, `Mines:
[minesDodged, totalMines]`, `Rolls: [rollCount, totalRolls]`) — exactly how the existing
`SubmissionCalculator.calculateScore` already consumes them (`scoring/index.ts:462-471`). Since
golf's mine/hold penalty is a flat constant (200 regardless of which specific note), the aggregate
data is sufficient — no per-note mine/hold identity needed:

```ts
function calcStrokes(offset: number | 'Miss'): number {
  if (offset === 'Miss') return 200;
  const ms = Math.abs(offset) * 1000;
  if (ms <= 4) return 0;
  if (ms > 103.5) return 200;
  return Math.floor(ms) - 4;
}

export function calculateGolfStrokes(submission: PlaySubmission): { totalStrokes: number; noteCount: number } {
  let totalStrokes = 0;
  for (const [, offset] of submission.timingData) totalStrokes += calcStrokes(offset);
  const [heldCount, totalHolds] = submission.radar.Holds;
  const [rollCount, totalRolls] = submission.radar.Rolls;
  const [minesDodged, totalMines] = submission.radar.Mines;
  totalStrokes += (totalHolds - heldCount + totalRolls - rollCount + totalMines - minesDodged) * 200;
  return { totalStrokes, noteCount: submission.timingData.length };
}
```

Matches the Lua exactly: tap `calcStrokes` (nil→200 ≈ `'Miss'`→200), HitMine→200, AvoidMine→ignored,
Miss→200, hold `LetGo`/`MissedHold`→200, successful hold→ignored. Client HUD displays
`totalStrokes / 1000` to 2 decimals — replicate that division only at display/render time; store and
transmit the raw integer sum everywhere else.

## Implementation

### 1. Shared pure scoring module

New file `api/src/utils/scoring/golf.ts` — `calculateGolfStrokes` above, verbatim, zero dependencies
(no `PrismaClient`, no AWS SDK). This file gets imported two ways:
- Directly by the core API (§4/§5) via a normal relative import.
- Via a relative import from `events/golf/backend/src/score-processor.ts` reaching into
  `api/src/utils/scoring/golf.ts` — confirm during Phase 2 that `events/golf/backend/build.mjs`
  (esbuild, per its `.mjs` naming) resolves this fine; if not, fall back to a literal copy with a
  comment pointing at the source of truth, but a shared import is strongly preferred to avoid the two
  formulas drifting apart.

Explicitly **not** built on `SubmissionCalculator` (hardwired to a "% of computed max, floored,
clamped ≥0" formula — incompatible with a raw, uncapped, lower-is-better stroke sum).

### 2. Golf's own async backend (new work — doesn't exist on the branch yet)

Following `events/testevent/backend/`'s exact shape:
- `events/golf/backend/src/score-processor.ts` — SQS handler (mirrors `testevent`'s
  `score-processor.ts`): parse the SNS-wrapped `ScoreSubmissionEvent`, fetch/parse the raw timing
  data from `event.play.rawTimingDataUrl` directly (S3 GetObject — `testevent`'s version instead
  calls back into the main API for pre-computed scores via `GET /play/{id}`, but golf strokes aren't
  a standard leaderboard type, so golf's processor reads the raw submission itself and calls
  `calculateGolfStrokes`), write a `PLAY#{timestamp}#{playId}` item + update `BEST#{chartHash}` if
  improved (lower strokes = better — flip `testevent`'s `score > currentBest.score` comparison to
  `score < currentBest.score`), recompute a user/standings summary.
- `events/golf/backend/src/read-api.ts` — Function URL GET handler (mirrors `testevent`'s
  `read-api.ts`): serves rank/best/nearby-standings queries against golf's own DynamoDB table.
  This is the endpoint `chart.ts`'s sync hook will call.
- `events/golf/backend/src/shared.ts` — DynamoDB client + item builders, mirroring `testevent`'s
  `shared.ts` structure.

### 3. `GolfBackendStack` CDK wiring

Currently `GolfBackendStack` only passes `eventSlug: 'golf'` to `EventBackendConstruct` (no score
processing, no read API — it only has the chart-submission bucket/Lambda). Extend it to also pass:
`scoreSubmissionTopic` (from `ApiStack`, same topic every other consumer uses), `chartHashes` (the
placeholder array, filled in later), `scoreProcessorCodePath`/`scoreProcessorHandler`,
`readApiCodePath`/`readApiHandler` — exactly mirroring how `cdk/bin/app.ts` wires
`EventBackendConstruct-testevent`. This is what actually stands up golf's score-processor Lambda +
DynamoDB table + read-api Function URL.

New CDK output/env wiring: expose the read-api's Function URL to `apiLambda` as an environment
variable (e.g. `GOLF_READ_API_URL`), added in `api-stack.ts` alongside `apiLambda`'s other
environment vars — this is the one, deliberately narrow, cross-stack reference (a URL string, not a
shared table/queue/role) that lets `chart.ts` make its bounded HTTP read.

### 4. Core API: the manually-curated event-result-image registry

New file `api/src/utils/event-result-images.ts` — explicitly **not** part of `EventConfig`/
`EventRegistry`. A small, hand-maintained array the user adds an entry to per-event, only for events
that should get this capability:

```ts
interface EventResultImageProvider {
  id: string;
  chartHashes: string[];               // hardcoded, same pattern as ELIGIBLE_PACK_IDS
  testUserIds?: Set<string>;           // gate; omit once rolled out, matching the pack-image precedent
  computeOwnScore(submission: PlaySubmission): unknown;      // pure, e.g. calculateGolfStrokes
  fetchContext(userId: string, chartHash: string): Promise<unknown>;  // bounded HTTP GET to read-api, own timeout/catch
  renderImages(play: Play, ownScore: unknown, context: unknown): Promise<Buffer[]>;
}

export const EVENT_RESULT_IMAGE_PROVIDERS: EventResultImageProvider[] = [
  golfResultImageProvider, // api/src/utils/golf-result-image.ts
];
```

`fetchContext` owns its own timeout (e.g. `AbortController` + ~300ms) and must never throw past its
own boundary — on timeout/error it returns `undefined`/partial context, and `renderImages` must
degrade gracefully (e.g. omit rank/nearby-standings, still show this play's own score).

### 5. `chart.ts` wiring

After the existing (already fire-and-forget, unblocked) SNS publish, and alongside the existing
`computePackResultImages` call, add a new step that loops `EVENT_RESULT_IMAGE_PROVIDERS`, checks
`chartHashes.includes(hash)` + the test-user gate, and — for matches — runs the provider's
compute→fetch→render→upload pipeline, wrapped in try/catch (matching the existing
`computePackResultImages` error-handling convention: log and continue, never fail the request),
pushing any returned URLs into the same `resultImages` array already feeding
`response.resultImages`. No response-contract change — the client's existing "paginate through N
result images" handling needs nothing new.

For any chart not on an event's `chartHashes` list, this is a zero-cost no-op (one array
`.includes()` check per provider) — byte-identical behavior to today for every non-golf, non-pack
submission.

### 6. Golf result-image render module

New file `api/src/utils/golf-result-image.ts`, structurally cloned from the proven
`api/src/utils/pack-result-image.ts` pattern: same `SCALE`/card-size convention, same
lazily-memoized `loadFonts()`/logo loading (reuses the already-bundled Miso/Nunito assets), same
dynamic `await import('./golf-result-image')` from the provider's `renderImages`, for the identical
isolation reason already established for packs (a satori/resvg native-module load failure can only
break this one call).

**Color convention is inverted from packs — do not copy-paste the sign check.** For golf,
`strokeDelta = totalStrokes - previousBestStrokes`; a **negative** delta (fewer strokes) is good and
must be green; positive is bad and must be red — opposite of `pack-result-image.ts`'s
`delta > 0 ? DELTA_UP : DELTA_DOWN`.

Whether to show rank/nearby-standings depends entirely on whether `fetchContext` succeeded (§4) —
design the layout to look correct both with and without that data, since a read-api timeout must
still produce a coherent image, just a simpler one (own score only).

### 7. Test-account gating

Same two IDs as the pack-leaderboard rollout, expressed as `golfResultImageProvider.testUserIds` in
the registry entry (§4) — checked in `chart.ts`'s provider loop before doing any work. Not an
`EventConfig.isActiveForUser` hook (that system isn't involved here at all).

## Explicitly out of scope

- `api/src/utils/events/base.ts`'s `EventConfig`/`EventRegistry` and the dormant
  `BlueShift*EventConfig` classes — not touched, not extended, not used as a foundation for golf.
- Any new Postgres `Leaderboard`/`PlayLeaderboard` row for golf — golf's scores live exclusively in
  golf's own DynamoDB table.
- `processSinglePlay`, `SubmissionCalculator` — untouched.
- `pack-leaderboard.ts`'s async SQS→S3-JSON pipeline for the streamer widget — unaffected.
- Golf's own frontend leaderboard micro-site pages (`events/golf/frontend/`) — the read-api this
  plan adds is needed by both that future site and `chart.ts`'s sync hook, but building out the
  site's own UI is separate work, not required for result images to function.
- Par/vs-par display — `GolfScoring.lua`'s "Par: 3" is a hardcoded placeholder, not computed
  anywhere; not implemented here.

## Phasing

1. **Local satori POC** — `scripts/golf-satori-poc.ts`, cloned from `scripts/satori-poc.ts`, mock
   data only (including a mocked "context missing" render, to validate the graceful-degradation
   layout). Iterate visually with you first, no production wiring.
2. **Shared scoring module** — `api/src/utils/scoring/golf.ts`, unit-tested against every branch of
   the formula; confirm the cross-boundary import works from `events/golf/backend/`.
3. **Golf's async backend** — `score-processor.ts`, `read-api.ts`, `shared.ts` in
   `events/golf/backend/src/`, `GolfBackendStack` CDK wiring (score processing + read-api features).
4. **Core registry + `chart.ts` wiring** — `event-result-images.ts`, the provider loop, the
   `GOLF_READ_API_URL` env var wiring in `api-stack.ts`.
5. **Production render module** — `api/src/utils/golf-result-image.ts`, porting the Phase-1 visuals.
6. **Verification** (below).

## Open questions

1. `fetchContext`'s exact timeout budget — 300ms was used as an illustrative number during
   discussion; confirm before Phase 4 (should be comfortably inside `apiLambda`'s 10s total timeout
   alongside everything else `scoreSubmission` already does).
2. Golf read-api's response shape/contract (rank, previous best, nearby standings) — design
   alongside the Phase 1 POC once we know what the image needs to show.
3. Naming: event id (`'golf'`), DynamoDB item shapes, read-api route(s) — placeholders pending your
   input, same as before.
4. Confirm `events/golf/backend/build.mjs` can resolve a relative import into `api/src/utils/` for
   the shared scoring module (§1) — if not, we fall back to a deliberate, clearly-commented copy.

## Verification

- **Unit**: `calculateGolfStrokes` against hand-computed examples spanning every branch.
- **Isolation**: kill/break golf's read-api (or simulate a timeout) and confirm a score submission
  on a golf chart still succeeds normally — pack images (if any) still return, response still 200,
  no error surfaced to the client, only a log line. Separately, confirm a bug thrown inside
  `score-processor.ts` (golf's async Lambda) has zero effect on `chart.ts`'s response — it's a
  different Lambda, different queue, decoupled by design.
- **Gating**: non-test-user submission on a golf chart hash → zero calls to golf's read-api, no
  golf entries in `resultImages`. Test-user submission → exactly one golf image URL, correct score.
- **Correctness**: submit two plays with different stroke totals from the same test user; confirm
  the golf read-api reports the *lower*-stroke play as the better one everywhere it reports rank.
- **Regression**: non-golf, non-pack submissions and the `pack-leaderboard` webpack entry (async SQS
  Lambda) remain byte-identical/unaffected — nothing golf-related is reachable from that bundle or
  from `EventConfig`/`EventRegistry`.
