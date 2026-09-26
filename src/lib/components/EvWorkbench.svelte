<script lang="ts">
  import EvEditor from '$lib/components/EvEditor.svelte';
  import { buildBenchmarkIndex, type BenchmarkIndex } from '$lib/benchmarks';
  import type { Member, Team } from '$lib/catalog';
  import {
    ownSpreadSuggestions,
    type CatalogSuggestion,
    type OwnTeamSet,
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
  const ownSpreads = $derived(
    ownSpreadSuggestions(member, ownTeams, excludeOwnTeamId)
  );
</script>

<EvEditor
  {member}
  spread={member.spread || ''}
  nature={member.nature || ''}
  {index}
  {ownSpreads}
  {currentRegulation}
  teams={regulationTeams}
  {natureSuggestions}
  {onspreadchange}
  {onnaturechange}
/>
