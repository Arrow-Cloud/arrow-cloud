import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Frontend hosting bucket.
    // Files are private at the bucket layer and served through CloudFront OAC.
    // This keeps direct S3 access closed while allowing CDN delivery.
    const bucket = new s3.Bucket(this, 'FrontendBucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: false, // Use CloudFront for access
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
      autoDeleteObjects: true, // Automatically delete objects when the bucket is destroyed
    });

    // Optionally import ACM cert for custom domain (must be in us-east-1 for CloudFront)
    // Set via: cdk deploy -c cloudFrontCertArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID
    const frontendCertArn = this.node.tryGetContext('cloudFrontCertArn') as string | undefined;
    const maybeCert = frontendCertArn ? acm.Certificate.fromCertificateArn(this, 'FrontendCertificate', frontendCertArn) : undefined;

    // CloudFront cache model:
    // 1) Default behavior (HTML/navigation): caching disabled so users quickly see new releases.
    // 2) /assets/* behavior (hashed JS/CSS/media): optimized caching for performance.
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        // Entry documents should not be edge-cached across releases.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
      },
      additionalBehaviors: {
        'assets/*': {
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, // Optimize cache efficiency by minimizing the values that CloudFront includes in the cache key.
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        // SPA fallback: route unknown paths to index.html so client-side router can handle them.
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        // S3/OAC can return 403 for missing objects; treat it as SPA fallback as well.
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      // Only set custom domain when a certificate ARN is provided
      ...(maybeCert
        ? {
            certificate: maybeCert,
            domainNames: ['arrowcloud.dance'],
            comment: 'Arrow Cloud Frontend',
          }
        : {}),
    });

    // Deploy the frontend files to the S3 bucket
    new s3deploy.BucketDeployment(this, 'DeployFrontendAssets', {
      sources: [s3deploy.Source.asset('../frontend/dist')], // Path to the built frontend files
      destinationBucket: bucket,
      exclude: ['index.html'],
      cacheControl: [s3deploy.CacheControl.maxAge(cdk.Duration.days(365)), s3deploy.CacheControl.immutable()],
      distribution, // Invalidate the CloudFront cache after deployment
      distributionPaths: ['/*'],
    });

    // Output the CloudFront distribution URL
    new s3deploy.BucketDeployment(this, 'DeployFrontendIndex', {
      sources: [s3deploy.Source.asset('../frontend/dist')],
      destinationBucket: bucket,
      include: ['index.html'],
      cacheControl: [s3deploy.CacheControl.noStore(), s3deploy.CacheControl.mustRevalidate()],
      distribution,
      // Only invalidate entrypoint paths for this deploy phase.
      distributionPaths: ['/index.html', '/'],
    });

    // Stack outputs for deployment/runtime visibility.
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: distribution.domainName,
      description: 'The URL of the frontend application',
    });

    if (maybeCert) {
      new cdk.CfnOutput(this, 'FrontendCustomDomain', {
        value: 'https://arrowcloud.dance',
        description: 'Custom domain for the frontend (configure DNS at Porkbun to point to the distribution)',
      });
    }
  }
}
