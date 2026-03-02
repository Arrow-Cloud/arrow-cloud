import { Page } from 'puppeteer-core';

/**
 * Extract dominant colors from an image URL using Canvas API in the browser
 * Returns two colors suitable for a dark gradient background
 */
export async function extractBannerColors(page: Page, imageUrl: string): Promise<[string, string]> {
  try {
    const colors = await page.evaluate((url) => {
      return new Promise<[string, string]>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(['#0f172a', '#1e293b']);
              return;
            }
            
            // Sample at reduced size for performance
            const sampleWidth = 100;
            const sampleHeight = Math.floor((img.height / img.width) * sampleWidth);
            canvas.width = sampleWidth;
            canvas.height = sampleHeight;
            
            ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
            const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
            const pixels = imageData.data;
            
            // Color buckets for clustering with saturation tracking
            const colorCounts: Map<string, { r: number; g: number; b: number; count: number; saturation: number }> = new Map();
            
            // Sample every 4th pixel for performance
            for (let i = 0; i < pixels.length; i += 16) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];
              const a = pixels[i + 3];
              
              // Skip transparent and very dark/light pixels
              if (a < 128 || (r < 20 && g < 20 && b < 20) || (r > 235 && g > 235 && b > 235)) {
                continue;
              }
              
              // Calculate saturation (HSV)
              const rNorm = r / 255;
              const gNorm = g / 255;
              const bNorm = b / 255;
              const max = Math.max(rNorm, gNorm, bNorm);
              const min = Math.min(rNorm, gNorm, bNorm);
              const saturation = max === 0 ? 0 : (max - min) / max;
              
              // Skip very desaturated (gray) colors
              if (saturation < 0.2) {
                continue;
              }
              
              // Bucket colors into ranges for clustering
              const bucketSize = 32;
              const rBucket = Math.floor(r / bucketSize) * bucketSize;
              const gBucket = Math.floor(g / bucketSize) * bucketSize;
              const bBucket = Math.floor(b / bucketSize) * bucketSize;
              const key = `${rBucket},${gBucket},${bBucket}`;
              
              if (colorCounts.has(key)) {
                const existing = colorCounts.get(key)!;
                existing.r += r;
                existing.g += g;
                existing.b += b;
                existing.saturation += saturation;
                existing.count += 1;
              } else {
                colorCounts.set(key, { r, g, b, count: 1, saturation });
              }
            }
            
            if (colorCounts.size === 0) {
              resolve(['#0f172a', '#1e293b']);
              return;
            }
            
            // Score colors by both saturation and frequency
            const scoredColors = Array.from(colorCounts.values())
              .map(cluster => ({
                ...cluster,
                avgSaturation: cluster.saturation / cluster.count,
                // Weight saturation heavily (70%) and frequency moderately (30%)
                score: (cluster.saturation / cluster.count) * 0.7 + (cluster.count / pixels.length) * 0.3
              }))
              .sort((a, b) => b.score - a.score);
            
            if (scoredColors.length === 0) {
              resolve(['#0f172a', '#1e293b']);
              return;
            }
            
            // Get the most vibrant color
            const topColor = scoredColors[0];
            
            // Find a second color that's sufficiently different from the first
            let secondColor = scoredColors[1];
            const minColorDistance = 100; // Minimum euclidean distance in RGB space
            
            for (let i = 1; i < scoredColors.length && i < 10; i++) {
              const candidate = scoredColors[i];
              const avgR1 = topColor.r / topColor.count;
              const avgG1 = topColor.g / topColor.count;
              const avgB1 = topColor.b / topColor.count;
              const avgR2 = candidate.r / candidate.count;
              const avgG2 = candidate.g / candidate.count;
              const avgB2 = candidate.b / candidate.count;
              
              const distance = Math.sqrt(
                Math.pow(avgR1 - avgR2, 2) + 
                Math.pow(avgG1 - avgG2, 2) + 
                Math.pow(avgB1 - avgB2, 2)
              );
              
              if (distance >= minColorDistance) {
                secondColor = candidate;
                break;
              }
            }
            
            // Average the colors in each cluster
            const avgColors = [topColor, secondColor].filter(Boolean).map(cluster => {
              const r = Math.floor(cluster.r / cluster.count);
              const g = Math.floor(cluster.g / cluster.count);
              const b = Math.floor(cluster.b / cluster.count);
              return { r, g, b };
            });
            
            // Darken colors for background use
            const darken = (color: { r: number; g: number; b: number }, amount: number) => {
              const r = Math.floor(color.r * amount);
              const g = Math.floor(color.g * amount);
              const b = Math.floor(color.b * amount);
              return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            };
            
            const color1 = darken(avgColors[0], 0.3);
            const color2 = avgColors[1] ? darken(avgColors[1], 0.35) : darken(avgColors[0], 0.25);
            
            resolve([color1, color2]);
          } catch (err) {
            console.error('Color extraction error:', err);
            resolve(['#0f172a', '#1e293b']);
          }
        };
        
        img.onerror = () => {
          resolve(['#0f172a', '#1e293b']);
        };
        
        img.src = url;
      });
    }, imageUrl);
    
    return colors;
  } catch (error) {
    console.warn('[Color Extractor] Failed to extract colors:', error);
    return ['#0f172a', '#1e293b'];
  }
}
