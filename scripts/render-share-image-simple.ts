/**
 * Script to generate a share image for a play using the share-service code
 * Usage: npx tsx scripts/render-share-image-simple.ts <playId> [outputPath]
 */

import { generatePlayImage } from '../share-service/src/services/image-generator';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const playId = parseInt(process.argv[2], 10);
  const outputPath = process.argv[3] || `output/${playId}.png`;

  if (!playId || isNaN(playId)) {
    console.error('Usage: npx tsx scripts/render-share-image-simple.ts <playId> [outputPath]');
    process.exit(1);
  }

  console.log(`Generating share image for play ${playId}...`);

  try {
    const imageBuffer = await generatePlayImage(playId);
    
    const fullPath = resolve(outputPath);
    writeFileSync(fullPath, imageBuffer);
    
    console.log(`✓ Image saved to: ${fullPath}`);
  } catch (error) {
    console.error('Error generating image:', error);
    process.exit(1);
  }
}

main();
