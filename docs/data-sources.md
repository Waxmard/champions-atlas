# Catalog snapshot

The catalog holds Pokémon Champions doubles teams from three sources: the
VGCPastes M-C and M-B spreadsheets, Victory Road's Champions replica-team page,
and DevonCorp's M-A collection. All teams from a sheet or an index include parsed
paste sets. Missing fields within a published paste remain unknown.

Sources:

- [VGCPastes M-C](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit#gid=2001945654)
- [VGCPastes M-B](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit#gid=1458357160)
- [Victory Road replica teams](https://victoryroad.pro/champions-replica/) lists
  Champions M-C and M-B teams under explicit regulation headings. The importer
  reads only those regulation tables and stops at the page's past formats
  section, which still holds Scarlet and Violet teams.
- [DevonCorp M-A teams](https://devoncorp.press/resources/38-teams-for-pokemon-champions-regulation-m-a)
  is one fixed M-A collection. The importer reads its article body only, and
  never the site-wide pages or the `/api/` and `format=json` variants that its
  robots policy disallows.
- [Champions Battle Data](https://championsbattledata.com/api) supplies the level-50
  stat values used for Speed. Its JSON is CORS-enabled and offered for app use,
  and it is not used for usage percentages or result evidence. Refresh the
  committed table by hand with `npm run sync:stats`; dev, build, and typecheck
  never fetch it.
- Individual PokéPaste, VR Pastes, and original report links are retained on each team.

A team from an index joins the catalog only when its linked paste is a six-set
Pokémon Champions paste for that team's regulation. The importer rejects a paste
whose format names another regulation or another game, a protected paste, a
Victory Road row whose published roster does not match the paste, and a Victory
Road row whose creator and result claims belong to a different roster.

## Freshness and scheduling

`.github/workflows/deploy-prod.yml` imports the catalog and deploys it on every
push to `main`, and once a day at 08:17 UTC. GitHub can delay a scheduled run.
The workflow serializes publication, and a failed import, tagging run, or build
stops before deployment so the previously hosted build stays available. Nothing
imports on a schedule outside that workflow: dev, build, and typecheck generate a
missing catalog and otherwise leave it in place.

## Reuse conditions

The owner enabled daily automation for personal use with attribution and local
caching, and accepted the unresolved reuse question for this combined source
data. That decision is not a license from any provider, and public access alone
grants no permission to redistribute. Generated catalogs and source caches are
ignored by Git.

## Interpretation

Sheet regulation, species, items, author, publication date, result claims, and
replica status are retained. Missing values remain unknown. Paste sets match by
species and item, allowing a base species to match the sheet's Mega form. A
mismatch fails the import instead of assigning details to the wrong Pokémon.
Paste notes remain visible because they can describe a different regulation.

A team from an index carries no sheet ID. Its published regulation, creator, and
result claims are kept only after the paste passes the format and roster checks,
so a row that links another team's paste is dropped rather than misattributed. A
missing result claim is not a rejection: an index row with no explicit placement
still imports.

Exact duplicates share regulation, paste URL, and member species/items. Their
sheet IDs and report links merge; different paste URLs remain separate variants.
Imports are atomic, and source files are cached. The displayed snapshot date
tracks catalog generation, not independent verification of source claims.
By default every paste is fetched with three concurrent workers and reused from
cache. Individual paste failures preserve compatible previous sets and expose an
error. Sheet schema failures abort the import. `PASTE_LIMIT` is an explicit
partial-fetch option and does not erase compatible previously loaded sets. It
counts candidate teams with the sheets first, so a limit below the sheet count
leaves index teams unreached: those keep their previously validated record
unchanged, and a new index team beyond the limit is omitted and reported as
`limited`.

Saved teams retain their own original snapshot and source history. Single-slot
replacement copies the selected published raw set; manual edits belong to the user's draft.
Similarity measures shared Pokémon and matching known set details, with result
priority breaking ties. It does not predict matchup quality or infer EVs.

M-C is the configured current regulation from the planning discussion. No
current-rule legality checker exists. Original regulation is not evidence that
a team remains legal or competitive now.

## Preliminary ordering

The comparator passes all agreed comparison examples. Within current or
historical regulation groups, it recognizes explicit tournament winner,
runner-up, and top-cut labels, followed by strong reported ladder results,
current-regulation Master Ball, other results, and unknown results. Qualifying
current teams precede qualifying historical teams; historical qualifiers precede
current teams without qualifying evidence.

For this prototype, explicit Champions/Rank 1 labels, reported Champions ladder
positions up to 1,000, and Showdown positions up to 100 qualify. Numeric positions
remain numeric positions in the UI; they are never converted into in-game tiers.
These numeric cutoffs are provisional, not verified game-tier thresholds.
Tournament size, event significance, exact placement within a result group, and
season finish versus peak do not yet break ties; publication date does.
An eighth-place finish is not assumed to mean top cut without explicit evidence.

Before treating ordering as final, settle numeric ladder cutoffs and tournament
strength/placement rules, add structured event evidence, and verify current
regulation legality. Report labels describe source claims, not verified results.

## Inferred tags

`scripts/jev-enrich.mjs` asks a System One model for each catalog team's primary
game plan, speed mode, and per-slot member posture, and writes the answers to the
generated `src/lib/data/team-tags.json`. These tags are inference, never
evidence: they carry no result label and never outrank a sourced result. They only
order teams that already share the same teammates and set details _and_ are
equally proven; publication date and team ID settle whatever remains.

The tiebreak has two halves: keyword role flags computed in code, and the
inferred postures carried by the tags. An empty stub disables the whole
tiebreak, so an untagged build is identical to the pre-feature baseline. With
generated tags, the tiebreak reorders about 9% of suggestion lists.

Both deploy workflows require `TYPESAFE_API_KEY` and refuse to deploy untagged.
Dev, CI, and typecheck still write the stub when no credential is present, so
those paths stay hermetic. `npm run enrich:tags` reuses `.cache/jev`, so a warm
cache performs no requests at all; it fails when a run tags nothing, or when
every team it had to fetch came back unusable, so a dead credential or a changed
response shape cannot ship silently.

Role flags used by that tiebreak are computed in code from move and ability
names, not asked of the model, because counting and matching are what code does
reliably. `scripts/jev-eval.mjs` scores run-to-run stability and checks
structural invariants before the tags may be consumed; a failing evaluation
leaves the tags empty. Its setter invariants are objective (a Trick Room team
must run Trick Room), but the `support` invariant only measures how many support
moves its vocabulary recognizes, so read its rate as coverage, not accuracy.
