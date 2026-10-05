<script lang="ts">
  import EvEditor from '$lib/components/EvEditor.svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { buildBenchmarkIndex, type BenchmarkIndex } from '$lib/benchmarks';
  import { normalize, type Member, type Team } from '$lib/catalog';
  import {
    catalogSpreadSuggestions,
    ownSpreadSuggestions,
    type CatalogSuggestion,
    type OwnTeamSet,
    type SpreadSuggestion,
  } from '$lib/workbench';

  let {
    member,
    teams,
    currentRegulation,
    natureSuggestions,
    ownTeams,
    excludeOwnTeamId,
    onspreadchange,
    onnaturechange,
  }: {
    member: Member;
    teams: Team[];
    currentRegulation: string;
    natureSuggestions: CatalogSuggestion[];
    ownTeams: OwnTeamSet[];
    excludeOwnTeamId: string | null;
    onspreadchange: (spread: string, nature?: string | null) => void;
    onnaturechange: (nature: string) => void;
  } = $props();

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
  const spreadKey = (nature: string, spread: string) =>
    `${normalize(nature)}|${normalize(spread)}`;

  const spreadSuggestions = $derived.by(() => {
    const seen = new SvelteSet<string>();
    const rows: SpreadSuggestion[] = [];
    for (const option of ownSpreadSuggestions(
      member,
      ownTeams,
      excludeOwnTeamId
    )) {
      const key = spreadKey(option.nature, option.spread);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        spread: option.spread,
        nature: option.nature,
        source: `${option.teamName} · ${option.regulation}`,
        deltas: option.deltas,
        movedPoints: option.movedPoints,
        speed: option.speed,
      });
    }
    for (const option of catalogSpreadSuggestions(
      member,
      teams,
      currentRegulation
    )) {
      const key = spreadKey(option.nature, option.spread);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        spread: option.spread,
        nature: option.nature,
        source:
          `${option.totalCount} catalog team${option.totalCount === 1 ? '' : 's'}` +
          (option.currentCount
            ? ` · ${option.currentCount} in ${currentRegulation}`
            : ''),
        deltas: option.deltas,
        movedPoints: option.movedPoints,
        speed: option.speed,
      });
    }
    return rows.slice(0, 6);
  });
</script>

<EvEditor
  {member}
  spread={member.spread || ''}
  nature={member.nature || ''}
  {index}
  {spreadSuggestions}
  {currentRegulation}
  teams={regulationTeams}
  {natureSuggestions}
  {onspreadchange}
  {onnaturechange}
/>
