import {
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';

const pokemonIndex = 'https://pokeapi.co/api/v2/pokemon?limit=100000';
const spriteRoot =
  'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const championsRoot = `${spriteRoot}/versions/generation-ix/champions`;
const itemRoot =
  'https://raw.githubusercontent.com/smogon/sprites/master/src/minisprites/items';

const spriteAliases = {
  aegislash: 'aegislash-shield',
  basculegion: 'basculegion-male',
  basculegionf: 'basculegion-female',
  floetteeternalmega: 'floette-mega',
  indeedee: 'indeedee-male',
  indeedeef: 'indeedee-female',
  maushold: 'maushold-family-of-four',
  mausholdfour: 'maushold-family-of-four',
  meowstic: 'meowstic-male',
  meowsticfmega: 'meowstic-female-mega',
  mimikyu: 'mimikyu-disguised',
  palafin: 'palafin-zero',
  taurospaldeaaqua: 'tauros-paldea-aqua-breed',
  toxtricity: 'toxtricity-amped',
};
const exactSprites = {
  sinistchamasterpiece: `${spriteRoot}/1013-masterpiece.png`,
  vivillonfancy: `${spriteRoot}/666-fancy.png`,
};

export const assetSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
export const basePokemon = (text) => assetSlug(text).replace(/mega[a-z]?$/, '');
const sourceItemSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export function resolveSprite(pokemon, index) {
  const key = assetSlug(pokemon);
  if (exactSprites[key]) return exactSprites[key];
  const name = spriteAliases[key] || pokemon;
  const entry = index.results.find(
    (candidate) => assetSlug(candidate.name) === assetSlug(name)
  );
  const id =
    entry &&
    /^https:\/\/pokeapi\.co\/api\/v2\/pokemon\/(\d+)\/?$/.exec(entry.url)?.[1];
  return id ? `${championsRoot}/${id}.png` : null;
}

export const resolveItemIcon = (item) =>
  `${itemRoot}/i${sourceItemSlug(item)}.png`;

export function validateIndex(text) {
  const data = JSON.parse(text);
  if (
    !Array.isArray(data.results) ||
    !data.results.length ||
    data.results.some(
      (entry) =>
        typeof entry?.name !== 'string' || typeof entry?.url !== 'string'
    )
  )
    throw new Error('Invalid PokéAPI Pokémon index');
  return data;
}

export function validatePng(data) {
  if (
    data.length < 8 ||
    data.length > 500000 ||
    !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new Error('Invalid PNG sprite');
}

async function loadPng(address) {
  const response = await fetch(address, {
    signal: AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`${response.status} fetching ${address}`);
  if (
    response.headers.get('content-type')?.split(';')[0] !== 'image/png' ||
    Number(response.headers.get('content-length') || 0) > 500000
  )
    throw new Error(`Invalid PNG response from ${address}`);
  return Buffer.from(await response.arrayBuffer());
}

async function syncAssets(
  wanted,
  { directory, load = loadPng, warn = console.warn }
) {
  await mkdir(directory, { recursive: true });
  const entries = [...wanted];
  let downloaded = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < entries.length) {
      const [filename, source] = entries[cursor++];
      if (!source) continue;
      const path = resolve(directory, filename);
      try {
        validatePng(await readFile(path));
        continue;
      } catch (error) {
        if (error.message === 'Invalid PNG sprite') await unlink(path);
        else if (error.code !== 'ENOENT') throw error;
      }
      const temporary = `${path}.${process.pid}.tmp`;
      try {
        const data = await load(source);
        validatePng(data);
        await writeFile(temporary, data);
        await rename(temporary, path);
        downloaded++;
      } catch (error) {
        await unlink(temporary).catch(() => {});
        warn(`Asset download failed for ${filename}: ${error.message}`);
        failed++;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(8, entries.length) }, worker)
  );
  let removed = 0;
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (
      entry.isFile() &&
      entry.name.endsWith('.png') &&
      !wanted.has(entry.name)
    ) {
      await unlink(resolve(directory, entry.name));
      removed++;
    }
  return { wanted: wanted.size, downloaded, failed, removed };
}

export async function syncSprites(
  teams,
  index,
  { directory = resolve('static/sprites'), load, warn = console.warn } = {}
) {
  const pokemon = [
    ...new Set(
      teams.flatMap((team) =>
        team.members.flatMap((member) => [
          member.pokemon,
          basePokemon(member.pokemon),
        ])
      )
    ),
  ];
  const wanted = new Map();
  for (const name of pokemon) {
    const source = resolveSprite(name, index);
    wanted.set(`${assetSlug(name)}.png`, source);
    if (!source) warn(`Sprite unavailable for ${name}`);
  }
  return syncAssets(wanted, { directory, load, warn });
}

export async function syncItems(
  teams,
  { directory = resolve('static/items'), load, warn = console.warn } = {}
) {
  const items = [
    ...new Set(
      teams.flatMap((team) =>
        team.members.map((member) => member.item).filter(Boolean)
      )
    ),
  ];
  return syncAssets(
    new Map(
      items.map((item) => [`${assetSlug(item)}.png`, resolveItemIcon(item)])
    ),
    { directory, load, warn }
  );
}

export { pokemonIndex };
