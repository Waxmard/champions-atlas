<script lang="ts">
  import { battleFormChoices, resolveBattleForm } from '$lib/battle-forms';
  import type {
    BenchmarkConditions,
    CombatantConditions,
  } from '$lib/benchmarks';
  import type { Member } from '$lib/catalog';

  let {
    conditions,
    self,
    opponent,
    onconditionschange,
  }: {
    conditions: BenchmarkConditions;
    self: Member;
    opponent: Member | null;
    onconditionschange: (next: BenchmarkConditions) => void;
  } = $props();

  const sides = ['self', 'opponent'] as const;
  const stats = ['Atk', 'Def', 'SpA', 'SpD', 'Spe'] as const;
  const statuses = [
    ['', 'None'],
    ['brn', 'Burn'],
    ['par', 'Paralysis'],
    ['psn', 'Poison'],
    ['tox', 'Badly poisoned'],
    ['slp', 'Sleep'],
    ['frz', 'Freeze'],
  ] as const;
  const weatherOptions = ['', 'Sun', 'Rain', 'Sand', 'Snow'] as const;
  const terrainOptions = [
    '',
    'Electric',
    'Grassy',
    'Psychic',
    'Misty',
  ] as const;
  const sideLabel = (side: 'self' | 'opponent') =>
    side === 'self' ? 'Your Pokémon' : 'Opponent';

  function updateCombatant(
    side: 'self' | 'opponent',
    patch: Partial<CombatantConditions>
  ) {
    onconditionschange({
      ...conditions,
      [side]: { ...conditions[side], ...patch },
    });
  }

  function updateBoost(
    side: 'self' | 'opponent',
    stat: (typeof stats)[number],
    value: number
  ) {
    updateCombatant(side, {
      boosts: { ...conditions[side].boosts, [stat]: value },
    });
  }

  function updateField<K extends keyof BenchmarkConditions>(
    key: K,
    value: BenchmarkConditions[K]
  ) {
    onconditionschange({ ...conditions, [key]: value });
  }

  function abilityName(member: Member, combatant: CombatantConditions) {
    return (
      resolveBattleForm(member, combatant.form ?? undefined).ability ??
      'No ability'
    );
  }

  function conditionSummary() {
    const parts: string[] = [];
    for (const side of sides) {
      const combatant = conditions[side];
      const member = side === 'self' ? self : opponent;
      const name = sideLabel(side);
      if (combatant.hpPercent !== 100)
        parts.push(`${name} ${combatant.hpPercent}% HP`);
      if (combatant.form) parts.push(`${name}: ${combatant.form}`);
      for (const stat of stats) {
        const stage = combatant.boosts[stat];
        if (stage)
          parts.push(`${name} ${stat} ${stage > 0 ? '+' : ''}${stage}`);
      }
      if (combatant.status)
        parts.push(
          `${name}: ${statuses.find(([value]) => value === combatant.status)?.[1]}`
        );
      if (combatant.abilityOn && member)
        parts.push(`${name}: ${abilityName(member, combatant)} effect active`);
    }
    if (conditions.weather) parts.push(conditions.weather);
    if (conditions.terrain) parts.push(`${conditions.terrain} terrain`);
    if (conditions.reflect) parts.push('Reflect');
    if (conditions.lightScreen) parts.push('Light Screen');
    if (conditions.helpingHand) parts.push('Helping Hand');
    if (!conditions.spreadDamage) parts.push('Single-target damage');
    if (conditions.criticalHit) parts.push('Critical hit');
    return (
      parts.join(' · ') ||
      'Defaults: full HP · neutral boosts · no status, weather, or terrain'
    );
  }
</script>

<details class="border-y border-base-300 py-2">
  <summary
    class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"
  >
    <span>Battle conditions</span>
    <span class="provenance text-right font-normal">{conditionSummary()}</span>
  </summary>

  <div class="grid gap-4 pt-3 sm:grid-cols-2">
    {#each sides as side (side)}
      {@const member = side === 'self' ? self : opponent}
      {@const combatant = conditions[side]}
      {@const name = sideLabel(side)}
      {@const ability = member ? abilityName(member, combatant) : 'No ability'}
      <fieldset
        class="min-w-0 space-y-3 border border-base-300 p-3"
        disabled={side === 'opponent' && !opponent}
      >
        <legend class="px-1 text-sm font-semibold"
          >{name}{member ? ` · ${member.pokemon}` : ''}</legend
        >
        {#if !member}
          <p class="provenance">Choose an opponent to edit its conditions.</p>
        {:else}
          <label class="block space-y-1 text-sm">
            <span class="term">Battle form</span>
            <select
              aria-label={`${name} battle form`}
              class="select min-h-11 w-full"
              value={combatant.form ?? ''}
              onchange={(event) =>
                updateCombatant(side, {
                  form: event.currentTarget.value || null,
                })}
            >
              <option value="">Default form</option>
              {#each battleFormChoices(member) as form (form)}
                <option value={form}>{form}</option>
              {/each}
            </select>
          </label>

          <label class="block space-y-1 text-sm">
            <span class="term">HP remaining (%)</span>
            <input
              aria-label={`${name} HP remaining percentage`}
              class="input min-h-11 w-full tabular-nums"
              type="number"
              min="1"
              max="100"
              step="1"
              value={combatant.hpPercent}
              oninput={(event) => {
                const value = Number(event.currentTarget.value);
                if (Number.isFinite(value))
                  updateCombatant(side, {
                    hpPercent: Math.max(1, Math.min(100, value)),
                  });
              }}
            />
          </label>

          <fieldset class="grid grid-cols-2 gap-2 border-0 p-0">
            <legend class="term col-span-2 mb-1 text-sm">Stat boosts</legend>
            {#each stats as stat (stat)}
              <label class="block space-y-1 text-sm">
                <span>{stat}</span>
                <select
                  aria-label={`${name} ${stat} boost`}
                  class="select min-h-11 w-full tabular-nums"
                  value={combatant.boosts[stat]}
                  onchange={(event) =>
                    updateBoost(side, stat, Number(event.currentTarget.value))}
                >
                  {#each Array.from({ length: 13 }, (_, index) => index - 6) as stage (stage)}
                    <option value={stage}
                      >{stage > 0 ? `+${stage}` : stage}</option
                    >
                  {/each}
                </select>
              </label>
            {/each}
          </fieldset>

          <label class="block space-y-1 text-sm">
            <span class="term">Status</span>
            <select
              aria-label={`${name} status`}
              class="select min-h-11 w-full"
              value={combatant.status}
              onchange={(event) =>
                updateCombatant(side, {
                  status: event.currentTarget
                    .value as CombatantConditions['status'],
                })}
            >
              {#each statuses as [value, label] (value)}
                <option {value}>{label}</option>
              {/each}
            </select>
          </label>

          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              class="checkbox checkbox-sm"
              type="checkbox"
              aria-label={`${name}: ${ability} conditional effect active`}
              checked={combatant.abilityOn}
              disabled={ability === 'No ability'}
              onchange={(event) =>
                updateCombatant(side, {
                  abilityOn: event.currentTarget.checked,
                })}
            />
            <span>
              <span class="font-medium"
                >{ability} conditional effect active</span
              >
              <span class="provenance block"
                >Tracks conditional effects, such as Flash Fire after a Fire
                hit. Passive effects remain active; Intimidate is an entry
                trigger, and Competitive's SpA boost is set under Stat boosts.</span
              >
            </span>
          </label>
        {/if}
      </fieldset>
    {/each}

    <fieldset
      class="min-w-0 space-y-3 border border-base-300 p-3 sm:col-span-2"
    >
      <legend class="px-1 text-sm font-semibold">Battlefield</legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block space-y-1 text-sm">
          <span class="term">Weather</span>
          <select
            aria-label="Weather"
            class="select min-h-11 w-full"
            value={conditions.weather}
            onchange={(event) =>
              updateField(
                'weather',
                event.currentTarget.value as BenchmarkConditions['weather']
              )}
          >
            {#each weatherOptions as value (value)}<option {value}
                >{value || 'None'}</option
              >{/each}
          </select>
        </label>
        <label class="block space-y-1 text-sm">
          <span class="term">Terrain</span>
          <select
            aria-label="Terrain"
            class="select min-h-11 w-full"
            value={conditions.terrain}
            onchange={(event) =>
              updateField(
                'terrain',
                event.currentTarget.value as BenchmarkConditions['terrain']
              )}
          >
            {#each terrainOptions as value (value)}<option {value}
                >{value || 'None'}</option
              >{/each}
          </select>
        </label>
      </div>
      <div class="grid gap-x-3 sm:grid-cols-2">
        {#each [['reflect', 'Reflect'], ['lightScreen', 'Light Screen'], ['helpingHand', 'Helping Hand'], ['spreadDamage', 'Spread damage'], ['criticalHit', 'Critical hit']] as [key, label] (key)}
          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              class="checkbox checkbox-sm"
              type="checkbox"
              aria-label={label}
              checked={conditions[
                key as
                  | 'reflect'
                  | 'lightScreen'
                  | 'helpingHand'
                  | 'spreadDamage'
                  | 'criticalHit'
              ]}
              onchange={(event) =>
                updateField(
                  key as
                    | 'reflect'
                    | 'lightScreen'
                    | 'helpingHand'
                    | 'spreadDamage'
                    | 'criticalHit',
                  event.currentTarget.checked
                )}
            />
            {label}
          </label>
        {/each}
      </div>
    </fieldset>
  </div>
</details>
