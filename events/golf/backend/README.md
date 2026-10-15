# Golf Event Backend — Read API

Public, read-only, unauthenticated JSON over HTTP. This is everything the golf site reads: leaderboards,
the course list, and a feed of recent plays.

## Quick reference

| Route | Returns | Shape |
|---|---|---|
| `GET /courses` | Every public course: name, banner, description, holes | Static index |
| `GET /courses/{slug}` | One public course, same fields; when logged in, also the viewer's best on each hole | Static, plus one read when logged in |
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

- **Public, no caching.** Every response is fresh. Add your own client cache if you want one.
- **Optional login.** Send `Authorization: Bearer <session token>` (the one the main site issues at login) and
  routes that personalise will use it. See [Authentication](#authentication). Never needed; never an error.
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
- **`profileImageUrl`** is a ready-to-use image URL, or `null` for a player with no avatar. Render a placeholder
  for `null`. It is stored with the alias, so it has the same freshness (see the known gaps).
- **Paging only.** `limit` defaults to 50 (max 100). `offset` defaults to 0. Unusable values fall back to
  the defaults instead of erroring. Ranks are absolute: page two starts at rank 51. `totalPlayers` is the
  whole board, so one response is enough to build a pager. An `offset` past the end gives empty `rows`.
- There is no "around me" parameter. Find the viewer by `userId`, and fetch a later page if needed.

### `GET /courses`

Every public course, in display order, with its name, banner, description and holes. Hidden courses (Alpha
Test, Alpha Testing) are never listed.

```jsonc
{
  "courses": [
    {
      "slug": "beta-pines",
      "name": "Beta Pines",
      "order": 2,                // release order; the list is sorted by it
      "description": "More challenging content to test your limits on golf scoring.",   // null if none
      "bannerUrl": "https://assets.arrowcloud.dance/misc/golf/courses/beta-pines-99f0ff48.webp",   // null if none
      "holesTotal": 18,
      "parTotal": 76,            // null if any hole has no par
      "holes": [
        { "holeNumber": 1, "chartHash": "88ea9f8af9490151", "songName": "Example Song",
          "artist": "Example Artist", "meter": 10, "par": 4,
          "bannerUrl": "https://assets.arrowcloud.dance/misc/golf/holes/88ea9f8af9490151-1a2b3c4d.webp" }   // null if the song has none
      ]
    }
  ]
}
```

Both `bannerUrl`s (course and hole) are full URLs on the assets CloudFront distribution, so they work from any
origin. Every banner is a WebP at most 1024px wide, cropped to the 1024x400 banner shape (see below). A hole's
`bannerUrl` is `null` when its song has no usable image (every current hole has one, but a new song may not): render a
fallback. The file name ends in a hash of the image, so a URL never changes meaning: a new image is a new URL.

### `GET /courses/{slug}`

One course, with exactly the fields of a `/courses` entry (holes included), wrapped as `{ "course": { ... } }`.
`404` for an unknown slug, and the same `404` for a hidden course, so a hidden slug reveals nothing.

When the request carries a valid login token, the response also has the viewer's best on each hole of the
course. This replaces one `/best` call per hole (18 per course). The viewer comes from the token, so there is no
`userId` parameter:

```jsonc
{
  "course": { /* as above */ },
  "bests": [   // hole order; a hole the player has not played is absent; [] for a new player
    { "chartHash": "9cc32b8a9a788bb9", "totalStrokes": 27860, "achievedAt": "2026-10-01T12:00:00.000Z" }
  ]
}
```

A logged-out caller, or one whose token is missing, expired or invalid, gets the plain course with **no `bests`
key** (not an error). Match `bests` to `course.holes` by `chartHash`.

Where the data comes from: `description` is hand-written in `scripts/data/golf-course-meta.json`. The images come from
the packs, found by `scripts/gather-golf-course-meta.ts`: the course banner is `Banner=` in the pack's `Pack.ini`, and a
hole banner is the `#BANNER:` of its song's `.ssc` (or, when that is empty, the folder's `banner.png` / `*-bn.png`, as
ITGmania does). The script centre-crops each image to 1024x400, caps it at 1024px wide, encodes WebP (the originals total
about 33 MB, the output about 2 MB) and writes the files to `scripts/output/golf-assets/` (gitignored), laid out as they
sit in the bucket: `courses/<slug>-<hash>.webp` and `holes/<chartHash>-<hash>.webp`. The hash is of the source image and the
settings, so a changed image gets a new name and the year-long cache never serves a stale one. It records the paths in
`golf-course-meta.json` (`banner`, and `holes.<chartHash>.banner`), and `scripts/build-golf-courses.ts` turns them into
URLs in [`../config/courses.json`](../config/courses.json).

To change a banner or add a course or hole:
1. `npx tsx scripts/gather-golf-course-meta.ts` (add `--dry-run` to preview; it never touches AWS). Check its notes:
   songs with no image, and pictures cropped by more than 20% to fit.
2. Upload: `aws s3 sync scripts/output/golf-assets s3://arrow-cloud-assets/misc/golf/ --content-type image/webp --cache-control "public, max-age=31536000, immutable"`
   (the script prints this). Upload **before** deploying, or the API links to files that are not there yet.
3. `npx tsx scripts/build-golf-courses.ts`, then deploy GolfBackend. No CloudFront invalidation is needed.

The earlier PNG course banners (`misc/golf/acitgb*-bn.png`) are no longer referenced and can be deleted from the bucket.

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
    { "rank": 1, "userId": "…", "alias": "bracken", "profileImageUrl": "https://assets.arrowcloud.dance/profile-images/…", "totalStrokes": 61240, "holesCompleted": 18, "complete": true },
    { "rank": 2, "userId": "…", "alias": "nilo", "profileImageUrl": null, "totalStrokes": 63910, "holesCompleted": 18, "complete": true },
    { "rank": 3, "userId": "…", "alias": "teague", "profileImageUrl": null, "totalStrokes": 27860, "holesCompleted": 4, "complete": false }
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
    { "rank": 1, "userId": "…", "alias": "nilo", "profileImageUrl": null, "totalStrokes": 630, "achievedAt": "2026-10-09T20:42:13.017Z" }
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
- **Aliases and avatars are as of the player's last best.** A rename or a new avatar is not propagated until they next improve a best.

Fine to build against. Not fine to promote until these close.

---

## `GET /activity`

A feed of the most recent play by each of the N most recently active players. It backs the "Currently On
Course" panel. It is **not a leaderboard**: it is ordered by time, one row per player.

```
GET /activity?limit=3&course=beta-pines&chartHash=<hash>&userIds=<id>,<id>
```

| Param | Default | |
|---|---|---|
| `limit` | `3` | Max `50`. Rows to return (one per player). |
| `course` | all courses | Optional. One course slug, e.g. `beta-pines`. |
| `chartHash` | all holes | Optional. One hole's chart hash. Only visible-course charts are accepted. |
| `userIds` | everyone | Optional. Comma-separated user ids, max 100. Only their plays. |

`400` for an unknown `course` (the response lists `validCourses`), an unknown or hidden `chartHash`, or more than 100 `userIds`.

**With `course`:** each row is the player's latest play *on that course*. A player whose newest round was on
another course still appears, via their latest round on this one.

**With `chartHash`:** each row is the player's latest play *on that hole*, so a hole's feed is one row per player, not every attempt. Combined with `course`, a hash from another course returns an empty list.

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
      "profileImageUrl": null,
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
- **`courses.json`** is generated, not hand-edited: `scripts/build-golf-courses.ts` builds it from the par files
  in `scripts/data/golf-*-pars-final*.json` (holes and pars) and `scripts/data/golf-course-meta.json` (description,
  and the course and hole banner paths). `npx tsx scripts/build-golf-courses.ts --check` fails if the committed file is out of date.
  To change a course:
  - **Pars or holes:** re-run `scripts/assign-golf-pars.ts`, then rebuild.
  - **Description:** edit `golf-course-meta.json`, then rebuild.
  - **Banners (course and hole):** put the image in the pack, run `scripts/gather-golf-course-meta.ts` (it optimises
    them into `scripts/output/golf-assets/` and prints the `aws s3 sync` upload command), upload, then rebuild. Details
    under `GET /courses/{slug}` above.
  - Then deploy GolfBackend. The config is bundled into the Lambda, so nothing takes effect until then.

## Authentication

The read API can tell who is calling, for routes that want to (`src/auth.ts`). It does not issue tokens. The
main site logs the user in and issues a session JWT; the browser sends it as `Authorization: Bearer <token>`,
and this Lambda verifies it against the same signing key (the `JwtSecret` secret ApiStack uses).

- **Optional everywhere.** A missing, malformed, expired or wrongly-signed token means anonymous. It is never a
  `401`, so a stale session cannot break a page that works logged out. If the signing key cannot be read (a deploy
  problem) it is logged, and callers are treated as anonymous.
- **Checked:** signature (HS256 only; `none` and other algorithms are rejected), expiry, and a non-empty `userId`.
- **Not checked:** whether the user still exists or is banned, because the token is trusted without calling the
  core API. Tokens last up to 30 days. That is fine for reading your own public bests. A route that **acts** for a
  viewer needs a stronger check.
- **Frontend:** `fetchCourse` in `frontend/src/lib/readApi.ts` attaches the token from the main site's auth
  storage. Same-origin `/api` only: CloudFront forwards `Authorization` to the Lambda (the `api/*` behavior uses the
  all-viewer-except-Host origin request policy, and caching is off).
- **Wiring:** `readApiJwtSecretName: 'JwtSecret'` on the golf `EventBackendConstruct` sets `JWT_SECRET_ARN` and grants
  read. Needs a GolfBackend deploy. Other events opt in the same way, and the secret is not granted by default.
- **Adding a personalised route:** `const viewer = await getViewer(event.headers)`; `null` means anonymous.
- `/best` and `/rankings` still take a `userId` parameter, because the core API calls them server-to-server
  without a user token.
