import { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException } from '@aws-sdk/client-apigatewaymanagementapi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONNECTIONS_TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME || '';
const WEBSOCKET_API_URL = process.env.WEBSOCKET_API_URL || '';

interface WebSocketMessage {
  type: string;
  data: any;
}

/**
 * Send a message to a specific WebSocket connection
 */
export async function sendToConnection(connectionId: string, message: WebSocketMessage): Promise<boolean> {
  if (!WEBSOCKET_API_URL) {
    console.warn('WEBSOCKET_API_URL not configured');
    return false;
  }

  const client = new ApiGatewayManagementApiClient({
    endpoint: WEBSOCKET_API_URL,
  });

  try {
    await client.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      }),
    );
    return true;
  } catch (error) {
    if (error instanceof GoneException) {
      // Connection no longer exists, remove from database
      console.log(`Connection ${connectionId} is gone, removing from database`);
      await docClient.send(
        new DeleteCommand({
          TableName: CONNECTIONS_TABLE_NAME,
          Key: { connectionId },
        }),
      );
    } else {
      console.error(`Error sending to connection ${connectionId}:`, error);
    }
    return false;
  }
}

/**
 * Send a message to all connections for a specific user
 */
export async function sendToUser(userId: string, message: WebSocketMessage): Promise<number> {
  if (!CONNECTIONS_TABLE_NAME) {
    console.warn('CONNECTIONS_TABLE_NAME not configured');
    return 0;
  }

  try {
    // Query all connections for this user
    const result = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE_NAME,
        IndexName: 'userIdIndex',
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }),
    );

    if (!result.Items || result.Items.length === 0) {
      console.log(`No active connections found for user ${userId}`);
      return 0;
    }

    // Send to all connections
    const sendPromises = result.Items.map((item) => sendToConnection(item.connectionId as string, message));

    const results = await Promise.all(sendPromises);
    const successCount = results.filter((r) => r).length;

    console.log(`Sent message to ${successCount}/${result.Items.length} connections for user ${userId}`);
    return successCount;
  } catch (error) {
    console.error(`Error sending to user ${userId}:`, error);
    return 0;
  }
}

/**
 * Broadcast a message to all connected clients
 */
export async function broadcastToAll(message: WebSocketMessage): Promise<number> {
  if (!CONNECTIONS_TABLE_NAME) {
    console.warn('CONNECTIONS_TABLE_NAME not configured');
    return 0;
  }

  try {
    // Scan all connections (be careful with this in production with many connections)
    const result = await docClient.send(
      new QueryCommand({
        TableName: CONNECTIONS_TABLE_NAME,
      }),
    );

    if (!result.Items || result.Items.length === 0) {
      console.log('No active connections found');
      return 0;
    }

    // Send to all connections
    const sendPromises = result.Items.map((item) => sendToConnection(item.connectionId as string, message));

    const results = await Promise.all(sendPromises);
    const successCount = results.filter((r) => r).length;

    console.log(`Broadcast message to ${successCount}/${result.Items.length} connections`);
    return successCount;
  } catch (error) {
    console.error('Error broadcasting to all:', error);
    return 0;
  }
}
