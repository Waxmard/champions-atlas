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
const itemRoot =
  'https://raw.githubusercontent.com/smogon/sprites/master/src/minisprites/items';

const spriteAliases = {
  aegislash: 'aegislash-shield',
  basculegion: 'basculegion-male',
  basculegionf: 'basculegion-female',
  floetteeternalmega: 'floette-mega',
  gourgeist: 'gourgeist-average',
  indeedee: 'indeedee-male',
  indeedeef: 'indeedee-female',
  lycanroc: 'lycanroc-midday',
  maushold: 'maushold-family-of-four',
  mausholdfour: 'maushold-family-of-four',
  meowstic: 'meowstic-male',
  meowsticf: 'meowstic-female',
  meowsticfmega: 'meowstic-female-mega',
  meowsticm: 'meowstic-male',
  meowsticmega: 'meowstic-male-mega',
  meowsticmmega: 'meowstic-male-mega',
  mimikyu: 'mimikyu-disguised',
  palafin: 'palafin-zero',
  morpeko: 'morpeko-full-belly',
  pyroar: 'pyroar-male',
  taurospaldeaaqua: 'tauros-paldea-aqua-breed',
  toxtricity: 'toxtricity-amped',
  squawkabilly: 'squawkabilly-green-plumage',
};
const exactSprites = {
  floette: `${spriteRoot}/670.png`,
  sinistchamasterpiece: `${spriteRoot}/1013-masterpiece.png`,
  vivillonfancy: `${spriteRoot}/666-fancy.png`,
  vivillonpokeball: `${spriteRoot}/666-poke-ball.png`,
};

export const assetSlug = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
export const basePokemon = (text) => assetSlug(text).replace(/mega[a-z]?$/, '');
const sourceItemAliases = {
  dragonitite: 'dragoninite',
  staraptorite: 'staraptite',
  venosaurite: 'venusaurite',
};
const sourceItemSlug = (text) => {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return sourceItemAliases[slug] || slug;
};
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
  return id ? `${spriteRoot}/${id}.png` : null;
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
  const pokemon = new Map();
  for (const team of teams)
    for (const member of team.members)
      for (const name of [member.pokemon, basePokemon(member.pokemon)]) {
        const slug = assetSlug(name);
        if (!pokemon.has(slug)) pokemon.set(slug, name);
      }
  const wanted = new Map();
  for (const [slug, name] of pokemon) {
    const source = resolveSprite(name, index);
    wanted.set(`${slug}.png`, source);
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

export async function restoreCatalogAssets(
  teams,
  { fetchCached, refresh = false }
) {
  let sprites = null;
  let items = null;
  try {
    const index = validateIndex(
      await fetchCached('pokemon.json', pokemonIndex, validateIndex, refresh)
    );
    sprites = await syncSprites(teams, index);
  } catch (error) {
    console.warn(`Sprites unavailable: ${error.message}`);
  }
  try {
    items = await syncItems(teams);
  } catch (error) {
    console.warn(`Item icons unavailable: ${error.message}`);
  }
  return { sprites, items };
}
