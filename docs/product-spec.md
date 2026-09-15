# Product specification

## Purpose

Champion's Atlas helps its owner choose Pokémon Champions doubles teams on a
phone. Existing spreadsheets are awkward to browse, and missingNO loses filters
when opening a team. Version 1 succeeds by making discovery reliable and fast.

This document records the planning conversation. It does not imply that source
integrations or game-rule validation have been implemented.

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
- Keep unknown fields unknown, including spreads and placements.
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

| Source                                                                                                                   | Verified during planning                                                                                                               | Remaining checks                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [VGCPastes M-C](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit#gid=2001945654) | CSV export returned 81 teams with paste links, species, items, dates, sources, and replica metadata. Only four rows had rank metadata. | Fetch and parse paste contents; historical tabs; reuse conditions; schema changes.                        |
| [Limitless API](https://docs.limitlesstcg.com/developer/tournaments.html)                                                | A sampled M-C event returned 71 submitted teamlists with items, abilities, moves, and natures; 39 entries had placements.              | Event completion, regulation/platform mapping, coverage, missing result handling.                         |
| [poch.ms](https://poch.ms/en/leaderboard)                                                                                | Downloaded page contained team summaries and original X links.                                                                         | Full sets, achievement evidence, stable automated access, reuse conditions.                               |
| [VGC History](https://vgchistory.com/data)                                                                               | Documents structured standings/team-sheet files and permits cached reuse.                                                              | Champions event coverage and sample imports.                                                              |
| [MetaVGC](https://metavgc.com/teams/tournaments)                                                                         | Lists tournament teams and describes available set fields/pastes.                                                                      | Stable ingestion interface and reuse conditions.                                                          |
| [PokéKit](https://poke.itlibra.com/en/opendata)                                                                          | Offers reusable JSON/CSV aggregate Showdown statistics.                                                                                | Later use only; aggregate spreads are not proof of an individual team's build or Champions ladder finish. |

Start by validating VGCPastes and Limitless imports. Add a supplementary ladder
source if their result metadata cannot meet discovery needs. Direct X ingestion
is not a version 1 requirement.

## Version 1.5: similar teams and editing

The workflow in **My teams** saves an original snapshot and editable copy,
shows similar teams by default, and lets the user toggle one Pokémon to change.
This is the only comparison setting. All six sets stay unchanged by default;
choosing a slot shows alternative builds of that Pokémon and different species
from similar teams. Applying a replacement changes only that slot. The other
five sets and original remain intact. Set-text editing, local saving, and export
remain available.

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

Field-based editing for saved catalog teams and legality-aware adaptation are not
implemented.

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

## Version 2 and later

- AI integration and separately verified subscription/API billing options.
- Spread suggestions and calculator-assisted optimization.
- Screenshot and team-ID import.
- Cross-device sync.
- Native iOS app.

Version 1 has no Supabase dependency. Storage providers, free-tier terms, and
authentication should be reconsidered when sync becomes necessary.

## Development stack

Svelte and SvelteKit are selected. Gaining more experience with Svelte is an
explicit project goal. Use SvelteKit routing for team details and URL-based
filter state.

The confirmed component and styling stack is shadcn-svelte with Tailwind CSS,
using Bits UI primitives for accessible interactions. Add components as needed
and customize their source to suit the app.

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
