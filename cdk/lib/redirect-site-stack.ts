import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export interface RedirectSiteStackProps extends cdk.StackProps {
  /** Subdomain prefix that should redirect, e.g. "inthegolf" → inthegolf.arrowcloud.dance */
  subdomain: string;
  /** Root domain, e.g. "arrowcloud.dance" */
  domainName: string;
  /** ACM wildcard certificate ARN in us-east-1 */
  wildcardCertArn: string;
  /** Full hostname to redirect to, e.g. "golf.arrowcloud.dance" (no scheme/path) */
  redirectToHost: string;
}

/**
 * A CloudFront distribution that does nothing but 301-redirect every request on `subdomain` to the
 * same path on `redirectToHost` - for domains people might plausibly guess/type that should land on
 * the real site instead of a dead end (e.g. "inthegolf.arrowcloud.dance" → "golf.arrowcloud.dance").
 *
 * DNS here is managed manually outside CDK (same as EventSiteStack - see its own CfnOutput comment),
 * so this can't use aws-route53-patterns' HttpsRedirect (that needs an existing Route53 hosted
 * zone). A CloudFront Function does the redirect entirely at the edge, before any origin is ever
 * contacted - the origin below is only a placeholder to satisfy CloudFront's API (every distribution
 * needs one configured, whether traffic actually reaches it or not), so no S3 bucket is needed.
 */
export class RedirectSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RedirectSiteStackProps) {
    super(scope, id, props);

    const fqdn = `${props.subdomain}.${props.domainName}`;
    const certificate = acm.Certificate.fromCertificateArn(this, 'WildcardCert', props.wildcardCertArn);

    const redirectFunction = new cloudfront.Function(this, 'RedirectFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: 'https://${props.redirectToHost}' + request.uri }
    }
  };
}
`),
    });

    const distribution = new cloudfront.Distribution(this, 'RedirectDistribution', {
      defaultBehavior: {
        // Never actually hit - the function above returns its own response for every request before
        // CloudFront would reach an origin. Pointed at the real target purely because Distribution
        // requires some origin to be configured.
        origin: new origins.HttpOrigin(props.redirectToHost),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        functionAssociations: [{ function: redirectFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      certificate,
      domainNames: [fqdn],
      comment: `Redirect ${fqdn} -> https://${props.redirectToHost}`,
    });

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description: `CloudFront domain — point ${fqdn} CNAME to this`,
    });
  }
}
