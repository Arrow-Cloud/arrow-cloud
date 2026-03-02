import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const WEBSOCKET_API_URL = process.env.WEBSOCKET_API_URL;
const CONNECTIONS_TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME;

if (!WEBSOCKET_API_URL || !CONNECTIONS_TABLE_NAME) {
  console.error('Required environment variables: WEBSOCKET_API_URL, CONNECTIONS_TABLE_NAME');
  process.exit(1);
}

const dynamoClient = new DynamoDBClient({ region: 'us-east-2' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const apiGatewayClient = new ApiGatewayManagementApiClient({
  endpoint: WEBSOCKET_API_URL,
  region: 'us-east-2',
});

interface WidgetRefreshMessage {
  type: 'refresh';
  userId?: string;
  reason?: string;
  timestamp: string;
}

/**
 * Send a refresh notification to widgets watching a specific user (or all widgets)
 */
async function sendTestMessage(targetUserId?: string) {
  try {
    console.log('Fetching active connections...');

    // Get all active connections from DynamoDB
    const result = await docClient.send(
      new ScanCommand({
        TableName: CONNECTIONS_TABLE_NAME,
      }),
    );

    const connections = result.Items || [];
    console.log(`Found ${connections.length} total connections`);

    // For targeted messages, we send to all connections and let them filter
    // (since we don't track which userId each widget is displaying)
    console.log(`Sending refresh notification to all ${connections.length} connections`);
    if (targetUserId) {
      console.log(`Message will instruct widgets displaying userId ${targetUserId} to refresh`);
    } else {
      console.log('Message will instruct ALL widgets to refresh');
    }

    // Create refresh notification
    const message: WidgetRefreshMessage = {
      type: 'refresh',
      userId: targetUserId, // If specified, only widgets showing this user will refresh
      reason: 'Manual refresh triggered',
      timestamp: new Date().toISOString(),
    };

    // Send message to all connections (widgets will filter by userId on their end)
    const results = await Promise.allSettled(
      connections.map(async (conn) => {
        try {
          await apiGatewayClient.send(
            new PostToConnectionCommand({
              ConnectionId: conn.connectionId,
              Data: JSON.stringify(message),
            }),
          );
          console.log(`✓ Sent to connection ${conn.connectionId} (userId: ${conn.userId || 'anonymous'})`);
          return { success: true, connectionId: conn.connectionId };
        } catch (error: any) {
          // Connection is stale, ignore 410 errors
          if (error.statusCode === 410) {
            console.log(`⚠ Connection ${conn.connectionId} is stale (410 Gone)`);
          } else {
            console.error(`✗ Failed to send to ${conn.connectionId}:`, error.message);
          }
          return { success: false, connectionId: conn.connectionId, error };
        }
      }),
    );

    // Summary
    const successful = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    console.log(`\n📊 Summary: ${successful} sent, ${failed} failed`);

    console.log('\n📝 Message sent:');
    console.log(JSON.stringify(message, null, 2));
  } catch (error) {
    console.error('Error sending test message:', error);
    process.exit(1);
  }
}

// Get userId from command line arguments
const targetUserId = process.argv[2];

if (targetUserId) {
  console.log(`🎯 Sending test message to connections for userId: ${targetUserId}\n`);
} else {
  console.log('🌐 Sending test message to ALL connections\n');
  console.log('💡 Tip: Pass a userId as an argument to target specific users:');
  console.log('   npx tsx scripts/send-widget-message.ts <userId>\n');
}

sendTestMessage(targetUserId);
