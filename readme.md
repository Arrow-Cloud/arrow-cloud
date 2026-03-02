# Arrow Cloud

A modern backend for ITG score tracking, leaderboards, social features, and events.

## Architecture

Arrow Cloud is a monorepo deployed entirely on AWS, managed with CDK (Infrastructure as Code).

- **API** — An Express-style application running on AWS Lambda behind API Gateway. Handles authentication, score submission, leaderboards, pack management, and all core logic. Uses Prisma ORM with a PostgreSQL database on RDS.
- **Frontend** — A React single-page application built with Vite, served via S3 and CloudFront. Supports internationalization via react-intl and Crowdin.
- **WebSocket API** — A separate API Gateway WebSocket endpoint used for real-time features like the streamer widget. Connection state is tracked in DynamoDB.
- **Share Service** — A Dockerized Lambda running headless Chromium to render shareable score images on demand, served through its own CloudFront distribution.
- **Background Processing** — Score submissions are processed asynchronously via SQS queues, with Lambda consumers handling pack processing, user stats aggregation, and Discord notifications.
- **Storage** — S3 is used for pack assets, user avatars, and score replay data. CloudFront sits in front of S3 for asset delivery.

## Contributing

See CONTRIBUTING.md for guidelines on how to contribute to this project.

## Project Structure

_more information coming soon_

## Development Setup



## Deployment Setup

_more information coming soon_

Note: If you want to run this project yourself you will absolutely need some familiarity with AWS, your own AWS account and credentials, and a willingness to spend a little bit of money per month (primarily because of the database server). 

You will need to first create a cdk context json file where you can populate some information.

```sh
cp cdk/cdk.context.json.example cdk/cdk.context.json
```

1. `cloudFrontCertArn` - Certificate arn for the cloudfront distribution (assets.arrowcloud.dance)
2. `shareCertArn` - Certificate arn for the share service (share.arrowcloud.dance)
3. `apiCertArn` - Certificate arn for the api (api.arrowcloud.dance)
4. `sharpLayerArn` - A sharp layer arn is needed for some image processing in lambdas.
5. `dbAccessCidrs` - An array of IP addresses and names that enable an ingress connection to the database for administration purposes.
6. `corsAllowedOrigins` - An array of domain names for access to S3/Assets Cloudfront distribution

The certificates are not provisioned by default because they cost money, but you do not need to provide them. You can use the default api gateway and cloudfront distribution URLs without problem.


Next, there is some frontend specific .env configuration for Vite needed

```sh
cp frontend/.env.example frontend/.env.production
cp frontend/.env.example frontend/.env.development
```

1. `VITE_API_BASE_URL` - Base URL for the API
2. `VITE_SHARE_SERVICE_URL` - Base URL for the share service
3. `VITE_WEBSOCKET_URL` - Base URL for websockets


