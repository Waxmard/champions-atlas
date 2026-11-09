import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Generations } from '@smogon/calc/dist/data/index.js';
import { cosmeticForms } from '../src/lib/battle-forms.ts';
import { normalize } from '../src/lib/catalog.ts';

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
    for (const entry of Object.keys(data.megas ?? {})) names.add(entry);
  }
  for (const sp of Generations.get(0).species) names.add(sp.id);
  return [...names];
}

function buildMegaPeers(gen0) {
  const peers = new Map();
  const link = (a, b) => {
    if (!a || !b || a === b) return;
    if (!peers.has(a)) peers.set(a, new Set());
    if (!peers.has(b)) peers.set(b, new Set());
    peers.get(a).add(b);
    peers.get(b).add(a);
  };
  for (const item of gen0.items) {
    if (!item.megaStone) continue;
    for (const [base, mega] of Object.entries(item.megaStone)) {
      link(normalize(base), normalize(mega));
    }
  }
  link('floetteeternalmega', 'floetteeternal');
  link('floetteeternalmega', 'floettemega');
  return peers;
}

async function main() {
  if (ifMissing) {
    const existing = await readFile(output, 'utf8')
      .then((raw) => JSON.parse(raw))
      .catch(() => null);
    if (
      Array.isArray(existing?.moves?.rotomwash) &&
      existing.moves.rotomwash.length > 1 &&
      Array.isArray(existing?.abilities?.abomasnow)
    ) {
      console.log('[movepools] using existing file');
      return;
    }
  }
  const { Dex } = await import('@pkmn/dex');
  const dex = Dex.forGen(9);
  const gen0 = Generations.get(0);
  const generation = Generations.get(9);
  const megaPeers = buildMegaPeers(gen0);
  const moves = {};
  const abilities = {};
  let skipped = 0;
  let moveCount = 0;
  for (const name of await rosterIds()) {
    const canonicalId =
      cosmeticForms[name] ?? (name === 'aegislashboth' ? 'aegislash' : name);
    const entries = {};
    const visited = new Set();
    let cur = dex.species.get(canonicalId);
    while (cur?.exists && !visited.has(cur.id)) {
      visited.add(cur.id);
      const own = (await dex.learnsets.get(cur.id))?.learnset ?? {};
      for (const [moveId, sources] of Object.entries(own)) {
        if (!sources?.length) continue;
        entries[moveId] = [...(entries[moveId] ?? []), ...sources];
      }
      const parentName =
        cur.changesFrom ||
        (Object.keys(own).length <= 1 ? cur.baseSpecies : '');
      if (
        parentName &&
        parentName !== cur.name &&
        !visited.has(dex.species.get(parentName).id)
      ) {
        cur = dex.species.get(parentName);
      } else {
        cur = cur.prevo ? dex.species.get(cur.prevo) : null;
      }
    }
    const hasGen9 = Object.values(entries).some((sources) =>
      sources?.some((source) => source.startsWith('9'))
    );
    const moveNames = [];
    for (const [id, sources] of Object.entries(entries)) {
      if (
        !sources?.length ||
        (hasGen9 && !sources.some((source) => source.startsWith('9')))
      )
        continue;
      const move = generation.moves.get(id);
      if (move) moveNames.push(move.name);
    }
    if (moveNames.length) {
      moves[name] = [...new Set(moveNames)].sort((a, b) => a.localeCompare(b));
      moveCount += moves[name].length;
    } else {
      skipped++;
    }

    if (dex.species.get(canonicalId)?.exists) {
      const abilityNames = new Set();
      const relatedIds = [canonicalId, ...(megaPeers.get(canonicalId) ?? [])];
      for (const relId of relatedIds) {
        const dexAbilities = dex.species.get(relId)?.abilities;
        if (dexAbilities) {
          for (const ab of Object.values(dexAbilities)) {
            if (ab) abilityNames.add(ab);
          }
        }
        const gen0Abilities = gen0.species.get(relId)?.abilities;
        if (gen0Abilities) {
          for (const ab of Object.values(gen0Abilities)) {
            if (ab) abilityNames.add(ab);
          }
        }
      }
      if (abilityNames.size) {
        abilities[name] = [...abilityNames].sort((a, b) => a.localeCompare(b));
      }
    }
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ moves, abilities }) + '\n');
  console.log(
    `[movepools] ${Object.keys(moves).length} species, ${moveCount} moves, ${Object.keys(abilities).length} ability sets` +
      (skipped ? `, ${skipped} skipped` : '')
  );
}

await main();
