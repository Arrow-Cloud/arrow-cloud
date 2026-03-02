/**
 * Point scaling simulator for Blue Shift leaderboards
 *
 * This script simulates a leaderboard with a configurable number of participants
 * and shows the point value for each position using different scaling formulas.
 */

/**
 * Current exponential decay formula
 */
function exponentialDecay(rank: number, maxPoints: number = 10000, decayRate: number = 0.167): number {
  if (rank <= 0) return 0;
  const points = maxPoints * Math.exp(-decayRate * (rank - 1));
  return Math.max(1, Math.round(points));
}

/**
 * Alternative: Power decay (slower falloff)
 */
function powerDecay(rank: number, maxPoints: number = 10000, exponent: number = 0.5): number {
  if (rank <= 0) return 0;
  const points = maxPoints * Math.pow(rank, -exponent);
  return Math.max(1, Math.round(points));
}

/**
 * Alternative: Linear decay
 */
function linearDecay(rank: number, maxPoints: number = 10000, minPoints: number = 100, totalParticipants: number = 25): number {
  if (rank <= 0) return 0;
  if (rank > totalParticipants) return minPoints;
  const pointsPerRank = (maxPoints - minPoints) / (totalParticipants - 1);
  return Math.max(minPoints, Math.round(maxPoints - pointsPerRank * (rank - 1)));
}

/**
 * Alternative: Logarithmic decay (gentle curve)
 */
function logarithmicDecay(rank: number, maxPoints: number = 10000, scale: number = 5): number {
  if (rank <= 0) return 0;
  const points = maxPoints / (1 + Math.log(rank) / Math.log(scale));
  return Math.max(1, Math.round(points));
}

// Configuration
const PARTICIPANTS = 25;
const MAX_POINTS = 10000;

console.log('Blue Shift Point Scaling Simulator');
console.log('==================================\n');
console.log(`Simulating ${PARTICIPANTS} participants with max points: ${MAX_POINTS}\n`);

// Show current system
console.log('CURRENT SYSTEM: Exponential Decay (decayRate = 0.167)');
console.log('Rank | Points | % of 1st | Difference from prev');
console.log('-----|--------|----------|---------------------');
let prevPoints = 0;
for (let rank = 1; rank <= PARTICIPANTS; rank++) {
  const points = exponentialDecay(rank, MAX_POINTS, 0.167);
  const percentOfFirst = rank === 1 ? 100 : (points / exponentialDecay(1, MAX_POINTS, 0.167)) * 100;
  const diff = rank === 1 ? '-' : (prevPoints - points).toString();
  console.log(
    `${rank.toString().padStart(4)} | ${points.toString().padStart(6)} | ${percentOfFirst.toFixed(1).padStart(8)}% | ${diff.toString().padStart(19)}`,
  );
  prevPoints = points;
}

console.log('\n---\n');

// Show alternative: Gentler exponential decay
console.log('ALTERNATIVE 1: Gentler Exponential Decay (decayRate = 0.08)');
console.log('Rank | Points | % of 1st | Difference from prev');
console.log('-----|--------|----------|---------------------');
prevPoints = 0;
for (let rank = 1; rank <= PARTICIPANTS; rank++) {
  const points = exponentialDecay(rank, MAX_POINTS, 0.08);
  const percentOfFirst = rank === 1 ? 100 : (points / exponentialDecay(1, MAX_POINTS, 0.08)) * 100;
  const diff = rank === 1 ? '-' : (prevPoints - points).toString();
  console.log(
    `${rank.toString().padStart(4)} | ${points.toString().padStart(6)} | ${percentOfFirst.toFixed(1).padStart(8)}% | ${diff.toString().padStart(19)}`,
  );
  prevPoints = points;
}

console.log('\n---\n');

// Show power decay
console.log('ALTERNATIVE 2: Power Decay (exponent = 0.5)');
console.log('Rank | Points | % of 1st | Difference from prev');
console.log('-----|--------|----------|---------------------');
prevPoints = 0;
for (let rank = 1; rank <= PARTICIPANTS; rank++) {
  const points = powerDecay(rank, MAX_POINTS, 0.5);
  const percentOfFirst = rank === 1 ? 100 : (points / powerDecay(1, MAX_POINTS, 0.5)) * 100;
  const diff = rank === 1 ? '-' : (prevPoints - points).toString();
  console.log(
    `${rank.toString().padStart(4)} | ${points.toString().padStart(6)} | ${percentOfFirst.toFixed(1).padStart(8)}% | ${diff.toString().padStart(19)}`,
  );
  prevPoints = points;
}

console.log('\n---\n');

// Show logarithmic decay
console.log('ALTERNATIVE 3: Logarithmic Decay (scale = 3)');
console.log('Rank | Points | % of 1st | Difference from prev');
console.log('-----|--------|----------|---------------------');
prevPoints = 0;
for (let rank = 1; rank <= PARTICIPANTS; rank++) {
  const points = logarithmicDecay(rank, MAX_POINTS, 3);
  const percentOfFirst = rank === 1 ? 100 : (points / logarithmicDecay(1, MAX_POINTS, 3)) * 100;
  const diff = rank === 1 ? '-' : (prevPoints - points).toString();
  console.log(
    `${rank.toString().padStart(4)} | ${points.toString().padStart(6)} | ${percentOfFirst.toFixed(1).padStart(8)}% | ${diff.toString().padStart(19)}`,
  );
  prevPoints = points;
}

console.log('\n---\n');

// Show linear decay
console.log('ALTERNATIVE 4: Linear Decay (min points = 100)');
console.log('Rank | Points | % of 1st | Difference from prev');
console.log('-----|--------|----------|---------------------');
prevPoints = 0;
for (let rank = 1; rank <= PARTICIPANTS; rank++) {
  const points = linearDecay(rank, MAX_POINTS, 100, PARTICIPANTS);
  const percentOfFirst = rank === 1 ? 100 : (points / linearDecay(1, MAX_POINTS, 100, PARTICIPANTS)) * 100;
  const diff = rank === 1 ? '-' : (prevPoints - points).toString();
  console.log(
    `${rank.toString().padStart(4)} | ${points.toString().padStart(6)} | ${percentOfFirst.toFixed(1).padStart(8)}% | ${diff.toString().padStart(19)}`,
  );
  prevPoints = points;
}

console.log('\n==================================');
console.log('SUMMARY');
console.log('==================================\n');

const systems = [
  { name: 'Current (exp 0.167)', func: (r: number) => exponentialDecay(r, MAX_POINTS, 0.167) },
  { name: 'Gentler Exp (0.08)', func: (r: number) => exponentialDecay(r, MAX_POINTS, 0.08) },
  { name: 'Gentlest Exp (0.05)', func: (r: number) => exponentialDecay(r, MAX_POINTS, 0.05) },
  { name: 'Gentlester Exp (0.025)', func: (r: number) => exponentialDecay(r, MAX_POINTS, 0.025) },
];

console.log('Points at key positions:');
console.log('System              | 1st    | 2nd    | 5th    | 10th   | 25th');
console.log('--------------------|--------|--------|--------|--------|--------');

for (const system of systems) {
  const pts = [1, 2, 5, 10, 25].map((r) => system.func(r).toString().padStart(6));
  console.log(`${system.name.padEnd(19)} | ${pts.join(' | ')}`);
}

console.log('\nTo adjust the formulas, edit this script and modify the parameters in each function.');
console.log('Then run: npx tsx scripts/simulate-point-scaling.ts\n');
