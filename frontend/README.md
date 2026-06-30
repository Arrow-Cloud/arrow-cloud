# Arrow Cloud Frontend

## Environment / Build Setup

Vite bakes `VITE_*` variables into the bundle at **build time**. Create a `.env.production` (gitignored) from `.env.example` before running `npm run build` for a production deployment:

```
VITE_API_BASE_URL=https://api.arrowcloud.dance
VITE_SHARE_SERVICE_URL=https://share.arrowcloud.dance
VITE_WEBSOCKET_URL=wss://<id>.execute-api.<region>.amazonaws.com/prod
```

The WebSocket URL comes from the `WebSocketApiUrl` CDK stack output (`ApiStack`). Without it, the streamer widget renders correctly but won't receive live score-refresh events.

## Localization

We use `react-intl` for localization and Crowdin as a TMS.

### Message Extraction

For now, strings are manually extracted with `npm run intl:extract` and the results should be committed back to the repo. Crowdin will see updates to the `src/intl/raw/en.json` file during its hourly sync jobs, and will have any new/changed strings show up in their interface for translation.

Translations added in Crowdin will automatically be pushed back to the repo via automatically created PRs that can be reviewed and merged as needed. Be sure to delete those branches after merging to help avoid conflicts appearing later on.

### Message Compilation

As an additional step, the extracted messages should be compiled to a more optimized format before delivery to prod. This is accomplished with a separate command `npm run intl:compile` which reads the existing extracted messages in `src/intl/raw/en.json` and outputs a `src/intl/compiled/en.json` file based on it.
