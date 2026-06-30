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

These operations will be done manually by a human when required.

# Additional Context

There are README.md files scattered in various places throughout the repo. Reference these for local context where required. Keep the readme files up to date. When context is gained that would be valuable to add at a high level please add additional sections or readme files when appropriate.