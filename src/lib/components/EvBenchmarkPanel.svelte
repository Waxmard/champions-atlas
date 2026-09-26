<script lang="ts">
  import {
    DEFAULT_BENCHMARK_CONDITIONS,
    damagingMoves,
    deriveBenchmarkSet,
    itemOptions,
    ownSetConditions,
    type BenchmarkConditions,
    type BenchmarkIndex,
  } from '$lib/benchmarks';
  import {
    solveBenchmark,
    type BenchmarkGoal,
    type BenchmarkGroup,
    type BenchmarkResult,
  } from '$lib/benchmark-suggestions';
  import { resolveBattleForm } from '$lib/battle-forms';
  import { normalize, type Member } from '$lib/catalog';
  import PokemonPicker from '$lib/components/PokemonPicker.svelte';
  import { formatSpreadDelta } from '$lib/paste';

  let {
    member,
    index,
    currentRegulation,
    onspreadchange,
  }: {
    member: Member;
    index: BenchmarkIndex;
    currentRegulation: string;
    onspreadchange: (spread: string, nature?: string | null) => void;
  } = $props();

  const GOALS: Array<{ value: BenchmarkGoal; label: string }> = [
    { value: 'survive', label: 'Survive a hit' },
    { value: 'ko', label: 'Take a KO' },
    { value: 'outspeed', label: 'Outspeed' },
  ];
  const WEATHER = ['Sun', 'Rain', 'Sand', 'Snow'] as const;
  const TERRAIN = ['Electric', 'Grassy', 'Psychic', 'Misty'] as const;
  const BOOSTS = ['Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
  const CHECKS: Array<{
    key:
      | 'reflect'
      | 'lightScreen'
      | 'helpingHand'
      | 'spreadDamage'
      | 'criticalHit';
    label: string;
  }> = [
    { key: 'reflect', label: 'Reflect' },
    { key: 'lightScreen', label: 'Light Screen' },
    { key: 'helpingHand', label: 'Helping Hand' },
    { key: 'spreadDamage', label: 'Spread damage' },
    { key: 'criticalHit', label: 'Critical hit' },
  ];
  const SPEED_ABILITIES = [
    'swiftswim',
    'sandrush',
    'chlorophyll',
    'slushrush',
    'surgesurfer',
    'unburden',
    'quickfeet',
  ];

  let goal = $state<BenchmarkGoal>('survive');
  let opponent = $state('');
  let item = $state('');
  let move = $state('');
  let conditions = $state<BenchmarkConditions>(
    structuredClone(DEFAULT_BENCHMARK_CONDITIONS)
  );
  let result = $state<BenchmarkResult | null>(null);
  let pending = $state(false);

  const species = $derived(
    index.species
      .filter((entry) => entry.variants.length)
      .map((entry) => entry.pokemon)
  );
  const opponentSet = $derived(
    opponent
      ? deriveBenchmarkSet(index, opponent, {
          item: item || null,
          excludeChoiceScarf: goal === 'outspeed' && !item,
        })
      : null
  );
  const itemChoices = $derived(opponent ? itemOptions(index, opponent) : []);
  const moveChoices = $derived(
    goal === 'ko' ? damagingMoves(member.moves) : (opponentSet?.moves ?? [])
  );
  const selectedMove = $derived(
    moveChoices.includes(move) ? move : (moveChoices[0] ?? '')
  );
  const caveats = $derived.by(() => {
    if (!opponentSet) return [];
    const notes: string[] = [];
    if (normalize(opponentSet.member.item ?? '') === 'choicescarf')
      notes.push('Choice Scarf ×1.5 applied to the target.');
    const ability = resolveBattleForm(opponentSet.member).ability ?? '';
    if (SPEED_ABILITIES.includes(normalize(ability)))
      notes.push(`Unmodified: ${ability} speed doubling is not applied.`);
    return notes;
  });
  const groups = $derived(
    result?.kind === 'answer'
      ? [result.current, result.changed].filter(
          (group): group is BenchmarkGroup =>
            !!group && (group.solutions.length > 0 || !!group.message)
        )
      : []
  );

  function chooseOpponent(pokemon: string) {
    opponent = pokemon;
    item = '';
    move = '';
    const next = deriveBenchmarkSet(index, pokemon);
    conditions = next
      ? ownSetConditions(member, next.member)
      : structuredClone(DEFAULT_BENCHMARK_CONDITIONS);
  }

  $effect(() => {
    const target = opponentSet?.member ?? null;
    const goalValue = goal;
    const moveValue = selectedMove;
    const scenario = $state.snapshot(conditions);
    const snapshot = { ...member, moves: [...member.moves] };
    result = null;
    pending = false;
    if (!target) return;
    pending = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void solveBenchmark(
        snapshot,
        {
          goal: goalValue,
          opponent: target,
          move: moveValue || null,
          conditions: scenario,
        },
        controller.signal
      )
        .then((answer) => {
          if (controller.signal.aborted) return;
          result = answer;
          pending = false;
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          result = {
            kind: 'error',
            message: 'The benchmark could not be calculated.',
          };
          pending = false;
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });
</script>

{#snippet chips(value: string)}
  <div class="flex flex-wrap items-center gap-1.5">
    {#each value.split(' / ').filter(Boolean) as part (part)}
      <span
        class="value inline-flex items-center rounded-[var(--radius-selector)] border border-base-300 px-2 py-0.5 font-mono"
        >{part}</span
      >
    {/each}
  </div>
{/snippet}

<section
  class="plate mt-4 grid divide-y"
  aria-label="EV benchmarks"
  aria-busy={pending}
>
  <div class="px-3 py-2.5">
    <h3 class="term">Benchmark a goal</h3>
    <p class="provenance mt-1">
      Aim a spread at one recorded set. Answers move the fewest points; Speed is
      unmodified level-50 Speed with only the Choice Scarf multiplier.
    </p>
  </div>

  <div class="grid gap-3 px-3 py-2.5">
    <fieldset>
      <legend class="term">Goal</legend>
      <div class="mt-1.5 grid gap-1 sm:grid-cols-3">
        {#each GOALS as option (option.value)}
          <label class="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name="benchmark-goal"
              class="radio radio-sm"
              value={option.value}
              aria-label={option.label}
              bind:group={goal}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
    </fieldset>

    <div class="min-w-0">
      <span class="term">Opponent</span>
      <div class="mt-1.5">
        <PokemonPicker
          options={species}
          label="Opponent"
          placeholder="Find an opponent…"
          portal={false}
          onselect={chooseOpponent}
        />
      </div>
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <div class="min-w-0">
        <label for="benchmark-item" class="term">Opponent item</label>
        <select
          id="benchmark-item"
          class="select mt-1.5 min-h-11 w-full text-sm"
          value={item}
          onchange={(event) => (item = event.currentTarget.value)}
        >
          <option value="">
            {goal === 'outspeed'
              ? 'Any (ignoring Choice Scarf)'
              : 'Any recorded set'}
          </option>
          {#each itemChoices as choice (choice.item)}
            <option value={choice.item}>{choice.item}</option>
          {/each}
        </select>
      </div>
      {#if goal !== 'outspeed'}
        <div class="min-w-0">
          <label for="benchmark-move" class="term">Move</label>
          <select
            id="benchmark-move"
            class="select mt-1.5 min-h-11 w-full text-sm"
            value={selectedMove}
            onchange={(event) => (move = event.currentTarget.value)}
          >
            {#each moveChoices as option (option)}
              <option value={option}>{option}</option>
            {:else}
              <option value="">No damaging moves recorded</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    {#if opponentSet}
      <p class="provenance">
        {opponentSet.pokemon} @ {opponentSet.member.item} — {opponentSet.member
          .nature}
        {opponentSet.member.spread}
        ({opponentSet.teams} recorded teams · {opponentSet.spreads} recorded spreads
        in
        {currentRegulation}).{#if caveats.length}
          {caveats.join(' ')}{/if}
      </p>
    {:else if opponent}
      <p class="provenance">No recorded set matches this item.</p>
    {/if}
  </div>

  <details class="px-3 py-2.5">
    <summary class="term min-h-11 cursor-pointer content-center"
      >Conditions</summary
    >
    <div class="mt-2 grid gap-3 sm:grid-cols-2">
      <div class="min-w-0">
        <label for="benchmark-weather" class="term">Weather</label>
        <select
          id="benchmark-weather"
          class="select mt-1.5 min-h-11 w-full text-sm"
          value={conditions.weather}
          onchange={(event) =>
            (conditions.weather = event.currentTarget
              .value as BenchmarkConditions['weather'])}
        >
          <option value="">—</option>
          {#each WEATHER as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>
      <div class="min-w-0">
        <label for="benchmark-terrain" class="term">Terrain</label>
        <select
          id="benchmark-terrain"
          class="select mt-1.5 min-h-11 w-full text-sm"
          value={conditions.terrain}
          onchange={(event) =>
            (conditions.terrain = event.currentTarget
              .value as BenchmarkConditions['terrain'])}
        >
          <option value="">—</option>
          {#each TERRAIN as option (option)}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>
    </div>
    <div class="mt-2 grid gap-1">
      {#each CHECKS as check (check.key)}
        <label class="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            class="checkbox checkbox-sm"
            aria-label={check.label}
            checked={conditions[check.key]}
            onchange={(event) =>
              (conditions[check.key] = event.currentTarget.checked)}
          />
          <span>{check.label}</span>
        </label>
      {/each}
    </div>
    <div class="mt-2 grid gap-3 sm:grid-cols-2">
      {#each [{ key: 'self', label: 'Your HP' }, { key: 'opponent', label: 'Opponent HP' }] as entry (entry.key)}
        <div class="min-w-0">
          <label for={`benchmark-hp-${entry.key}`} class="term"
            >{entry.label} %</label
          >
          <input
            id={`benchmark-hp-${entry.key}`}
            type="number"
            min="1"
            max="100"
            class="input mt-1.5 min-h-11 w-full px-2 text-center font-mono text-xs"
            value={conditions[entry.key as 'self' | 'opponent'].hpPercent}
            oninput={(event) =>
              (conditions[entry.key as 'self' | 'opponent'].hpPercent =
                Math.min(
                  100,
                  Math.max(1, event.currentTarget.valueAsNumber || 1)
                ))}
          />
        </div>
      {/each}
    </div>
    <div class="mt-3 grid gap-2 sm:grid-cols-5">
      {#each BOOSTS as stat (stat)}
        <div class="min-w-0">
          <label for={`benchmark-boost-${stat}`} class="term">Foe {stat}</label>
          <input
            id={`benchmark-boost-${stat}`}
            type="number"
            min="-6"
            max="6"
            class="input mt-1.5 min-h-11 w-full px-1 text-center font-mono text-xs"
            value={conditions.opponent.boosts[stat]}
            oninput={(event) =>
              (conditions.opponent.boosts[stat] = Math.min(
                6,
                Math.max(-6, event.currentTarget.valueAsNumber || 0)
              ))}
          />
        </div>
      {/each}
    </div>
  </details>

  <div class="grid divide-y">
    {#if !opponentSet}
      <p class="provenance px-3 py-2.5">
        Choose an opponent to benchmark against.
      </p>
    {:else if pending}
      <p class="provenance px-3 py-2.5">Checking spreads…</p>
    {:else if result?.kind === 'error'}
      <p class="provenance px-3 py-2.5" role="status">{result.message}</p>
    {:else if result}
      <p class="provenance px-3 py-2.5" role="status">{result.summary}</p>
      {#each groups as group (group.nature)}
        <div class="grid divide-y">
          <h4 class="term px-3 py-2.5">
            {result.current === group
              ? `With your ${group.nature} nature`
              : 'Needs a different nature'}
          </h4>
          {#each group.solutions as solution, position (solution.spread)}
            <button
              type="button"
              class="group flex min-h-11 flex-col gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-base-200/70 focus-visible:ring-2 focus-visible:ring-primary"
              aria-label={`Use ${solution.nature} spread ${solution.spread}`}
              aria-describedby={`ev-benchmark-${group.nature}-${position}`}
              onclick={() => onspreadchange(solution.spread, solution.nature)}
            >
              {@render chips(solution.spread)}
              <span class="value"
                >{solution.nature} · {formatSpreadDelta(solution.deltas) ||
                  'No spread change'}</span
              >
              <span class="value">{solution.outcome}</span>
              <span
                id={`ev-benchmark-${group.nature}-${position}`}
                class="provenance"
                >{solution.movedPoints} points moved · Speed
                {solution.speed}</span
              >
            </button>
          {/each}
          {#if group.others > 0}
            <p class="provenance px-3 py-2.5">
              +{group.others} more at the same cost
            </p>
          {/if}
          {#if group.message}
            <p class="provenance px-3 py-2.5">{group.message}</p>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
</section>
