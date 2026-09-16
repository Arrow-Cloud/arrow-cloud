# Arrow Cloud

Arrow Cloud is a modern backend supporting In The Groove (ITG) - a rhythm game where players step on arrows with their feet on a dance pad with 4 arrows.

# Structure

This is a mono-repo housing the following:
1. CDK `/cdk` - AWS IaC
2. API `/api` - The main API backend. Deployed on AWS Lambda. Mostly bespoke/custom. Uses RDS Postgres for DB with Prisma for ORM/Migrations.
3. Frontend `/frontend` - A static frontend served by CloudFront. Vite, React, DaisyUI.
4. Share Service `/share-service` - A frontend distribution that is not static that helps with OpenGraph for share images.
5. Events `/events` - Micro-sites with frontends and backend APIs using DynamoDB.
6. Scripts `/scripts` - Small script utilities, some of which are one-off, some have ongoing utility.

# Rules

You are NEVER allowed to:
- Run migrations
- Run deployments
- Run any AWS CLI command or AWS MCP tool call without asking first - this includes read-only calls (e.g. reading logs, Lambda config, DynamoDB items), not just mutating ones
- Switch, override, or fall back to any AWS profile/credentials other than the one active when the session was launched - never pass `--profile`, set `AWS_PROFILE`, or otherwise select a different identity mid-session (including falling back to a default/root identity if a call fails)

These operations will be done manually by a human when required. If an AWS call fails due to
insufficient permissions under the current profile, report the permission error and ask - do not
try another profile or credential source to make it succeed. If broader access is genuinely needed,
that's a scope change to propose for `IamStack` (see below), not a reason to switch identities.

# AWS Access

This account uses dedicated, least-privilege IAM identities for non-human/tooling use (e.g. Claude
Code's local AWS MCP access) instead of sharing broad personal or root credentials. These are
defined in `cdk/lib/iam-stack.ts` (`IamStack`) - see `docs/aws-mcp-access.md` for the full rationale,
scope, and setup. Add new identities there as access needs grow (e.g. a future deploy-only user),
rather than broadening an existing identity's scope for an unrelated use case.

# Additional Context

There are README.md files scattered in various places throughout the repo. Reference these for local context where required. Keep the readme files up to date. When context is gained that would be valuable to add at a high level please add additional sections or readme files when appropriate.