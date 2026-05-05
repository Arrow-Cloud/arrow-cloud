/**
 * Local verification that escapeHtml/safeUrl neutralize the injection payloads
 * we built earlier. Renders the share-service template with a malicious play
 * object and checks that the dangerous markup is HTML-encoded (not live).
 *
 * Run from repo root:
 *   npx tsx --tsconfig share-service/tsconfig.json scripts/repro/verify-share-escape.ts
 */
import { generateImageHTML } from '../../share-service/src/utils/image-template';

const INJECTION_ARTIST =
  '</div><div style="position:fixed;top:50%;left:50%;background:#fff;color:#000;padding:18px;z-index:99999">arrow-cloud.local says XSS</div><div>';

const JS_PROOF_ARTIST = '</div><img src=x onerror="document.title=\'PWNED\'"><div>';

const fakePlay: any = {
  id: 1,
  user: { id: 'u', alias: 'tester', profileImageUrl: null },
  chart: {
    bannerUrl: null,
    title: 'InjectionChart',
    artist: INJECTION_ARTIST,
    description: '<script>alert(1)</script>',
    credit: '"><img src=x onerror=alert(2)>',
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
  const html = await generateImageHTML(fakePlay);

  const checks = [
    {
      label: 'markup-injection ARTIST is encoded',
      bad: '</div><div style="position:fixed',
      good: '&lt;/div&gt;&lt;div style=&#61;&quot;position:fixed',
    },
    {
      label: 'js-proof <img onerror> would be encoded if used',
      bad: '<img src=x onerror=',
      good: '&lt;img src=x onerror=',
    },
    {
      label: 'description <script> is encoded',
      bad: '<script>alert(1)</script>',
      good: '&lt;script&gt;alert(1)&lt;/script&gt;',
    },
    {
      label: 'credit attribute breakout is encoded',
      bad: '"><img src=x onerror=alert(2)>',
      good: '&quot;&gt;&lt;img src=x onerror=alert(2)&gt;',
    },
  ];

  // Replace artist with the JS-proof payload and re-render to check that case too.
  const html2 = await generateImageHTML({ ...fakePlay, chart: { ...fakePlay.chart, artist: JS_PROOF_ARTIST } });

  let pass = 0;
  let fail = 0;
  for (const c of checks) {
    const target = c.label.includes('js-proof') ? html2 : html;
    const live = target.includes(c.bad);
    // Security property: the dangerous string must not appear verbatim in output.
    if (!live) {
      console.log(`  ✓ ${c.label} (payload not rendered as live HTML)`);
      pass++;
    } else {
      console.log(`  ✗ ${c.label} — DANGEROUS: payload rendered live!`);
      // Show context around the live payload for debugging
      const idx = target.indexOf(c.bad);
      console.log(`    context: ...${target.slice(Math.max(0, idx - 40), idx + c.bad.length + 40)}...`);
      fail++;
    }
  }
  // Sanity: ensure HTML entity encoding was applied somewhere we expect
  const sawEncoding = html.includes('&lt;') && html.includes('&quot;');
  console.log(`  ${sawEncoding ? '✓' : '✗'} HTML entity encoding applied to artist/credit`);
  if (!sawEncoding) fail++;
  else pass++;
  console.log(`\n${pass}/${pass + fail} checks passed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
