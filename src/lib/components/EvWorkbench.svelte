<script lang="ts">
  import { tick } from 'svelte';
  import EvBenchmarks from '$lib/components/EvBenchmarks.svelte';
  import EvEditor from '$lib/components/EvEditor.svelte';
  import {
    buildBenchmarkIndex,
    DEFAULT_BENCHMARK_CONDITIONS,
    type BenchmarkConditions,
    type BenchmarkIndex,
  } from '$lib/benchmarks';
  import type { Member, Team } from '$lib/catalog';
  import type { CatalogSuggestion, SpreadSuggestion } from '$lib/workbench';

  let {
    member,
    teams,
    currentRegulation,
    spreadSuggestions,
    natureSuggestions,
    onspreadchange,
    onnaturechange,
  }: {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    spreadSuggestions: SpreadSuggestion[];
    natureSuggestions: CatalogSuggestion[];
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
  } = $props();

  let view = $state<'edit' | 'benchmarks'>('edit');
  let mode = $state<'incoming' | 'outgoing' | 'speed'>('incoming');
  let conditions = $state<BenchmarkConditions>(
    structuredClone(DEFAULT_BENCHMARK_CONDITIONS)
  );
  let editHeading = $state<HTMLElement>();
  let benchmarkHeading = $state<HTMLElement>();
  let root = $state<HTMLElement>();
  let editScroll = 0;
  let benchmarkScroll = 0;
  let memberKey = $state<string | null>(null);
  let cachedTeams: Team[] | undefined;
  let cachedRegulation = '';
  let cachedIndex: BenchmarkIndex | undefined;
  const index = $derived.by(() => {
    if (
      !cachedIndex ||
      cachedTeams !== teams ||
      cachedRegulation !== currentRegulation
    ) {
      cachedTeams = teams;
      cachedRegulation = currentRegulation;
      cachedIndex = buildBenchmarkIndex(teams, currentRegulation);
    }
    return cachedIndex;
  });

  $effect(() => {
    const nextKey = `${member.pokemon}|${member.item ?? ''}`;
    if (memberKey === null) memberKey = nextKey;
    else if (nextKey !== memberKey) {
      memberKey = nextKey;
      conditions = structuredClone(DEFAULT_BENCHMARK_CONDITIONS);
    }
  });

  function parentScroller() {
    return root?.closest<HTMLElement>('.overflow-y-auto') ?? null;
  }

  async function navigate(next: 'edit' | 'benchmarks') {
    const scroller = parentScroller();
    if (view === 'edit') editScroll = scroller?.scrollTop ?? editScroll;
    else benchmarkScroll = scroller?.scrollTop ?? benchmarkScroll;
    view = next;
    await tick();
    (next === 'edit' ? editHeading : benchmarkHeading)?.focus({
      preventScroll: true,
    });
    if (scroller)
      scroller.scrollTop = next === 'edit' ? editScroll : benchmarkScroll;
    if (next === 'edit') {
      root
        ?.querySelector<HTMLButtonElement>('[data-benchmark-trigger]')
        ?.focus({ preventScroll: true });
    }
  }

  function updateConditions(next: BenchmarkConditions) {
    conditions = next;
  }

  function useSpread(spread: string) {
    onspreadchange(spread, member.nature);
    void navigate('edit');
  }
</script>

<div bind:this={root}>
  <section hidden={view !== 'edit'} aria-labelledby="ev-workbench-heading">
    <h3
      bind:this={editHeading}
      id="ev-workbench-heading"
      tabindex="-1"
      class="sr-only"
    >
      EV editing
    </h3>
    <EvEditor
      {member}
      spread={member.spread || ''}
      nature={member.nature || ''}
      {spreadSuggestions}
      {natureSuggestions}
      {onspreadchange}
      {onnaturechange}
      form={conditions.self.form}
      onformchange={(form: string | null) =>
        updateConditions({ ...conditions, self: { ...conditions.self, form } })}
      onbenchmark={() => navigate('benchmarks')}
    />
  </section>

  <section hidden={view !== 'benchmarks'}>
    <button
      type="button"
      class="btn mb-3 min-h-11 btn-ghost"
      onclick={() => navigate('edit')}
    >
      Back to EV editing
    </button>
    <h3
      bind:this={benchmarkHeading}
      id="ev-benchmarks-heading"
      tabindex="-1"
      class="sr-only"
    >
      EV benchmarks
    </h3>
    <EvBenchmarks
      {member}
      {index}
      {teams}
      {conditions}
      onconditionschange={updateConditions}
      onusespread={useSpread}
      {mode}
      onmodechange={(next: 'incoming' | 'outgoing' | 'speed') => (mode = next)}
    />
  </section>
</div>
