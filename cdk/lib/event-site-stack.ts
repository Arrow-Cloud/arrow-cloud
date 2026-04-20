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
  /** Root domain, e.g. "arrowcloud.dance" */
  domainName: string;
  /** ACM wildcard certificate ARN in us-east-1 */
  wildcardCertArn: string;
  /** Relative path from cdk/ to the built event site dist folder */
  distPath: string;
}

export class EventSiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: EventSiteStackProps) {
    super(scope, id, props);

    const fqdn = `${props.subdomain}.${props.domainName}`;

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      publicReadAccess: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const certificate = acm.Certificate.fromCertificateArn(this, 'WildcardCert', props.wildcardCertArn);

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
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      certificate,
      domainNames: [fqdn],
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

    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: `CloudFront domain — point ${fqdn} CNAME to this`,
    });
  }
}
