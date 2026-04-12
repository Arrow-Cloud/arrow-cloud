import * as cdk from 'aws-cdk-lib';
import { ApiStack } from '../lib/api-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { CertificatesStackUsEast1, CertificatesStackUsEast2, WildcardCertificateStack } from '../lib/certificates-stack';
import { ShareServiceStack } from '../lib/share-service-stack';
import { EventSiteStack } from '../lib/event-site-stack';

const app = new cdk.App();

// Domain name from context or env
const domainName = (app.node.tryGetContext('domainName') as string | undefined) || process.env.DOMAIN_NAME || 'arrowcloud.dance';

// Helper certificate stacks (deploy independently)
const certUsEast1 = new CertificatesStackUsEast1(app, 'CertificatesUsEast1', {
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

// Main stacks
const apiStack = new ApiStack(app, 'ApiStack');
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
    distPath: '../events/testevent/dist',
  });
}
