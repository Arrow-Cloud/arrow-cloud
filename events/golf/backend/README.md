# Golf Event Backend — Read API

Public, read-only, unauthenticated JSON over HTTP. This is everything the golf site reads: leaderboards,
the course list, and a feed of recent plays.

## Quick reference

| Route | Returns | Shape |
|---|---|---|
| `GET /courses` | Every public course and its holes | Static index |
| `GET /courses/{slug}/leaderboard` | Everyone's standing on a course | **Raw leaderboard**, paged |
| `GET /holes/{chartHash}/leaderboard` | Everyone's best on a hole | **Raw leaderboard**, paged |
| `GET /activity` | Latest play per player | Feed (not a leaderboard) |
| `GET /rankings` | A viewer's position on a hole and course | **Windowed view** — ranks skip |
| `GET /best` | One player's best on one hole | Single value |

## Calling it

Always call `/api/...` **same-origin**. CloudFront routes `golf.arrowcloud.dance/api/*` to this Lambda and
strips the prefix, so there is no base URL to configure and no CORS.

```ts
const res = await fetch('/api/courses/beta-pines/leaderboard?limit=25');
const board = await res.json();
```

For local dev the Vite server proxies the same `/api` prefix. Set `VITE_GOLF_READ_API_URL` in
`events/golf/frontend/.env` (see `.env.example`) to the `GolfReadApiUrl` stack output. Production needs
nothing. Application code never reads that variable; it only calls `/api/...`.

Conventions:

- **No auth, no caching.** Every response is fresh. Add your own client cache if you want one.
- **Strokes are raw integers.** Divide by 1000 and fix to 2dp at render time: `27860` → `"27.86"`. Store and
  pass the raw integer everywhere else.
- **Errors** are `{ "error": "message" }` with `400` (bad or missing parameter), `404` (unknown thing) or
  `503` (a board too large to read in one pass — not a concern at beta scale).
- **Course and hole metadata** (name, hole number, song, artist, par) comes from
  [`../config/courses.json`](../config/courses.json) at read time. Use `GET /courses` rather than
  hardcoding hole lists.
- If you call the raw Lambda Function URL instead of `/api`, it ends in a trailing slash, and
  `${base}/activity` becomes a double slash that 404s. `/api` has no such trap.

---

## Leaderboards

`GET /courses/{slug}/leaderboard` and `GET /holes/{chartHash}/leaderboard` return **raw leaderboards**:
every player, in rank order, with nothing added.

- **Ranks are contiguous** (1, 2, 3, …) with no gaps. Exact ties get consecutive ranks; the player who
  reached the standing first is ahead.
- **Rows are in order.** Render them top to bottom as given.
- **No viewer or rival markers.** To highlight someone, compare `userId` yourself.
- **Paging only.** `limit` defaults to 50 (max 100). `offset` defaults to 0. Unusable values fall back to
  the defaults instead of erroring. Ranks are absolute: page two starts at rank 51. `totalPlayers` is the
  whole board, so one response is enough to build a pager. An `offset` past the end gives empty `rows`.
- There is no "around me" parameter. Find the viewer by `userId`, and fetch a later page if needed.

### `GET /courses`

Every public course, in display order, with its holes. The hidden Alpha Testing course is never listed.

```jsonc
{
  "courses": [
    {
      "slug": "beta-pines",
      "name": "Beta Pines",
      "holesTotal": 18,
      "parTotal": 76,            // null if any hole has no par
      "holes": [
        { "holeNumber": 1, "chartHash": "88ea9f8af9490151", "songName": "Example Song",
          "artist": "Example Artist", "meter": 10, "par": 4 }
      ]
    }
  ]
}
```

### `GET /courses/{slug}/leaderboard`

Standing on one course. **Finished rounds first, by total strokes. Then unfinished rounds: most holes
completed first, then total strokes.** Totals over different hole counts are not comparable (fewer holes
always means fewer strokes), so holes completed leads for unfinished rounds. A player appears from their
first hole; there is no minimum.

```jsonc
{
  "course": { "slug": "beta-pines", "name": "Beta Pines", "holesTotal": 18 },
  "totalPlayers": 57,
  "limit": 50,
  "offset": 0,
  "rows": [
    { "rank": 1, "userId": "…", "alias": "bracken", "totalStrokes": 61240, "holesCompleted": 18, "complete": true },
    { "rank": 2, "userId": "…", "alias": "nilo", "totalStrokes": 63910, "holesCompleted": 18, "complete": true },
    { "rank": 3, "userId": "…", "alias": "teague", "totalStrokes": 27860, "holesCompleted": 4, "complete": false }
  ]
}
```

`complete` is `holesCompleted >= holesTotal`.

### `GET /holes/{chartHash}/leaderboard`

Each player's best eligible play on one hole, fewest strokes first. Get hashes from `GET /courses`.

```jsonc
{
  "hole": {
    "chartHash": "88ea9f8af9490151", "courseSlug": "beta-pines", "courseName": "Beta Pines",
    "holeNumber": 1, "songName": "Example Song", "artist": "Example Artist", "par": 4
  },
  "totalPlayers": 25,
  "limit": 50,
  "offset": 0,
  "rows": [
    { "rank": 1, "userId": "…", "alias": "nilo", "totalStrokes": 630, "achievedAt": "2026-10-09T20:42:13.017Z" }
  ]
}
```

`achievedAt` is when the player set that best.

### Errors

`404` for an unknown course slug, an unknown hash, or a hole on no public course. A hidden course and an
unknown one look the same on purpose.

### Known gaps — read before promoting these pages

The boards show exactly what the score processor stored. There is no moderation layer.

- **Banned and shadowbanned players are not filtered.** Golf has no user table, and core does not expose ban
  state to it.
- **Plays deleted in core are not removed.** Golf's queue only accepts `score-submitted`.
- **Aliases are as of the player's last best.** A rename is not propagated until they next improve a best.

Fine to build against. Not fine to promote until these close.

---

## `GET /activity`

A feed of the most recent play by each of the N most recently active players. It backs the "Currently On
Course" panel. It is **not a leaderboard**: it is ordered by time, one row per player.

```
GET /activity?limit=3&course=beta-pines&userIds=<id>,<id>
```

| Param | Default | |
|---|---|---|
| `limit` | `3` | Max `50`. Rows to return (one per player). |
| `course` | all courses | Optional. One course slug, e.g. `beta-pines`. |
| `userIds` | everyone | Optional. Comma-separated user ids, max 100. Only their plays. |

`400` for an unknown `course` (the response lists `validCourses`) or more than 100 `userIds`.

**With `course`:** each row is the player's latest play *on that course*. A player whose newest round was on
another course still appears, via their latest round on this one.

**"Rivals only":** there is no flag. The browser is authenticated with the core API, so it reads its own
rivals there and passes their ids:

```ts
const { rivals } = await (await fetch('https://api.arrowcloud.dance/rivals', { headers: auth })).json();
const qs = new URLSearchParams({ limit: '3', userIds: rivals.map((r) => r.userId).join(',') });
const res = await fetch(`/api/activity?${qs}`);
```

Passing ids is safe: every row is already public in the unfiltered feed. If the user has no rivals, send
`userIds=` (present but empty) and you get an empty list. Omitting the parameter shows everyone.

> The empty-`userIds` behavior needs the latest GolfBackend deploy. Earlier deploys treated an empty value
> as no filter.

```jsonc
{
  "data": [
    {
      "playId": 531987,
      "userId": "…",
      "playerAlias": "bracken",
      "timestamp": "2026-10-08T01:26:47.304Z",
      "courseSlug": "beta-pines", "courseName": "Beta Pines", "holeNumber": 8,
      "chartHash": "9a5e366400f59236", "songName": "Example Song", "artist": "Example Artist",
      "par": 3,
      "totalStrokes": 3818,
      "noteCount": 367,
      "noteStrokes": [25, 7, 0, 3, 0, 19]   // trimmed; real length equals noteCount
    }
  ]
}
```

Always `200` with a `data` array. An empty array means no qualifying plays.

- **`noteStrokes`** has one value per tap note, `0` (ace) to `200` (miss), in time order. Feed it to the
  dispersion chart. Mines, holds and rolls count in `totalStrokes` but have no dot, so a round can score above
  what the dots explain. It is typed `number[] | null`. If it is ever null, render the row without a plot.
- **The dispersion green's shape** is derived from `chartHash`, so the same chart always draws the same green.
- **`par`** can be `null` in the type. Hidden-course plays are filtered out, so in practice it is set.
- **Size:** about 1.5 KB per row. The default 3 rows is ~4 KB. `limit=50` is ~76 KB.
- **"Currently" is inferred.** A score exists only after a play finishes, and there is no recency window. A
  quiet event shows old rows. Use `timestamp` to render "3 minutes ago".

Filters, applied before a player counts as seen: visible courses only, and eligible plays only (passed, music
rate exactly 1, no autoplay outside the allow-list, not the affected DeadSync versions). Then one row per
player, newest first.

Banned and shadowbanned players are not filtered here either (see the gaps above).

---

## `GET /rankings`

A **viewer-centered window** onto the hole board and the course board. This is not a raw leaderboard: it
returns a curated handful of rows around one player and **skips ranks on purpose**. For a full board use the
leaderboard routes.

```
GET /rankings?userId=<uuid>&alias=<name>&chartHash=<hash>&playId=<n>&strokes=<n>&playedAt=<iso>[&rivalIds=<id>,<id>]
```

All of `userId`, `alias`, `chartHash`, `playId`, `strokes` (raw int, 0–9,999,999) and `playedAt` are required.
`rivalIds` is optional (max 50). `400` on a missing or malformed value.

The boards are ranked **as if this play were already stored**, because golf stores plays asynchronously.
Nothing is written.

Rows are the top 2, the viewer, the players either side, the best rival and the rival nearest the viewer,
then whoever is closest to the viewer, up to 7.

```jsonc
{
  "previousBestStrokes": 4210,       // null: first play, or already stored
  "hole": {
    "courseSlug": "beta-pines", "courseName": "Beta Pines", "holeNumber": 8,
    "songName": "Example Song", "artist": "Example Artist", "par": 3,
    "totalPlayers": 41, "selfRank": 19,
    "rows": [
      { "rank": 1, "userId": "…", "alias": "nilo", "totalStrokes": 1420,
        "isSelf": false, "isRival": false, "isPreviousBest": false }
    ]
  },
  "course": {
    "slug": "beta-pines", "name": "Beta Pines", "totalPlayers": 33, "selfRank": 11,
    "holesTotal": 18, "selfHolesCompleted": 15, "selfComplete": false,
    "rows": [ /* same row shape plus holesCompleted */ ]
  }
}
```

`hole` and `course` are `null` for a hidden course, a chart on no public course, or a board too large to read.
`isPreviousBest` is set only on the viewer's own row, when this play did not beat their best.

## `GET /best`

```
GET /best?userId=<uuid>&chartHash=<hash>
→ { "previousBestStrokes": 3450 }      // null if none
```

`400` if either parameter is missing. Only eligible plays set a best.

---

## Maintainers

- **Ranking rules** live in [`src/rankings.ts`](./src/rankings.ts). The score processor, `/rankings`, the
  leaderboard routes and the backfill all use it, because they must agree on the sort-key encoding exactly.
  The leaderboard response builders are in [`src/leaderboards.ts`](./src/leaderboards.ts) and are pure.
- **Storage:** `BEST#<hash>` items are indexed in `gsi1` under `HOLE#<hash>`. Each player has a
  `COURSE#<slug>` standing item in `gsi2`, rebuilt from their per-hole bests whenever one changes, never
  incremented. `scripts/backfill-golf-play-notes.ts` builds them for older plays.
- **Core consumes `/rankings` and `/best` over HTTP** for result images. Core declares the shape it reads
  (`api/src/utils/event-result-images.ts`) instead of importing golf's types. Change a field here and you
  must change it there.
- **Tests:** `test/*.test.ts`, run by the api's jest (`cd api && npx jest`), which is what CI runs.
- **`courses.json`** is hand-maintained. `scripts/build-golf-courses.ts` can generate it, but its input
  files are not in the working tree.
