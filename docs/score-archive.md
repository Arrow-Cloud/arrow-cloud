# Score archive

All submitted scores are compressed to monthly archives by a Lambda.
The archive bucket itself is private.
CloudFront serves it at https://assets.arrowcloud.dance/archive/. Its contents:

| URL | Contents |
|---|---|
| `manifest.json` | Information about which months archives exist and what they contain |
| `scores-[YYYY-MM].tar.zst` | Every score received in that month |


## How it works

`ScoreArchiveLambda` runs the `score-archive` handler of the API bundle
(`api/src/score-archive.ts`) at 01:00 UTC on the first of each month. A run:

1. Lists the scores bucket.
2. Groups the keys by month.
3. Reads `manifest.json` for existing months.
4. Compresses the ended month(s) objects into a temporary file on local disk and uploads it to the archive bucket.
5. Rewrites `manifest.json` with the new state.

There is some extra logic to enable initial backfill. The months are filled in order from the earliest.


## Caveats

- Lambda runtime of 15 mins should be enough with the current volume of scores, but perhaps requires reconsideration in the future. Initial backfill likely needs several Lambda runs or a local run.
- Does not take deleted scores / users into account, as the data is fetched directly from the score bucket. Rewriting history needs manual deletions / reruns.
- The score bucket key structure is not prefix optimized to support lookup by month for this purpose.
- The archive bucket does not have egress restrictions.
- There is no special error handling or reporting. Failures retry the entire Lambda up to its retry limit.
- Concurrent runs are not supported as there's no locking mechanism for the manifest.


## Running lambda by hand

Invoke asynchronously:

```sh
aws lambda invoke --function-name arrow-cloud-score-archive --invocation-type Event \
  --cli-binary-format raw-in-base64-out --payload '{"write":true}' /dev/null
aws logs tail /aws/lambda/arrow-cloud-score-archive --follow
```
Payload:

| Payload | Type | Effect |
|---|---|---|
| `write` | `true` | Build and upload archives. Any other value or omitting this key is a dry run. |
| `force` | Array\<string\> of "YYYY-MM" | Build a month, bypassing regular checks (e.g. for score deletions). |


## Running logic locally

On the first deploy, every month is missing, which is potentially more than the Lambda 15 minute limit allows to generate.
The logic can also be run locally against production if not wanting to invoke the Lambda multiple times.

`npm run score-archive` (`scripts/score-archive.ts`) calls the Lambda handler with the given payload and no time limit. The environment
decides what it runs against.


### Against production data

```sh
export SCORES_BUCKET=arrow-cloud-scores
export ARCHIVE_BUCKET=arrow-cloud-score-archive

npm run score-archive
npm run score-archive -- '{"write":true}'
```


### Against a local S3 server with fake data

`AWS_ENDPOINT_URL` points the SDK at the local server and `S3_FORCE_PATH_STYLE` makes it address
buckets the way local servers expect.

```sh
uvx --from 'moto[server]' moto_server -p 9000 &

export AWS_ENDPOINT_URL=http://127.0.0.1:9000
export S3_FORCE_PATH_STYLE=true
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_REGION=us-east-1

export SCORES_BUCKET=arrow-cloud-scores
export ARCHIVE_BUCKET=arrow-cloud-score-archive

# create buckets and fake scores
npm run score-archive-seed -- --count 5000 --years 2025,2026

npm run score-archive
npm run score-archive -- '{"write":true}'

aws s3 cp s3://arrow-cloud-score-archive/archive/manifest.json -
aws s3 cp s3://arrow-cloud-score-archive/archive/scores-2026-01.tar.zst - | zstd -d | tar -tv | head
```
