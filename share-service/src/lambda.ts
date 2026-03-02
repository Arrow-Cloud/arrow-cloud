import { generatePlayImage, generateSessionImage } from './services/image-generator';
import { fetchPlayData } from './services/play-data';
import { fetchSessionData } from './services/session-data';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client();

export const handler = async (event: any) => {
  console.log('Lambda invoked:', event.path, event.httpMethod, event.queryStringParameters);

  // Route to appropriate handler
  if (event.path?.match(/^\/play\/\d+$/)) {
    return handlePlayPage(event);
  } else if (event.path?.match(/^\/image\/\d+$/)) {
    return handleImageGeneration(event);
  } else if (event.path?.match(/^\/session\/\d+$/)) {
    return handleSessionPage(event);
  } else if (event.path?.match(/^\/session\/image\/\d+$/)) {
    return handleSessionImageGeneration(event);
  } else {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };
  }
};

async function handlePlayPage(event: any) {
  const match = event.path.match(/^\/play\/(\d+)$/);
  const playId = parseInt(match![1], 10);

  // Parse query parameters
  const { primary, secondary } = parseLeaderboardParams(event.queryStringParameters);

  // Fetch play data to get meaningful metadata
  let playData;
  try {
    playData = await fetchPlayData(playId, primary, secondary);
  } catch (error) {
    console.error('Error fetching play data:', error);
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Play not found' }),
    };
  }

  if (!playData) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Play not found' }),
    };
  }

  // Build meaningful title
  const songTitle = playData.chart.title || 'Unknown Song';
  const artist = playData.chart.artist || 'Unknown Artist';
  const userName = playData.user.alias || 'Player';

  const title = `${userName} - ${songTitle} by ${artist}`;

  // Build image URL
  const baseUrl = event.requestContext?.domainName ? `https://${event.requestContext.domainName}/${event.requestContext.stage}` : '';
  const imageUrl = `${baseUrl}/image/${playId}?p=${primary}&s=${secondary}`;
  const mainSiteUrl = process.env.MAIN_SITE_URL || 'https://arrowcloud.dance';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
    },
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Arrow Cloud</title>
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="880" />
  <meta property="og:image:height" content="800" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta name="twitter:title" content="${title}" />
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 900px;
      width: 100%;
    }
    img {
      width: 100%;
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    .link {
      margin-top: 20px;
      text-align: center;
    }
    a {
      color: #21CCE8;
      text-decoration: none;
      font-size: 18px;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${imageUrl}" alt="${title}" />
    <div class="link">
      <a href="${mainSiteUrl}/play/${playId}">View on Arrow Cloud →</a>
    </div>
  </div>
</body>
</html>`,
  };
}

async function handleImageGeneration(event: any) {
  const match = event.path.match(/^\/image\/(\d+)$/);
  const playId = parseInt(match![1], 10);

  // Parse query parameters
  const { primary, secondary } = parseLeaderboardParams(event.queryStringParameters);

  // Fetch play data to get userId for S3 key structure
  let playData;
  try {
    playData = await fetchPlayData(playId, primary, secondary);
  } catch (error) {
    console.error('Error fetching play data:', error);
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Play not found' }),
    };
  }

  if (!playData) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Play not found' }),
    };
  }

  // Generate S3 key based on userId, playId and parameters
  const s3Key = `plays/${playData.user.id}/${playId}/${primary}-${secondary}.jpg`;
  const bucketName = process.env.SHARE_IMAGES_BUCKET;

  // Check if cached image exists in S3
  if (bucketName) {
    try {
      console.log(`Checking S3 for cached image: ${s3Key}`);
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const s3Response = await s3Client.send(getCommand);
      if (s3Response.Body) {
        console.log(`Found cached image in S3, returning it`);
        const cachedBuffer = await streamToBuffer(s3Response.Body);
        const base64 = cachedBuffer.toString('base64');

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
            'X-Cache': 'HIT',
          },
          body: base64,
          isBase64Encoded: true,
        };
      }
    } catch (error: any) {
      if (error.name !== 'NoSuchKey') {
        console.warn('Error checking S3 cache:', error);
      }
      // Cache miss, continue to generate
      console.log(`Cache miss, generating new image`);
    }
  }

  try {
    console.log(`Generating image for play ${playId} (primary: ${primary}, secondary: ${secondary})`);
    const imageBuffer = await generatePlayImage(playId, primary, secondary);

    console.log(`Image generated: ${imageBuffer.length} bytes, type: ${typeof imageBuffer}, isBuffer: ${Buffer.isBuffer(imageBuffer)}`);

    // Ensure it's a proper Buffer
    const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);

    // Save to S3 cache
    if (bucketName) {
      try {
        console.log(`Saving image to S3: ${s3Key}`);
        const putCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: buffer,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=86400',
        });
        await s3Client.send(putCommand);
        console.log(`Image saved to S3 successfully`);
      } catch (error) {
        console.error('Error saving to S3:', error);
        // Continue even if S3 save fails
      }
    }

    const base64 = buffer.toString('base64');

    console.log(`Base64 length: ${base64.length}, first 50 chars: ${base64.substring(0, 50)}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
      body: base64,
      isBase64Encoded: true,
    };
  } catch (error: any) {
    console.error('Error generating image:', error);

    return {
      statusCode: error.message?.includes('Play not found') ? 404 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Failed to generate image',
      }),
    };
  }
}

// Helper function to convert stream to buffer
async function streamToBuffer(stream: any): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseLeaderboardParams(queryParams: any): { primary: string; secondary: string } {
  const validSystems = ['H.EX', 'EX', 'ITG'];

  const primaryParam = (queryParams?.p || 'EX').toUpperCase();
  const secondaryParam = (queryParams?.s || 'ITG').toUpperCase();

  // If either is invalid, use defaults for both
  const isValid = validSystems.includes(primaryParam) && validSystems.includes(secondaryParam);

  return {
    primary: isValid ? primaryParam : 'EX',
    secondary: isValid ? secondaryParam : 'ITG',
  };
}

function parseSessionParams(queryParams: any): { playIds: number[]; system: string } {
  const validSystems = ['H.EX', 'EX', 'ITG'];

  // Parse system parameter
  const systemParam = (queryParams?.system || 'EX').toUpperCase();
  const system = validSystems.includes(systemParam) ? systemParam : 'EX';

  // Parse plays parameter (comma-separated list of play IDs)
  const playsParam = queryParams?.plays || '';
  const playIds = playsParam
    .split(',')
    .map((id: string) => parseInt(id.trim(), 10))
    .filter((id: number) => !isNaN(id) && id > 0)
    .slice(0, 5); // Max 5 plays

  return { playIds, system };
}

async function handleSessionPage(event: any) {
  const match = event.path.match(/^\/session\/(\d+)$/);
  const sessionId = parseInt(match![1], 10);

  // Parse query parameters
  const { playIds, system } = parseSessionParams(event.queryStringParameters);

  if (playIds.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No plays specified. Use ?plays=1,2,3' }),
    };
  }

  // Fetch session data
  let sessionData;
  try {
    sessionData = await fetchSessionData(sessionId, playIds, system);
  } catch (error) {
    console.error('Error fetching session data:', error);
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Session not found' }),
    };
  }

  if (!sessionData) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Session not found' }),
    };
  }

  const userName = sessionData.user.alias || 'Player';
  const sessionDate = new Date(sessionData.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const title = `${userName} Session Highlights - ${sessionDate}`;

  // Calculate estimated image dimensions
  // Header ~68px, Info row varies by pack count, Play cards ~150px each + 12px gaps, Footer ~36px, Padding 40px
  const packCount = Math.min(sessionData.topPacks.length, 4);
  const infoRowHeight = packCount <= 2 ? 130 : 170; // Chart 85/110px + title + padding
  const estimatedHeight = 170 + infoRowHeight + sessionData.selectedPlays.length * 162;

  // Build image URL
  const baseUrl = event.requestContext?.domainName ? `https://${event.requestContext.domainName}/${event.requestContext.stage}` : '';
  const imageUrl = `${baseUrl}/session/image/${sessionId}?plays=${playIds.join(',')}&system=${system}`;
  const mainSiteUrl = process.env.MAIN_SITE_URL || 'https://arrowcloud.dance';

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=3600',
    },
    body: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Arrow Cloud</title>
  <meta property="og:image" content="${imageUrl}" />
  <meta property="og:image:width" content="700" />
  <meta property="og:image:height" content="${estimatedHeight}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${imageUrl}" />
  <meta name="twitter:title" content="${title}" />
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 900px;
      width: 100%;
    }
    img {
      width: 100%;
      border-radius: 8px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    .link {
      margin-top: 20px;
      text-align: center;
    }
    a {
      color: #21CCE8;
      text-decoration: none;
      font-size: 18px;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${imageUrl}" alt="${title}" />
    <div class="link">
      <a href="${mainSiteUrl}/session/${sessionId}">View on Arrow Cloud →</a>
    </div>
  </div>
</body>
</html>`,
  };
}

async function handleSessionImageGeneration(event: any) {
  const match = event.path.match(/^\/session\/image\/(\d+)$/);
  const sessionId = parseInt(match![1], 10);

  // Parse query parameters
  const { playIds, system } = parseSessionParams(event.queryStringParameters);

  if (playIds.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No plays specified. Use ?plays=1,2,3' }),
    };
  }

  // Fetch session data to get userId for S3 key structure
  let sessionData;
  try {
    sessionData = await fetchSessionData(sessionId, playIds, system);
  } catch (error) {
    console.error('Error fetching session data:', error);
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Session not found' }),
    };
  }

  if (!sessionData) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Session not found' }),
    };
  }

  // Generate S3 key based on userId, sessionId and parameters
  const playIdsStr = playIds.sort((a, b) => a - b).join('-');
  const s3Key = `sessions/${sessionData.user.id}/${sessionId}/${system}-${playIdsStr}.jpg`;
  const bucketName = process.env.SHARE_IMAGES_BUCKET;

  // Check if cached image exists in S3
  if (bucketName) {
    try {
      console.log(`Checking S3 for cached session image: ${s3Key}`);
      const getCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
      });

      const s3Response = await s3Client.send(getCommand);
      if (s3Response.Body) {
        console.log(`Found cached session image in S3, returning it`);
        const cachedBuffer = await streamToBuffer(s3Response.Body);
        const base64 = cachedBuffer.toString('base64');

        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
            'X-Cache': 'HIT',
          },
          body: base64,
          isBase64Encoded: true,
        };
      }
    } catch (error: any) {
      if (error.name !== 'NoSuchKey') {
        console.warn('Error checking S3 cache:', error);
      }
      // Cache miss, continue to generate
      console.log(`Cache miss, generating new session image`);
    }
  }

  try {
    console.log(`Generating session image for session ${sessionId} (system: ${system}, plays: ${playIds.join(',')})`);
    const imageBuffer = await generateSessionImage(sessionData);

    console.log(`Session image generated: ${imageBuffer.length} bytes`);

    // Ensure it's a proper Buffer
    const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);

    // Save to S3 cache
    if (bucketName) {
      try {
        console.log(`Saving session image to S3: ${s3Key}`);
        const putCommand = new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: buffer,
          ContentType: 'image/jpeg',
          CacheControl: 'public, max-age=86400',
        });
        await s3Client.send(putCommand);
        console.log(`Session image saved to S3 successfully`);
      } catch (error) {
        console.error('Error saving session image to S3:', error);
        // Continue even if S3 save fails
      }
    }

    const base64 = buffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'MISS',
      },
      body: base64,
      isBase64Encoded: true,
    };
  } catch (error: any) {
    console.error('Error generating session image:', error);

    return {
      statusCode: error.message?.includes('not found') ? 404 : 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error.message || 'Failed to generate image',
      }),
    };
  }
}
