import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../src/lib/catalog.ts';

export const statsSource = 'https://championsbattledata.com/api';

/* Level-50 stats at 0 SP and a neutral nature, not mainline base stats. */
export function reduceStats(data) {
  const stats = {};
  for (const entry of data.pokemon || []) {
    const forms = [entry.summary?.primary, ...(entry.summary?.forms || [])];
    for (const form of forms) {
      if (!form?.showdown_name) continue;
      const key = normalize(form.showdown_name);
      if (!key || stats[key]) continue;
      stats[key] = [
        form.hp,
        form.attack,
        form.defense,
        form.sp_attack,
        form.sp_defense,
        form.speed,
      ];
    }
  }
  return stats;
}

async function main() {
  const cache = resolve('.cache/champions-battledata.json');
  const output = resolve('src/lib/data/pokemon-stats.json');
  if (process.argv.includes('--if-missing')) {
    try {
      await readFile(output, 'utf8');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await mkdir(resolve('.cache'), { recursive: true });
  let raw = null;
  if (process.env.REFRESH !== '1') {
    try {
      raw = await readFile(cache, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (raw === null) {
    try {
      if (process.env.OFFLINE === '1') throw new Error('offline');
      const response = await fetch(statsSource, {
        signal: AbortSignal.timeout(60000),
        redirect: 'error',
      });
      if (!response.ok)
        throw new Error(`${response.status} fetching ${statsSource}`);
      raw = await response.text();
      if (raw.length > 8000000)
        throw new Error('Stats response exceeds size limit');
      JSON.parse(raw);
      await writeFile(cache, raw);
    } catch (error) {
      try {
        await readFile(output, 'utf8');
        console.warn(
          `Stats refresh failed (${error.message}); keeping existing ${output}.`
        );
        return;
      } catch {
        console.error('no cached stats and offline');
        process.exitCode = 1;
        return;
      }
    }
  }
  const stats = reduceStats(JSON.parse(raw));
  await writeFile(
    output,
    JSON.stringify({
      source: statsSource,
      fetchedAt: new Date().toISOString().slice(0, 10),
      stats,
    }) + '\n'
  );
  console.log(`Wrote ${Object.keys(stats).length} stat rows to ${output}.`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
