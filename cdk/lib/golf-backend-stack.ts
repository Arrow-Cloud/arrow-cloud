import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
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
      },
    });

    // Lambda needs to generate pre-signed URLs — grantPut gives s3:PutObject
    this.submissionsBucket.grantPut(submitApiLambda);

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
  }
}
