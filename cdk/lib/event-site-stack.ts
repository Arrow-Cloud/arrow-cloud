import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export interface EventSiteStackProps extends cdk.StackProps {
  /** Subdomain prefix, e.g. "testevent" → testevent.arrowcloud.dance */
  subdomain: string;
  /** Additional subdomains that should also point to this site (e.g. dev aliases) */
  additionalSubdomains?: string[];
  /** Root domain, e.g. "arrowcloud.dance" */
  domainName: string;
  /** ACM wildcard certificate ARN in us-east-1 */
  wildcardCertArn: string;
  /** Relative path from cdk/ to the built event site dist folder */
  distPath: string;
  /**
   * Optional: a public read-api URL (a Lambda Function URL) to expose same-origin under `/api/*`.
   *
   * Without this the site has to call the Function URL cross-origin, which means the API hostname
   * becomes build-time frontend config that changes if the function is ever replaced, and every
   * caller has to get the trailing slash right (`<url>/` + `/activity` yields a double slash, which
   * the Lambda's path router does not match and answers 404 - this has already caused one silent
   * outage). Routing through the site's own distribution removes both problems and the CORS
   * dependency with them.
   *
   * Server-to-server callers (e.g. the core API's result-image hook) should keep using the Function
   * URL directly - this path exists for the browser, and adding a CDN hop to a latency-budgeted
   * call would be a step backwards.
   */
  readApiUrl?: string;
}

export class EventSiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: EventSiteStackProps) {
    super(scope, id, props);

    const fqdn = `${props.subdomain}.${props.domainName}`;
    const allFqdns = [fqdn, ...(props.additionalSubdomains || []).map((s) => `${s}.${props.domainName}`)];

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const certificate = acm.Certificate.fromCertificateArn(this, 'WildcardCert', props.wildcardCertArn);

    // The read API is a separate stack's Lambda Function URL, passed as a plain string (see
    // golf-backend-stack.ts for why event infra is wired by config rather than CDK references), so
    // it is fronted as an ordinary HTTP origin rather than with FunctionUrlOrigin.
    const apiOrigin = props.readApiUrl
      ? new cloudfrontOrigins.HttpOrigin(new URL(props.readApiUrl).hostname, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        })
      : undefined;

    // CloudFront matches `api/*` but the Lambda routes on bare paths (`/activity`, `/best`), so the
    // prefix is stripped at the edge rather than taught to the Lambda - that keeps the Function URL
    // usable directly by server-to-server callers, which would otherwise have to adopt a `/api`
    // prefix that means nothing to them.
    const stripApiPrefix = props.readApiUrl
      ? new cloudfront.Function(this, 'StripApiPrefix', {
          comment: `Strip /api prefix for ${fqdn}`,
          runtime: cloudfront.FunctionRuntime.JS_2_0,
          code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  // This function only runs on the 'api/*' behaviour, so the URI always starts with '/api'.
  // Query strings live on request.querystring and are untouched by this.
  request.uri = request.uri.substring(4) || '/';
  return request;
}
`),
        })
      : undefined;

    this.distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        'assets/*': {
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        ...(apiOrigin
          ? {
              'api/*': {
                origin: apiOrigin,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                // Not cached: these are small, live reads, and the one route the core API calls
                // synchronously must never be served stale. A short TTL would be a reasonable
                // optimisation later, but it belongs behind a measurement, not a guess.
                cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                // Forwards query strings (the routes are driven entirely by them) while stripping
                // the viewer Host header. That exclusion is mandatory, not stylistic: a Lambda
                // Function URL rejects requests whose Host is not its own domain, so forwarding the
                // site's hostname would fail every request.
                originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
                functionAssociations: [{ function: stripApiPrefix!, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
              },
            }
          : {}),
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      certificate,
      domainNames: allFqdns,
      comment: `Event site: ${fqdn}`,
    });

    // Deploy hashed assets with long-lived cache
    new s3deploy.BucketDeployment(this, 'DeploySiteAssets', {
      sources: [s3deploy.Source.asset(props.distPath)],
      destinationBucket: bucket,
      exclude: ['index.html'],
      cacheControl: [s3deploy.CacheControl.maxAge(cdk.Duration.days(365)), s3deploy.CacheControl.immutable()],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    // Deploy index.html with no-cache
    new s3deploy.BucketDeployment(this, 'DeploySiteIndex', {
      sources: [s3deploy.Source.asset(props.distPath)],
      destinationBucket: bucket,
      include: ['index.html'],
      cacheControl: [s3deploy.CacheControl.noStore(), s3deploy.CacheControl.mustRevalidate()],
      distribution: this.distribution,
      distributionPaths: ['/index.html', '/'],
    });

    new cdk.CfnOutput(this, 'SiteUrl', {
      value: `https://${fqdn}`,
      description: `Event site URL`,
    });

    if (props.readApiUrl) {
      new cdk.CfnOutput(this, 'ApiPath', {
        value: `https://${fqdn}/api`,
        description: 'Same-origin read API base - the site needs no API URL configured',
      });
    }

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: `CloudFront domain — point ${fqdn} CNAME to this`,
    });
  }
}
