import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { Generations } from '@smogon/calc/dist/data/index.js';
import { normalize } from '../src/lib/catalog.ts';
import { fetchWithRetry } from './catalog-sources.mjs';

const source =
  'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/item_names.csv';

async function main() {
  const response = await fetchWithRetry(source, { redirect: 'error' });
  if (!response.ok) throw new Error(`${response.status} fetching ${source}`);
  const rows = parse(await response.text(), { columns: true });
  const names = new Map();
  for (const { item_id, local_language_id, name } of rows) {
    const id = Number(item_id);
    const entry = names.get(id) ?? { english: '', japanese: {} };
    if (local_language_id === '9') entry.english = name;
    else if (['1', '11'].includes(local_language_id))
      entry.japanese[local_language_id] = name;
    names.set(id, entry);
  }
  const calcItems = Generations.get(0).items;
  const items = {};
  for (const id of [...names.keys()].sort((a, b) => a - b)) {
    const { english, japanese } = names.get(id);
    const found = english && calcItems.get(normalize(english));
    if (!found) continue;
    for (const name of [japanese['1'], japanese['11']]) {
      if (!name) continue;
      const key = name.normalize('NFKC');
      if (!Object.hasOwn(items, key)) items[key] = found.name;
    }
  }
  if (Object.keys(items).length < 100)
    throw new Error('Too few Japanese item names resolved');
  const sorted = Object.fromEntries(
    Object.keys(items)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, items[key]])
  );
  const output = resolve('scripts/data/pokedb-items.json');
  await writeFile(
    output,
    JSON.stringify({ source, items: sorted }, null, 2) + '\n'
  );
  console.log(`Wrote ${Object.keys(sorted).length} item names to ${output}.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
