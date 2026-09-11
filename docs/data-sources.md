# Catalog snapshot

The initial snapshot contains 941 distinct M-C/M-B team records from 942
VGCPastes rows, fetched on 2026-09-11. All 941 teams now include parsed PokéPaste
sets, including Peter Chen's Worlds team (MB809). Missing fields within a
published paste remain unknown. M-A and other data providers are not imported yet.

Sources:

- [VGCPastes M-C](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit#gid=2001945654)
- [VGCPastes M-B](https://docs.google.com/spreadsheets/d/1axlwmzPA49rYkqXh7zHvAtSP-TKbM0ijGYBPRflLSWw/edit#gid=1458357160)
- Individual PokéPaste and original report links are retained on each team.

No explicit reuse license has been established for this combined source data.
This is a personal prototype; source reuse conditions remain unresolved before
scheduled ingestion or public redistribution. Public access does not establish
permission. Dev/build/typecheck generate a missing catalog automatically;
subsequent refreshes are explicit. There is no scheduled scraper. Generated
catalogs and source caches are ignored by Git.

## Interpretation

Sheet regulation, species, items, author, publication date, result claims, and
replica status are retained. Missing values remain unknown. Paste sets match by
species and item, allowing a base species to match the sheet's Mega form. A
mismatch fails the import instead of assigning details to the wrong Pokémon.
Paste notes remain visible because they can describe a different regulation.

Exact duplicates share regulation, paste URL, and member species/items. Their
sheet IDs and report links merge; different paste URLs remain separate variants.
Imports are atomic, and source files are cached. The displayed snapshot date
tracks catalog generation, not independent verification of source claims.
By default every paste is fetched with three concurrent workers and reused from
cache. Individual paste failures preserve compatible previous sets and expose an
error. Sheet schema failures abort the import. `PASTE_LIMIT` is an explicit
partial-fetch option and does not erase compatible previously loaded sets.

Saved teams retain their own original snapshot and source history. Candidate
replacement copies published raw sets; manual edits belong to the user's draft.
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
