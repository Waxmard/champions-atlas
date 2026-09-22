import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../src/lib/catalog.ts';
import { ROLE_KEYWORDS, roleFlags } from '../src/lib/tags.ts';
import { post, questionsFor, stateOf } from './jev-enrich.mjs';

const output = resolve('src/lib/data/team-tags.json');
const report = resolve('test-results/jev-eval.json');

const namesOf = (member) =>
  [member.ability, ...member.moves].filter(Boolean).map(normalize);
const carries = (member, ...keys) =>
  namesOf(member).some((name) => keys.includes(name));

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
    const flags = roleFlags(member);
    const weatherMove = member.moves.some((move) =>
      ROLE_KEYWORDS.weather.has(normalize(move))
    );
    if (
      !weatherMove &&
      !flags.includes('redirection') &&
      !flags.includes('disruption')
    )
      violations.push(`${team.id}: slot ${slot} support without support moves`);
  }
  return violations;
}

const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

async function loadCatalog() {
  try {
    return JSON.parse(
      await readFile(resolve('src/lib/data/catalog.json'), 'utf8')
    );
  } catch {
    console.error('No catalog; run npm run import:catalog');
    process.exitCode = 1;
    return null;
  }
}

async function printSample(count) {
  let tags;
  try {
    tags = JSON.parse(await readFile(output, 'utf8'));
  } catch {
    console.log(`No ${output}; run npm run enrich:tags first.`);
    return;
  }
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
  const violations = [];

  for (const team of sampled) {
    const body = {
      state: stateOf(team),
      model: 'jev-latest',
      questions: questionsFor(team.members),
    };
    const first = await post(key, body);
    const second = await post(key, body);
    const ids = Object.keys(body.questions);
    for (const id of ids) {
      questions++;
      if (first.answers?.[id]?.choice === second.answers?.[id]?.choice)
        matches++;
    }
    const confidence = first.answers?.archetype?.confidence;
    if (typeof confidence === 'number') confidences.push(confidence);
    const { answers } = first;
    if (answers) {
      const tag = {
        archetype: answers.archetype?.choice,
        speedMode: answers.speed_mode?.choice,
        roles: Object.fromEntries(
          Object.entries(answers)
            .map(([id, value]) => [
              /^role_slot(\d+)$/.exec(id)?.[1],
              value.choice,
            ])
            .filter(([slot, choice]) => slot && choice)
        ),
      };
      violations.push(...invariantViolations(team, tag));
    }
  }

  const agreement = questions ? matches / questions : 0;
  const medianConfidence = median(confidences);
  const rate = sampled.length ? violations.length / sampled.length : 1;
  const ok = agreement >= 0.9 && medianConfidence >= 0.6 && rate <= 0.05;
  const result = {
    sampledTeams: sampled.length,
    questions,
    agreement,
    medianArchetypeConfidence: medianConfidence,
    invariantViolationRate: rate,
    violations: violations.slice(0, 20),
    ok,
  };
  await mkdir(resolve('test-results'), { recursive: true });
  await writeFile(report, JSON.stringify(result, null, 2) + '\n');
  console.log(
    `agreement ${(agreement * 100).toFixed(1)}%, median archetype confidence ${medianConfidence.toFixed(2)}, invariant violations ${(rate * 100).toFixed(1)}%`
  );
  console.log(ok ? 'Tag consumption: GO' : 'Tag consumption: NO-GO');
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
  const stabilityCount = args.includes('--stability')
    ? valueOf('--stability', 40)
    : sample
      ? 0
      : 40;
  if (!stabilityCount) return;
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) {
    console.error('TYPESAFE_API_KEY is required to run the Jev evaluation');
    process.exitCode = 1;
    return;
  }
  await stability(key, stabilityCount);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
