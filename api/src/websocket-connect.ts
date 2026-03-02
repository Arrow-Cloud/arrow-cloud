import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const dynamoClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const CONNECTIONS_TABLE_NAME = process.env.CONNECTIONS_TABLE_NAME || '';

/**
 * WebSocket $connect handler
 * Stores connection info in DynamoDB
 * Accepts optional userId as query parameter
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;

  if (!connectionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing connectionId' }),
    };
  }

  try {
    // Get userId from query parameters (optional)
    const userId = event.queryStringParameters?.userId || 'anonymous';

    // Store connection in DynamoDB
    const ttl = Math.floor(Date.now() / 1000) + 7200; // 2 hour TTL
    await docClient.send(
      new PutCommand({
        TableName: CONNECTIONS_TABLE_NAME,
        Item: {
          connectionId,
          userId, // Store 'anonymous' if not provided to satisfy GSI
          connectedAt: new Date().toISOString(),
          ttl,
        },
      }),
    );

    console.log(`WebSocket connected: ${connectionId}, userId: ${userId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Connected' }),
    };
  } catch (error) {
    console.error('Error in connect handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
