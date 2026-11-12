import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { battleSpecies } from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';

export const ladderIndex = 'https://www.smogon.com/stats/';
export const ladderRegulation = 'M-C';
const ladderFile = 'chaos/gen9championsvgc2026regmc-1760.json';
const MIN_SHARE = 0.02;

const key = (name) => normalize(battleSpecies(name)?.name ?? name);

export function reducePartners(data) {
  const partners = {};
  for (const [name, entry] of Object.entries(data)) {
    const total = Object.values(entry.Abilities ?? {}).reduce(
      (sum, count) => sum + count,
      0
    );
    if (!(total > 0)) continue;
    const row = {};
    for (const [mate, count] of Object.entries(entry.Teammates ?? {})) {
      const share = Math.round((count / total) * 1000) / 1000;
      if (share >= MIN_SHARE) row[key(mate)] = share;
    }
    if (Object.keys(row).length) partners[key(name)] = row;
  }
  return partners;
}

async function main() {
  const index = await fetch(ladderIndex, {
    signal: AbortSignal.timeout(60000),
    redirect: 'error',
  });
  if (!index.ok) throw new Error(`${index.status} fetching ${ladderIndex}`);
  const months = [...(await index.text()).matchAll(/href="(\d{4}-\d{2})\/"/g)]
    .map((match) => match[1])
    .sort()
    .reverse();
  for (const month of months.slice(0, 3)) {
    const source = `${ladderIndex}${month}/${ladderFile}`;
    const response = await fetch(source, {
      signal: AbortSignal.timeout(120000),
      redirect: 'error',
    });
    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`${response.status} fetching ${source}`);
    const partners = reducePartners((await response.json()).data ?? {});
    const forms = Object.keys(partners).length;
    if (forms < 50) throw new Error(`Only ${forms} forms in ${source}`);
    const output = resolve('src/lib/data/ladder-partners.json');
    await writeFile(
      output,
      JSON.stringify({
        source,
        month,
        regulation: ladderRegulation,
        partners,
      }) + '\n'
    );
    console.log(`Wrote ${forms} ladder rows from ${month} to ${output}.`);
    return;
  }
  throw new Error(`No ${ladderFile} in the latest three months`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
