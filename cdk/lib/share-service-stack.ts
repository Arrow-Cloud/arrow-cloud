/* eslint-disable @typescript-eslint/no-unused-vars */
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as path from 'path';

interface ShareServiceStackProps extends cdk.StackProps {
  vpc: ec2.IVpc;
  dbSecurityGroup: ec2.ISecurityGroup;
  databaseSecret: secretsmanager.ISecret;
  scoresBucket: s3.IBucket;
}

export class ShareServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ShareServiceStackProps) {
    super(scope, id, props);

    const domainName = 'arrowcloud.dance';
    const shareDomain = `share.${domainName}`;

    // CloudFront certificate ARN (must be in us-east-1)
    // Set via: cdk deploy -c shareCertArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID
    const cloudFrontCertArn = this.node.tryGetContext('shareCertArn') as string | undefined;

    // S3 bucket for generated share images
    const shareImagesBucket = new s3.Bucket(this, 'ShareImagesBucket', {
      bucketName: 'arrow-cloud-share-images',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [
        {
          // Delete cached images after 30 days
          expiration: cdk.Duration.days(30),
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda function for share service (containerized with Chromium)
    const shareServiceFunction = new lambda.DockerImageFunction(this, 'ShareServiceFunction', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../share-service')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 2048,
      vpc: props.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [props.dbSecurityGroup],
      environment: {
        DATABASE_SECRET_ARN: props.databaseSecret.secretArn,
        SCORES_BUCKET: props.scoresBucket.bucketName,
        SHARE_IMAGES_BUCKET: shareImagesBucket.bucketName,
        MAIN_SITE_URL: `https://${domainName}`,
        SHARE_BASE_URL: `https://${shareDomain}`,
        NODE_ENV: 'production',
      },
    });

    // Grant access to databases and buckets
    props.databaseSecret.grantRead(shareServiceFunction);
    props.scoresBucket.grantRead(shareServiceFunction);
    shareImagesBucket.grantReadWrite(shareServiceFunction);

    // API Gateway
    const api = new apigateway.RestApi(this, 'ShareServiceApi', {
      restApiName: 'Arrow Cloud Share Service',
      description: 'Share service for Arrow Cloud play images',
      binaryMediaTypes: ['image/jpeg', 'image/*', '*/*'],
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Add permission for API Gateway to invoke Lambda
    shareServiceFunction.addPermission('ApiGatewayInvoke', {
      principal: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${api.restApiId}/*/*`,
    });

    const lambdaIntegration = new apigateway.LambdaIntegration(shareServiceFunction, {
      proxy: true,
      contentHandling: apigateway.ContentHandling.CONVERT_TO_BINARY,
    });

    // Add proxy to handle all routes through Lambda
    api.root.addProxy({
      defaultIntegration: lambdaIntegration,
      anyMethod: true,
    });

    const certificate = cloudFrontCertArn ? acm.Certificate.fromCertificateArn(this, 'ShareCertificate', cloudFrontCertArn) : undefined;

    const distribution = new cloudfront.Distribution(this, 'ShareDistribution', {
      defaultBehavior: {
        origin: new cloudfrontOrigins.RestApiOrigin(api),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: new cloudfront.CachePolicy(this, 'ShareCachePolicy', {
          cachePolicyName: 'ShareServiceCachePolicy',
          defaultTtl: cdk.Duration.hours(24),
          minTtl: cdk.Duration.seconds(0),
          maxTtl: cdk.Duration.days(365),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        }),
      },
      ...(certificate
        ? {
            domainNames: [shareDomain],
            certificate,
          }
        : {}),
      comment: 'Arrow Cloud Share Service',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.distributionDomainName,
      description: 'CloudFront domain name - point share.arrowcloud.dance CNAME to this',
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'Share Service API Gateway URL',
    });

    new cdk.CfnOutput(this, 'ShareImagesBucketName', {
      value: shareImagesBucket.bucketName,
      description: 'S3 bucket for share images',
    });
  }
}
