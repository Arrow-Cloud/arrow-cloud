/**
 * Render the share-service template with a malicious chart payload using BOTH
 * the pre-fix (HEAD) version and the current (fixed) version, write each HTML
 * to disk, then write a tiny harness for Playwright to load them.
 *
 * Run from repo root:
 *   npx tsx --tsconfig share-service/tsconfig.json scripts/repro/render-share-before-after.ts
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { generateImageHTML as generateFixed } from '../../share-service/src/utils/image-template';
import { generateImageHTML as generateBefore } from './image-template.before';

const POPUP_ARTIST =
  '</div><div id="injected-popup" style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:1px solid #888;border-radius:6px;padding:18px 22px;box-shadow:0 12px 48px rgba(0,0,0,.55);font:14px system-ui,sans-serif;color:#000;z-index:99999;min-width:340px"><div style="font-weight:600;font-size:15px;margin-bottom:6px">arrow-cloud.local says</div><div style="margin-bottom:14px">XSS via chart metadata</div><div style="text-align:right"><span style="display:inline-block;background:#1a73e8;color:#fff;padding:6px 18px;border-radius:3px">OK</span></div></div><div>';

const fakePlay: any = {
  id: 1,
  user: { id: 'u', alias: 'tester', profileImageUrl: null },
  chart: {
    bannerUrl: null,
    title: 'InjectionChart',
    artist: POPUP_ARTIST,
    description: 'pwn',
    credit: '',
    stepsType: 'dance-single',
    difficulty: 'Beginner',
    meter: 1,
  },
  primaryScore: { system: 'EX', percent: 0, grade: null, judgments: {} },
  secondaryScore: null,
  timingStats: null,
  timingData: [],
  radar: null,
  playedAt: new Date().toISOString(),
  modifiers: null,
};

(async () => {
  const outDir = 'D:/github/arrow-cloud/share-service/.repro-out';
  mkdirSync(outDir, { recursive: true });

  const beforeHtml = await generateBefore(fakePlay);
  const afterHtml = await generateFixed(fakePlay);

  writeFileSync(join(outDir, 'before.html'), beforeHtml);
  writeFileSync(join(outDir, 'after.html'), afterHtml);

  console.log('wrote', outDir + '/before.html  (', beforeHtml.length, 'bytes )');
  console.log('wrote', outDir + '/after.html   (', afterHtml.length, 'bytes )');
})();
