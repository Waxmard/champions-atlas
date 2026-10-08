# Catalog snapshot

The catalog holds Pokémon Champions doubles teams from five sources: the
VGCPastes M-C and M-B spreadsheets, Victory Road's Champions replica-team page,
DevonCorp's M-A collection, the published Poch.ms leaderboard, and X posts that
link a Champions paste. Teams from a sheet or an index include parsed paste sets,
and Poch.ms records include the set details that page publishes. Missing fields
remain unknown.

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
- [Poch.ms](https://poch.ms/en/leaderboard) publishes its leaderboard as inline
  structured JSON. The importer reads only that JSON and imports two record
  sets: explicitly identified M-A, M-B, and M-C doubles tournament entries, and
  doubles social teams. Regulation comes from the published format field only,
  never from a season number, a publication date, or a tier claim. Reported
  singles and other formats are excluded. Existing X-linked social coverage remains
  on this free source; the ranking policy adds no paid API, scraper, or subscription.
- [X](https://x.com/search?q=pokepast.es%20pokemonchampions&f=live) posts are read
  through the keyless FxTwitter JSON API, a community mirror rather than X's own
  API, by `npm run import:x`. That script searches for Champions paste posts,
  keeps the posts whose text links a PokéPaste or VR Pastes URL, and stores each
  post's text, author, date, and screenshot. The catalog import then admits a post
  as a team only when its linked paste passes the same format and roster checks as
  any other index row, and prints `X: N discovered — A accepted, R retained, S
skipped, M merged.` like every other source. A post supplies no result claim:
  its report keeps empty event and rank fields, so it grades as unattributed.
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

A Poch.ms record joins the catalog only when its rule is `double`, its species
resolve, and every field it uses parses. A record with an unresolvable species, a
malformed field it needs, or a conflicting duplicate source ID is skipped rather
than guessed. A source parse that finds supported records but admits none fails
the refresh instead of publishing an empty success.

## Freshness and scheduling

`.github/workflows/deploy-prod.yml` imports the catalog and deploys it on every
push to `main`, and once a day at 08:17 UTC. GitHub can delay a scheduled run.
The workflow serializes publication, and a failed import, tagging run, or build
stops before deployment so the previously hosted build stays available. A source
fetch or structural failure throws before the atomic catalog write, so the
previous catalog stays published. Nothing imports on a schedule outside that
workflow: dev, build, and typecheck generate a missing catalog and otherwise
leave it in place.

`deploy-prod.yml` and `deploy-preview.yml` also run `npm run import:x` before the
catalog import, under the same `CHECK_SHEET=1` refresh gate, so X discovery and
post details refresh on that daily schedule. `ci.yml` only restores the cache and
never fetches X. Dev, build, and typecheck write an empty post stub when
`src/lib/data/team-posts.json` is missing, and never fetch. `OFFLINE=1`, or
`--if-missing`, likewise writes the stub instead of fetching.

X ingest bounds its own work per run: `X_POST_LIMIT` caps post lookups (400 by
default, oldest first), `X_PAGE_LIMIT` caps search pages per query (1), and
`X_IMAGE_LIMIT` caps mirrored screenshots (60). `X_AUTHOR_LIMIT` rotates how many
citing authors are re-searched per run (40). `X_REFRESH_DAYS` (30) is the age at
which a stored post is fetched again on a run without the refresh gate; a run
with `CHECK_SHEET=1` or `REFRESH=1` refreshes the oldest stored posts every time
instead. If every search fails, or five post lookups in a row cannot reach the
API, the run keeps the cached post index and exits 0; with no cache at all it
exits 1. A post lookup that reaches the API but returns a non-200 code or a
non-JSON body is stored as `unavailable` and the team page says so.

## Reuse conditions

The owner enabled daily automation for personal use with attribution and local
caching, and accepted the unresolved reuse question for this combined source
data. That decision is not a license from any provider, and public access alone
grants no permission to redistribute. Stored X post text and screenshots are
third-party content shown with the author handle and a link back to the post, and
are never presented as catalog-verified result claims. Generated catalogs and
source caches are ignored by Git.

## Interpretation

Sheet regulation, species, items, author, publication date, result claims, and
replica status are retained. Missing values remain unknown. Paste sets match by
species and item, allowing a base species to match the sheet's Mega form. The
declared appearance-only forms (`cosmeticForms`, such as `Sinistcha` and
`Sinistcha-Masterpiece`) match across their spellings too, on both the paste and
published-roster checks, while the retained name stays the one the source wrote.
A mismatch fails the import instead of assigning details to the wrong Pokémon.
Paste notes remain visible because they can describe a different regulation.

Poch.ms records keep published values and leave the rest unknown. A missing set
field or scalar stays unknown. The page publishes no spreads, so these records
never gain benchmark eligibility. A generated paste is an export of the published
set details, and only when at least one member publishes some; it is not an
original paste. Every record carries an empty paste URL and no sheet IDs, so the
importer never merges it with a sheet or paste record on shared species alone. A
published replica code is kept with an empty replica status, because publishing a
code does not prove that it still works.

Published display names map to a recognized species only through a bounded alias
list: plain Floette and Eternal Flower Floette to Floette-Eternal, the five
Hisuian names, Alolan Ninetales, Galarian Slowking, Wash and Heat Rotom, and
Paldean Tauros Aqua Breed to Tauros-Paldea-Aqua. This is not general name
resolution. An item-backed Mega form is used only when the published item
supports it, as for Floette-Mega or Raichu-Mega-X, and an itemless Pokémon stays
its base species. The importer never invents an item, ability, nature, or spread,
and it rejects a record whose species do not resolve.

Result evidence follows source claims. Tournament reports retain the published
rank label and, when available, a positive published entrant count. The count is
the source-reported field size, not the number of imported teams; missing counts
remain unknown. Invalid counts and placements beyond a known field are rejected.
A social record that names an event reports only that event placement. A social
record without an event emits separate Champions ranked battles claims for a
reported rank, published tier, and finite positive rating. Reports link to the
original X or Twitter post and retain separate Poch.ms attribution. The importer
does not infer peak, season finish, or rating thresholds.

The importer also recovers explicit ladder annotations from published paste
notes. Whole-line Achieved or Reached annotations for Champion Tier, Rank 1,
Rank 2, bare Master Ball, and Master Ball Rank 1–4, plus the global, peak,
season-finish, and Showdown numeric forms, become ladder claims sourced to the
original paste. The notes and the
original source reports stay unchanged, extraction is idempotent, and a
successful refresh that drops an annotation removes the claim it derived. Only
whole annotation lines count, so an unrecognized note stays visible and yields no
evidence.

A team from an index carries no sheet ID. Its published regulation, creator, and
result claims are kept only after the paste passes the format and roster checks,
so a row that links another team's paste is dropped rather than misattributed. A
missing result claim is not a rejection: an index row with no explicit placement
still imports.

An X team is such an index row. One post admits at most one team: the first
linked paste that carries a Champions regulation, and never a paste whose format
names another game. The team page shows the citing post's text, author handle,
and publication date, clipped to 200 characters, with at most two screenshots
that use the mirrored copy when it exists and the original image URL otherwise.
A post whose lookup failed is labelled unavailable, and a post whose author does
not match the team's listed creator is labelled as differing, rather than
silently attributed.

Exact duplicates share regulation, paste URL, and member species/items. Their
sheet IDs and report links merge; different paste URLs remain separate variants.
Imports are atomic, and source files are cached. `REFRESH=1` or `CHECK_SHEET=1`
fetches every source, the Poch.ms leaderboard included; `OFFLINE=1` requires the
cache. The measured 2026-10-05 import holds 1713 teams; Poch.ms contributes 332
accepted records, 92 of them with regulation `Unknown`, and 194 skipped records
(reported singles and unsupported formats). With the X post index, the measured
2026-10-08 import holds 1759 teams where the same inputs without it hold 1717, so
X adds 42 admitted teams and 62 merged report links; 1186 of its 1290 cached posts
are skipped, nearly all because their text links no paste. The displayed snapshot
date tracks catalog generation, not independent verification of source claims.
By default every paste is fetched with three concurrent workers and reused from
cache. Individual paste failures preserve compatible previous sets and expose an
error. Sheet schema failures abort the import. `PASTE_LIMIT` is an explicit
partial-fetch option and does not erase compatible previously loaded sets. It
counts candidate teams with the sheets first, so a limit below the sheet count
leaves index teams unreached: those keep their previously validated record
unchanged, and a new index team beyond the limit is omitted and reported as
`limited`.

Saved teams retain their own original snapshot and source history, and the
snapshot keeps the original reports too. A record without a real paste URL
contributes no source entry. Single-slot replacement copies the selected
published raw set; manual edits belong to the user's draft.
Similarity measures shared Pokémon and matching known set details, with result
priority breaking ties. It does not predict matchup quality or infer EVs.

M-C is the configured current regulation from the planning discussion. No
current-rule legality checker exists. Original regulation is not evidence that
a team remains legal or competitive now.

## Ranking and discovery

The comparator orders non-custom teams ahead of known custom-rule records, known
regulations ahead of Unknown, then achievement band, current-regulation status,
and credential merit. A supplied recommendation tiebreak follows merit;
publication time and team ID settle remaining ties. Newest shared is a deliberate
date-only sort. Unknown regulation remains below every known regulation.

Achievement bands, from highest to lowest, are: (1) Champions Champion Tier or
explicit Champions global, peak, or season-finish position 1–100, then Master Ball
1; (2) qualifying major-event finishes; (3) Master Ball 2, Champions positions
101–1,000, then Showdown positions 1–100; (4) supported community finishes; (5)
Master Ball 3, Master Ball 4, then unspecified Master Ball in the current
regulation; (6) other reported results; and (7) no result. Tournament Champion,
Winner, and Runner up are placement labels, not ladder credentials. Numeric ladder
positions retain their platform context and are not converted to tiers or compared
across platforms.

Major-event names match exact normalized aliases: Worlds, Worlds 2026, Worlds 2026
San Francisco, Baltimore Regional 2027, and Frankfurt Regional Championships.
Worlds finishes through 32nd and listed Regional Championship finishes through
eighth qualify; an explicit top-cut claim qualifies only for a listed major.
Other tournament finishes receive community priority only when the published
field has at least 32 entrants and the finish is in the top quarter, capped at
eighth. For example, eighth of 32 qualifies, while ninth of 32 and eighth of
eight do not. Missing field size remains unknown. Regional Challenge and arbitrary
event names containing World or Regional do not receive major priority.

After current-regulation status, major results sort Worlds before listed regional
events, then better finish bounds and larger known fields. Community results sort by finish-to-field ratio,
then larger field and finish. Other reported results and no-result teams have no
inferred credential merit. Publication time cannot promote a lower achievement
band above a higher one.

Known custom-rule records match Mudkip's Marsh Pit #6 by normalized event name or
its published Poch record IDs. They are hidden from Browse by default; the Include
custom-rule teams option reveals them there. Automatic recommendations always
exclude these records, regardless of the Browse option. They remain available by
direct link, keep their source attribution, and can be saved or used as teams.
Their displayed evidence receives reported-grade treatment. This policy does not
classify other similarly named events or infer standard-format legality; unknown
restrictions are not evidence of standard rules.

Cached catalogs without entrant metadata remain readable and use unknown field
size conservatively. Event aliases and result labels describe source claims; they
do not independently verify event identity, attendance, or results.

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
