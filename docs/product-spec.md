# Product specification

## Purpose

Champion's Atlas helps its owner choose Pokémon Champions doubles teams on a
phone. Existing spreadsheets are awkward to browse, and missingNO loses filters
when opening a team. Version 1 succeeds by making discovery reliable and fast.

This document records the planning conversation. It does not imply that every
planned source integration or game-rule validation has been implemented; the
Poch.ms integration below shipped after planning, and
[data sources](data-sources.md) describes the current import.

## Version 1

- Ship an installable, mobile-friendly PWA for personal use.
- Browse teams with or without a Pokémon in mind.
- Combine multiple Pokémon filters using AND: every selected Pokémon must occur
  on the team.
- Attach item, move, and ability constraints to the selected Pokémon. A matching
  item on a different teammate does not satisfy that constraint.
- Support explicit forms and Mega selections.
- Include older regulations by default, labeling each team's original regulation.
- Prioritize relevant results using the ordering below.
- Show available team sets, original sources, result evidence, paste links, and
  copyable rental/replica codes when published.
- Preserve filters, sorting, and scroll position when opening teams and returning.
- Encode filters in the URL so a refresh or shared link restores the selection.
- Save current team(s) locally. Favorites and cross-device sync are not required.
- Distinguish teams usable unchanged from teams requiring adaptation. Do not
  silently modify imported teams.

Tournament details support team selection, not a separate tournament-browsing
product. A compact result label is sufficient.

## Ranking

The agreed high-level order is:

1. Current-regulation teams with qualifying results.
2. Proven older-regulation teams.
3. Current-regulation teams with unknown results.

Other entries remain available with lower priority and accurate labels. Within a
regulation, strong tournament finishes lead, followed by high ladder achievements,
lower ladder achievements, and other tournament entries or unknown results.
Participation alone does not make a team proven. Top cut is a strong indicator;
event size, significance, placement, and recency should inform tournament ordering.
A team whose source publishes no regulation stays in an `Unknown` group that sorts
below every known regulation, so its reported results do not make it look current.

Current-regulation relevance outweighs stronger historical results when the
current team has qualifying evidence. Early in M-C, reaching Master Ball qualifies
for discovery because higher-tier result coverage is sparse. This is a
regulation-specific policy, not a permanent Master Ball cutoff for every season.

Both Pokémon Champions and Pokémon Showdown ladder achievements count. Label the
platform, and distinguish peak rank, season finish, rating, and tier reached.
Do not directly compare raw ratings across platforms or seasons.

The owner described Champions tiers approximately as Champions = top 100,
Rank 1 = top 1,000, and Rank 2 = top 10,000. These are planning context, not verified
thresholds to encode. Store the reported tier and its evidence. Rank 2 eligibility
remains optional outside the early-regulation fallback.

### Agreed comparison examples

| Candidates                                  | Higher priority      |
| ------------------------------------------- | -------------------- |
| M-B major top cut versus M-C Master Ball    | M-C Master Ball      |
| Similar tournament finishes in M-B and M-C  | M-C                  |
| M-B Champions tier versus M-C Master Ball   | M-C Master Ball      |
| M-C Showdown peak #3 versus M-C Master Ball | M-C Showdown peak #3 |
| M-C Master Ball versus M-C unknown results  | M-C Master Ball      |
| Proven M-B team versus M-C unknown results  | Proven M-B team      |

Exact tournament cutoffs, ordering between comparable high ladder achievements,
and placement of teams requiring adaptation remain to be finalized. The browser's
preliminary comparator and its limits are documented in [data sources](data-sources.md).
Use concrete examples to settle these rather than an unexplained weighted score.

## Data requirements

- Keep original source links, publication/fetch dates, game, battle format,
  regulation, and result evidence.
- Keep unknown fields unknown, including spreads, placements, and a source's
  regulation when it publishes none.
- Interpret result labels in context: a tournament's "Champion" is not the
  Champions ladder tier; Showdown "Peak 3rd" is not an in-game Champions rank.
- Merge exact duplicates while retaining source evidence and distinct set variants.
  Sharing six species alone does not establish identical builds.
- A repeated import should not multiply teams. A failed refresh should preserve
  the last successful catalog and expose its freshness.
- Resolve current regulation and legality from verified rules. Historical legality
  does not establish present legality or present competitive strength.
- Verify source reuse conditions and cache fetched data before automated ingestion.

### Source research snapshot: 2026-09-11

| Source                                                                                                                   | Verified during planning                                                                                                                                                                   | Remaining checks                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [VGCPastes M-C](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit#gid=2001945654) | CSV export returned 81 teams with paste links, species, items, dates, sources, and replica metadata. Only four rows had rank metadata.                                                     | Fetch and parse paste contents; historical tabs; reuse conditions; schema changes.                          |
| [Limitless API](https://docs.limitlesstcg.com/developer/tournaments.html)                                                | A sampled M-C event returned 71 submitted teamlists with items, abilities, moves, and natures; 39 entries had placements.                                                                  | Event completion, regulation/platform mapping, coverage, missing result handling.                           |
| [poch.ms](https://poch.ms/en/leaderboard)                                                                                | Published page carries inline structured JSON. The importer reads it for M-A, M-B, and M-C doubles tournament entries and doubles social teams; social regulation stays literal `Unknown`. | Implemented; full sets, achievement evidence, cached access, and personal-use reuse conditions are settled. |
| [VGC History](https://vgchistory.com/data)                                                                               | Documents structured standings/team-sheet files and permits cached reuse.                                                                                                                  | Champions event coverage and sample imports.                                                                |
| [MetaVGC](https://metavgc.com/teams/tournaments)                                                                         | Lists tournament teams and describes available set fields/pastes.                                                                                                                          | Stable ingestion interface and reuse conditions.                                                            |
| [PokéKit](https://poke.itlibra.com/en/opendata)                                                                          | Offers reusable JSON/CSV aggregate Showdown statistics.                                                                                                                                    | Later use only; aggregate spreads are not proof of an individual team's build or Champions ladder finish.   |

Start by validating VGCPastes and Limitless imports. Add a supplementary ladder
source if their result metadata cannot meet discovery needs. Direct X ingestion
is not a version 1 requirement.

## Version 1.5: similar teams and editing

The workflow in **My teams** saves an immutable original and an editable copy.
Catalog originals retain the full published sets and source metadata available
when saved. Custom originals are starting teams without public source claims;
legacy originals are never backfilled from a refreshed catalog.

Completed valid text saves on blur or Enter. Selections, clears, and suggestions
save immediately; invalid interim EV allocations remain uncommitted. **Done**
flushes and closes, while **Close** can discard only remaining unsaved input.
There is no separate Apply step. The immutable original and the current team
synchronize across devices.
Background reconciliation remains active while an editor is mounted; the form
stays unchanged, and stale saves retain pending input rather than overwrite a
remote change or recreate a deleted team.

**Original & history** compares the current team with the original and restores
the original, including name and roster order, without changing the saved ID or
source history. Individual
original-slot restores leave the other five sets untouched and enforce duplicate
Pokémon and replacement Mega restrictions. Set-text editing and export remain
available; structured changes preserve supported untouched raw lines.

Saved teams can be deleted after confirmation. If the deleted team was active,
the next saved team becomes active; deleting the last one returns to the empty
My teams view. Deletion also discards unsaved edits to that team. The app
remembers the last successfully visited browse, team-detail, or My teams URL
for a bare-root reload and returns to it after sign-in. Explicit links take
precedence, and a missing remembered detail falls back to browsing. The main
navigation remains visible while scrolling, and selecting a Pokémon clears
its search input for the next choice.

An explicit saved-team link with no saved teams keeps its URL and shows a
missing-team notice. Resuming a deleted saved team opens the empty My teams
view and clears its active selection.

Similarity counts shared Pokémon first, matching known item/ability/nature/EV
fields and moves next, then uses result ordering for ties. All regulations are
included. Replacement sets favor retaining the chosen Pokémon and its set details,
then use source-team ranking for ties, with duplicate sets
collapsed and species already in another slot excluded. Sources need not match
the fixed five members exactly. Source result claims are not attributed to the
user's edited team. Exact forms remain distinct.

- One Pokémon toggle replaces individual item, move, and ability locks.
- Show concrete differences for the proposed single-slot replacement.
- Retain published set text and source history on edits.
- Preserve the original imported team when creating an edited draft.

Field-based editing for saved catalog teams is implemented. Full legality-aware
adaptation is not implemented. The two-Mega limit applies to Pokémon replacement
suggestions.

EV spread suggestions begin with the immutable original nature/spread pair when
it is complete, standard, and resolves to the current battle form. Spreads from
other saved teams follow, then common catalog spreads for the resolved form,
with exact duplicate pairs removed. Original field suggestions use exact Pokémon
identity or a successfully resolved matching battle form, never unrelated base
forms. Catalog counts are not inflated by original recommendations.
When an observed complete pair matches the immutable original nature, at least
one matching option remains visible through the catalog and combined list limits,
even after you change the edited nature. Borrowed spreads retain their own source
labels; they do not fill in unpublished original EVs.
You can also ask one benchmark question: survive a named move from a named
opponent, take a KO, or outspeed. The opponent's set is
the most common recorded current-regulation set for that species, filtered by
held item when one is named. An outspeed query excludes Choice Scarf targets
unless Choice Scarf is the named item, and applies the ×1.5 multiplier to the
target's Speed whenever the target holds it. Each answer reports the fewest moved
points, up to six equal-cost spreads for the Pokémon's own nature, and up to six
more when a second nature reaches the goal for fewer points. When no 66-point
spread reaches the goal, the answer says so and names the closest achievable
result. Damage is one landed hit at full HP with the resolved battle form, actual
item, and deterministic field-setting abilities. Benchmark Speed is unmodified
level-50 Speed with only the Choice Scarf ×1.5 multiplier applied, never
weather- or ability-adjusted turn order; the Speed tiers list stays unmodified
level-50 Speed.

Inferred archetype and role tags are enrichment, never evidence: they carry no
result label and never outrank a sourced result. They break ties among teams that
already share the same teammates and set details and are equally proven; the
keyword half of that tiebreak works without them.

Custom import starts in **My teams** with a required name and complete
Showdown-style paste. It accepts exactly six unique Pokémon, each with an item,
ability, nature, EVs, and four unique moves. Team building happens in
[Pokémon Showdown Teambuilder](https://play.pokemonshowdown.com/teambuilder);
Champion's Atlas accepts its exported text only. Imported text becomes the
immutable original snapshot; nickname, gender, and unknown lines remain intact,
while IVs, level, and Tera Type are omitted from displayed and exported Champions
text. Custom teams are saved locally under the current regulation with legality
unverified and no published source claims. File, URL, screenshot, rental-code,
legality, and cross-device import are out of scope.

Similarity can suggest alternatives without AI. It cannot recover unpublished
spreads. Any borrowed or inferred spread must remain separate from sourced data.

Signed-in devices sync saved teams through Cloud Firestore. Sequential saves
update the same saved team on every device, and filters, navigation, and the
active team stay on the device that set them. A device that changes a team
before it sees another device's change to the same team keeps its own edit under
that team's ID and preserves the displaced version as a separate recovered team.
See [Firebase deployment and sync](firebase.md).

## Version 2 and later

- AI integration and separately verified subscription/API billing options.
- Screenshot and team-ID import.
- Cross-device sync (implemented for saved teams).
- Native iOS app.

Version 1 has no Supabase dependency. Storage providers, free-tier terms, and
authentication should be reconsidered when sync becomes necessary.

## Development stack

Svelte and SvelteKit are selected. Gaining more experience with Svelte is an
explicit project goal. Use SvelteKit routing for team details and URL-based
filter state.

The confirmed component and styling stack is daisyUI with Tailwind CSS, using
Bits UI primitives for accessible interactions. Maintained libraries handle CSV
parsing (csv-parse), saved-team validation (Zod), and class merging
(tailwind-merge and clsx). Add components as needed and customize their source
to suit the app.

Use ESLint with eslint-plugin-svelte, Prettier with its Svelte and Tailwind
plugins, and svelte-check. This is an agreed exception to mw-kit's Biome default
because Svelte-aware tooling is preferred over experimental component support.

The foundation includes Node 24 LTS via mise, npm, Lefthook, GitHub Actions, and
Dependabot. The browser includes a cached M-C/M-B VGCPastes import,
Pokémon/set filters, preliminary result ordering, and team details with URL and
Back/Forward preservation. My teams adds local storage, comparison, set-text
editing, and export. Desktop/mobile browser checks run in CI. Legality validation
and PWA installation remain unimplemented. Deployment and
data-refresh hosting are not selected yet.

The catalog is generated locally and ignored by Git. Dev/build/typecheck import
it when missing and reuse it otherwise; refreshing is explicit. A clean checkout
requires network access or a populated source cache for its first import.
Catalog bootstrap also caches decorative Pokémon and item images locally. Missing
images do not block catalog generation, and visible names remain authoritative.

## Delivery sequence

1. Establish the agreed UI and development tooling foundation (implemented).
2. Validate representative current and historical source records, including
   missing fields and results. Establish current-legality data and remaining
   ranking examples.
3. Build one complete browse/filter/detail/back flow with real imported teams (implemented).
4. Finalize result ordering and add PWA behavior; local current-team storage is implemented.
5. Verify and refine the initial comparison/editing workflow against acceptance criteria.

## Acceptance criteria

- Two selected Pokémon must both appear in every result.
- An item/move/ability constraint must match the intended team member.
- Forms and Megas match the explicit selection consistently.
- Opening several teams and returning preserves filters, sort, and scroll.
- Reloading a filtered URL restores its filters.
- Ranking checks reproduce every agreed comparison above.
- Old regulations remain discoverable and visibly labeled.
- Unknown placements, tiers, spreads, and legality are not fabricated.
- Reimporting does not create duplicate teams or erase valid cached data on failure.
- Current team(s) survive reload and app reopening without a cloud account.
- Mobile layout, keyboard access, and reduced-motion behavior work; state
  transitions are smooth without disturbing browsing position.
- Relevant tests, lint, type checking, and production build pass with the selected
  toolchain.
