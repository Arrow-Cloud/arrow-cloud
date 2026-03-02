import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

/**
 * WebSocket sendMessage handler
 * Echo messages back to the client (can be extended for more functionality)
 */
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const connectionId = event.requestContext.connectionId;
  const domainName = event.requestContext.domainName;
  const stage = event.requestContext.stage;

  if (!connectionId || !domainName || !stage) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Missing required context' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Create API Gateway Management API client
    const apiGatewayClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${domainName}/${stage}`,
    });

    // Handle ping messages
    if (body.action === 'ping') {
      console.log(`Received ping from connection ${connectionId}`);
      await apiGatewayClient.send(
        new PostToConnectionCommand({
          ConnectionId: connectionId,
          Data: JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString(),
          }),
        }),
      );
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Pong sent' }),
      };
    }

    // Echo the message back to the sender
    await apiGatewayClient.send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: JSON.stringify({
          type: 'echo',
          message: body.message || 'No message provided',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Message sent' }),
    };
  } catch (error) {
    console.error('Error in sendMessage handler:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
};
