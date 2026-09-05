# AWS access for Claude Code / AWS MCP

A dedicated, least-privilege IAM identity for Claude Code's local AWS CLI/MCP use, instead of the
account root credentials that were configured previously. Read-only across the board — nothing this
identity can do can create, modify, or delete any resource.

Defined in `IamStack` — [`cdk/lib/iam-stack.ts`](../cdk/lib/iam-stack.ts) — rather than manual `aws
iam` commands, so the identity's exact scope is reviewable and version controlled the same way every
other piece of this repo's infra is. That file is the source of truth for the actual policy
statements; this doc explains the *why*, not the *what*.

`IamStack` is meant to hold this account's scoped, non-human identities generally, not just this one
- e.g. a future deploy-only user/role scoped to just what `cdk deploy` needs. Each identity is its
own call to that file's `createServiceUser` helper, with its own policy statements; nothing about the
Claude identity's scope (read-only, the explicit Deny block) is shared with or assumed by any
identity added later.

**Deploying and credential retrieval are done manually by a human.** Claude does not run
`cdk deploy`, or any AWS CLI/MCP call — including read-only ones under this identity — without
asking first in the session.

## Scope

| Service | Access | Why |
|---|---|---|
| CloudWatch Logs | Read-only, all `/aws/lambda/*` log groups | Debugging Lambda behavior (e.g. diagnosing the golf read-api cold-start timeout) |
| Lambda | Read-only metadata + `GetFunctionConfiguration` (env vars), all functions | Confirming deployed config (e.g. whether `GOLF_READ_API_URL` made it into `ApiStack-ApiLambda`'s env) |
| DynamoDB | Read-only (`GetItem`/`Query`/`Scan`/`DescribeTable`/`BatchGetItem`), scoped to `event-golf-state` and `event-testevent-state` only | Inspecting event state (BEST/PLAY records) directly instead of inferring from logs |
| CloudFormation | Read-only (`DescribeStacks`/`ListStacks`/`DescribeStackResources`/`GetTemplate`) | Checking deploy status and stack outputs (e.g. `GolfReadApiUrl`) without needing them pasted in |

Explicitly **not** granted, with a belt-and-suspenders explicit `Deny` on top (so a future accidental
broadening of the stack's `Allow` statements doesn't quietly grant these): IAM of any kind, Secrets
Manager, SSM `GetParameter` with decryption, and `sts:AssumeRole` into any other role. Also no
write/delete actions anywhere, no `lambda:InvokeFunction`, no S3 access.

**Known tradeoff:** `lambda:GetFunctionConfiguration` is allowed for *all* functions, including
`ApiStack-ApiLambda`, not just the `event-*` ones. That means if any real secret (DB credentials, a
signing key, etc.) is ever set as a plain Lambda environment variable rather than pulled from Secrets
Manager/SSM at runtime, this identity could read it. Worth a quick check of `ApiStack-ApiLambda`'s
current env vars before deploying this, and preferring Secrets Manager references over raw env vars
for anything sensitive going forward.

(The DynamoDB table names in the stack - `event-golf-state`, `event-testevent-state` - match what
`EventBackendConstruct` names them, but weren't independently verified against live AWS before
writing this doc.)

## Setup

```bash
cd cdk
npx cdk deploy IamStack
```

This creates the `claude-code-mcp` IAM user, its inline read-only policy, an access key, and a
Secrets Manager secret (`claude-code-mcp-credentials`) holding both the access key ID and secret
access key as one JSON object. The secret value is never written into a CloudFormation output,
template, or `cdk diff`/`synth` output — only the deployed secret's ARN is (as a stack output).

Retrieve the actual credentials after deploying:

```bash
aws secretsmanager get-secret-value \
  --secret-id claude-code-mcp-credentials \
  --query SecretString --output text
```

Save the resulting `AccessKeyId`/`SecretAccessKey` into a dedicated local AWS profile (e.g.
`~/.aws/credentials` under `[claude-code]`), and point the AWS MCP server's config at that profile
rather than the default one. Rotate the access key periodically — it's a long-lived credential, only
as safe as this machine (`cdk deploy` again after rotating the key in the stack, e.g. by removing and
re-adding the `iam.AccessKey` construct, since CDK doesn't rotate it automatically).
