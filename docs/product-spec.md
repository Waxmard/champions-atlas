# Product specification

Champion's Atlas is an iOS app that helps you choose Pokémon Champions doubles
teams. Existing spreadsheets are awkward to browse, and missingNO loses filters
when opening a team. The product focuses on reliable, fast discovery. Browser
development, preview, and tests are local shared-UI tools, not a supported website
or PWA.

This document records agreed behavior that lives nowhere else: discovery and
browsing, saved-team editing and similarity rules, and acceptance criteria.
Import and result-ordering rules are in
[data sources](data-sources.md), the synced record model is in
[iOS installation and Firebase sync](firebase.md), and user-facing behavior, tooling,
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
- Browse lists every regulation, newest first, with each card labelled by
  regulation. Selected Pokémon stay compact on the page; **Filters** opens a
  pop-up with item, ability, and move controls for each selection, plus
  **Unknown regulation only** (`?unknown=1`). Older links and saved filters
  that carry a regulation choice are ignored.
- A team of Unknown regulation shows a regulation picker on its page, offering
  only regulations whose roster the whole team is legal in. The choice is saved
  on the device, marked "Set by you", synced with a signed-in account, and
  treated as the team's regulation everywhere. Choosing "Regulation unknown"
  reverts it.
- Prioritize relevant results with the ordering in [data sources](data-sources.md).
- Saving or moving a team does not hide its catalog entry; Browse filters still
  apply.
- Show available team sets and original sources. Browse and Wishlist cards show
  one source chip: the ladder platform or tournament name for a reported result,
  or the featured channel or listing source otherwise. Keep placements on team
  details, and show result evidence, paste links, and copyable rental/replica
  codes when published.
- Preserve Browse filters and scroll position when opening teams and returning.
  Back to teams stays visible while browsing a team.
- Encode Browse filters in the URL so a refresh or shared link restores the selection.
- Mark Browse cards from the latest catalog batch (the most recent publish that
  added teams) with a blue dot before the team name; the dot stays until a later
  batch replaces it. **New teams only** in Browse filters (`?new=1`) shows just
  those teams.
- Signed-in iPhone users can turn off **Notifications → New teams** in the
  account menu (on by default, stored on the device). The catalog refresh sends
  one banner per batch counting its current-regulation teams, with a body naming
  the tournaments and YouTubers they came from. Tapping it opens Browse with
  **New teams only** on.
- Save current teams locally. Configured account sync is described in
  [iOS installation and Firebase sync](firebase.md).
- Distinguish teams usable unchanged from teams requiring adaptation. Do not
  silently modify imported teams.

Tournament details support team selection, not a separate tournament-browsing
product. A compact result label is sufficient.

Sources researched during planning and not imported: Limitless API, VGC History,
and MetaVGC. PokéKit stays later-use only, because aggregate spreads are not
proof of an individual team's build or a Champions ladder finish. This policy
adds no paid API, scraper, or subscription.

## Saved teams, similarity, and editing

Open a catalog team and choose **My Teams**, or choose **My Teams** on a Wishlist
card. **My teams** keeps an immutable original and an editable copy. Catalog
originals retain the full published sets and source metadata available when
saved; show that metadata as evidence for the original, not the edited version.
Older saved teams show only metadata they retained. Custom originals are
starting teams without public source claims; never backfill legacy originals from
a refreshed catalog.

Saved originals link to current catalog details when the original ID matches,
or otherwise when their canonical Poképaste or VRPastes URL exactly and uniquely
matches a catalog URL. Current details do not change the original evidence,
saved edits, or independent team copies. Teams without a match remain usable
without a catalog link or warning.

Browse and Wishlist share a compact team summary style. Opening a catalog team,
a Wishlist bookmark, or My teams shows the six Pokémon sets in a shared card
grid. Catalog and Wishlist cards open a read-only full-set view; My teams cards
open editors for individual fields. When available, **View catalog details**
opens the matching catalog team from My teams or a selected Wishlist team.

**Revert changes** restores a team slot to its state when you opened the team.
It is unavailable when the set is unchanged, while editing or deleting, or when
restoration conflicts with the current roster.

My Teams shows a **Record** row for the selected team, such as
**3W – 1L · 75%**. The percentage is the share of games won, rounded to a whole
number, and is omitted before the first game. Tapping the row opens a pop-up.
**Win** and **Loss** each log one game and the pop-up stays open, so several
games can be logged in a row. **Edit** reveals buttons to add or remove a win or
a loss and **Reset**.
Reset asks for confirmation and returns the record to 0W – 0L. The record never
goes below zero and is unavailable while edits are pending or the team changed
elsewhere. It is saved with the team, so it stays when the team moves between
My Teams, Favorites, and Wishlist and syncs like other team content. Favorites
and Wishlist cards show it read-only, with the percentage, once a team has a
record. On iPhone, the **Log Game Result** shortcut action names the team
selected in My Teams, asks for **Win** or **Loss**, and logs it without opening
the app. Results logged this way join the record the next time the app is
opened.

Completed valid text saves on blur or Enter. Selections, clears, and suggestions
save immediately and close the keyboard; invalid interim EV allocations remain
uncommitted, and editor text fields keep focus until a valid option is chosen or
cleared. Item suggestions include all valid Pokémon Champions items for the
Pokémon, ability suggestions include all legal species abilities, and nature
suggestions include all 25 standard natures. There is no separate Apply step.

**Done** commits valid pending input. **Cancel** discards pending input and
restores the set to how it was when the editor opened, undoing changes saved
while it was open, without asking. If the set cannot be restored, the editor
stays open and says so, and **Done** then closes it with the saved changes kept.
**Advanced set text** explicitly replaces a set. Structured edits preserve
nicknames and untouched supported lines; they never guess unknown values.

**Save team text** replaces the current sets with the edited Showdown text;
**Reset text** discards its unsaved changes. While team text is unsaved, team
selection and competing edits are unavailable. Reordered sets keep their
Pokémon's metadata and unchanged legacy details. Deleting the team still confirms
before discarding unsaved input. Closing the team text pop-up with unsaved
changes asks before discarding them. Saving closes the pop-up.

The EV slider keeps vertical page scrolling,
with a 44-pixel touch target across its full height. **Fill** adds or removes
points from the selected stat to reach 66 total, within that stat's 0–32 bounds.
It never changes another stat. If the selected stat cannot absorb the full
difference, the differing total stays uncommitted and the editor reports it when
you finish.

The nature field, its suggestion rows, the current allocation, and spread
suggestions all remain visible on the EV tab. **Adjust EVs manually** opens a
pop-up over the set editor with the number fields, quick allocation buttons, and
sliders. It starts closed whenever you open the EV editor.

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
Record individual committed sets from each set's actions or **Record all
in-game sets** below the team, never from the editor. These secondary
actions use the Save icon and appear only when a snapshot would change.
Recording is unavailable while editing and never flushes pending editor input or
a pending team name. Individual replacements use native
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

Opening an editor focuses its section heading and never a text field, so no
keyboard opens on a phone. Focus is shown as a fill rather than a ring or
outline. Operation errors use alerts. Deliberate
actions, including Wishlist additions and removals, imports, collection moves,
deletions, restorations, copying, and in-game recording, use one temporary status
message below navigation for three seconds. The message survives navigation but
is not stored or replayed. Wishlist reordering, autosaved fields, and background
sync do not produce these messages. Validation errors and failed shared imports
remain available until corrected or dismissed.

Background reconciliation remains active while an editor is mounted; the form
stays unchanged, and stale saves retain pending input rather than overwrite a
remote change or recreate a deleted team. The immutable original and the current
team synchronize across devices.

Saved teams can be deleted after confirmation. If the deleted team was active,
the next saved team becomes active; deleting the last one returns to the empty
My teams view. Deletion also discards unsaved edits to that team. The app
remembers the last successfully visited URL and scroll position on this device
for a bare-root reopen and returns to that page after sign-in. With no remembered
page, it opens Browse. Explicit links take precedence, and a missing remembered
detail falls back to browsing. Editors and dialogs reopen closed. The main
navigation is a bottom tab bar (Browse, My Teams, Favorites, Wishlist) that
remains visible while scrolling, and selecting a Pokémon clears its
search input for the next choice.

An explicit saved-team link with no saved teams keeps its URL and shows a
missing-team notice. Resuming a deleted saved team opens the empty My teams view
and clears its active selection.

Saving requires available app-local storage; clearing it removes local saves.
Only unsaved input prompts before navigation. Browse filters and
position remain device-local.

Similarity counts shared Pokémon first, matching known item/ability/nature/EV
fields and moves next, then uses result ordering for ties. Teams in the current
regulation count, and so do earlier-regulation teams whose suggested form is
legal in the current regulation. A suggestion whose resolved form appears with
one complete set in several teams keeps that set; otherwise the app assembles the
most common item, the most common ability among sets holding that item, the most
common Nature and EV pair for those, and the four most frequent moves. Counts
favor better-placed and recent teams through a weighted vote (see
[Ranking and discovery](data-sources.md#ranking-and-discovery)). An item
another teammate holds is never reused, and a suggested Mega keeps its own Mega
Stone. Candidates rank by shared teammates, then by the form's weighted vote,
then by matching details for those teammates, then by
recency-adjusted results, regulation, and credentials. Inferred archetype and role
tags break only
equally proven ties. Sources need not match the fixed five members exactly. Source
result claims are not attributed to the user's edited team. Exact forms remain
distinct.

- One Pokémon toggle replaces individual item, move, and ability locks.
- Show concrete differences for the proposed single-slot replacement.
- Retain published set text and source history on edits.
- Preserve the original imported team when creating an edited draft.

The **Details** pop-up holds the team name and the original team's
results, source links, paste link, and replica code. The original team stays
stored with the saved team, but it cannot be restored from My Teams.

The two-Mega limit applies to Pokémon replacement suggestions.

The **Swaps** pop-up opens with up to four whole-set replacements, at most one per
slot, each taken from that slot's Pokémon suggestions in the set editor. Each
row names the suggested Pokémon, the Pokémon it replaces on a second line, and
the set's item, ability, and nature on a third; long lines are cut off rather
than wrapped. **Show 5 more** reveals further rows in ranked order, each Pokémon once on the slot where it ranks best; a slot can repeat. Rows backed by a team
sharing three or more teammates come first, ranked by the weighted vote of
those teams. The remaining rows follow by shared teammates, then by how often
the suggested Pokémon is paired with the rest of the team on the current
regulation's Smogon ladder, so a team that few catalog teams resemble still gets
suggestions. A row that would lower the team's ladder pairing is dropped unless
it is that slot's only idea. Sets from Favorites teams rank in the same list, count as much as
the best-placed supporting team once they share three teammates, and are
labelled **Favorite**. Tapping a row in either list shows the full set inside
the pop-up with **Back** and **Apply swap**; Back returns to the list where it
was. Applying replaces the whole set,
leaves **Revert changes** available, and closes the pop-up. **Swap in a specific Pokémon** looks one
resolved form up across every slot. Swaps stay unavailable while team text is
unsaved or an editor is open, and a team already holding two Mega Pokémon is not
offered another.

Changed item, ability, move, and Pokémon names must be known to the app. An
unchanged legacy value stays accepted, and a committed value uses its canonical
spelling. Each item can be held by only one team member. Custom team import and
Wishlist import remain permissive.

Catalog item, ability, and move suggestions show the value with provenance
labels: **Original** for the original team's value, **In-game** for the recorded
in-game set, **Favorite** for a value from a matching set in a Favorites team,
and **Movepool** for a move no catalog team recorded. Favorite values rank after
Original and In-game values. Items another
teammate already holds are not offered. Move suggestions include the species'
newest available movepool, which ranks after catalog observations. In the set
editor's Pokémon suggestions, Favorites sets rank among catalog suggestions by
shared teammates until a name is typed, then they list first. Tapping a row
there shows the same full-set preview as Swaps, with **Back** and **Apply
swap**; nothing changes until Apply swap, and applying returns to the Pokémon
section. Teams of Unknown
regulation count toward item, ability, move, and Nature totals but carry no
vote, so their values rank after every voted value.

Every suggestion surface renders as full-width rows with an icon cell, the name,
and one muted detail line (two in Swaps). Item, ability, move, Pokémon, and spread lists start
with ten rows; natures start with six. **Show 5 more** appends five rows as a muted
dashed footer that is not a selectable row. It disappears when the list is
complete. A check mark marks the
selected nature and spread. Changing a field's query or committing input
collapses its list again.

EV spread suggestions include only complete, standard pairs whose Nature matches
the selected Nature and whose spread resolves to the current battle form.
Matching immutable original and in-game pairs come first. Exact duplicate pairs
appear once with their source labels combined. The initial list contains up to
ten additional unique catalog pairs after up to two matching saved-source pairs.
**Show 5 more** appends five additional catalog pairs in the same ranked order. It
disappears when no eligible pairs remain. Each row shows its Nature and
allocation, and its muted detail line carries
the source, moved points, and unmodified Speed without team counts. Expansion
does not change saved teams. Selecting a spread, adjusting EVs, or selecting the
same Nature preserves the expanded depth. Selecting a different Nature or
reopening the EV editor resets the catalog allowance to ten.
Fewer rows appear when eligible recorded data is insufficient. A catalog pair
whose best source team shares four or more teammates ranks first, more shared
teammates first, then by that team's matching set details. Remaining pairs rank
by the weighted vote of current-regulation sets holding the
edited set's item, then by the overall vote, then by the best source team's
shared teammates and matching details, then by recency-adjusted results,
regulation, and credentials. Total observations break ties before publication
date or ID. Catalog counts use
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

From a Poképaste page, the iOS share extension accepts one direct link or paste
ID. **Save link** queues it; opening Atlas finishes the import in **Wishlist**.
The manual fallback, **Add a Poképaste** on the Wishlist list, accepts a
`pokepast.es` link or 16-character paste ID.
Imports do not change the active team. An existing bookmark for the link is
returned unchanged, even if multiple catalog teams share that link. A unique
catalog match is bookmarked with its source metadata without a network request.
When multiple catalog teams share a link without an existing bookmark, import is
rejected without fetching or saving. Otherwise the app fetches the paste
directly from Poképaste and applies the same six-set requirements as custom text
import. A failed shared import remains queued for retry or dismissal from the
Wishlist list or team detail, without deleting a saved team. File, screenshot,
rental-code, and social-post imports are out of scope.

Export current sets with Champions EV normalization, using 0–32 per stat. Omit
IVs, level, Tera Type, and unknown values. Never assign edited teams new rental
codes.

Similarity can suggest alternatives without AI. It cannot recover unpublished
spreads. Any borrowed or inferred spread must remain separate from sourced data.

**Wishlist** and **Favorites** are collections over the same saved-team
records: a record without a collection belongs to My teams, and `wishlist` and
`favorites` records are excluded from My teams selection and its active-team
fallback. Each has its own page and tab beside My Teams, and the team sheet
offers moving a team into either. Move a record in either direction without
changing its ID, original snapshot, edits, or sources. Moving from My teams asks
for confirmation first, is unavailable while edits are pending, and rejects
stale records or a conflicting copy already in the target collection. Separate
copies are never merged. Wishlist holds only teams whose sets match their
original, so Browse bookmarks and **My Teams** always open the original sets:
moving a team with set edits to Wishlist is refused with a pointer to
Favorites, which keeps edited teams. A rename alone does not count as an edit.

Wishlist Pokémon search matches the saved roster, including edits on records
saved before Wishlist required unedited sets, rather than the original catalog
roster. All selected Pokémon must match, using the same
base and Mega identities as Browse. Search does not change saved records. It
stays active when opening a bookmark and returning to the list, but resets on
reload or a new visit. Wishlist search is independent of Browse filters.

With no Wishlist filters active, reorder bookmarks using the move up and down
controls. New bookmarks appear first without changing the relative order of
existing bookmarks. The order persists across reloads and syncs with the account.

The catalog **Wishlist** button adds a bookmark or immediately removes the
matching saved Wishlist copy and its edits; My teams copies remain unchanged.
If multiple Wishlist records match, remove them individually in Wishlist rather
than deleting them together. Using a bookmarked catalog team promotes the same
record; if multiple bookmarks match, choose one in Wishlist. Removal rejects a
record that is no longer a bookmark so a stale control cannot delete a promoted
team. Selecting a bookmark in Wishlist opens its saved sets, copyable team text,
and retained original source evidence; a bookmark without a current catalog
match stays usable with its saved roster and no catalog details link. Both
collections share the same storage ceiling and sync path (see
[storage and sync](firebase.md)).

The iOS app uses native Google sign-in, app-local storage, and Firebase sync.
After a successful sign-in, it can open saved data offline; sync resumes when
connected. A first sign-in may require connectivity. Native setup and signing
are described in [iOS installation and Firebase sync](firebase.md).

The My teams title opens a list of in-use teams with the selected team checked.
The list's search box takes focus only when tapped. Search covers the current
team name and each member's species, with exact, prefix, substring, and
character-subsequence tiers, requiring every whitespace-separated term to match.

## Future scope

- AI integration and separately verified subscription/API billing options.
- Screenshot and team-ID import.

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
- Mobile layout and reduced-motion behavior work; state
  transitions are smooth without disturbing browsing position.
- Relevant tests, lint, type checking, and production build pass with the selected
  toolchain.
