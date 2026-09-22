import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint = 'https://api.typesafe.ai/v1/systemone';
const pricePerMtok = 0.042;
const output = resolve('src/lib/data/team-tags.json');
const cacheDir = resolve('.cache/jev');

const ARCHETYPE = {
  type: 'choice',
  instructions:
    "What is this team's primary game plan? Judge the plan the team is built to execute in most games.",
  criteria: {
    rain: 'Main plan is rain: sets rain and wins with rain-boosted Water moves or Swift Swim',
    sun: 'Main plan is sun: sets sun and wins with sun-boosted Fire moves or Chlorophyll',
    sand: 'Main plan is sand: sets sand and wins with sand damage or Sand Rush',
    snow: 'Main plan is snow: sets snow and wins with Aurora Veil or Blizzard',
    trick_room:
      'Main plan is Trick Room: sets Trick Room and wins with slow hard-hitting members under it',
    tailwind_offense: 'Main plan is Tailwind, pressuring with fast attackers',
    hyper_offense:
      'Immediate offense with little defensive investment or support',
    balance:
      'No single field or speed plan; mixes offense and defense and wins on positioning',
    other: 'None of the above fits better than these',
  },
};

const SPEED_MODE = {
  type: 'choice',
  instructions: 'Which best describes how this team usually moves first?',
  criteria: {
    faster: 'Outruns the opponent with Speed investment or Tailwind',
    slower: 'Relies on Trick Room or on moving after the opponent',
    mixed: 'Speed varies by member with no single plan',
  },
};

const roleQuestion = (slot) => ({
  type: 'choice',
  instructions: `In this team's plan, what is the job of the member in slot ${slot}? Judge the job that member performs on this team, not what its species usually does.`,
  criteria: {
    fast_attacker:
      "Attacks fast and hard; usually the first of the team's attackers to move",
    bulky_attacker: 'Deals damage while surviving hits; invests in bulk',
    win_condition: 'The member the team is built to support and win with',
    support: 'Its job is helping its partner rather than dealing damage',
    other: 'None of the above fits better than these',
  },
});

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/* Node never reads .env files on its own; an exported key still wins. */
export function loadEnvFile() {
  try {
    process.loadEnvFile(
      fileURLToPath(new URL('../.env.local', import.meta.url))
    );
  } catch {
    // .env.local is optional.
  }
}

const stub = {
  generatedAt: null,
  model: 'jev-1.13.0',
  provenance: 'jev',
  teams: {},
};

export async function post(key, body) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok) return response.json();
    const retriable = response.status === 429 || response.status === 529;
    if (!retriable || attempt >= 3)
      throw new Error(`${response.status} from ${endpoint}`);
    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : [1000, 4000, 16000][attempt]
    );
  }
}

export function tagOf(answer) {
  const answers = answer?.answers || {};
  const archetype = answers.archetype?.choice;
  const speedMode = answers.speed_mode?.choice;
  if (!archetype || !speedMode) return null;
  const roles = {};
  for (const [id, value] of Object.entries(answers)) {
    const slot = /^role_slot(\d+)$/.exec(id)?.[1];
    if (slot && value?.choice) roles[slot] = value.choice;
  }
  return { archetype, speedMode, roles };
}

export function questionsFor(members) {
  const questions = { archetype: ARCHETYPE, speed_mode: SPEED_MODE };
  members.forEach((_, index) => {
    questions[`role_slot${index + 1}`] = roleQuestion(index + 1);
  });
  return questions;
}

export function stateOf(team) {
  return {
    regulation: team.regulation,
    team: team.members.map((member, index) => ({
      slot: index + 1,
      species: member.pokemon,
      item: member.item,
      ability: member.ability,
      nature: member.nature,
      spread: member.spread,
      moves: member.moves,
    })),
  };
}

async function pooled(items, workers, run) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      while (next < items.length) {
        const item = items[next++];
        await run(item);
      }
    })
  );
}

async function main() {
  if (process.argv.includes('--if-missing')) {
    try {
      await readFile(output, 'utf8');
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    await mkdir(resolve('src/lib/data'), { recursive: true });
    await writeFile(
      output,
      JSON.stringify({ ...stub, generatedAt: new Date().toISOString() }) + '\n'
    );
    console.log(
      `Wrote an empty tag stub to ${output}; run npm run enrich:tags to fill it.`
    );
    return;
  }

  let catalog;
  try {
    catalog = JSON.parse(
      await readFile(resolve('src/lib/data/catalog.json'), 'utf8')
    );
  } catch {
    console.error('No catalog; run npm run import:catalog');
    process.exitCode = 1;
    return;
  }

  loadEnvFile();

  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    console.error('TYPESAFE_API_KEY is required to enrich team tags');
    process.exitCode = 1;
    return;
  }
  await mkdir(cacheDir, { recursive: true });
  const teams = {};
  const tokens = {};
  const failures = {};
  let model = stub.model;

  await pooled(catalog.teams, 4, async (team) => {
    const cachePath = resolve(cacheDir, `${team.id}.json`);
    let answer = null;
    try {
      answer = JSON.parse(await readFile(cachePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError))
        throw error;
    }
    if (!answer) {
      try {
        answer = await post(key, {
          state: stateOf(team),
          model: 'jev-latest',
          questions: questionsFor(team.members),
        });
        await writeFile(cachePath, JSON.stringify(answer));
      } catch (error) {
        failures[team.id] = error.message;
        return;
      }
    }
    const tag = tagOf(answer);
    if (!tag) {
      failures[team.id] = 'incomplete answers';
      return;
    }
    if (answer.model) model = answer.model;
    if (answer.usage?.input_tokens) tokens[team.id] = answer.usage.input_tokens;
    teams[team.id] = tag;
  });

  const total = Object.values(tokens).reduce((sum, value) => sum + value, 0);
  const count = Object.keys(tokens).length;
  await writeFile(
    output,
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      model,
      provenance: 'jev',
      meanInputTokens: count ? Math.round(total / count) : 0,
      teams,
    }) + '\n'
  );
  await writeFile(
    resolve(cacheDir, 'failed.json'),
    JSON.stringify(failures, null, 2) + '\n'
  );
  console.log(
    `Tagged ${Object.keys(teams).length}/${catalog.teams.length} teams, ${
      Object.keys(failures).length
    } failed. ${total} input tokens (~$${((total * pricePerMtok) / 1_000_000).toFixed(4)}).`
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
