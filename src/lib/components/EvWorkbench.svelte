<script lang="ts">
  import EvEditor from '$lib/components/EvEditor.svelte';
  import { buildBenchmarkIndex, type BenchmarkIndex } from '$lib/benchmarks';
  import {
    recommendSpreads,
    type SpreadRecommendation,
  } from '$lib/benchmark-suggestions';
  import type { Member, Team } from '$lib/catalog';
  import type { CatalogSuggestion } from '$lib/workbench';

  let {
    member,
    teams,
    currentRegulation,
    natureSuggestions,
    onspreadchange,
    onnaturechange,
  }: {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    natureSuggestions: CatalogSuggestion[];
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
  } = $props();

  let recommendations = $state<SpreadRecommendation[]>([]);
  let recommendationMessage = $state<string | null>(null);
  let recommendationsPending = $state(true);
  let recommendationError = $state(false);
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
  const regulationTeams = $derived(
    teams.filter((team) => team.regulation === currentRegulation)
  );

  $effect(() => {
    const snapshot = { ...member, moves: [...member.moves] };
    const benchmarkIndex = index;
    const currentTeams = regulationTeams;
    recommendations = [];
    recommendationMessage = null;
    recommendationError = false;
    recommendationsPending = true;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void recommendSpreads(
        snapshot,
        benchmarkIndex,
        currentTeams,
        controller.signal
      )
        .then((result) => {
          if (controller.signal.aborted) return;
          recommendations = result.suggestions;
          recommendationMessage = result.message;
          recommendationsPending = false;
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          recommendationError = true;
          recommendationsPending = false;
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });
</script>

<EvEditor
  {member}
  spread={member.spread || ''}
  nature={member.nature || ''}
  {recommendations}
  {recommendationMessage}
  {recommendationsPending}
  {recommendationError}
  {currentRegulation}
  teams={regulationTeams}
  {natureSuggestions}
  {onspreadchange}
  {onnaturechange}
/>
