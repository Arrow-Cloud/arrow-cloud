import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class ApiStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly dbSecurityGroup: ec2.ISecurityGroup;
  public readonly databaseSecret: secretsmanager.ISecret;
  public readonly scoresBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'ACApiVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // Add S3 VPC Gateway Endpoint to avoid NAT Gateway charges for S3 traffic
    vpc.addGatewayEndpoint('S3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });

    // Add Secrets Manager VPC Interface Endpoint to avoid NAT Gateway charges
    vpc.addInterfaceEndpoint('SecretsManagerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    // Allow external IPs to access the database directly (e.g. developer machines)
    // Set via cdk.context.json: "dbAccessCidrs": [{"cidr": "1.2.3.4/32", "description": "My machine"}]
    const dbAccessCidrs = (this.node.tryGetContext('dbAccessCidrs') as { cidr: string; description: string }[] | undefined) || [];
    for (const entry of dbAccessCidrs) {
      dbSecurityGroup.addIngressRule(ec2.Peer.ipv4(entry.cidr), ec2.Port.tcp(5432), `Allow PostgreSQL access from ${entry.description}`);
    }

    const database = new rds.DatabaseInstance(this, 'ApiDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_17_4,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.M8G, ec2.InstanceSize.LARGE),
      applyImmediately: true,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
      multiAz: false,
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      publiclyAccessible: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: false,
      credentials: rds.Credentials.fromGeneratedSecret('dbadmin'),
      securityGroups: [dbSecurityGroup],
    });

    // Security group for Lambda and db access
    const lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', { vpc });
    dbSecurityGroup.addIngressRule(lambdaSecurityGroup, ec2.Port.tcp(5432), 'Allow Lambda to access PostgreSQL');

    // Allow database security group to connect to itself (for cross-stack Lambda access)
    dbSecurityGroup.addIngressRule(dbSecurityGroup, ec2.Port.tcp(5432), 'Allow database security group members to access PostgreSQL');

    // Reference the existing JWT secret
    const jwtSecret = secretsmanager.Secret.fromSecretNameV2(this, 'JwtSecret', 'JwtSecret');

    // Create SNS topic for score submission events
    const scoreSubmissionTopic = new sns.Topic(this, 'ScoreSubmissionTopic', {
      topicName: 'arrow-cloud-score-submissions',
      displayName: 'Arrow Cloud Score Submissions',
      enforceSSL: true,
    });

    // SES Email Identity for sending verification emails
    new ses.EmailIdentity(this, 'ArrowCloudEmailIdentity', {
      identity: ses.Identity.email('noreply@arrowcloud.dance'), // todo: verify this domain in SES
    });

    // API Lambda
    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'index.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        DATABASE_SECRET_ARN: database.secret?.secretArn || '',
        JWT_SECRET_ARN: jwtSecret.secretArn,
        FROM_EMAIL_ADDRESS: 'noreply@arrowcloud.dance', // todo: verify this domain in SES
        FRONTEND_URL: 'https://arrowcloud.dance',
        WEBAUTHN_RP_ID: 'arrowcloud.dance',
        WEBAUTHN_ORIGIN: 'https://arrowcloud.dance',
        S3_BUCKET_PACKS: 'arrow-cloud-packs',
        SCORE_SUBMISSION_TOPIC_ARN: scoreSubmissionTopic.topicArn,
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
    });

    // Create the arrow-cloud-scores S3 bucket
    const s3BucketScores = new cdk.aws_s3.Bucket(this, 'ArrowCloudScoresBucket', {
      bucketName: 'arrow-cloud-scores',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Grant Lambda access to the S3 bucket
    s3BucketScores.grantReadWrite(apiLambda);

    // Create the arrow-cloud-mock-scores S3 bucket
    // Used for testing
    const s3BucketMockScores = new cdk.aws_s3.Bucket(this, 'ArrowCloudMockScoresBucket', {
      bucketName: 'arrow-cloud-mock-scores',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // Automatically delete objects when the bucket is deleted
    });

    // Grant Lambda access to the mock S3 bucket
    s3BucketMockScores.grantReadWrite(apiLambda);

    // CORS allowed origins for S3 buckets and CloudFront
    // Set via cdk.context.json: "corsAllowedOrigins": ["https://example.com", "http://localhost:5173"]
    const corsAllowedOrigins = (this.node.tryGetContext('corsAllowedOrigins') as string[] | undefined) || ['http://localhost:5173'];

    const S3_CORS_CONFIG = [
      {
        allowedHeaders: ['*'],
        allowedMethods: [
          cdk.aws_s3.HttpMethods.GET,
          cdk.aws_s3.HttpMethods.PUT,
          cdk.aws_s3.HttpMethods.POST,
          cdk.aws_s3.HttpMethods.DELETE,
          cdk.aws_s3.HttpMethods.HEAD,
        ],
        allowedOrigins: corsAllowedOrigins,
        exposedHeaders: ['ETag'],
        maxAge: 3000,
      },
    ];

    // Create the arrow-cloud-packs S3 bucket for pack uploads
    const s3BucketPacks = new cdk.aws_s3.Bucket(this, 'ArrowCloudPacksBucket', {
      bucketName: 'arrow-cloud-packs',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: S3_CORS_CONFIG,
    });

    // Grant Lambda access to the packs S3 bucket
    s3BucketPacks.grantReadWrite(apiLambda);

    // Pack processing Lambda will be defined after assets bucket/CDN are created

    // Create the arrow-cloud-assets S3 bucket for public assets (images, etc.)
    const s3BucketAssets = new s3.Bucket(this, 'ArrowCloudAssetsBucket', {
      bucketName: 'arrow-cloud-assets',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS, // Block ACLs but allow bucket policies
      cors: S3_CORS_CONFIG,
    });

    // Optionally import ACM cert for assets custom domain (must be in us-east-1 for CloudFront)
    // Set via: cdk deploy -c cloudFrontCertArn=arn:aws:acm:us-east-1:ACCOUNT:certificate/ID
    const assetsCertArn = this.node.tryGetContext('cloudFrontCertArn') as string | undefined;
    const assetsCert = assetsCertArn ? acm.Certificate.fromCertificateArn(this, 'AssetsCertificate', assetsCertArn) : undefined;

    // Create a CORS response headers policy for assets CDN
    const assetsCorsHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'AssetsCorsPolicy', {
      responseHeadersPolicyName: 'ArrowCloudAssetsCorsPolicy',
      comment: 'CORS headers for Arrow Cloud assets CDN',
      corsBehavior: {
        accessControlAllowOrigins: corsAllowedOrigins,
        accessControlAllowHeaders: ['*'],
        accessControlAllowMethods: ['GET', 'HEAD'],
        accessControlAllowCredentials: false,
        originOverride: true,
      },
    });

    // Create CloudFront distribution for assets
    const assetsDistribution = new cloudfront.Distribution(this, 'ArrowCloudAssetsDistribution', {
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(s3BucketAssets),
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: assetsCorsHeadersPolicy,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Use only North America and Europe edge locations
      comment: 'Arrow Cloud Assets CDN',
      ...(assetsCert
        ? {
            certificate: assetsCert,
            domainNames: ['assets.arrowcloud.dance'],
          }
        : {}),
    });

    // Grant Lambda access to the assets S3 bucket
    s3BucketAssets.grantReadWrite(apiLambda);

    // Add CloudFront domain to Lambda environment (prefer custom domain when configured)
    const assetsPublicUrl = assetsCert ? 'https://assets.arrowcloud.dance' : `https://${assetsDistribution.distributionDomainName}`;
    apiLambda.addEnvironment('CLOUDFRONT_ASSETS_URL', assetsPublicUrl);
    apiLambda.addEnvironment('S3_BUCKET_ASSETS', s3BucketAssets.bucketName);

    // Lambda to process packs on .zip upload
    const packProcessorLambda = new lambda.Function(this, 'PackProcessorLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.X86_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'pack-processor.handler',
      memorySize: 2048,
      timeout: cdk.Duration.minutes(15),
      // Sharp Layer for x86_64 - from https://github.com/pH200/sharp-layer
      // Set via: cdk deploy -c sharpLayerArn=arn:aws:lambda:REGION:ACCOUNT:layer:sharp-x64:VERSION
      ...(this.node.tryGetContext('sharpLayerArn')
        ? { layers: [lambda.LayerVersion.fromLayerVersionArn(this, 'SharpLayer', this.node.tryGetContext('sharpLayerArn') as string)] }
        : {}),
      environment: {
        DATABASE_SECRET_ARN: database.secret?.secretArn || '',
        S3_BUCKET_ASSETS: s3BucketAssets.bucketName,
        CLOUDFRONT_ASSETS_URL: assetsPublicUrl,
        SIMFILE_CONCURRENCY_LIMIT: '3',
        // Provide FRONTEND_URL so the lambda can build links to the site
        FRONTEND_URL: 'https://arrowcloud.dance',
        // Help Sharp find its binaries from the layer
        LD_LIBRARY_PATH: '/opt/lib:/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/runtime/lib:/var/task:/var/task/lib:/opt/lib',
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
    });

    // Permissions for pack processor
    s3BucketPacks.grantRead(packProcessorLambda);
    s3BucketAssets.grantReadWrite(packProcessorLambda);
    if (database.secret) {
      database.secret.grantRead(packProcessorLambda);
    }

    // S3 event to trigger pack processing on .zip upload
    packProcessorLambda.addEventSource(
      new lambdaEventSources.S3EventSource(s3BucketPacks, {
        events: [s3.EventType.OBJECT_CREATED_PUT, s3.EventType.OBJECT_CREATED_POST, s3.EventType.OBJECT_CREATED_COMPLETE_MULTIPART_UPLOAD],
        filters: [{ prefix: 'pack-uploads/', suffix: '.zip' }],
      }),
    );

    // Grant Lambda access to the RDS secret
    if (database.secret) {
      database.secret.grantRead(apiLambda);
    }

    // Grant Lambda access to the JWT secret
    jwtSecret.grantRead(apiLambda);

    // Grant Lambda permissions to send emails via SES
    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: ['*'],
      }),
    );

    // Grant Lambda permissions to publish to SNS topic
    scoreSubmissionTopic.grantPublish(apiLambda);

    // === Discord Integration (SQS + Lambda) ===
    // Reference Discord secret created in Secrets Manager
    const discordSecret = secretsmanager.Secret.fromSecretNameV2(this, 'DiscordBotSecret', 'DiscordBotSecret');

    // SQS queue for Discord notifications
    const discordNotifyQueue = new sqs.Queue(this, 'DiscordNotifyQueue', {
      queueName: 'arrow-cloud-discord-notify',
      visibilityTimeout: cdk.Duration.minutes(2),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'DiscordNotifyDLQ', { queueName: 'arrow-cloud-discord-notify-dlq' }),
        maxReceiveCount: 5,
      },
    });

    // Lambda to send messages to Discord
    // Note: This Lambda does NOT need VPC access - it only calls Discord API and Secrets Manager
    const discordNotifierLambda = new lambda.Function(this, 'DiscordNotifierLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'discord-bot.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      environment: {
        DISCORD_SECRET_ARN: discordSecret.secretArn,
        // Optional override: set a default channel id via env instead of the secret key adminChannelId
        // DISCORD_DEFAULT_CHANNEL_ID: '123456789012345678',
      },
      // Removed VPC configuration to avoid NAT Gateway charges for Discord API calls
      events: [new lambdaEventSources.SqsEventSource(discordNotifyQueue, { batchSize: 5 })],
    });

    // Allow Discord Lambda to read bot secret
    discordSecret.grantRead(discordNotifierLambda);

    // Allow API Lambda to send messages to the Discord queue
    discordNotifyQueue.grantSendMessages(apiLambda);
    // Allow the pack processor lambda to send messages to the Discord queue
    discordNotifyQueue.grantSendMessages(packProcessorLambda);

    // Expose queue URL to API Lambda for convenience
    apiLambda.addEnvironment('DISCORD_NOTIFY_QUEUE_URL', discordNotifyQueue.queueUrl);
    // Expose queue URL to Pack Processor Lambda
    packProcessorLambda.addEnvironment('DISCORD_NOTIFY_QUEUE_URL', discordNotifyQueue.queueUrl);

    new cdk.CfnOutput(this, 'DiscordNotifyQueueUrl', { value: discordNotifyQueue.queueUrl });

    // Debounce state table
    new dynamodb.Table(this, 'DebounceLocks', {
      tableName: 'DebounceLocks',
      partitionKey: { name: 'lockId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // === User Stats Processing (SQS + Lambda) ===
    // Create SQS queue for user stats processing
    const userStatsQueue = new sqs.Queue(this, 'UserStatsQueue', {
      queueName: 'arrow-cloud-user-stats',
      visibilityTimeout: cdk.Duration.minutes(5), // Match lambda timeout
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'UserStatsDLQ', {
          queueName: 'arrow-cloud-user-stats-dlq',
        }),
        maxReceiveCount: 3,
      },
    });

    // Subscribe SQS queue to SNS topic with message filtering
    scoreSubmissionTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(userStatsQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['score-submitted', 'score-deleted'],
          }),
        },
      }),
    );

    // Create Lambda function for user stats processing
    const userStatsLambda = new lambda.Function(this, 'UserStatsLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'user-stats.handler',
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),

      environment: {
        DATABASE_SECRET_ARN: database.secret?.secretArn || '',
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      events: [
        new lambdaEventSources.SqsEventSource(userStatsQueue, {
          batchSize: 10,
          maxBatchingWindow: cdk.Duration.seconds(5),
          reportBatchItemFailures: true,
        }),
      ],
    });

    // Grant User Stats Lambda access to the database secret
    if (database.secret) {
      database.secret.grantRead(userStatsLambda);
    }

    // === Pack Leaderboard Processing (SQS + Lambda) ===
    // Create SQS queue for pack leaderboard processing
    const packLeaderboardQueue = new sqs.Queue(this, 'PackLeaderboardQueue', {
      queueName: 'arrow-cloud-pack-leaderboard',
      visibilityTimeout: cdk.Duration.minutes(5),
      deadLetterQueue: {
        queue: new sqs.Queue(this, 'PackLeaderboardDLQ', {
          queueName: 'arrow-cloud-pack-leaderboard-dlq',
        }),
        maxReceiveCount: 3,
      },
    });

    // Subscribe SQS queue to SNS topic — only score-submitted events
    scoreSubmissionTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(packLeaderboardQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ['score-submitted'],
          }),
        },
      }),
    );

    // Create Lambda function for pack leaderboard processing
    const packLeaderboardLambda = new lambda.Function(this, 'PackLeaderboardLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'pack-leaderboard.handler',
      memorySize: 256,
      timeout: cdk.Duration.minutes(5),
      environment: {
        DATABASE_SECRET_ARN: database.secret?.secretArn || '',
        S3_BUCKET_ASSETS: s3BucketAssets.bucketName,
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
      events: [
        new lambdaEventSources.SqsEventSource(packLeaderboardQueue, {
          batchSize: 10,
          maxBatchingWindow: cdk.Duration.seconds(5),
          reportBatchItemFailures: true,
        }),
      ],
    });

    // Grant Pack Leaderboard Lambda access to the database secret and S3
    if (database.secret) {
      database.secret.grantRead(packLeaderboardLambda);
    }
    s3BucketAssets.grantReadWrite(packLeaderboardLambda);

    // === Pack Popularity Calculation Lambda ===
    // Lambda to calculate pack popularity scores every 6 hours
    const packPopularityLambda = new lambda.Function(this, 'PackPopularityLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'pack-popularity.handler',
      memorySize: 512,
      timeout: cdk.Duration.minutes(15),
      environment: {
        DATABASE_SECRET_ARN: database.secret?.secretArn || '',
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
    });

    // Grant Pack Popularity Lambda access to the database secret
    if (database.secret) {
      database.secret.grantRead(packPopularityLambda);
    }

    // Schedule pack popularity calculation every 6 hours
    const packPopularitySchedule = new events.Rule(this, 'PackPopularitySchedule', {
      ruleName: 'arrow-cloud-pack-popularity-schedule',
      description: 'Triggers pack popularity calculation every 6 hours',
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '*/6', // Every 6 hours
      }),
    });

    packPopularitySchedule.addTarget(new targets.LambdaFunction(packPopularityLambda));

    new cdk.CfnOutput(this, 'PackPopularityLambdaArn', {
      value: packPopularityLambda.functionArn,
      description: 'ARN of the pack popularity calculation lambda',
    });

    // === WebSocket API Gateway ===
    // DynamoDB table to store WebSocket connection IDs
    const websocketConnectionsTable = new dynamodb.Table(this, 'WebSocketConnections', {
      tableName: 'arrow-cloud-websocket-connections',
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl', // Auto-cleanup old connections
    });

    // Add GSI for userId lookups
    websocketConnectionsTable.addGlobalSecondaryIndex({
      indexName: 'userIdIndex',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // WebSocket Connect Lambda
    const wsConnectLambda = new lambda.Function(this, 'WebSocketConnectLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'websocket-connect.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
      },
    });

    // WebSocket Disconnect Lambda
    const wsDisconnectLambda = new lambda.Function(this, 'WebSocketDisconnectLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'websocket-disconnect.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
      },
    });

    // WebSocket Send Message Lambda
    const wsSendMessageLambda = new lambda.Function(this, 'WebSocketSendMessageLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code: lambda.Code.fromAsset('../api/dist'),
      handler: 'websocket-sendmessage.handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      environment: {
        CONNECTIONS_TABLE_NAME: websocketConnectionsTable.tableName,
        DATABASE_SECRET_ARN: database.secret?.secretArn || '',
        JWT_SECRET_ARN: jwtSecret.secretArn,
      },
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [lambdaSecurityGroup],
    });

    // Grant table access to WebSocket lambdas
    websocketConnectionsTable.grantReadWriteData(wsConnectLambda);
    websocketConnectionsTable.grantReadWriteData(wsDisconnectLambda);
    websocketConnectionsTable.grantReadWriteData(wsSendMessageLambda);

    // Grant secret access
    jwtSecret.grantRead(wsConnectLambda);
    jwtSecret.grantRead(wsSendMessageLambda);
    if (database.secret) {
      database.secret.grantRead(wsSendMessageLambda);
    }

    // Create WebSocket API
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: 'arrow-cloud-websocket-api',
      description: 'WebSocket API for real-time updates',
      connectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('ConnectIntegration', wsConnectLambda),
      },
      disconnectRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DisconnectIntegration', wsDisconnectLambda),
      },
      defaultRouteOptions: {
        integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('DefaultIntegration', wsSendMessageLambda),
      },
    });

    // Add sendMessage route
    webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('SendMessageIntegration', wsSendMessageLambda),
    });

    // Add ping route (keep-alive)
    webSocketApi.addRoute('ping', {
      integration: new apigatewayv2Integrations.WebSocketLambdaIntegration('PingIntegration', wsSendMessageLambda),
    });

    // Create WebSocket stage
    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'WebSocketStage', {
      webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Grant permission to API Gateway to invoke lambdas for management
    const wsApiManagementPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/*`],
    });

    wsSendMessageLambda.addToRolePolicy(wsApiManagementPolicy);

    // Add WebSocket API URL to environment variables for other lambdas that need to send updates
    const wsApiUrl = `${webSocketApi.apiEndpoint}/${webSocketStage.stageName}`;

    // Add to main API Lambda for score submissions
    apiLambda.addEnvironment('WEBSOCKET_API_URL', wsApiUrl);
    apiLambda.addEnvironment('CONNECTIONS_TABLE_NAME', websocketConnectionsTable.tableName);
    apiLambda.addToRolePolicy(wsApiManagementPolicy);
    websocketConnectionsTable.grantReadData(apiLambda);

    new cdk.CfnOutput(this, 'WebSocketApiUrl', {
      value: wsApiUrl,
      description: 'WebSocket API URL for real-time connections',
    });

    new cdk.CfnOutput(this, 'WebSocketConnectionsTableName', {
      value: websocketConnectionsTable.tableName,
      description: 'DynamoDB table for WebSocket connections',
    });

    // API Gateway
    const api = new apigateway.LambdaRestApi(this, 'ApiGateway', {
      handler: apiLambda,
      proxy: true,
      binaryMediaTypes: ['application/zip', 'application/octet-stream', 'multipart/form-data'],
    });

    // Optional: import ACM certificate ARN from context for API custom domain (must be in us-east-2)
    // Set via: cdk deploy -c apiCertArn=arn:aws:acm:us-east-2:ACCOUNT:certificate/ID
    const apiCertArn = this.node.tryGetContext('apiCertArn') as string | undefined;
    if (apiCertArn) {
      const apiCert = acm.Certificate.fromCertificateArn(this, 'ApiCertificate', apiCertArn);
      const domainName = new apigateway.DomainName(this, 'ApiCustomDomain', {
        domainName: 'api.arrowcloud.dance',
        certificate: apiCert,
        endpointType: apigateway.EndpointType.REGIONAL,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      });

      new apigateway.BasePathMapping(this, 'ApiBasePathMapping', {
        domainName,
        restApi: api,
        basePath: '', // root mapping
        stage: api.deploymentStage,
      });

      new cdk.CfnOutput(this, 'ApiCustomDomainUrl', { value: `https://${domainName.domainName}` });
      new cdk.CfnOutput(this, 'ApiGatewayRegionalDomainName', { value: domainName.domainNameAliasDomainName });
      new cdk.CfnOutput(this, 'ApiGatewayRegionalHostedZoneId', { value: domainName.domainNameAliasHostedZoneId });
    }

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
    });

    new cdk.CfnOutput(this, 'AssetsCloudFrontUrl', {
      value: `https://${assetsDistribution.distributionDomainName}`,
      description: 'CloudFront URL for public assets',
    });

    if (assetsCert) {
      new cdk.CfnOutput(this, 'AssetsCustomDomain', {
        value: 'https://assets.arrowcloud.dance',
        description: 'Custom domain for assets (create DNS CNAME/ALIAS at Porkbun)',
      });
    }

    new cdk.CfnOutput(this, 'AssetsBucketName', {
      value: s3BucketAssets.bucketName,
      description: 'S3 bucket name for assets',
    });

    new cdk.CfnOutput(this, 'ScoreSubmissionTopicArn', {
      value: scoreSubmissionTopic.topicArn,
      description: 'SNS topic ARN for score submission events',
    });

    // Export resources for other stacks
    this.vpc = vpc;
    this.dbSecurityGroup = dbSecurityGroup;
    this.databaseSecret = database.secret!;
    this.scoresBucket = s3BucketScores;
  }
}
