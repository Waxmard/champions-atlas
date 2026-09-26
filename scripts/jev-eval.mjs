import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../src/lib/catalog.ts';
import { roleFlags } from '../src/lib/tags.ts';
import {
  loadEnvFile,
  post,
  questionsFor,
  stateOf,
  stub,
} from './jev-enrich.mjs';

const output = resolve('src/lib/data/team-tags.json');
/* Not test-results/: Playwright clears that directory on every e2e run. */
const report = resolve('.cache/jev/eval.json');
const AGREEMENT = 0.9;
const CONFIDENCE = 0.6;
const VIOLATION_RATE = 0.05;

/* Partner-helping moves the five product role flags do not name: screens,
   healing, Helping Hand-style boosts, sleep, and field effects. Validator
   vocabulary only; the product's role flags are unchanged. */
const SUPPORT_MOVES = [
  'Helping Hand',
  'Coaching',
  'Decorate',
  'Heal Pulse',
  'Life Dew',
  'Heal Bell',
  'Aromatherapy',
  'Wish',
  'Aurora Veil',
  'Reflect',
  'Light Screen',
  'Safeguard',
  'Hypnosis',
  'Sing',
  'Yawn',
  'Lovely Kiss',
  'Dark Void',
  'Electric Terrain',
  'Grassy Terrain',
  'Psychic Terrain',
  'Misty Terrain',
  'Revival Blessing',
  'Jungle Healing',
  'Floral Healing',
  'Strength Sap',
  'Swagger',
  'Flatter',
].map(normalize);

const namesOf = (member) =>
  [member.ability, ...member.moves].filter(Boolean).map(normalize);
const carries = (member, ...keys) =>
  namesOf(member).some((name) => keys.includes(name));

/* A support posture needs evidence of a partner-helping job. Any of the five
   role flags counts, as does a named support move: Tailwind, Drizzle and
   Aurora Veil are all support work, and only redirection/disruption are not
   the whole of it. */
export function invariantViolations(team, tag) {
  const violations = [];
  if (
    tag.archetype === 'rain' &&
    !team.members.some((m) => carries(m, 'drizzle', 'raindance'))
  )
    violations.push(`${team.id}: rain without Drizzle or Rain Dance`);
  if (
    tag.archetype === 'trick_room' &&
    !team.members.some((m) => carries(m, 'trickroom'))
  )
    violations.push(`${team.id}: trick_room without Trick Room`);
  for (const [slot, role] of Object.entries(tag.roles)) {
    const member = team.members[Number(slot) - 1];
    if (!member || role !== 'support') continue;
    if (roleFlags(member).length === 0 && !carries(member, ...SUPPORT_MOVES))
      violations.push(
        `${team.id}: slot ${slot} ${member.pokemon} tagged support with no support trait`
      );
  }
  return violations;
}

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

async function loadJson(path, hint) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    console.error(hint);
    process.exitCode = 1;
    return null;
  }
}

const loadCatalog = () =>
  loadJson(
    resolve('src/lib/data/catalog.json'),
    'No catalog; run npm run import:catalog'
  );

const loadTags = () =>
  loadJson(output, `No ${output}; run npm run enrich:tags first.`);

async function readReport() {
  try {
    return JSON.parse(await readFile(report, 'utf8'));
  } catch {
    return {};
  }
}

function passes(state) {
  return (
    (state.agreement === undefined || state.agreement >= AGREEMENT) &&
    (state.medianArchetypeConfidence === undefined ||
      state.medianArchetypeConfidence >= CONFIDENCE) &&
    (state.invariantViolationRate === undefined ||
      state.invariantViolationRate <= VIOLATION_RATE)
  );
}

/* Stability numbers describe a fixed tags file, so they carry forward while
   that file is unchanged. */
async function save(patch, tagsGeneratedAt) {
  const previous = await readReport();
  const base = previous.tagsGeneratedAt === tagsGeneratedAt ? previous : {};
  const state = { ...base, ...patch, tagsGeneratedAt };
  state.ok = passes(state);
  await mkdir(resolve('.cache/jev'), { recursive: true });
  await writeFile(report, JSON.stringify(state, null, 2) + '\n');
  return state;
}

async function invariants() {
  const tags = await loadTags();
  if (!tags) return null;
  const catalog = await loadCatalog();
  if (!catalog) return null;
  const tagged = catalog.teams.filter((team) => tags.teams?.[team.id]);
  if (!tagged.length) {
    console.log(`${output} holds no tags yet.`);
    return null;
  }
  const violations = tagged.flatMap((team) =>
    invariantViolations(team, tags.teams[team.id])
  );
  const rate = violations.length / tagged.length;
  const state = await save(
    {
      teamsTagged: tagged.length,
      teamsChecked: tagged.length,
      invariantViolationRate: rate,
      invariantViolations: violations,
    },
    tags.generatedAt
  );
  console.log(
    `structural invariants: ${violations.length} violations across ${tagged.length} tagged teams (${(rate * 100).toFixed(1)}%, limit ${VIOLATION_RATE * 100}%)`
  );
  for (const violation of violations) console.log(`  ${violation}`);
  if (state.agreement !== undefined)
    console.log(
      `stability on record: agreement ${(state.agreement * 100).toFixed(1)}%, median archetype confidence ${state.medianArchetypeConfidence.toFixed(2)}`
    );
  console.log(state.ok ? 'Tag consumption: GO' : 'Tag consumption: NO-GO');
  if (!state.ok) {
    await writeFile(
      output,
      JSON.stringify({ ...stub, generatedAt: new Date().toISOString() }) + '\n'
    );
    console.error(
      `Invariant violation rate ${(rate * 100).toFixed(1)}% exceeds the ${VIOLATION_RATE * 100}% limit; wrote an empty tag stub to ${output}.`
    );
    process.exitCode = 1;
  }
  return state;
}

async function printSample(count) {
  const tags = await loadTags();
  if (!tags) return;
  const catalog = await loadCatalog();
  if (!catalog) return;
  const tagged = catalog.teams.filter((team) => tags.teams?.[team.id]);
  if (!tagged.length) {
    console.log(`${output} holds no tags yet.`);
    return;
  }
  const stride = Math.max(1, Math.floor(tagged.length / count));
  for (
    let index = 0;
    index < tagged.length && index / stride < count;
    index += stride
  ) {
    const team = tagged[index];
    const tag = tags.teams[team.id];
    console.log(
      [
        `[${tag.archetype} / ${tag.speedMode}] (${team.regulation})`,
        team.members
          .map(
            (member, slot) =>
              `${member.pokemon}=${tag.roles[String(slot + 1)] || '?'}`
          )
          .join(', '),
      ].join(' ')
    );
  }
}

async function stability(key, count) {
  const tags = await loadTags();
  if (!tags) return;
  const catalog = await loadCatalog();
  if (!catalog) return;
  const teams = catalog.teams;
  const stride = Math.max(1, Math.floor(teams.length / count));
  const sampled = [];
  for (
    let index = 0;
    index < teams.length && sampled.length < count;
    index += stride
  )
    sampled.push(teams[index]);

  let matches = 0;
  let questions = 0;
  const confidences = [];

  for (const team of sampled) {
    const body = {
      state: stateOf(team),
      model: 'jev-latest',
      questions: questionsFor(team.members),
    };
    const first = await post(key, body);
    const second = await post(key, body);
    for (const id of Object.keys(body.questions)) {
      questions++;
      if (first.answers?.[id]?.choice === second.answers?.[id]?.choice)
        matches++;
    }
    const confidence = first.answers?.archetype?.confidence;
    if (typeof confidence === 'number') confidences.push(confidence);
  }

  const agreement = questions ? matches / questions : 0;
  const medianArchetypeConfidence = median(confidences);
  await save(
    {
      sampledTeams: sampled.length,
      questions,
      agreement,
      medianArchetypeConfidence,
    },
    tags.generatedAt
  );
  console.log(
    `stability: agreement ${(agreement * 100).toFixed(1)}% (limit ${AGREEMENT * 100}%), median archetype confidence ${medianArchetypeConfidence.toFixed(2)} (limit ${CONFIDENCE})`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const valueOf = (flag, fallback) => {
    const index = args.indexOf(flag);
    const value = index >= 0 ? Number(args[index + 1]) : NaN;
    return Number.isInteger(value) && value > 0 ? value : fallback;
  };
  const sample = args.includes('--sample') ? valueOf('--sample', 20) : 0;
  if (sample) await printSample(sample);
  if (args.includes('--stability')) {
    loadEnvFile();
    const key = process.env.TYPESAFE_API_KEY;
    if (!key) {
      console.error('TYPESAFE_API_KEY is required to run the Jev evaluation');
      process.exitCode = 1;
      return;
    }
    await stability(key, valueOf('--stability', 40));
  }
  if (args.includes('--stability') || !sample) await invariants();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
