# Game Primer

Arrow Cloud supports In The Groove (ITG), a rhythm game played on a dance pad with 4 arrows (left, down, up, right). Players step on arrows in time with the music.

This doc gives engineers (and their agents) the game context needed to judge whether a change is correct. It is maintained by the project owner; if something here is missing or unclear, ask rather than guess.

## Rules of engagement
- Anything that changes scoring, charts, leaderboards, rankings, or what players see about their performance is `domain: game` and requires sign-off.
- UX, design, performance, tests, infra and web best practices are `domain: general` and open to your judgment.

## Glossary
Plain terms first. Game-specific terms are marked with the code name where it differs.

| Term | Meaning |
|---|---|
| **Engine** | The game client. ITGmania (about 70% of players) or DeadSync (about 30%). Both send plays to Arrow Cloud. |
| **Pack** | A collection of songs distributed together. Admins upload and index packs so metadata and graphics are parsed. |
| **Song** (`Simfile`) | One piece of music with its step files. It has several charts. |
| **Chart** | One playable arrow pattern for a song, at one difficulty. Identified by its **chart hash** (`Chart.hash`). |
| **Difficulty / Meter** | The label and number for a chart's difficulty. Pack leaderboards use the Medium, Hard and Expert slots. |
| **Play** | One run through a chart that reached the results screen and was sent to Arrow Cloud. |
| **Judgment** | How well one step was timed. From best to worst: Fantastic, Excellent, Great, Decent, Way Off, Miss. |
| **Score** | A percentage (for example 98.76%) computed from a play's judgments. |
| **Scoring system** | The formula that turns judgments into a score. The platform supports ITG, EX and H.EX (Hard EX). Each weights judgments differently and uses different timing windows. |
| **Rate** | Music playback speed. ITG Rate and EX Rate are separate leaderboard variants. |
| **Grade** | The letter or star rank given to a score. Assignment rules are core logic. |
| **Leaderboard** | A ranking of players' scores on a chart, or of points across a pack. Each uses one scoring system. |
| **Pack leaderboard** | A ranking per pack. Each player's best score on each chart converts to curved points that are summed. See `docs/pack-leaderboards.md`. |
| **Session** | A run of plays with no gap of 2 hours or more between them. Shown on the session page and shareable as an image. |
| **Rival** | Another player a user chooses to compare themselves against. |
| **Event** | A time-boxed competition with its own charts and leaderboards. Some are exclusive to Arrow Cloud. |

## How players use the platform
Arrow Cloud is an online backend for ITGmania and DeadSync. Neither game requires it.

Players choose to use it for:
- Events that only exist on Arrow Cloud.
- Score and data tracking.
- Score sharing.
- Livestreaming.

What players see:
- Their chosen leaderboards inside the game.
- Result images for pack leaderboards and custom events.

What admins do:
- Upload and index packs, so metadata and graphics are parsed.

Players are usually viewing their own data. Most page views are a player looking at their own scores and profile.

## Things that must never break
Tests in these core areas are sensitive:
- Chart hash calculation.
- Leaderboard score calculation.
- Leaderboard score eligibility.
- Grade assignment.

If a test in one of these areas fails, fix the code, not the test. Any change to these tests gets extra scrutiny. If you think one is wrong, explain why in the PR and ask.

Tests elsewhere follow normal practice.
