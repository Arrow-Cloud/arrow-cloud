import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { fetchPlayData } from './play-data';
import { SessionData } from './session-data';
import { generateImageHTML } from '../utils/image-template';
import { generateSessionImageHTML } from '../utils/session-image-template';
import { extractBannerColors } from '../utils/color-extractor';
import { execSync } from 'child_process';
import * as fs from 'fs';

// Find Chrome executable in local development
function findChromeExecutable(): string {
  const possiblePaths = ['/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome', '/snap/bin/chromium', process.env.CHROME_PATH].filter(
    Boolean,
  ) as string[];

  // Try to find Chrome using 'which' command
  try {
    const whichResult = execSync('which chromium-browser chromium google-chrome 2>/dev/null', { encoding: 'utf8' }).trim();
    if (whichResult) {
      return whichResult.split('\n')[0];
    }
  } catch {
    // Ignore error
  }

  // Fallback to checking known paths
  for (const path of possiblePaths) {
    try {
      if (fs.existsSync(path)) {
        return path;
      }
    } catch {
      continue;
    }
  }

  throw new Error('Chrome/Chromium not found. Please install chromium-browser or set CHROME_PATH environment variable.');
}

export async function generatePlayImage(playId: number, primarySystem: string = 'EX', secondarySystem: string = 'ITG'): Promise<Buffer> {
  const play = await fetchPlayData(playId, primarySystem, secondarySystem);

  if (!play) {
    throw new Error(`Play not found: ${playId}`);
  }

  console.log(`Generating play image for: ${play.user.alias} - ${play.chart.title}`);
  const html = await generateImageHTML(play);

  // Use local Chromium in development, @sparticuz/chromium in Lambda container
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  const browser = await puppeteer.launch({
    args: isLambda ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 880, height: 800 },
    executablePath: isLambda ? await chromium.executablePath() : findChromeExecutable(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 880, height: 800 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    await page.evaluate(() => document.fonts.ready);

    // Extract colors from banner if available
    if (play.chart.bannerUrl) {
      const [color1, color2] = await extractBannerColors(page, play.chart.bannerUrl);

      // Update the gradient in the page
      await page.evaluate(
        (c1, c2) => {
          document.body.style.background = `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`;
        },
        color1,
        color2,
      );
    }

    // Wait for all images to load
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.onload = img.onerror = resolve;
              }),
          ),
      );
    });

    // Wait for Chart.js to load and render if chart exists
    if (play.timingData && play.timingData.length > 0) {
      await page.waitForFunction('typeof window.Chart !== "undefined"', { timeout: 10000 }).catch(() => {
        console.warn('Chart.js did not load, continuing without chart');
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    const screenshot = (await page.screenshot({
      type: 'jpeg',
      quality: 95,
      omitBackground: false,
    })) as Buffer;

    console.log(`Play image generated (${(screenshot.length / 1024 / 1024).toFixed(2)} MB)`);
    return screenshot;
  } finally {
    await browser.close();
  }
}

export async function generateSessionImage(session: SessionData): Promise<Buffer> {
  console.log(`Generating session image for: ${session.user.alias} - Session ${session.id}`);

  const html = generateSessionImageHTML(session);

  // Use local Chromium in development, @sparticuz/chromium in Lambda container
  const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  const browser = await puppeteer.launch({
    args: isLambda ? chromium.args : ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 700, height: 1200 }, // Initial height, will be adjusted
    executablePath: isLambda ? await chromium.executablePath() : findChromeExecutable(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 700, height: 1200 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

    await page.evaluate(() => document.fonts.ready);

    // Wait for all images to load
    await page.evaluate(() => {
      return Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.onload = img.onerror = resolve;
              }),
          ),
      );
    });

    // Wait for Chart.js charts to render
    await page.waitForFunction('typeof window.Chart !== "undefined" && window.__chartsReady === true', { timeout: 10000 }).catch(() => {
      console.warn('Chart.js did not load, continuing without chart');
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewport({ width: 700, height: bodyHeight });

    const screenshot = (await page.screenshot({
      type: 'jpeg',
      quality: 98,
      omitBackground: false,
    })) as Buffer;

    console.log(`Session image generated (${(screenshot.length / 1024 / 1024).toFixed(2)} MB)`);
    return screenshot;
  } finally {
    await browser.close();
  }
}
