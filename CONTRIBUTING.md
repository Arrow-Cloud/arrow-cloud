# Contributing to Arrow Cloud

Thank you for your interest in contributing to Arrow Cloud! This document outlines the guidelines and expectations for contributing to the project.

## Project Philosophy

Arrow Cloud is built on the principle that **data is king**. We focus on preserving data in such a way that future features may take advantage of past plays. We store all play submissions, charts, and associated metadata in their raw _as submitted_ format. Everything is then built upon this foundation with a flexible and accurate data model. 

Data integrity and recovery is a steadfast principal of this platform. It is built in such a way that even if we had a catastrophic database failure we could recover nearly all data from S3. Your play data is safe! (So long as AWS is!)

From here the next layer is transformed data - this includes virtually all information stored in the database server. For example, plays are evaluated against leaderboards for eligibility, and scores are computed from your raw play data per leaderboard.

For a full breakdown on architecture, see the root projects' readme.

All of this is to say - if you wish to contribute, please treat user data with the utmost respect and care.

Frontends, interfaces, and presentation layers are designed to be flexible and replaceable — they serve the data, not the other way around. Contributions should reflect this philosophy.

## How to Contribute

Ideally you should be raising your concerns as an issue first. Feature requests belong on Discord. Bug reports are acceptable either on GitHub or Discord.

Once you're confident in your change you should submit your change as a pull request. A project maintainer will review and test/merge.

_You are not required to test changes yourself because running this service costs money!_

Please keep pull requests focused. A PR that does one thing well is easy to review.

## Code Review and Priority

Project administrators hold full discretion over the prioritization of feature requests, issues, and PR reviews. Submitting a pull request does not obligate maintainers to review it on any particular timeline. If your PR addresses an existing issue, link to it in your description.

## Data Model Changes

Changes to the database schema or data model (Prisma schema, migrations, etc.) are **strictly forbidden without prior discussion with project administrators**. If your contribution requires data model changes, open an issue or discussion first to propose and discuss the change before writing any code.

## LLM-Assisted Contributions

LLM-assisted contributions (e.g. code generated or refined with the help of AI tools) are welcome. However:

- **LLM usage must be declared** in the pull request description. If you are a well known contributor using such tools you don't need to say it every time.
- All submitted code will be **fully reviewed by a human**.
- You are responsible for understanding and being able to explain every line of code you submit.
- Low-effort or obviously unreviewed AI-generated PRs will be closed without review. Repeat offenders will be banned from submitting future pull requests.

## Testing

Changes **SHOULD** include test cases where appropriate, but tests are not strictly required for every PR. The expectation scales with risk — changes to core logic, data handling, or security-sensitive code should be well-tested. Minor UI tweaks or documentation changes may not need tests at all. When in doubt, add tests.

## General Guidelines

- **Be respectful.** Treat other contributors and maintainers with courtesy and professionalism.
- **Search before opening an issue.** Check existing issues and discussions to avoid duplicates.
- **Write clear commit messages.** Describe *what* changed and *why*, not just *how*.
- **Don't introduce unnecessary dependencies.** New packages should be justified and discussed if non-trivial.
- **Keep backwards compatibility in mind.** Breaking changes need clear justification and coordination with maintainers. ***Breaking an API contract is strictly forbidden.***

## Reporting Bugs

When filing a bug report, include:

- A clear description of the problem
- Steps to reproduce the issue
- Expected vs. actual behavior
- Relevant environment details (browser, OS, Node version, etc.)

## Feature Requests

Feature requests should be submitted via Discord for public discussion as many users do not use GitHub.
