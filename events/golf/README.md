# In The Golf

Golf-themed ITG event, served at `golf.arrowcloud.dance`.

- `frontend/` - Vite + React + DaisyUI static site (deployed by `EventSite-golf` in `cdk/bin/app.ts`). Reuses the main site's auth, NavBar, login page and intl via the `@shared` alias (`../../../frontend/src`), so changes there affect this site too.
- `backend/` - Lambdas for chart submissions and golf score reads (`GolfBackend` stack, `cdk/lib/golf-backend-stack.ts`).

## Frontend

```sh
cd frontend
cp .env.example .env   # VITE_GOLF_SUBMIT_API_URL enables chart uploads, VITE_GOLF_READ_API_URL the live feed
npm run dev
npm run lint           # also generates react-intl message ids (formatjs/enforce-id)
```

Pack IDs in `src/pages/SubmitChartPage.tsx` (`PACKS`) must match `VALID_PACK_IDS` in `backend/src/submit-api.ts`.

### Page backdrop

The scenery behind every page is `src/components/CourseBackground.tsx`, mounted once above the routes. It is CSS and SVG only, follows the light/dark theme, and comes in **variants** - one per kind of course - so a page can wear the scenery of the course it is about:

| | Variant | Scene |
|---|---|---|
| A | `pines` (default) | Green hills, pines, mowed fairway, fireflies at night |
| B | `sands` | Flat-topped mesas, dunes, saguaros and barrel cacti |
| C | `hills` | Big rounded highland hills in mist, lone oaks, sheep, dry-stone walls |
| D | `meadow` | Low gentle land thick with wildflowers, birches, butterflies by day, fireflies at night |
| E | `prairie` | A flat horizon under a big sky, wheat, a windmill, a fence running off |

- **Choose one from a page** with `useBackdrop('sands')` (`components/background/BackdropContext.tsx`). It applies while the component is on screen and puts the default back when it unmounts.
- **Test them** with the floating A-E switcher, bottom-left, in dev builds only (`BackdropSwitcher.tsx`). Clicking the active letter again hands the choice back to the page. The pick is remembered in localStorage. `?bg=a`..`?bg=e` (or a name) also works and beats the switcher.
- **Add one** by adding a key and a spec to `components/background/variants.ts` (terrain shape, what is planted, landmarks, fences and walls, flags, clouds, stars), and a `[data-backdrop='<name>']` colour block - plus its dark-theme twin - in `src/App.css`. A new kind of plant or landmark goes in `components/background/Landscape.tsx`.
- **How the land works:** each hill layer is a function from x to crest height (`terrain.ts`), drawn at the viewport's real pixel size so it never stretches, and anything planted on a hill samples that same function so it stands on the crest. Plants favour the side margins, since the content cards cover the middle. Colours live only in CSS variables, never in the components. Layers parallax through `--sp` (page scroll progress), and all motion stops under `prefers-reduced-motion`.

### New home page (`/beta`)

The new version of the home page is being built at `/beta` (`src/pages/beta/home/`), alongside the live `/` page. It isn't linked from the nav, but it isn't gated either - anyone with the URL can open it. It renders `PlayerHome` when logged in and `GuestHome` when logged out, and is lazy-loaded so it ships as its own chunk.

The "Currently On Course" panel (`CurrentlyOnCourse.tsx`) reads `GET /activity` from the golf read API via `src/lib/readApi.ts`, always same-origin at `/api` (CloudFront in production, the Vite proxy in dev) - see `backend/README.md` for the response and its quirks. Pass `course` to filter to one course. Cards show less as the feed narrows (`detail`: `all` / `course` / `song`), and size to their own width with container queries. With `VITE_GOLF_READ_API_URL` unset, `npm run dev` shows placeholder rows instead. Feed thumbnails seed `DispersionChart` from `chartHash` with no `greenVariant`, which draws the same green as that chart's result image.

`PlayerHome` is a summary block (not designed yet), a live "Latest Activity" feed, then one `CourseSection` per course, newest (highest `order`) first, each with a live course-filtered feed and a `Leaderboard` (`src/components/Leaderboard.tsx`, course or hole scope). The course list, the summary and the leaderboard scores are still placeholder data from `src/data/placeholderHome.ts` - there's no leaderboard endpoint yet. Strokes-from-par uses `ParDelta` everywhere (arrows at ±0.25). Course banners are 1024x400-ish, in `public/img/`.

If it needs gating later: ArrowCloud has no separate feature-flag system - a flag is a permission key in the main API's `Permission` table, granted directly (`UserPermission`) or via a `Role`, and exposed to the frontend as `useAuth().hasPermission(key)`. A frontend check only hides UI (the built JS is public), so any data behind it must be checked server-side too.
