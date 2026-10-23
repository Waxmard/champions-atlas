# Catalog snapshot

The catalog holds Pokémon Champions doubles teams from the VGCPastes M-C and M-B
spreadsheets, Victory Road's Champions replica-team page, DevonCorp's M-A
collection, the published Poch.ms leaderboard, and direct paste links from the
complete public upload histories of the configured YouTube VGC/Champions channels. Teams from a sheet
or index include parsed paste sets, and Poch.ms records include the set details
that page publishes. Missing fields remain unknown.

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
- [pokeaimMD](https://www.youtube.com/@pokeaimMD),
  [Pokeaim+](https://www.youtube.com/@pokeaimplus),
  [CybertronVGC](https://www.youtube.com/@CybertronVGC),
  [PokeRoy](https://www.youtube.com/@PokeRoyVGC), and
  [CloverBells](https://www.youtube.com/@CloverBells) are scanned through
  their complete public upload histories using YouTube Data API v3. The importer
  follows each channel's uploads playlist and reads direct supported paste links
  in video descriptions. It does not follow shorteners, social posts, website
  indexes, comments, transcripts, or screen-only teams.
- Individual PokéPaste, VR Pastes, and original report/video/tournament links
  (including supplementary `Report / Video` and `Other Links` columns on
  VGCPastes sheets) are retained on each team.

A team from an index joins the catalog only when its linked paste is a six-set
Pokémon Champions paste for that team's regulation. The importer rejects a paste
whose format names another regulation or another game, a protected paste, a
Victory Road row whose published roster does not match the paste, and a Victory
Road row whose creator and result claims belong to a different roster.

Every catalog entry path also checks the whole team against the official species,
form, and Mega Evolution roster for its declared regulation. Historical M-A and
M-B teams use their own rules, not M-C's roster. An `Unknown` team must fit one
complete supported roster and keeps its `Unknown` label. Unsupported regulations,
unmapped forms, and malformed rosters are excluded as `ineligible_species`;
ineligible teams never reach linked-spread enrichment or asset restoration.

The checked-in `scripts/data/champions-m-{a,b,c}.json` snapshots preserve official
form IDs and explicit normalized app identities. Their primary sources are:

| Regulation | Official notice                                                       | Eligible roster                                                                                                  |
| ---------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| M-A        | [M-A rules](https://champions-news.pokemon-home.com/en/page/751.html) | [M-A Pokémon](https://web-view.app.pokemonchampions.jp/battle/pages/events/rs177501629259kmzbny/en/pokemon.html) |
| M-B        | [M-B rules](https://champions-news.pokemon-home.com/en/page/776.html) | [M-B Pokémon](https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178066986988lmoqpm/en/pokemon.html) |
| M-C        | [M-C rules](https://champions-news.pokemon-home.com/en/page/816.html) | [M-C Pokémon](https://web-view.app.pokemonchampions.jp/battle/pages/events/rs178713870219xeaaio/en/pokemon.html) |

Update snapshots deliberately when official rules change; imports never fetch live
rosters. Keep full independent Mega maps: M-B's and M-C's notices announce additions
to the preceding sets. M-A's undifferentiated Mega Meowstic notice is interpreted
as covering both listed sexes. Crosswalks preserve exact forms: Maushold
`0925-000` is Family of Three in M-A/M-B; `0925-001` is Family of Four in M-C.
Ordinary Floette and Poké Ball Vivillon do not inherit eligibility from Eternal
Flower Floette or Fancy Vivillon. Snapshot validation fails before catalog
replacement if data is missing or malformed. Snapshot text contributes to the
source hash. This gate does not validate movesets or item clauses and does not
migrate personal or synced teams.

YouTube-linked teams require independent Pokémon Champions and VGC/doubles
context (from explicit format declarations, doubles/tournament terminology in
video text, or a six-Pokémon Champions doubles paste with protection/doubles
support moves, no singles entry hazards, and resolved Champions battle forms).
Every supplied `Format:` declaration, provider format, and explicit
M-A, M-B, or M-C regulation token must agree. Singles, OU, National Dex,
pre-Champions, other games, unknown format declarations, unsupported regulations,
and conflicting formats are excluded across both titles and descriptions.
Promotional description text mentioning another game does not override an
otherwise eligible team.

When no explicit regulation or unresolved format declaration exists, the video
date can estimate the regulation only with Champions doubles context:

| Regulation | Inclusive UTC start | Exclusive UTC end |
| ---------- | ------------------- | ----------------- |
| M-A        | 2026-04-08 00:00    | 2026-06-17 02:00  |
| M-B        | 2026-06-17 02:00    | 2026-09-09 02:00  |
| M-C        | 2026-09-09 02:00    | 2026-12-02 00:00  |

The [Victory Road regulation calendar](https://victoryroad.pro/champions-regulations/)
provides the outer calendar dates; those boundaries use UTC day precision, not
verified launch or closing times. The [official M-B notice](https://champions-news.pokemon-home.com/en/page/776.html)
provides the two 02:00 UTC transitions. The importer does not extrapolate beyond
these windows. Explicit regulation takes precedence: a tournament can use older
rules after a new regulation starts. Detail and saved-original views disclose
date inference with the source video link. It estimates rules active when shared,
not the tournament's actual rules or current legality.

Channel collection and video provenance remain attached. A video date is a
sharing date, not a result claim. The presenter is not treated as the team
builder. Only a standalone `Team by:` or `Team by` description line supplies builder credit.

Skip reasons distinguish evidence from availability: `missing_regulation` means
the importer lacks usable regulation evidence, `unsupported_format` means the
published game or format is incompatible, and `format_conflict` means explicit
regulations disagree. `paste_unavailable` means fetching failed, including HTTP
404; malformed content is `invalid_payload`.

A Poch.ms record joins the catalog only when its rule is `double`, its species
resolve, and every field it uses parses. A record with an unresolvable species, a
malformed field it needs, or a conflicting duplicate source ID is skipped rather
than guessed. A source parse that finds supported records but admits none fails
the refresh instead of publishing an empty success.

For YouTube API key setup, GitHub Actions configuration, and import commands,
see [YouTube credentials in README](../README.md#youtube-credentials).

Routine imports refresh the active M-C slice. They retain eligible M-A, M-B, and
`Unknown` records from the cached catalog baseline after checking each record
against its regulation roster. An ineligible historical record is omitted with a
warning. Frozen records keep their stored provenance and linked-spread values;
routine imports do not re-enrich them or use them as linked-spread donors.

The cache entry for `src/lib/data/catalog.json` supplies the history baseline.
If that catalog is missing or empty, the importer bootstraps all available
history. `REFRESH=1 npm run import:catalog` rebuilds the full history from current
source data, replacing changed or removed historical records. The production
workflow exposes the same operation through its **Rebuild all historical
regulations** manual-dispatch checkbox. Routine removals remain authoritative
for M-C; removal of a frozen record takes effect only in a full-history rebuild.

YouTube discovery remains complete during routine imports: playlist traversal
and configured-channel history scans are unchanged. The importer does not use a
date cutoff to reduce discovery. It admits teams and recomputes linked-spread
provenance only for the active slice. Frozen records retain their existing data.

## Freshness and scheduling

`.github/workflows/deploy-prod.yml` imports the catalog and deploys it on every
push to `main`, on manual dispatch, and once a day at 08:17 UTC. GitHub can delay
a scheduled run. Only scheduled production imports set `YOUTUBE_REFRESH=1` to
recrawl all configured channel histories. Pushes, manual dispatches, and PR previews
reuse valid complete discovery snapshots; a cold cache can still require a crawl.
The workflow serializes publication, and a failed import, tagging run, or build
stops before deployment so the previously hosted build stays available. A source
fetch or structural failure throws before the atomic catalog write, so the
previous catalog stays published. Nothing imports on a schedule outside that
workflow: dev, build, and typecheck generate a missing catalog or rebuild one
containing an ineligible team. Otherwise they reuse the catalog and restore assets.
YouTube discovery stores only a validated, completed snapshot at
`.cache/catalog/youtube-sources.json`. A keyed online import reuses a valid
complete snapshot unless `REFRESH=1` or `YOUTUBE_REFRESH=1` requests a complete
recrawl. `CHECK_SHEET=1` alone reuses discovery. Without a full recrawl flag, the
importer incrementally scans only newly configured channels when a valid cached
snapshot holds a subset of the allowlist.
`OFFLINE=1` never contacts YouTube; with a key it requires a valid snapshot.
Without a key, an existing valid snapshot is reused, while an absent snapshot
disables this source with a warning and retains previously imported channel-only
teams. An invalid snapshot fails in offline or keyless mode; a keyed online
import replaces it only after a successful complete crawl. Once an enabled scan
begins, API, quota, or structural failures abort before catalog replacement,
including in preview; preview's stale-cache option does not weaken YouTube
discovery. A successful complete scan treats disappeared video/paste links as
removals from the active slice; frozen historical records remain until a
full-history rebuild. Individual paste fetch failures retain compatible prior
sets and expose the error.
Rejected candidates are memoized in `.cache/catalog/youtube-decisions.json`,
keyed by video ID and paste URL, with the rejection reason and a digest of the
video text. A later import reuses a recorded rejection without reading its paste
and without spending the `PASTE_LIMIT` budget; transient reasons
(`paste_unavailable`, `invalid_payload`) are never recorded, and an edited
importer or eligibility snapshot discards the whole ledger. Deleting the file
costs time only.

## Assets and preview cache

Catalog bootstrap caches standard Pokémon PNG sprites and 24px item icons in
ignored `static/` directories. It uses PokéAPI's standard PNG artwork for new or
missing sprites. Exact aliases preserve source labels and raw paste text. Valid
cached PNGs remain unchanged; asset download failures remain visible and do not
alter catalog data.

The app captures the asset inventory at development-server startup and build
time. Missing sprites render nothing; missing item icons show a dash. Pokémon and
item names remain visible, and absent assets trigger no requests. Restart the
development server or rebuild after adding assets. `OFFLINE=1` controls source
discovery, not asset downloads.

Preview imports refresh live sources with `CHECK_SHEET=1` and set
`ALLOW_STALE_SOURCE_CACHE=1`. When an eligible transient HTTP or network failure
occurs, the importer warns and reuses validated raw source cache, including CSVs.
The existing retry policy remains unchanged.

Fallbacks fail when cache is missing, unreadable, invalid, or oversized. Fresh
validation and cache-write errors, and mandatory-source failures, remain fatal.
Production, CI, and local imports remain strict unless you explicitly set the
stale-cache option. It does not change offline behavior or impose a cache age
limit.

## Reuse conditions

The owner enabled daily automation for personal use with attribution and local
caching, and accepted the unresolved reuse question for this combined source
data. That decision is not a license from any provider, and public access alone
grants no permission to redistribute. Generated catalogs and source caches are
ignored by Git.

## Interpretation

Sheet regulation, species, items, author, publication date, result claims, and
replica status are retained. Missing values remain unknown. Unknown details never
satisfy a filter. Paste sets match by species and item, allowing a base species
to match the sheet's Mega form.
The declared appearance-only forms (`cosmeticForms`, such as `Sinistcha` and
`Sinistcha-Masterpiece`) match across their spellings too, on both the paste and
published-roster checks, while the retained name stays the one the source wrote.
A mismatch fails the import instead of assigning details to the wrong Pokémon.
Paste notes remain visible because they can describe a different regulation.

An explicit creator adaptation can fill missing EVs and a missing Nature on a
linked original. Each video must separately label one direct original-team paste
and one direct creator-version paste. Both pastes must pass ordinary admission
within the paste budget, share a supported regulation, and uniquely match all six
resolved battle forms. Every original-known item, ability, Nature, and move set
must agree; each receiving member must publish its item, ability, and four moves.
Only a complete valid Champions spread with a recognized donor Nature can fill
a hole. Published EVs and Natures are never replaced. Conflicting linked donor
proposals leave that member unchanged.

These additions retain donor paste and video attribution, separate from the
original tournament text and results. Copy and Save include the additions;
**Published paste text** shows the original without them. Attribution disappears
when the working set no longer matches the borrowed set. Different-paste variants
keep separate identities and reports; a matching roster alone never establishes
a relationship or merges teams.

For active teams, a completed discovery snapshot lets each import recompute
additions from source originals. Removed links, rejected donors, and unavailable
donor pastes cannot silently preserve active borrowed values. Frozen historical
teams keep their existing additions during routine imports. In inactive keyless
mode, compatible previously attributed additions also remain because discovery
is unobserved.

Poch.ms records keep published values and leave the rest unknown. A missing set
field or scalar stays unknown. The page publishes no spreads, so these records
do not contribute EV spread suggestions. A generated paste is an export of the published
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

Exact duplicates share regulation, paste URL, and member species/items. Their
sheet IDs and report links merge; different paste URLs remain separate variants.
Imports are atomic, and source files are cached. `REFRESH=1` or `CHECK_SHEET=1`
refreshes ordinary source indexes, the Poch.ms leaderboard included. Paste
payloads are cached indefinitely and never refreshed by `REFRESH=1` (an author
can still edit a paste behind its URL): an import reuses a cached
paste and fetches a missing one, and deleting `.cache/catalog/<paste-id>.json` is
the way to request it again. YouTube discovery refreshes separately with
`REFRESH=1` or `YOUTUBE_REFRESH=1`; `YOUTUBE_REFRESH=1` alone leaves warm
ordinary source caches unchanged. `OFFLINE=1` requires the cache.
The measured 2026-10-05 import holds 1713 teams; Poch.ms contributes 332
accepted records, 92 of them with regulation `Unknown`, and 194 skipped records
(reported singles and unsupported formats). The displayed snapshot date
tracks catalog generation, not independent verification of source claims.
By default only a paste missing from the cache is fetched, with three concurrent
workers. Individual paste failures preserve compatible previous sets and expose
an error. Sheet schema failures abort the import. `PASTE_LIMIT` is an explicit
partial-fetch option and does not erase compatible previously loaded sets. It
counts candidate teams with the sheets first, so a limit below the sheet count
leaves index teams unreached: those keep their previously validated record
unless an already-loaded shared payload contradicts the YouTube attribution.
A new index team beyond the limit is omitted and reported as `limited`.

Saved teams retain their own original snapshot and source history, and the
snapshot keeps the original reports too. A record without a real paste URL
contributes no source entry. Single-slot replacement copies the selected
published raw set; manual edits belong to the user's draft.
Similarity measures shared Pokémon and matching known set details, with result
priority breaking ties. It does not predict matchup quality or infer EVs.

M-C is the configured current regulation from the planning discussion. Catalog
admission checks species, forms, and allowed Mega Evolutions under each team's own
rules. It does not establish full current-rule legality or competitiveness.

## Ranking and discovery

Automatic team and set suggestions order non-custom teams ahead of known
custom-rule records, known regulations ahead of Unknown, then achievement band,
current-regulation status, and credential merit. A supplied recommendation
tiebreak follows merit; publication time and team ID settle remaining ties.
**Newest shared** is a deliberate date-only sort.

Browse's **Recommended** order keeps the same custom-rule and unknown-regulation
guards, then ranks resource groups: complete EVs with a video, complete EVs
without a video, a video without complete EVs, and neither. Complete EVs require
exactly six Pokémon with valid 66-point allocations, with each stat from 0 to 32;
Nature is not required. Attributed imported EV additions count as working sets.
A video is a direct HTTPS YouTube watch, live, Shorts, or youtu.be link with a
valid 11-character video ID, attached to a report or EV-addition attribution.
Channel and playlist links do not count. Multiple videos count the same as one.

Within each resource group, Browse ranks Champion Tier or Champions positions
1–100, Master Ball 1, qualifying major finishes, qualifying community finishes,
Master Ball 2, Champions positions 101–1,000, Showdown positions 1–100, eligible
lower Master Ball results, other reported results, then no result. Current
regulation comes before credential merit within each band, followed by
publication time and team ID. Every report can supply the team's best Browse
band. Showdown Bo1, Bo3, and unspecified labels receive the same qualification;
none implies closed team sheets. These Browse rules do not change evidence
labels or automatic suggestions.

For automatic suggestions, achievement bands, from highest to lowest, are: (1) Champions Champion Tier or
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
