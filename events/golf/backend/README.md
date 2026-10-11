# Golf Event Backend — Read API

Public and unauthenticated. There are two ways in, and which one you want depends on who's calling.

**From the site — use `/api`, same-origin.** CloudFront routes `golf.arrowcloud.dance/api/*` to this
Lambda, stripping the prefix at the edge (`cdk/lib/event-site-stack.ts`). So application code just
calls `/api/activity` with **no base URL to configure and no CORS involved**. The dev server proxies
the same prefix, so the identical path works locally — set `VITE_GOLF_READ_API_URL` in
`events/golf/frontend/.env` for dev only (see `.env.example`); production needs nothing.

```ts
const res = await fetch(`/api/activity?limit=3`);
```

**From a server — use the Function URL directly.** The core API's result-image hook does this, since
adding a CDN hop to a latency-budgeted call would be a step backwards. The URL is `readApiUrl` in
`events/golf/backend/config.json`, which is gitignored, so ask rather than looking for it in the repo.

> If you do use the Function URL from a browser, note it ends in a **trailing slash**: `${base}/activity`
> on a URL already ending in `/` gives a double slash, which the route matcher doesn't match and the
> Lambda answers `404`. This has already caused one silent outage on `/best`. The `/api` path has no
> such trap.

---

## `GET /activity`

The most recent play by each of the N most recently active players. Backs the **"Currently On
Course"** panel on the logged-out home page.

```
GET /activity?limit=3&course=beta-pines&userIds=<id>,<id>
```

| Param | Default | | |
|---|---|---|---|
| `limit` | `3` | max `50` | Number of rows (one per player) |
| `course` | all courses | optional | One course slug: `beta-hills` or `beta-pines` |
| `userIds` | everyone | optional | Comma-separated user ids, max 100 — only their plays |

`400` on an unknown `course` slug (the response lists the valid ones) or more than 100 `userIds`.
An explicitly empty `userIds=` returns an empty list, not the unfiltered feed — "restrict to nobody"
is not the same as "no restriction".

### Filtering by course

Each row is still a player's **most recent play on that course**, not "their most recent play, if it
happened to be on that course". A player whose newest round was on Beta Hills still appears in a
`course=beta-pines` request, via their latest Pines round.

### "Rivals only"

There's no `rivalsOnly` flag, because this endpoint can't verify a relationship it has no access to —
golf has no user table and no auth. Instead the browser, which *is* authenticated with the core API,
reads its own rival list and passes the ids:

```ts
// core API, authenticated — returns { rivals: [{ userId, alias, ... }] }, banned rivals excluded
const { rivals } = await (await fetch('https://api.arrowcloud.dance/rivals', { headers: auth })).json();

const qs = new URLSearchParams({ limit: '3', userIds: rivals.map(r => r.userId).join(',') });
const res = await fetch(`/api/activity?${qs}`);
```

Nothing is leaked by trusting the client here: every row this returns is already public in the
unfiltered feed, so naming arbitrary users only narrows what you'd have been shown anyway.

If the user has no rivals, send `userIds=` (empty) to get an empty panel rather than omitting the
parameter, which would show everyone's activity.

### Response

A real row, trimmed:

```jsonc
{
  "data": [
    {
      "playId": 531987,
      "userId": "2d6dbf9e-3a8c-4b0d-9f8e-e3ead7a4ae80",
      "playerAlias": "Brandough",
      "timestamp": "2026-10-08T01:26:47.304Z",

      "courseSlug": "beta-pines",
      "courseName": "Beta Pines",
      "holeNumber": 8,
      "chartHash": "9a5e366400f59236",
      "songName": "GIMME LOVE",
      "artist": "Łaszewo",
      "par": 3,

      "totalStrokes": 3818,
      "noteCount": 367,
      "noteStrokes": [25, 7, 0, 3, 0, 19, ...]   // 367 entries
    }
  ]
}
```

That renders as **Brandough · Beta Pines h8 · GIMME LOVE · 3.82 strokes (par 3)**.

Always `200` with a `data` array. An empty array means no qualifying plays, not an error.

### Field notes

- **`totalStrokes` is a raw integer, not the displayed number.** Divide by 1000 and fix to 2dp:
  `3818` → `"3.82 strokes"`. This matches the in-game HUD (`GolfScoring.lua`). Store and pass the
  raw integer everywhere; divide only at render time.
- **`par` can be `null`** — the hidden Alpha Testing charts have no par assigned. Those are filtered
  out of this endpoint, so in practice it won't be null here, but don't assume.
- **`noteStrokes`** is one value per tap note, `0` (ace) to `200` (miss / out of bounds), in
  chronological order — feed it straight to `DispersionChart`. Its length always equals `noteCount`.
  Only tap notes appear: mine, hold and roll penalties are counted in `totalStrokes` but have no
  per-note identity in the submission, so a round can score far above what these dots alone explain.
- **It's typed `number[] | null`.** In practice it should never be null — it's stored when the play
  is ingested, and a play whose timing data couldn't be read never reaches the feed at all. The null
  case is defensive, so if you do hit it, **render the row without a plot rather than hiding the
  row**.
- **The dispersion green's shape is derived from `chartHash`**, not sent — same chart always draws
  the same green. That's why `chartHash` is in the payload.
- **Payload is mostly `noteStrokes`** — roughly 1.5 KB per row, measured. The 3-row default is ~4 KB;
  `limit=50` is ~76 KB. Fine for the panel, worth knowing before any page asks for a big feed.

### What's filtered out

Rows are dropped, newest-first, until `limit` is reached:

1. **One row per player** — only their most recent qualifying play. Without this the panel is
   routinely one person's practice session. Every other filter is applied *before* a player is
   counted as seen, which is what makes the course filter behave as described above.
2. **Visible courses only** — charts dropped from a course have no name or par to render, and the
   Alpha Testing course is hidden.
3. **Eligible plays only** — passed, music rate exactly `1`, no autoplay (outside the allow-list),
   not from the affected DeadSync version range.

> **Not yet filtered: banned and shadowbanned players.** Golf's store has no user table, so a banned
> player can currently appear here. This is the most exposed surface for it, being public and
> logged-out. Tracked as open question 2 in `docs/plans/golf-beta-prep.md`, on the `golf-beta-prep`
> branch.

### "Currently" is inferred, not live

There is no presence signal — a score only exists once a play has **finished**. This is simply the
latest plays, with **no recency window**. A quiet event shows older rows rather than an empty panel,
so use `timestamp` to render the relative time ("3 minutes ago") and decide how to present a stale
one.

---

## `GET /best`

Previous best stroke total for one player on one hole.

```
GET /best?userId=<uuid>&chartHash=<hash>
→ { "previousBestStrokes": 3450 }   // null if none
```

Called synchronously by the core API's result-image hook with a short timeout
(`api/src/utils/event-result-images.ts`) to show a delta on the result card. Only eligible plays set
a best. `400` if either param is missing.

---

## Where the data comes from

Course, hole number, par, song name and artist are **not stored on plays** — they're resolved at
read time from [`../config/courses.json`](../config/courses.json), so revising a par or re-ordering
holes takes effect immediately with no backfill. Only facts about the play itself — strokes,
timestamp, player, eligibility — live on the DynamoDB item.

That file is also the only place the site should get course/hole metadata from, rather than
hardcoding hole lists. It's committed, so it's safe to import directly.

> **Maintainers:** `scripts/build-golf-courses.ts` generates it from the per-course par JSONs, but
> those input files are not currently in the working tree, so the generator won't run as-is. Until
> that's resolved, treat `courses.json` as hand-maintained and edit it directly.
