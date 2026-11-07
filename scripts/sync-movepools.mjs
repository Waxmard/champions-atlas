import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Generations } from '@smogon/calc/dist/data/index.js';

const output = resolve('src/lib/data/movepools.json');
const rosterFiles = ['a', 'b', 'c'].map((suffix) =>
  resolve(`scripts/data/champions-m-${suffix}.json`)
);
const ifMissing = process.argv.includes('--if-missing');

async function rosterIds() {
  const names = new Set();
  for (const file of rosterFiles) {
    const data = JSON.parse(await readFile(file, 'utf8'));
    for (const entry of Object.values(data.pokemon).flat()) names.add(entry);
  }
  return [...names];
}

async function main() {
  if (ifMissing) {
    const existing = await readFile(output, 'utf8').catch(() => null);
    if (existing) {
      console.log('[movepools] using existing file');
      return;
    }
  }
  const { Dex } = await import('@pkmn/dex');
  const dex = Dex.forGen(9);
  const generation = Generations.get(9);
  const result = {};
  let skipped = 0;
  let moveCount = 0;
  for (const name of await rosterIds()) {
    const data = await dex.learnsets.get(name);
    const entries = data?.learnset ?? {};
    const hasGen9 = Object.values(entries).some((sources) =>
      sources?.some((source) => source.startsWith('9'))
    );
    const moves = [];
    for (const [id, sources] of Object.entries(entries)) {
      if (
        !sources?.length ||
        (hasGen9 && !sources.some((source) => source.startsWith('9')))
      )
        continue;
      const move = generation.moves.get(id);
      if (move) moves.push(move.name);
    }
    if (!moves.length) {
      skipped++;
      continue;
    }
    result[name] = [...new Set(moves)].sort((a, b) => a.localeCompare(b));
    moveCount += result[name].length;
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result) + '\n');
  console.log(
    `[movepools] ${Object.keys(result).length} species, ${moveCount} moves` +
      (skipped ? `, ${skipped} skipped` : '')
  );
}

await main();
