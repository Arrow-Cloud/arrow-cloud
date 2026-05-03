/*
 * Test script for QR/device login flow.
 *
 * Usage:
 *   npx tsx scripts/test-device-login.ts
 *   npx tsx scripts/test-device-login.ts --base-url https://api.arrowcloud.dance --machine-label "Cab 1"
 *
 * Optional flags:
 *   --base-url <url>         API base URL (default: $API_BASE_URL or https://api.arrowcloud.dance)
 *   --machine-label <text>   Optional machine label shown on approval page
 *   --client-version <text>  Optional game client version
 *   --theme-version <text>   Optional theme version
 *   --interval <seconds>     Poll interval override (default: server value or 3)
 *   --timeout <seconds>      Max runtime before giving up (default: 300)
 */

interface StartResponse {
  sessionId: string;
  shortCode: string;
  pollToken: string;
  pollIntervalSeconds: number;
  expiresAt: string;
  verificationUrl: string;
}

interface PollResponse {
  status: 'pending' | 'approved' | 'consumed' | 'cancelled' | 'expired';
  pollIntervalSeconds?: number;
  apiKey?: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function printUsage(): void {
  console.log('Device Login Test Script');
  console.log('========================\n');
  console.log('Usage:');
  console.log('  npx tsx scripts/test-device-login.ts [options]\n');
  console.log('Options:');
  console.log('  --base-url <url>         API base URL');
  console.log('  --machine-label <text>   Optional machine label');
  console.log('  --client-version <text>  Optional game client version');
  console.log('  --theme-version <text>   Optional theme version');
  console.log('  --interval <seconds>     Poll interval override');
  console.log('  --timeout <seconds>      Timeout before exit (default: 300)');
  console.log('  --help                   Show this message');
}

(async () => {
  if (hasArg('--help')) {
    printUsage();
    process.exit(0);
  }

  const baseUrl = getArg('--base-url') || process.env.API_BASE_URL || 'https://api.arrowcloud.dance';
  const machineLabel = getArg('--machine-label');
  const clientVersion = getArg('--client-version');
  const themeVersion = getArg('--theme-version');
  const intervalOverride = Number(getArg('--interval') || '0');
  const timeoutSeconds = Number(getArg('--timeout') || '300');

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    console.error('Invalid --timeout value. Must be a positive number.');
    process.exit(1);
  }

  const startedAt = Date.now();

  try {
    console.log('Starting device-login session...');

    const startRes = await fetch(`${baseUrl}/device-login/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        machineLabel,
        clientVersion,
        themeVersion,
      }),
    });

    const startBodyText = await startRes.text();
    const startBody = startBodyText ? (JSON.parse(startBodyText) as StartResponse & { error?: string }) : ({} as StartResponse);

    if (!startRes.ok) {
      console.error('Failed to start device login:', startRes.status, startBody?.error || startBodyText);
      process.exit(1);
    }

    const session = startBody as StartResponse;

    console.log('\nSession started successfully.');
    console.log('Session ID:      ', session.sessionId);
    console.log('Short code:      ', session.shortCode);
    console.log('Expires at:      ', session.expiresAt);
    console.log('Verification URL:', session.verificationUrl);
    console.log('\nNext step: open the verification URL in a browser, sign in, and approve.\n');

    let pollIntervalSeconds = intervalOverride > 0 ? intervalOverride : session.pollIntervalSeconds || 3;
    let lastStatus: string | null = null;

    while (true) {
      const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsedSeconds > timeoutSeconds) {
        console.error(`Timed out after ${timeoutSeconds}s waiting for approval/consumption.`);
        process.exit(2);
      }

      const pollRes = await fetch(`${baseUrl}/device-login/poll`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          pollToken: session.pollToken,
        }),
      });

      const pollBodyText = await pollRes.text();
      const pollBody = pollBodyText ? (JSON.parse(pollBodyText) as PollResponse) : ({ status: 'pending' } as PollResponse);

      if (!pollRes.ok && pollRes.status !== 410) {
        console.error('Polling request failed:', pollRes.status, pollBodyText);
        process.exit(1);
      }

      const status = pollBody.status;
      if (status !== lastStatus) {
        console.log(`[${new Date().toISOString()}] status=${status}`);
        lastStatus = status;
      }

      if (status === 'pending') {
        if (typeof pollBody.pollIntervalSeconds === 'number' && pollBody.pollIntervalSeconds > 0) {
          pollIntervalSeconds = intervalOverride > 0 ? intervalOverride : pollBody.pollIntervalSeconds;
        }
      }

      if (status === 'approved') {
        // Keep polling until consumed to receive one-time apiKey payload.
      } else if (status === 'consumed') {
        if (pollBody.apiKey) {
          console.log('\nSuccess: received API key from consumed session.');
          console.log('API key:', pollBody.apiKey);
          console.log('\nArrowCloud.ini content:');
          console.log('[ArrowCloud]');
          console.log(`ApiKey=${pollBody.apiKey}`);
          process.exit(0);
        }

        console.log('\nSession already consumed, but no API key returned (likely already consumed previously).');
        process.exit(3);
      } else if (status === 'cancelled') {
        console.error('\nSession was cancelled.');
        process.exit(4);
      } else if (status === 'expired') {
        console.error('\nSession expired before completion.');
        process.exit(5);
      }

      await sleep(pollIntervalSeconds * 1000);
    }
  } catch (error) {
    console.error('Unexpected error in device-login test script:', error);
    process.exit(1);
  }
})();
