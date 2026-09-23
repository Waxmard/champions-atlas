<script lang="ts">
  import { Generations } from '@smogon/calc/dist/data/index.js';
  import type { ID } from '@smogon/calc/dist/data/interface.js';
  import BenchmarkConditionsForm from './BenchmarkConditions.svelte';
  import { normalize, type Member, type Team } from '../catalog.ts';
  import { resolveBattleForm } from '../battle-forms.ts';
  import {
    evaluateMatchup,
    type BenchmarkConditions,
    type BenchmarkIndex,
    type BenchmarkVariant,
    type MatchupResult,
  } from '../benchmarks.ts';
  import {
    suggestBenchmarkSpreads,
    type BenchmarkSuggestion,
  } from '../benchmark-suggestions.ts';
  import {
    CHAMPIONS_STATS,
    NATURES,
    parseChampionsSpread,
    type ChampionsStat,
  } from '../paste.ts';
  import { speedBenchmark, speedTiers, spreadNudges } from '../stats.ts';

  type Props = {
    member: Member;
    index: BenchmarkIndex;
    teams: Team[];
    conditions: BenchmarkConditions;
    onconditionschange: (next: BenchmarkConditions) => void;
    onusespread: (spread: string) => void;
    mode: 'incoming' | 'outgoing' | 'speed';
    onmodechange: (mode: 'incoming' | 'outgoing' | 'speed') => void;
  };
  let {
    member,
    index,
    teams,
    conditions,
    onconditionschange,
    onusespread,
    mode,
    onmodechange,
  }: Props = $props();
  const gen = Generations.get(0);
  const stats = CHAMPIONS_STATS;
  const statId: Record<string, ChampionsStat> = {
    atk: 'Atk',
    def: 'Def',
    spa: 'SpA',
    spd: 'SpD',
    spe: 'Spe',
  };
  const probs = [
    { label: '100%', value: 1 },
    { label: '93.75%', value: 0.9375 },
    { label: '87.5%', value: 0.875 },
    { label: '75%', value: 0.75 },
    { label: '50%', value: 0.5 },
  ];

  let query = $state('');
  let showAll = $state(false);
  let selectedPokemon = $state('');
  let selectedVariantKey = $state('');
  let selectedMove = $state('');
  const goal = $derived(mode === 'incoming' ? 'survive' : 'ko');
  let probability = $state(1);
  let optimizeStats = $state<ChampionsStat[]>(['HP', 'Def']);
  let lockedStats = $state<ChampionsStat[]>([]);
  let results = $state<BenchmarkSuggestion[]>([]);
  let searchMessage = $state('');

  const species = $derived(
    index.species.find((entry) => entry.pokemon === selectedPokemon) ?? null
  );
  const variant: BenchmarkVariant | null = $derived(
    species?.variants.find((entry) => entry.key === selectedVariantKey) ??
      species?.variants[0] ??
      null
  );
  const opponent: Member | null = $derived(variant?.member ?? null);
  const attackerMoves = $derived(
    mode === 'incoming' ? (opponent?.moves ?? []) : member.moves
  );
  const matchupRows = $derived(
    index.species.filter(
      (entry) =>
        !query ||
        normalize(entry.pokemon).includes(normalize(query)) ||
        entry.pokemon.toLowerCase().includes(query.toLowerCase())
    )
  );
  const visibleSpecies = $derived(
    query || showAll ? matchupRows : matchupRows.slice(0, 12)
  );
  const currentForm = $derived(
    resolveBattleForm(member, conditions.self.form ?? undefined)
  );
  const spread = $derived(
    member.spread ? parseChampionsSpread(member.spread) : null
  );
  const currentResult: MatchupResult | null = $derived(
    opponent && selectedMove
      ? evaluateMatchup(
          member,
          opponent,
          mode === 'outgoing' ? 'outgoing' : 'incoming',
          selectedMove,
          conditions
        )
      : null
  );
  const speedTeams = $derived(
    teams.filter((team) => team.regulation === index.regulation)
  );
  const natureKnown = $derived(
    NATURES.some((name) => normalize(name) === normalize(member.nature ?? ''))
  );
  const speed = $derived(
    currentForm.error || !spread || !natureKnown
      ? null
      : speedBenchmark(currentForm.pokemon, spread, member.nature, speedTeams)
  );
  const tiers = $derived(speedTiers(speedTeams, 12));
  const nudges = $derived(
    currentForm.error || !spread || !natureKnown
      ? []
      : spreadNudges(currentForm.pokemon, spread, member.nature, speedTeams)
  );
  const searchSignature = $derived(
    JSON.stringify([
      member,
      mode,
      species?.pokemon,
      variant?.key,
      selectedMove,
      conditions,
      goal,
      probability,
      optimizeStats,
      lockedStats,
    ])
  );
  const selectedMoveData = $derived(
    gen.moves.get(normalize(selectedMove) as ID)
  );
  const defaultAxes = $derived(
    mode === 'incoming'
      ? ([
          'HP',
          statId[
            selectedMoveData?.overrideDefensiveStat ??
              (selectedMoveData?.category === 'Physical' ? 'def' : 'spd')
          ],
        ] as ChampionsStat[])
      : ([
          statId[
            selectedMoveData?.overrideOffensiveStat ??
              (selectedMoveData?.category === 'Physical' ? 'atk' : 'spa')
          ],
        ] as ChampionsStat[])
  );
  let axesToken = '';
  $effect(() => {
    const token = mode + ':' + selectedMove;
    if (token !== axesToken) {
      optimizeStats = defaultAxes;
      axesToken = token;
    }
  });
  let lastSignature = '';
  $effect(() => {
    const next = searchSignature;
    if (lastSignature && next !== lastSignature) {
      results = [];
      searchMessage = '';
    }
    lastSignature = next;
  });

  function exactDefaultMove(
    source: Member,
    target: Member,
    direction: 'incoming' | 'outgoing'
  ) {
    let best = '';
    let bestKo = -1;
    let bestMax = -1;
    for (const move of source.moves) {
      const result = evaluateMatchup(
        member,
        target,
        direction,
        move,
        conditions
      );
      if (result.kind !== 'exact') continue;
      if (
        result.koChance > bestKo ||
        (result.koChance === bestKo && result.maxDamage > bestMax)
      ) {
        best = move;
        bestKo = result.koChance;
        bestMax = result.maxDamage;
      }
    }
    return best || source.moves[0] || '';
  }
  function resetOpponentConditions(next: Member | null) {
    const form = conditions.opponent.form;
    const invalidForm =
      !!form && (!next || !!resolveBattleForm(next, form).error);
    if (invalidForm || conditions.opponent.abilityOn) {
      onconditionschange({
        ...conditions,
        opponent: {
          ...conditions.opponent,
          ...(invalidForm ? { form: null } : {}),
          abilityOn: false,
        },
      });
    }
  }
  function selectSpecies(name: string) {
    selectedPokemon = name;
    const next = index.species.find((entry) => entry.pokemon === name);
    selectedVariantKey = next?.variants[0]?.key ?? '';
    const nextOpponent = next?.variants[0]?.member;
    resetOpponentConditions(nextOpponent ?? null);
    selectedMove = nextOpponent
      ? exactDefaultMove(
          mode === 'incoming' ? nextOpponent : member,
          nextOpponent,
          mode === 'outgoing' ? 'outgoing' : 'incoming'
        )
      : '';
  }
  function selectVariant(key: string) {
    selectedVariantKey = key;
    const next = species?.variants.find((entry) => entry.key === key)?.member;
    resetOpponentConditions(next ?? null);
    if (next)
      selectedMove = exactDefaultMove(
        mode === 'incoming' ? next : member,
        next,
        mode === 'outgoing' ? 'outgoing' : 'incoming'
      );
  }
  function selectMode(next: 'incoming' | 'outgoing' | 'speed') {
    onmodechange(next);
    results = [];
    searchMessage = '';
    if (next !== 'speed' && opponent)
      selectedMove = exactDefaultMove(
        next === 'incoming' ? opponent : member,
        opponent,
        next === 'outgoing' ? 'outgoing' : 'incoming'
      );
  }
  function updateOptimize(stat: ChampionsStat, checked: boolean) {
    optimizeStats = checked
      ? [...optimizeStats, stat].slice(-2)
      : optimizeStats.filter((item) => item !== stat);
    results = [];
    searchMessage = '';
  }
  function updateLock(stat: ChampionsStat, checked: boolean) {
    lockedStats = checked
      ? [...lockedStats, stat]
      : lockedStats.filter((item) => item !== stat);
    results = [];
    searchMessage = '';
  }
  function runSearch() {
    results = [];
    if (!opponent || !selectedMove) {
      searchMessage = 'Choose a complete opponent set and move first.';
      return;
    }
    if (currentResult?.kind !== 'exact') {
      searchMessage =
        currentResult?.kind === 'unavailable'
          ? currentResult.reason
          : 'This matchup is unavailable.';
      return;
    }
    const chance =
      goal === 'survive'
        ? currentResult.survivalChance
        : currentResult.koChance;
    if (chance >= probability) {
      searchMessage = 'The current spread already meets this single-hit goal.';
      return;
    }
    results = suggestBenchmarkSpreads(
      member,
      opponent,
      mode === 'outgoing' ? 'outgoing' : 'incoming',
      selectedMove,
      conditions,
      { goal, probability, optimizeStats, lockedStats }
    );
    searchMessage = results.length
      ? ''
      : 'No spread found under these search settings.';
  }
  function useSpread(value: string) {
    results = [];
    onusespread(value);
  }
  const percent = (n: number, d: number) =>
    d ? Number(((n * 100) / d).toFixed(2)) : 0;
  const formatChance = (chance: number) => Number((chance * 100).toFixed(2));
  const resultLine = (result: MatchupResult | null) =>
    !result
      ? 'Choose an opponent set and move.'
      : result.kind === 'unavailable'
        ? result.reason
        : `${result.minDamage}–${result.maxDamage} HP (${percent(result.minDamage, result.defenderMaxHp)}–${percent(result.maxDamage, result.defenderMaxHp)}%)`;
  const countLabel = (n: number) => `${n} ${n === 1 ? 'team' : 'teams'}`;
</script>

<section class="space-y-4" aria-label="EV benchmarks">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h2 class="text-xl font-semibold">Compare a real set</h2>
      <p class="provenance">
        {index.teamCount} current-regulation catalog teams · coverage counts distinct
        teams
      </p>
    </div>
    <nav class="join" aria-label="Benchmark mode">
      {#each [['incoming', 'Incoming'], ['outgoing', 'Outgoing'], ['speed', 'Speed']] as [value, label] (value)}
        <button
          type="button"
          class="btn join-item btn-sm"
          aria-pressed={mode === value}
          onclick={() => selectMode(value as 'incoming' | 'outgoing' | 'speed')}
          >{label}</button
        >
      {/each}
    </nav>
  </header>

  {#if mode === 'speed'}
    <section class="plate space-y-3 p-4" aria-labelledby="speed-heading">
      <h3 id="speed-heading" class="text-lg font-semibold">Unmodified Speed</h3>
      <p class="provenance">
        Level 50 stat from legal current-regulation spreads. No item or ability
        multipliers, stages, Tailwind, priority, or Trick Room assumptions.
      </p>
      {#if speed}<p class="value">
          {speed.speed} Speed · faster than {speed.beatPercent}% of {index.regulation}
          indexed Speed records
        </p>{:else}<p class="unknown">
          Speed unavailable: check resolved form, spread, nature, and stat data.
        </p>{/if}
      {#if tiers.length}<div>
          <h4 class="term">Common current-regulation tiers</h4>
          <ul class="divide-y divide-base-300">
            {#each tiers as tier (tier.pokemon)}<li
                class="flex justify-between gap-3 py-2"
              >
                <span>{tier.pokemon}</span><span class="value"
                  >median {tier.medianSpeed} · {tier.count} records</span
                >
              </li>{/each}
          </ul>
        </div>{:else}<p class="provenance">
          No eligible legal Speed spreads in this regulation.
        </p>{/if}
      {#if nudges.length}<div>
          <h4 class="term">Speed-only nudges</h4>
          <ul class="space-y-2">
            {#each nudges as nudge (`${nudge.targetSpeed}-${nudge.value}`)}<li
                class="plate flex flex-wrap items-center justify-between gap-2 p-3"
              >
                <span
                  >{nudge.target} · {nudge.speed} Speed · move {nudge.moved} points</span
                ><button
                  class="btn min-h-11 btn-sm"
                  type="button"
                  onclick={() => useSpread(nudge.value)}>Use spread</button
                ><small class="provenance w-full"
                  >{nudge.deltas
                    .map((delta) => `${delta.stat} ${delta.from}→${delta.to}`)
                    .join(' · ')}</small
                >
              </li>{/each}
          </ul>
        </div>{/if}
    </section>
  {:else}
    <div class="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,1.2fr)]">
      <section class="plate space-y-3 p-4" aria-label="Opponent catalog">
        <p class="provenance">
          {index.teamCount}
          {index.regulation} teams · eligible coverage is the subset with calculable
          full sets.
        </p>
        <label class="form-control"
          ><span class="term">Search all species</span><input
            class="input-bordered input min-h-11 w-full"
            type="search"
            bind:value={query}
            placeholder="Species name"
          /></label
        >
        {#if !index.species.length}<p class="unknown">
            No catalog teams are available for {index.regulation}; older
            regulations are not substituted.
          </p>{:else}
          <ul
            class="max-h-80 divide-y divide-base-300 overflow-auto"
            aria-label="Species, ordered by team frequency"
          >
            {#each visibleSpecies as entry (entry.pokemon)}
              <li>
                <button
                  type="button"
                  class="min-h-11 w-full p-2 text-left"
                  aria-pressed={selectedPokemon === entry.pokemon}
                  onclick={() => selectSpecies(entry.pokemon)}
                  ><span class="font-medium">{entry.pokemon}</span><span
                    class="provenance block"
                    >{countLabel(entry.teamCount)} · {entry.eligibleTeamCount} eligible
                    · {entry.variants.length} variants</span
                  ></button
                >
              </li>
            {/each}
          </ul>
          {#if !query && !showAll && matchupRows.length > 12}<button
              type="button"
              class="btn min-h-11 btn-sm"
              onclick={() => (showAll = true)}
              >Show all {matchupRows.length} species</button
            >{/if}
        {/if}
      </section>

      <section class="space-y-4" aria-label="Selected matchup">
        {#if species}
          <div class="plate space-y-3 p-4">
            <h3 class="text-lg font-semibold">{species.pokemon}</h3>
            <p class="provenance">
              Found in {countLabel(species.teamCount)}; {species.eligibleTeamCount}
              teams have at least one eligible set ({species.variants.length} variants).
            </p>
            {#if !variant}<p class="unknown">
                Insufficient set data: no complete, supported catalog set is
                available for damage calculation.
              </p>{:else}
              <label class="form-control"
                ><span class="term">Recorded set variant</span><select
                  aria-label="Recorded set variant"
                  class="select-bordered select min-h-11 w-full"
                  value={variant.key}
                  onchange={(event) => selectVariant(event.currentTarget.value)}
                  >{#each species.variants as choice (choice.key)}<option
                      value={choice.key}
                      >{countLabel(choice.teamIds.length)} · {choice.member
                        .pokemon} · {choice.member.spread}
                      {choice.member.nature} · {choice.member.item} · {choice
                        .member.ability}</option
                    >{/each}</select
                ></label
              >
              <p class="provenance">
                Actual variant: {variant.member.spread} · {variant.member
                  .nature} nature · {variant.member.item} · {variant.member
                  .ability} · moves {variant.member.moves.join(', ') || 'none'}.
              </p>
              <label class="form-control"
                ><span class="term"
                  >{mode === 'incoming'
                    ? 'Opponent attack'
                    : 'Your attack'}</span
                ><select
                  aria-label={mode === 'incoming'
                    ? 'Opponent attack'
                    : 'Your attack'}
                  class="select-bordered select min-h-11 w-full"
                  value={selectedMove}
                  onchange={(event) =>
                    (selectedMove = event.currentTarget.value)}
                  ><option value="" disabled>Choose a move</option
                  >{#each attackerMoves as move (move)}<option value={move}
                      >{move}</option
                    >{/each}</select
                ></label
              >
              <div
                class="rounded-sm border border-base-300 p-3"
                aria-live="polite"
              >
                <p class="term">
                  {mode === 'incoming'
                    ? 'Damage to your draft'
                    : 'Damage to opponent'}
                </p>
                <p class="value">{resultLine(currentResult)}</p>
                {#if currentResult?.kind === 'exact'}<p class="provenance">
                    Current HP {currentResult.defenderHp}/{currentResult.defenderMaxHp}
                    · {mode === 'incoming'
                      ? `Survives ${formatChance(currentResult.survivalChance)}% of damage rolls`
                      : `OHKO ${formatChance(currentResult.koChance)}% of damage rolls`}.
                  </p>
                  <p class="provenance">
                    Conditional on one attack connecting; no accuracy, residual
                    damage, healing, or turn sequence is simulated.
                  </p>{:else if currentResult?.kind === 'unavailable'}<p
                    role="status"
                    class="unknown"
                  >
                    Unavailable: {currentResult.reason}
                  </p>{/if}
              </div>
              <BenchmarkConditionsForm
                {conditions}
                self={member}
                opponent={variant.member}
                {onconditionschange}
              />
            {/if}
          </div>
          {#if variant}
            <div class="plate space-y-3 p-4">
              <h3 class="text-lg font-semibold">Targeted EV search</h3>
              <p class="provenance">
                One selected single-hit matchup only. Nature stays fixed; donor
                points come from remaining stats in a deterministic order. Not a
                global optimum or protection against other opponents.
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <p class="rounded-sm border border-base-300 p-3">
                  <span class="term">Goal</span><br />{goal === 'survive'
                    ? 'Survive the incoming hit'
                    : 'OHKO the opponent'}
                </p>
                <label class="form-control"
                  ><span class="term">Required chance</span><select
                    aria-label="Required chance"
                    class="select-bordered select min-h-11"
                    bind:value={probability}
                    >{#each probs as option (option.value)}<option
                        value={option.value}
                        >{option.label}{option.value < 1
                          ? ' chance'
                          : ''}</option
                      >{/each}</select
                  ></label
                >
              </div>
              <fieldset>
                <legend class="term">Optimize one or two stats</legend>
                <div class="flex flex-wrap gap-2">
                  {#each stats as stat (stat)}<label
                      class="flex min-h-11 items-center gap-2"
                      ><input
                        class="checkbox"
                        type="checkbox"
                        checked={optimizeStats.includes(stat)}
                        disabled={optimizeStats.includes(stat) &&
                          optimizeStats.length === 1}
                        onchange={(event) =>
                          updateOptimize(stat, event.currentTarget.checked)}
                      />{stat}</label
                    >{/each}
                </div>
              </fieldset>
              <fieldset>
                <legend class="term">Lock stats (unchanged)</legend>
                <div class="flex flex-wrap gap-2">
                  {#each stats as stat (stat)}<label
                      class="flex min-h-11 items-center gap-2"
                      ><input
                        class="checkbox"
                        type="checkbox"
                        checked={lockedStats.includes(stat)}
                        onchange={(event) =>
                          updateLock(stat, event.currentTarget.checked)}
                      />{stat}</label
                    >{/each}
                </div>
              </fieldset>
              <button type="button" class="btn min-h-11" onclick={runSearch}
                >Find EV adjustments</button
              >
              {#if searchMessage}<p role="status" class="provenance">
                  {searchMessage}
                </p>{/if}
              {#if results.length}<p class="provenance">
                  Nature fixed: {member.nature ?? 'unknown'} · optimize {optimizeStats.join(
                    ' + '
                  )} · locked {lockedStats.join(', ') || 'none'} · donor stats reconcile
                  points deterministically. Each result meets this selected one-hit
                  chance only.
                </p>
                <ul class="space-y-3">
                  {#each results as result (result.spread)}<li
                      class="plate space-y-2 p-3"
                    >
                      <div
                        class="flex flex-wrap items-center justify-between gap-2"
                      >
                        <strong>{result.spread}</strong><button
                          class="btn min-h-11 btn-sm"
                          type="button"
                          onclick={() => useSpread(result.spread)}
                          >Use spread</button
                        >
                      </div>
                      <p class="provenance">
                        {result.movedPoints} points transferred · nature unchanged
                        ({result.nature}) · {goal === 'survive'
                          ? `survival ${formatChance(result.matchup.survivalChance)}%`
                          : `OHKO ${formatChance(result.matchup.koChance)}%`}
                      </p>
                      <p class="provenance">
                        {stats
                          .map((stat) => {
                            const change = result.deltas.find(
                              (delta) => delta.stat === stat
                            );
                            return `${stat} ${change?.from ?? spread?.[stat] ?? 0}→${change?.to ?? spread?.[stat] ?? 0}`;
                          })
                          .join(' · ')}
                      </p>
                      <p class="provenance">
                        Before: {resultLine(currentResult)} · After: {result
                          .matchup.minDamage}–{result.matchup.maxDamage} HP; {goal ===
                        'survive'
                          ? `survives ${formatChance(result.matchup.survivalChance)}%`
                          : `OHKO ${formatChance(result.matchup.koChance)}%`}.
                      </p>
                    </li>{/each}
                </ul>{/if}
            </div>
          {/if}
        {:else}<p class="plate p-4">
            Select a species to inspect its most common eligible recorded set.
          </p>{/if}
      </section>
    </div>
  {/if}
  <p class="provenance">
    Catalog frequency is not ladder usage. Damage is exact only for supported
    one-hit attacks; unsupported mechanics remain unavailable rather than
    estimated.
  </p>
</section>
