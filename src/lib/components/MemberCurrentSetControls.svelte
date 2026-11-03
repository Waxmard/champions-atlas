<script lang="ts">
  import { tick } from 'svelte';
  import { Popover } from 'bits-ui';
  import Ellipsis from '@lucide/svelte/icons/ellipsis';
  import Pencil from '@lucide/svelte/icons/pencil';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Save from '@lucide/svelte/icons/save';
  import { localImageSrc } from '#lib/assets.js';
  import type { Member } from '#lib/catalog.js';
  import CurrentSetSaveButton from '#lib/components/CurrentSetSaveButton.svelte';
  import {
    CHAMPIONS_STATS,
    natureEffect,
    parseChampionsSpread,
  } from '#lib/paste.js';
  import ItemIcon from '#lib/components/ItemIcon.svelte';
  import type { EditableSetField } from '#lib/components/MemberCard.svelte';
  import PokemonSprite from '#lib/components/PokemonSprite.svelte';
  import TypeBadge from '#lib/components/TypeBadge.svelte';
  import UnknownValue from '#lib/components/UnknownValue.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import { activeSpreadSource } from '#lib/spread-provenance.js';
  import { getMoveType, getPokemonTypes, TYPE_COLORS } from '#lib/types.js';

  let {
    teamId,
    baseline,
    members,
    memberIndex,
    disabled = false,
    editing = false,
    onedit,
    onrevert,
    revertDisabled = false,
    revertReason = '',
  }: {
    teamId: string;
    baseline: string;
    members: Member[];
    memberIndex: number;
    disabled?: boolean;
    editing?: boolean;
    onedit: (field: EditableSetField) => void;
    onrevert: () => void;
    revertDisabled?: boolean;
    revertReason?: string;
  } = $props();
  const member = $derived(members[memberIndex]);
  const types = $derived(getPokemonTypes(member.pokemon));
  const effect = $derived(natureEffect(member.nature));
  const spread = $derived(
    member.spread?.trim() ? parseChampionsSpread(member.spread) : null
  );
  const itemSrc = $derived(
    member.item?.trim() ? localImageSrc('items', member.item) : ''
  );
  const band = $derived(
    `linear-gradient(135deg, color-mix(in oklab, ${TYPE_COLORS[types[0]]} 24%, var(--color-base-100)), color-mix(in oklab, ${TYPE_COLORS[types[types.length - 1]]} 24%, var(--color-base-100)))`
  );
  const spreadSource = $derived(activeSpreadSource(member));
  let record = $state<{
    save: (event: MouseEvent) => void;
    canRecord: () => boolean;
  }>();
  const canRecord = $derived(record?.canRecord() ?? false);
  const hasActions = $derived(
    canRecord || !revertDisabled || !!revertReason || !!spreadSource
  );
  let actionsOpen = $state(false);
  let setButton = $state<HTMLButtonElement | null>(null);
  let returnToSet = false;

  function keepFocus(event: PointerEvent) {
    event.preventDefault();
  }

  function focusActionTrigger(event: MouseEvent) {
    (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
  }

  function recordSet(event: MouseEvent) {
    returnToSet = true;
    record?.save(event);
    actionsOpen = false;
  }

  function revertSet() {
    returnToSet = true;
    actionsOpen = false;
    onrevert();
  }

  function restoreSetFocus(event: Event) {
    if (!returnToSet) return;
    event.preventDefault();
    void tick().then(() => {
      setButton?.focus({ preventScroll: true });
      returnToSet = false;
    });
  }
</script>

<div
  class="plate @container min-w-0 overflow-hidden leading-[1.4] text-base-content"
>
  <div class="grid min-w-0 gap-1 px-3 py-2" style:background={band}>
    <div class="flex min-w-0 items-start gap-1">
      <button
        bind:this={setButton}
        type="button"
        class="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 rounded-[var(--radius-field)] px-2 text-start text-base leading-[1.4] font-bold text-base-content hover:bg-base-100/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 disabled:pointer-events-none disabled:opacity-50"
        aria-label={`Edit set for ${member.pokemon}`}
        data-set-field="set"
        disabled={disabled || editing}
        onclick={() => onedit('set')}
      >
        <span
          class="min-w-0 flex-1 wrap-anywhere whitespace-pre-wrap select-text"
          >{member.pokemon}</span
        >
        <Pencil class="size-4 shrink-0" aria-hidden="true" />
      </button>
      <Popover.Root bind:open={actionsOpen}>
        <Popover.Trigger onclick={focusActionTrigger}>
          {#snippet child({ props })}
            {#if hasActions}
              <Button
                {...props}
                variant="quiet"
                size="icon-compact"
                class="size-11 shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
                aria-label={`More actions for ${member.pokemon}`}
                data-preserve-team-name
              >
                <Ellipsis class="size-4" aria-hidden="true" />
              </Button>
            {/if}
          {/snippet}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            role="dialog"
            aria-label={`More actions for ${member.pokemon}`}
            data-preserve-team-name
            align="end"
            sideOffset={8}
            trapFocus={false}
            onCloseAutoFocus={restoreSetFocus}
            class="z-50 flex max-h-[calc(100dvh-1rem)] w-64 max-w-[calc(100vw-1rem)] min-w-0 flex-col gap-1 overflow-y-auto overscroll-contain rounded-[var(--radius-field)] border border-base-300 bg-base-100 p-2 text-base-content shadow-lg"
          >
            {#if canRecord}
              <Button
                variant="quiet"
                class="h-auto min-h-11 w-full justify-start text-start whitespace-normal"
                disabled={disabled || editing}
                aria-label={`Record in-game set for ${member.pokemon}`}
                onpointerdown={keepFocus}
                onclick={recordSet}
              >
                <Save class="size-4" aria-hidden="true" />
                <span>Record in-game set</span>
              </Button>
            {/if}
            {#if !revertDisabled}
              <Button
                variant="quiet"
                class="h-auto min-h-11 w-full justify-start text-start whitespace-normal"
                disabled={disabled || editing}
                aria-label={`Revert changes for ${member.pokemon}`}
                onclick={revertSet}
              >
                <RotateCcw class="size-4" aria-hidden="true" />
                <span>Revert changes</span>
              </Button>
            {/if}
            {#if revertReason}
              <p class="provenance min-w-0 wrap-anywhere">{revertReason}</p>
            {/if}
            {#if spreadSource}
              <a
                class="inline-flex min-h-11 min-w-0 link items-center text-sm leading-[1.4] wrap-anywhere focus-visible:ring-2 focus-visible:ring-primary"
                href={spreadSource.pasteUrl}
                target="_blank"
                rel="external noreferrer"
              >
                {spreadSource.borrowedNature
                  ? 'EVs and Nature from linked creator paste'
                  : 'EVs from linked creator paste'}
              </a>
              {#each spreadSource.videoUrls as videoUrl, index (videoUrl)}
                <a
                  class="inline-flex min-h-11 min-w-0 link items-center text-sm leading-[1.4] wrap-anywhere focus-visible:ring-2 focus-visible:ring-primary"
                  href={videoUrl}
                  target="_blank"
                  rel="external noreferrer"
                  aria-label={`Video provenance ${index + 1} for ${member.pokemon}'s linked creator paste`}
                >
                  Video provenance {index + 1}
                </a>
              {/each}
            {/if}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
    <div class="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" class="grid size-14 shrink-0 place-items-center">
        <PokemonSprite pokemon={member.pokemon} size={56} />
      </span>
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {#each types as type (type)}
          <span
            class="grid size-6 shrink-0 place-items-center rounded-[var(--radius-field)]"
            style:background-color={TYPE_COLORS[type]}
            title={type}
          >
            <TypeBadge {type} size="md" />
          </span>
        {/each}
        {#if member.ability?.trim()}
          <span class="min-w-0 text-sm wrap-anywhere whitespace-pre-wrap"
            >{member.ability}</span
          >
        {:else}
          <span class="unknown px-1 text-xs">Unknown ability</span>
        {/if}
        {#if itemSrc}
          <span class="ms-auto shrink-0" title={member.item}>
            <ItemIcon item={member.item ?? ''} size={28} />
            <span class="sr-only">Item: {member.item}</span>
          </span>
        {:else if member.item?.trim()}
          <span class="ms-auto text-sm wrap-anywhere whitespace-pre-wrap"
            >{member.item}</span
          >
        {:else}
          <span class="unknown ms-auto px-1 text-xs">Unknown item</span>
        {/if}
      </div>
    </div>
  </div>

  <div class="grid min-w-0 gap-3 px-2.5 py-3">
    {#if !member.spread?.trim() && !member.nature?.trim()}
      <div class="flex flex-wrap gap-1">
        <span class="unknown px-1 text-xs">Unknown EVs</span>
        <span class="unknown px-1 text-xs">Unknown nature</span>
      </div>
    {:else}
      {#if !member.spread?.trim()}
        <span class="unknown justify-self-start px-1 text-xs">Unknown EVs</span>
      {:else if spread === null}
        <p
          class="text-[0.8125rem] wrap-anywhere whitespace-pre-wrap tabular-nums"
        >
          {member.spread}
        </p>
      {:else}
        <dl
          class="grid grid-cols-6 gap-0 text-center"
          title={member.nature ? `${member.nature} nature` : undefined}
        >
          {#each CHAMPIONS_STATS as stat (stat)}
            {@const tone =
              effect?.raised === stat
                ? 'raised'
                : effect?.lowered === stat
                  ? 'lowered'
                  : ''}
            <div class="min-w-0">
              <dt
                class="text-[0.6875rem] leading-[1.4] font-bold {tone ===
                'raised'
                  ? 'text-[color:var(--color-error-content)]'
                  : tone === 'lowered'
                    ? 'text-[color:var(--color-info-content)]'
                    : 'text-[color:var(--color-muted)]'}"
              >
                {stat}{#if tone}<span class="sr-only">, {tone} by nature</span
                  >{/if}
              </dt>
              <dd class="text-sm tabular-nums">
                {#if spread[stat]}{spread[stat]}{:else}<span
                    aria-hidden="true"
                    class="text-[color:var(--color-muted)]">·</span
                  ><span class="sr-only">0</span>{/if}{#if tone}<span
                    aria-hidden="true"
                    class="text-[0.6875rem] font-bold {tone === 'raised'
                      ? 'text-[color:var(--color-error-content)]'
                      : 'text-[color:var(--color-info-content)]'}"
                    >{tone === 'raised' ? '↑' : '↓'}</span
                  >{/if}
              </dd>
              <div
                aria-hidden="true"
                class="mx-auto mt-0.5 h-1 w-full rounded-full bg-base-200"
              >
                <div
                  class="h-full rounded-full {tone === 'raised'
                    ? 'bg-[var(--color-error-content)]'
                    : tone === 'lowered'
                      ? 'bg-[var(--color-info-content)]'
                      : 'bg-[var(--color-muted)]'}"
                  style:width="{(spread[stat] / 32) * 100}%"
                ></div>
              </div>
            </div>
          {/each}
        </dl>
      {/if}
      {#if !member.nature?.trim()}
        <span class="unknown justify-self-start px-1 text-xs"
          >Unknown nature</span
        >
      {:else}
        <span class="sr-only">Nature: {member.nature}</span>
      {/if}
    {/if}

    {#if member.moves.length}
      <ol
        role="list"
        class="grid min-w-0 gap-1 text-sm leading-[1.4] @2xs:grid-cols-2"
      >
        {#each [0, 1, 2, 3] as index (index)}
          {@const move = member.moves[index] ?? ''}
          {@const trimmedMove = move.trim()}
          {@const type = trimmedMove ? getMoveType(trimmedMove) : null}
          <li
            class="flex min-h-8 min-w-0 rounded-[var(--radius-field)] bg-base-200 text-base-content"
          >
            <span
              class="flex w-7 shrink-0 items-center justify-center rounded-s-[var(--radius-field)]"
              style:background-color={type
                ? TYPE_COLORS[type]
                : 'var(--color-base-300)'}
            >
              {#if type}<TypeBadge {type} size="md" />{/if}
            </span>
            <span
              class="min-w-0 flex-1 px-1.5 py-1 wrap-anywhere whitespace-pre-wrap"
              >{trimmedMove ? move : 'Empty'}</span
            >
          </li>
        {/each}
      </ol>
    {:else}
      <div class="text-sm leading-[1.4]"><UnknownValue /></div>
    {/if}
  </div>
</div>
<div class="record-status">
  <CurrentSetSaveButton
    bind:this={record}
    {teamId}
    {baseline}
    {memberIndex}
    pokemon={member.pokemon}
    {disabled}
    {members}
  />
</div>

<style>
  .record-status :global(p[role='alert']:not(.sr-only)) {
    padding: 0.5rem;
    border: 1px solid var(--color-base-300);
    border-radius: var(--radius-field);
    background: var(--color-base-100);
    overflow-wrap: anywhere;
  }
</style>
