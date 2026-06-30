/**
 * Set cmodIneligible = true on SimfileChart rows matching the given chart hashes.
 *
 * Usage:
 *   npx ts-node scripts/set-cmod-ineligible-charts.ts <hash1> [hash2] ...
 *
 * To clear the flag on specific hashes, pass --clear:
 *   npx ts-node scripts/set-cmod-ineligible-charts.ts --clear <hash1> [hash2] ...
 *
 * To list all currently flagged charts:
 *   npx ts-node scripts/set-cmod-ineligible-charts.ts --list
 */
import { PrismaClient } from '../api/prisma/generated/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--list') {
    const flagged = await prisma.simfileChart.findMany({
      where: { cmodIneligible: true },
      select: { chartHash: true, difficulty: true, simfileId: true },
      orderBy: { chartHash: 'asc' },
    });
    if (flagged.length === 0) {
      console.log('No charts are currently flagged as CMOD-ineligible.');
    } else {
      console.log(`${flagged.length} chart(s) flagged as CMOD-ineligible:`);
      for (const row of flagged) {
        console.log(`  ${row.chartHash}  difficulty=${row.difficulty ?? '?'}  simfileId=${row.simfileId}`);
      }
    }
    return;
  }

  const clear = args[0] === '--clear';
  const hashes = clear ? args.slice(1) : args;

  if (hashes.length === 0) {
    console.error('Usage: set-cmod-ineligible-charts.ts [--clear] <hash1> [hash2] ...');
    console.error('       set-cmod-ineligible-charts.ts --list');
    process.exit(1);
  }

  const result = await prisma.simfileChart.updateMany({
    where: { chartHash: { in: hashes } },
    data: { cmodIneligible: !clear },
  });

  const action = clear ? 'cleared' : 'set';
  console.log(`cmodIneligible ${action} on ${result.count} SimfileChart row(s) for ${hashes.length} hash(es).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
