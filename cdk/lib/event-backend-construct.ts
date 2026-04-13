import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export interface EventBackendProps {
  /** Short identifier for the event, used in resource naming (e.g. "testevent") */
  eventSlug: string;

  /** SNS topic that publishes score submission events */
  scoreSubmissionTopic: sns.ITopic;

  /** Chart hashes this event cares about — used for SNS subscription filtering */
  chartHashes: string[];

  /** Path to the compiled score processor Lambda code */
  scoreProcessorCodePath: string;

  /** Handler entry point for the score processor Lambda (e.g. "score-processor.handler") */
  scoreProcessorHandler: string;

  /** Path to the compiled scheduled processor Lambda code */
  scheduledProcessorCodePath: string;

  /** Handler entry point for the scheduled processor Lambda (e.g. "scheduled-processor.handler") */
  scheduledProcessorHandler: string;

  /** Path to the compiled read API Lambda code */
  readApiCodePath: string;

  /** Handler entry point for the read API Lambda (e.g. "read-api.handler") */
  readApiHandler: string;

  /** How often the scheduled Lambda runs (default: 1 hour) */
  scheduleInterval?: cdk.Duration;

  /** Base URL for the Arrow Cloud API (default: https://api.arrowcloud.dance) */
  apiBaseUrl?: string;

  /** Additional environment variables for both Lambdas */
  environment?: Record<string, string>;
}

/**
 * Reusable construct for event backend processing.
 *
 * Creates:
 * - SQS queue subscribed to the score submission SNS topic, filtered by chart hash
 * - Score processor Lambda triggered by SQS messages
 * - DynamoDB table for event-specific state
 * - Scheduled Lambda on an EventBridge rule for periodic processing
 * - DLQs for both queues
 */
export class EventBackendConstruct extends Construct {
  public readonly table: dynamodb.Table;
  public readonly scoreProcessorLambda: lambda.Function;
  public readonly scheduledProcessorLambda: lambda.Function;
  public readonly readApiLambda: lambda.Function;
  public readonly readApiUrl: string;
  public readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string, props: EventBackendProps) {
    super(scope, id);

    const {
      eventSlug,
      scoreSubmissionTopic,
      chartHashes,
      scoreProcessorCodePath,
      scoreProcessorHandler,
      scheduledProcessorCodePath,
      scheduledProcessorHandler,
      readApiCodePath,
      readApiHandler,
      scheduleInterval = cdk.Duration.hours(1),
      apiBaseUrl = 'https://api.arrowcloud.dance',
      environment = {},
    } = props;

    const prefix = `event-${eventSlug}`;

    // === DynamoDB Table ===
    this.table = new dynamodb.Table(this, 'StateTable', {
      tableName: `${prefix}-state`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // GSI1: Chart activity — query plays by chart, sorted by time
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI2: Global activity — query all plays sorted by time
    this.table.addGlobalSecondaryIndex({
      indexName: 'gsi2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Shared environment for both Lambdas
    const sharedEnv: Record<string, string> = {
      EVENT_SLUG: eventSlug,
      STATE_TABLE_NAME: this.table.tableName,
      API_BASE_URL: apiBaseUrl,
      CHART_HASHES: JSON.stringify(chartHashes),
      ...environment,
    };

    // === Score Processor (SNS → SQS → Lambda) ===
    const dlq = new sqs.Queue(this, 'ScoreProcessorDLQ', {
      queueName: `${prefix}-score-processor-dlq`,
    });

    this.queue = new sqs.Queue(this, 'ScoreProcessorQueue', {
      queueName: `${prefix}-score-processor`,
      visibilityTimeout: cdk.Duration.minutes(5),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 3,
      },
    });

    // Subscribe to SNS with chart hash filter
    scoreSubmissionTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(this.queue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['score-submitted'],
          }),
          chartHash: sns.SubscriptionFilter.stringFilter({
            allowlist: chartHashes,
          }),
        },
      }),
    );

    this.scoreProcessorLambda = new lambda.Function(this, 'ScoreProcessorLambda', {
      functionName: `${prefix}-score-processor`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset(scoreProcessorCodePath),
      handler: scoreProcessorHandler,
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      environment: sharedEnv,
      events: [
        new lambdaEventSources.SqsEventSource(this.queue, {
          batchSize: 10,
          maxBatchingWindow: cdk.Duration.seconds(5),
          reportBatchItemFailures: true,
        }),
      ],
    });

    this.table.grantReadWriteData(this.scoreProcessorLambda);

    // === Scheduled Processor (EventBridge → Lambda) ===
    this.scheduledProcessorLambda = new lambda.Function(this, 'ScheduledProcessorLambda', {
      functionName: `${prefix}-scheduled-processor`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset(scheduledProcessorCodePath),
      handler: scheduledProcessorHandler,
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      environment: sharedEnv,
    });

    this.table.grantReadWriteData(this.scheduledProcessorLambda);

    const schedule = new events.Rule(this, 'ScheduledProcessorRule', {
      ruleName: `${prefix}-scheduled-processor`,
      description: `Periodic processing for event: ${eventSlug}`,
      schedule: events.Schedule.rate(scheduleInterval),
    });

    schedule.addTarget(new targets.LambdaFunction(this.scheduledProcessorLambda));

    // === Read API (Lambda Function URL) ===
    this.readApiLambda = new lambda.Function(this, 'ReadApiLambda', {
      functionName: `${prefix}-read-api`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset(readApiCodePath),
      handler: readApiHandler,
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: sharedEnv,
    });

    this.table.grantReadData(this.readApiLambda);

    const fnUrl = this.readApiLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.GET],
        allowedHeaders: ['content-type'],
      },
    });

    this.readApiUrl = fnUrl.url;

    // === Outputs ===
    new cdk.CfnOutput(this, 'StateTableName', {
      value: this.table.tableName,
      description: `DynamoDB state table for event: ${eventSlug}`,
    });

    new cdk.CfnOutput(this, 'ReadApiUrl', {
      value: fnUrl.url,
      description: `Read API URL for event: ${eventSlug}`,
    });
  }
}
