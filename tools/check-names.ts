/**
 * Re-checks the curated clubs and spare towns against real clubs.
 *
 *   npx tsx tools/check-names.ts            offline: embedded real-club list
 *   npx tsx tools/check-names.ts --online   also asks Wikipedia whether a page
 *                                           with each town's name exists
 */
import { REAL_CLUBS } from '../src/sports/football/data/blocklist';
import { CURATED_CLUBS, SPARE_TOWNS } from '../src/sports/football/data/clubs';
import { displayName, editDistance, isBlocked } from '../src/sports/football/names';

const towns = [...CURATED_CLUBS.map((c) => c.town), ...SPARE_TOWNS];
const realSingles = REAL_CLUBS.split('\n').filter((n) => !n.includes(' '));
const problems: string[] = [];

for (const c of CURATED_CLUBS) {
  if (isBlocked(displayName(c.town, c.suffix))) problems.push(`${displayName(c.town, c.suffix)}: blocked`);
}
for (const town of towns) {
  const t = town.toLowerCase();
  const near = realSingles.find((r) => editDistance(t, r, 1) <= 1);
  if (near) problems.push(`${town}: one letter from real club "${near}"`);
}

async function online(): Promise<void> {
  for (let i = 0; i < towns.length; i += 50) {
    const batch = towns.slice(i, i + 50);
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&titles=${encodeURIComponent(batch.join('|'))}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'SidelineNameCheck/0.1 (dev tool)' } });
    if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
    const data = (await res.json()) as { query: { pages: { title: string; missing?: boolean }[] } };
    for (const page of data.query.pages) if (!page.missing) problems.push(`${page.title}: has a Wikipedia page (may be a real place)`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const run = process.argv.includes('--online') ? online() : Promise.resolve();
run.then(() => {
  console.log(`Checked ${CURATED_CLUBS.length} clubs and ${SPARE_TOWNS.length} spare towns.`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log(problems.length ? `${problems.length} problem(s)` : 'All clear.');
  process.exitCode = problems.length ? 1 : 0;
});
