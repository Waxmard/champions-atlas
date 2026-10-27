# Product specification

Champion's Atlas helps you choose Pokémon Champions doubles teams on a
phone. Existing spreadsheets are awkward to browse, and missingNO loses filters
when opening a team. The product focuses on reliable, fast discovery.

This document records agreed behavior that lives nowhere else: discovery and
browsing, saved-team editing and similarity rules, and acceptance criteria.
Import and result-ordering rules are in
[data sources](data-sources.md), the synced record model is in
[Firebase deployment and sync](firebase.md), and user-facing behavior, tooling,
and commands are in the [README](../README.md) and `AGENTS.md`.

## Discovery and browsing

- Provide mobile-friendly browsing for personal use.
- Browse teams with or without a Pokémon in mind.
- Combine multiple Pokémon filters using AND: every selected Pokémon must occur
  on the team.
- Attach item, move, and ability constraints to the selected Pokémon. A matching
  item on a different teammate does not satisfy that constraint.
- In Browse, a base Pokémon and its Mega share one selectable identity.
  Garchomp, Garchomp-Mega, and Garchomp-Mega-Z share Garchomp; Mawile and
  Mawile-Mega share Mawile; Floette-Eternal, Floette-Eternal-Mega, and
  Floette-Mega share Floette-Eternal. Ordinary Floette remains separate. Held
  item starts at Any item, followed by observed applicable Mega Stones ordered
  by frequency, then other observed items by descending frequency with item-name
  ties in deterministic ascending order. Options use the full catalog. An
  optional item constraint applies to that same actual team member. This Browse
  identity does not change imported species/forms, exports, or battle
  calculations. Legacy filters canonicalize to the shared identity while
  retaining explicit constraints; duplicate aliases remain invalid.
- Default Browse to the current regulation; make older regulations available
  through All regulations.
- Prioritize relevant results with the ordering in [data sources](data-sources.md).
- Show available team sets and original sources. Browse and Wishlist cards show
  one source chip: the ladder platform or tournament name for a reported result,
  or the featured channel or listing source otherwise. Keep placements on team
  details, and show result evidence, paste links, and copyable rental/replica
  codes when published.
- Preserve filters, sorting, and scroll position when opening teams and
  returning. Back to teams stays visible while browsing a team.
- Encode filters in the URL so a refresh or shared link restores the selection.
- Save current teams locally. Configured account sync is described in
  [Firebase deployment and sync](firebase.md).
- Distinguish teams usable unchanged from teams requiring adaptation. Do not
  silently modify imported teams.
- Known custom-rule teams stay hidden from Browse by default; **Include
  custom-rule teams** reveals them, while automatic recommendations always
  exclude them. The identification rule is in [data sources](data-sources.md).

Tournament details support team selection, not a separate tournament-browsing
product. A compact result label is sufficient.

Sources researched during planning and not imported: Limitless API, VGC History,
and MetaVGC. PokéKit stays later-use only, because aggregate spreads are not
proof of an individual team's build or a Champions ladder finish. This policy
adds no paid API, scraper, or subscription.

## Saved teams, similarity, and editing

Choose **Use this team** for a catalog team. **My teams** keeps an immutable
original and an editable copy. Catalog originals retain the full published sets
and source metadata available when saved; show that metadata as evidence for the
original, not the edited version. Older saved teams show only metadata they
retained. Custom originals are starting teams without public source claims;
never backfill legacy originals from a refreshed catalog.

**Revert changes** restores a team slot to its state when you opened the team.
It is unavailable when the set is unchanged, while editing or deleting, or when
restoration conflicts with the current roster.

Completed valid text saves on blur or Enter. Selections, clears, and suggestions
save immediately; invalid interim EV allocations remain uncommitted. There is no
separate Apply step.

**Done** commits valid pending input. **Close** offers to discard invalid or
failed-write input without undoing earlier autosaves. **Advanced set text**
explicitly replaces a set. Structured edits preserve nicknames and untouched
supported lines; they never guess unknown values.

The EV slider keeps its native keyboard controls and vertical page scrolling,
with a 44-pixel touch target across its full height. **Fill** adds or removes
points from the selected stat to reach 66 total, within that stat's 0–32 bounds.
It never changes another stat. If the selected stat cannot absorb the full
difference, the differing total stays uncommitted and the editor reports it when
you finish.

Nature choices, the current allocation, and spread suggestions remain visible
while manual controls are closed. **Adjust EVs manually** is a native disclosure
that starts closed whenever you open the EV editor. It contains the number
fields, quick allocation buttons, and sliders. The app does not save its open
state.

Record and reuse one explicit **my in-game set** per Browse identity,
representing the set currently in your Pokémon Champions box. Recording changes
only Champion's Atlas, never Pokémon Champions, and does not save the team
itself. A base Pokémon and its Mega share a slot; ordinary Floette and
Floette-Eternal remain separate. Legacy Garchomp-Mega-Z slots normalize to the
Garchomp identity when read. When a canonical slot and its legacy Mega-Z
duplicate both exist, the canonical slot is kept and the duplicate is dropped
silently on startup, during sync, and when another device shares it. The removal
is permanent and keeps no backup. A lone legacy slot keeps its member and only
takes the canonical id. Malformed data remains unreadable and untouched.
Record individual committed sets or **Record all in-game sets** from the selected
team's **My teams** overview, never from
the editor. These secondary actions use the Save icon and appear only when a
snapshot would change. Recording is unavailable while editing and never flushes
pending editor input or a pending team name. Individual replacements use native
confirmation. Bulk recording offers one checklist of different existing
snapshots, initially unchecked. Select one, several, all, or none to replace.
Unchecked Pokémon keep their latest recorded sets; selecting none still records
new snapshots. New and identical snapshots do not prompt, and identical
snapshots do not show a Record action. Canceling preserves every slot, including
new ones. Validate the entire batch before the choice and write it atomically,
retaining unrelated snapshots. Reject stale teams, account changes, duplicate
incoming Browse identities, and conflicting eligible-slot changes during the
choice without overwriting data.

Snapshots remain independent of teams. Team edits do not update them, and
deleting a team does not delete them. The app does not auto-seed current sets
from teams or create snapshot history during normal recording, and it keeps no
in-game set backups.

When a snapshot exists, its item, ability, nature, and move values appear as
subtly source-labelled choices in the corresponding editor suggestion surfaces.
A snapshot EV/nature pair appears only when its Nature matches the selected
Nature. Selecting a matching spread changes its EV allocation and keeps the
selected Nature unchanged. Duplicate values appear once with their sources
combined.

Selecting a field suggestion changes only that field, except a spread suggestion
changes EVs and Nature together.

A whole-set suggestion previews structured changes,
including form and ordered moves; it discloses raw set text and saved metadata
changes before selection. Selecting the suggestion applies the complete saved
snapshot subject to normal editor and roster validation. Saved team cards do not
offer a direct reuse action.

Suggestions are keyboard-operable. Operation errors use alerts, and successful
actions use status messages.

Background reconciliation remains active while an editor is mounted; the form
stays unchanged, and stale saves retain pending input rather than overwrite a
remote change or recreate a deleted team. The immutable original and the current
team synchronize across devices.

Saved teams can be deleted after confirmation. If the deleted team was active,
the next saved team becomes active; deleting the last one returns to the empty
My teams view. Deletion also discards unsaved edits to that team. The app
remembers the last successfully visited browse, team-detail, or My teams URL for
a bare-root reload and returns to it after sign-in. Explicit links take
precedence, and a missing remembered detail falls back to browsing. The main
navigation remains visible while scrolling, and selecting a Pokémon clears its
search input for the next choice.

An explicit saved-team link with no saved teams keeps its URL and shows a
missing-team notice. Resuming a deleted saved team opens the empty My teams view
and clears its active selection.

Saving requires available browser storage; clearing the origin's storage removes
local saves. Only unsaved input prompts before navigation. Browse filters and
position remain device-local.

Similarity counts shared Pokémon first, matching known item/ability/nature/EV
fields and moves next, then uses result ordering for ties. All regulations are
included. Replacement sets favor retaining the chosen Pokémon and its set
details, then use source-team ranking for ties, with duplicate sets collapsed and
species already in another slot excluded. Sources need not match the fixed five
members exactly. Source result claims are not attributed to the user's edited
team. Exact forms remain distinct.

- One Pokémon toggle replaces individual item, move, and ability locks.
- Show concrete differences for the proposed single-slot replacement.
- Retain published set text and source history on edits.
- Preserve the original imported team when creating an edited draft.

In **Original & history**, compare the current team with the immutable original.
Restore the original team with its name, sets, and roster order without changing
its saved ID or source history. **Restore original set** is available only when
it does not duplicate a Pokémon or exceed the replacement Mega limit.

The two-Mega limit applies to Pokémon replacement suggestions.

EV spread suggestions include only complete, standard pairs whose Nature matches
the selected Nature and whose spread resolves to the current battle form.
Matching immutable original and in-game pairs come first. Exact duplicate pairs
appear once with their source labels combined. The initial list contains up to
five additional unique catalog pairs after up to two matching saved-source pairs.
**Show more** appends up to five additional catalog pairs in the same ranked
order. It disappears when no eligible pairs remain and focuses the first newly
revealed row. Expansion does not change saved teams. Selecting a spread, adjusting
EVs, or selecting the same Nature preserves the expanded depth. Selecting a
different Nature or reopening the EV editor resets the catalog allowance to five.
Fewer rows appear when eligible recorded data is insufficient. Matching catalog
pairs rank by the best actual source team's shared teammates and matching set
details for those teammates, then by published results, regulation, and credentials.
Catalog frequency breaks ties before publication date or ID. Catalog counts use
catalog observations only. Original and in-game suggestions retain their source
labels and do not fill in unpublished original EVs.

Original field suggestions use exact Pokémon identity or a successfully
resolved matching battle form, never unrelated base forms. In-game field values
follow original values and precede catalog values.

Each spread shows its own unmodified level-50 Speed, without item, ability,
weather, or other battle modifiers. The app ranks recorded sets rather than
solving survive, KO, or outspeed benchmarks. It does not show a catalog Speed
percentile or offer a calculator handoff.

Inferred archetype and role tags are enrichment, never evidence: they carry no
result label and never outrank a sourced result. They break ties among teams that
already share the same teammates and set details and are equally proven; the
keyword half of that tiebreak works without them. See
[data sources](data-sources.md) for how they are generated and validated.

Custom text import starts in **My teams** with a required name and complete
Showdown-style paste. It accepts exactly six unique Pokémon, each with an item,
ability, nature, EVs, and four unique moves. Export the text from
[Pokémon Showdown Teambuilder](https://play.pokemonshowdown.com/teambuilder)
and paste it into Champion's Atlas. Imported text becomes the immutable original
snapshot, where nickname, gender, and unknown lines remain intact; IVs, level,
and Tera Type are omitted from displayed and exported Champions text. Custom
teams are saved locally under the current regulation with legality unverified and
no published result claims.

In **Wishlist**, **Poképaste link** accepts a direct `pokepast.es` URL and
**Import to Wishlist** saves the team without changing the active team. An
existing bookmark is returned unchanged; a matching catalog team is bookmarked
with its source metadata without a network request. Otherwise the app fetches
the paste directly from Poképaste and applies the same six-set requirements as
custom text import. A failed fetch or invalid paste leaves saved data unchanged
and the link available to retry. File, screenshot, rental-code, and social-post
imports are out of scope.

Export current sets with Champions EV normalization, using 0–32 per stat. Omit
IVs, level, Tera Type, and unknown values. Never assign edited teams new rental
codes.

Similarity can suggest alternatives without AI. It cannot recover unpublished
spreads. Any borrowed or inferred spread must remain separate from sourced data.

**Wishlist** is a bookmark collection over the same saved-team records: a record
without a collection belongs to My teams, and a `wishlist` record is excluded
from My teams selection and its active-team fallback. Move a record in either
direction without changing its ID, original snapshot, edits, or sources. Moving
from My teams is unavailable while edits are pending and rejects stale records
or a conflicting Wishlist copy. Separate copies are never merged.

The catalog **Wishlist** button adds a bookmark or, after confirmation, removes
the matching saved Wishlist copy and its edits; My teams copies remain unchanged.
If multiple Wishlist records match, remove them individually in Wishlist rather
than deleting them together. Using a bookmarked catalog team promotes the same
record; if multiple bookmarks match, choose one in Wishlist. Removal rejects a
record that is no longer a bookmark so a stale control cannot delete a promoted
team. A bookmark whose source team leaves the catalog stays usable with its saved
roster and no catalog details. Both collections share the same storage ceiling
and sync path (see [storage and sync](firebase.md)).

The bundled iOS app uses native Google sign-in and the same local storage and
Firebase sync model. After a successful sign-in, it can open saved data offline;
sync resumes when connected. A first sign-in may require connectivity. Native
setup and signing are described in [Firebase deployment and sync](firebase.md).

The My teams picker shows only in-use teams. Its icon-first search covers the
current team name and each member's species, with exact, prefix, substring, and
character-subsequence tiers, requiring every whitespace-separated term to match.
Arrow keys and Enter select a result; Escape restores the current team without
renaming it.

## Future scope

- Support installation as a PWA for personal use.
- AI integration and separately verified subscription/API billing options.
- Screenshot and team-ID import.
- Native share extension.

## Acceptance criteria

- Two selected Pokémon must both appear in every result.
- An item/move/ability constraint must match the intended team member.
- Forms and Megas match the explicit selection consistently.
- Opening several teams and returning preserves filters, sort, and scroll.
- Reloading a filtered URL restores its filters.
- Ranking checks reproduce every agreed comparison in
  [data sources](data-sources.md).
- Old regulations remain discoverable and visibly labeled.
- Unknown placements, tiers, spreads, and legality are not fabricated.
- Reimporting does not create duplicate teams or erase valid cached data on failure.
- Current team(s) survive reload and app reopening without a cloud account.
- Mobile layout, keyboard access, and reduced-motion behavior work; state
  transitions are smooth without disturbing browsing position.
- Relevant tests, lint, type checking, and production build pass with the selected
  toolchain.
