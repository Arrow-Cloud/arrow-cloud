import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { CertificatesStackUsEast1, CertificatesStackUsEast2, WildcardCertificateStack } from '../lib/certificates-stack';
import { ShareServiceStack } from '../lib/share-service-stack';
import { EventSiteStack } from '../lib/event-site-stack';
import { RedirectSiteStack } from '../lib/redirect-site-stack';
import { EventBackendConstruct } from '../lib/event-backend-construct';
import { GolfBackendStack } from '../lib/golf-backend-stack';
import { IamStack } from '../lib/iam-stack';
import * as path from 'path';

const app = new cdk.App();

// Domain name from context or env
const domainName = (app.node.tryGetContext('domainName') as string | undefined) || process.env.DOMAIN_NAME || 'arrowcloud.dance';

// Helper certificate stacks (deploy independently)
new CertificatesStackUsEast1(app, 'CertificatesUsEast1', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  domainName,
  includeWww: true,
});

new CertificatesStackUsEast2(app, 'CertificatesUsEast2', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2' },
  domainName,
});

// Wildcard cert for event subdomains (*.arrowcloud.dance) — deploy independently
new WildcardCertificateStack(app, 'WildcardCertificate', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' },
  domainName,
});

// === Event Backends ===
// Loaded before ApiStack/GolfBackendStack since both need chartHashes/readApiUrl from it - a
// two-step config, not a live CDK cross-stack reference (see golf-backend-stack.ts's comment on
// why ApiStack and GolfBackendStack can't reference each other directly). On first deploy
// readApiUrl is blank; deploy GolfBackendStack, paste its GolfReadApiUrl output in here, redeploy.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const golfConfig = require('../../events/golf/backend/config.json');

// Main stacks
const apiStack = new ApiStack(app, 'ApiStack', {
  golfReadApiUrl: golfConfig.readApiUrl || undefined,
});
new FrontendStack(app, 'FrontendStack');

// Share service stack
new ShareServiceStack(app, 'ShareServiceStack', {
  vpc: apiStack.vpc,
  dbSecurityGroup: apiStack.dbSecurityGroup,
  databaseSecret: apiStack.databaseSecret,
  scoresBucket: apiStack.scoresBucket,
});

// === Event Sites ===
// Wildcard cert ARN from context (set after deploying WildcardCertificate stack)
const wildcardCertArn = app.node.tryGetContext('wildcardCertArn') as string | undefined;

if (wildcardCertArn) {
  new EventSiteStack(app, 'EventSite-testevent', {
    subdomain: 'testevent',
    domainName,
    wildcardCertArn,
    distPath: '../events/testevent/frontend/dist',
  });

  // Was hosted at the unguessable '6ddf7d26' subdomain pre-reveal, deliberately hidden from anyone
  // before the announcement. Now that it's happened, the real "golf" subdomain is public.
  new EventSiteStack(app, 'EventSite-golf', {
    subdomain: 'golf',
    domainName,
    wildcardCertArn,
    distPath: '../events/golf/frontend/dist',
  });

  // "In The Golf" is a plausible domain guess for this event - redirect it to the real one instead
  // of leaving it a dead end.
  new RedirectSiteStack(app, 'EventSite-golf-redirect-inthegolf', {
    subdomain: 'inthegolf',
    domainName,
    wildcardCertArn,
    redirectToHost: `golf.${domainName}`,
  });

  // Anyone who still has the pre-reveal hash link bookmarked (beta testers, curators) lands on the
  // real site instead of a dead cert-mismatch error now that EventSite-golf no longer answers to it.
  new RedirectSiteStack(app, 'EventSite-golf-redirect-hash', {
    subdomain: '6ddf7d26',
    domainName,
    wildcardCertArn,
    redirectToHost: `golf.${domainName}`,
  });
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const testeventConfig = require('../../events/testevent/backend/config.json');

new GolfBackendStack(app, 'GolfBackend', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-2' },
  submitApiCodePath: path.join(__dirname, '../../events/golf/backend/dist'),
  chartHashes: golfConfig.chartHashes,
});

// Standalone, unrelated to the app's own runtime infra - see docs/aws-mcp-access.md.
new IamStack(app, 'IamStack');

new EventBackendConstruct(apiStack, 'EventBackend-testevent', {
  eventSlug: 'testevent',
  scoreSubmissionTopic: apiStack.scoreSubmissionTopic,
  chartHashes: testeventConfig.chartHashes,
  scoreProcessorCodePath: path.join(__dirname, '../../events/testevent/backend/dist'),
  scoreProcessorHandler: 'score-processor.handler',
  scheduledProcessorCodePath: path.join(__dirname, '../../events/testevent/backend/dist'),
  scheduledProcessorHandler: 'scheduled-processor.handler',
  readApiCodePath: path.join(__dirname, '../../events/testevent/backend/dist'),
  readApiHandler: 'read-api.handler',
  environment: {
    LEADERBOARD_TYPE: testeventConfig.leaderboardType || 'EX',
    EVENT_ID: String(testeventConfig.eventId),
  },
});
