import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

/**
 * Broadcast a message to all active WebSocket connections
 */
export async function broadcastWebSocketMessage(
  apiUrl: string,
  connectionsTableName: string,
  message: WebSocketMessage,
  filterUserId?: string,
): Promise<{ sent: number; failed: number }> {
  try {
    // Get all active connections
    const result = await docClient.send(
      new ScanCommand({
        TableName: connectionsTableName,
      }),
    );

    const connections = result.Items || [];
    console.log(`[WebSocket] Broadcasting to ${connections.length} connections`);

    // Filter by userId if specified
    const targetConnections = filterUserId ? connections.filter((conn) => conn.userId === filterUserId) : connections;

    if (targetConnections.length === 0) {
      console.log('[WebSocket] No matching connections found');
      return { sent: 0, failed: 0 };
    }

    // Create API Gateway client
    // Convert wss:// to https:// for the Management API
    const managementApiUrl = apiUrl.replace('wss://', 'https://');
    const apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: managementApiUrl,
    });

    // Send message to all connections
    const results = await Promise.allSettled(
      targetConnections.map(async (conn) => {
        try {
          await apiGatewayClient.send(
            new PostToConnectionCommand({
              ConnectionId: conn.connectionId,
              Data: JSON.stringify(message),
            }),
          );
          return { success: true };
        } catch (error: any) {
          // Ignore stale connections (410 Gone)
          if (error.statusCode === 410 || error.$metadata?.httpStatusCode === 410) {
            console.log(`[WebSocket] Connection ${conn.connectionId} is stale (410 Gone)`);
          } else {
            // Log full error details
            console.error(`[WebSocket] Failed to send to ${conn.connectionId}:`, {
              statusCode: error.statusCode || error.$metadata?.httpStatusCode,
              message: error.message,
              name: error.name,
              code: error.code,
              errors: error.errors, // For AggregateError
              cause: error.cause,
              stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
            });
          }
          return { success: false };
        }
      }),
    );

    const sent = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - sent;

    console.log(`[WebSocket] Broadcast complete: ${sent} sent, ${failed} failed`);
    return { sent, failed };
  } catch (error) {
    console.error('[WebSocket] Error broadcasting message:', error);
    throw error;
  }
}

/**
 * Send a refresh notification to widgets
 */
export async function notifyWidgetRefresh(apiUrl: string, connectionsTableName: string, userId?: string, reason?: string): Promise<void> {
  const message = {
    type: 'refresh',
    userId,
    reason: reason || 'Data updated',
    timestamp: new Date().toISOString(),
  };

  await broadcastWebSocketMessage(apiUrl, connectionsTableName, message);
}
