import { PrismaClient } from '../api/prisma/generated/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

interface CountryData {
  name: string;
  code: string;
}

// usage: npx tsx scripts/load-countries.ts
(async () => {
  console.log('Loading countries data...');

  // Read the countries JSON file
  const countriesPath = join(__dirname, 'data', 'countries.json');
  const countriesData: CountryData[] = JSON.parse(readFileSync(countriesPath, 'utf8'));

  console.log(`Found ${countriesData.length} countries to load`);

  // Remove duplicates by code (some countries appear twice with different names)
  const uniqueCountries = new Map<string, CountryData>();
  for (const country of countriesData) {
    if (!uniqueCountries.has(country.code)) {
      uniqueCountries.set(country.code, country);
    }
  }

  const uniqueCountriesArray = Array.from(uniqueCountries.values());
  console.log(`After deduplication: ${uniqueCountriesArray.length} unique countries`);

  // Use upsert to insert or update countries
  let created = 0;
  let updated = 0;

  for (const country of uniqueCountriesArray) {
    await prisma.country.upsert({
      where: { code: country.code },
      update: {
        name: country.name,
      },
      create: {
        name: country.name,
        code: country.code,
      },
    });

    // Check if it was created or updated by trying to find if it existed before
    const existingCount = await prisma.country.count({
      where: {
        code: country.code,
        createdAt: { lt: new Date(Date.now() - 1000) }, // Created more than 1 second ago
      },
    });

    if (existingCount > 0) {
      updated++;
    } else {
      created++;
    }
  }

  console.log(`Successfully processed countries:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Total: ${created + updated}`);
})();
