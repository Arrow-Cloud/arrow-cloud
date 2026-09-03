import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { EventBackendConstruct } from './event-backend-construct';

export interface GolfBackendStackProps extends cdk.StackProps {
  /** Path to the compiled submit API Lambda code (the dist/ directory) */
  submitApiCodePath: string;
}

/**
 * Golf-specific backend resources layered on top of the shared event backend construct.
 *
 * Creates:
 * - Shared event backend state table via EventBackendConstruct
 * - Private S3 bucket for chart submission uploads
 * - Submit API Lambda with a Function URL that issues pre-signed S3 PUT URLs
 */
export class GolfBackendStack extends cdk.Stack {
  public readonly backend: EventBackendConstruct;
  public readonly table: dynamodb.Table;
  public readonly submissionsBucket: s3.Bucket;
  public readonly submitApiUrl: string;

  constructor(scope: Construct, id: string, props: GolfBackendStackProps) {
    super(scope, id, props);

    const { submitApiCodePath } = props;

    // Import the shared Discord notify queue by ARN — avoids a cross-environment
    // stack reference between ApiStack (no explicit env) and this stack.
    const discordNotifyQueue = sqs.Queue.fromQueueArn(this, 'DiscordNotifyQueue', `arn:aws:sqs:${this.region}:${this.account}:arrow-cloud-discord-notify`);

    this.backend = new EventBackendConstruct(this, 'Backend', {
      eventSlug: 'golf',
    });

    this.table = this.backend.table;

    // === Submissions Bucket ===
    this.submissionsBucket = new s3.Bucket(this, 'SubmissionsBucket', {
      bucketName: 'event-golf-submissions',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      // Retain on stack destroy — uploaded charts are user data
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          // Allow browsers to PUT directly using pre-signed URLs
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
    });

    // === Submit API Lambda ===
    const submitApiLambda = new lambda.Function(this, 'SubmitApiLambda', {
      functionName: 'event-golf-submit-api',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset(submitApiCodePath),
      handler: 'submit-api.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        SUBMISSIONS_BUCKET_NAME: this.submissionsBucket.bucketName,
        STATE_TABLE_NAME: this.table.tableName,
      },
    });

    // Lambda needs to generate pre-signed URLs — grantPut gives s3:PutObject
    this.submissionsBucket.grantPut(submitApiLambda);
    this.table.grantWriteData(submitApiLambda);

    const fnUrl = submitApiLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ['content-type'],
      },
    });

    this.submitApiUrl = fnUrl.url;

    new cdk.CfnOutput(this, 'SubmitApiUrl', {
      value: this.submitApiUrl,
      description: 'Golf event chart submission API URL',
    });

    new cdk.CfnOutput(this, 'SubmissionsBucketName', {
      value: this.submissionsBucket.bucketName,
      description: 'Golf event chart submissions S3 bucket',
    });

    // === Submissions CDN (CloudFront + OAC) ===
    // Provides short, stable download URLs for Discord notifications.
    // Objects are private in S3; CloudFront serves them via OAC.
    const submissionsCdn = new cloudfront.Distribution(this, 'SubmissionsCdn', {
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(this.submissionsBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      comment: 'Golf event chart submissions CDN',
    });

    new cdk.CfnOutput(this, 'SubmissionsCdnDomain', {
      value: submissionsCdn.distributionDomainName,
      description: 'CloudFront domain for golf submissions downloads',
    });

    // === Submission Notifier Lambda ===
    // Triggered by S3 ObjectCreated events; sends a Discord notification via the
    // shared Arrow Cloud discord-notify SQS queue.
    const submissionNotifierLambda = new lambda.Function(this, 'SubmissionNotifierLambda', {
      functionName: 'event-golf-submission-notifier',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset(submitApiCodePath),
      handler: 'submission-notifier.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(10),
      environment: {
        DISCORD_NOTIFY_QUEUE_URL: discordNotifyQueue.queueUrl,
        DISCORD_CHANNEL_ID: '1495970982404423711',
        SUBMISSIONS_BUCKET_NAME: this.submissionsBucket.bucketName,
        SUBMISSIONS_CDN_DOMAIN: submissionsCdn.distributionDomainName,
        STATE_TABLE_NAME: this.table.tableName,
      },
    });

    discordNotifyQueue.grantSendMessages(submissionNotifierLambda);
    this.table.grantReadData(submissionNotifierLambda);

    this.submissionsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(submissionNotifierLambda), { prefix: 'submissions/' });
  }
}
