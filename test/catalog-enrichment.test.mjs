import assert from 'node:assert/strict';
import test from 'node:test';
import {
  enrichLinkedSpreads,
  linkedSpreadPairs,
  resetLinkedSpreads,
} from '../scripts/catalog-enrichment.mjs';
import {
  mbItems,
  mbPokemon,
  youtubePasteUrl,
  youtubeRow,
} from './fixtures/catalog-import.mjs';
import {
  activeSpreadSource,
  memberSetSignature,
} from '../src/lib/spread-provenance.ts';
import { parsePaste } from '../src/lib/paste.ts';
import {
  newSavedTeam,
  readSavedTeams,
  saveTeam,
  storageKey,
} from '../src/lib/workbench.ts';

const videoId = 'NgnKt46TIjs';
const originalPasteUrl = youtubePasteUrl('0123456789abcdef');
const donorPasteUrl = youtubePasteUrl('fedcba9876543210');
const description = `Open team sheet: ${originalPasteUrl}\n\nMy version of the team: ${donorPasteUrl}`;
const rows = () => [
  youtubeRow(originalPasteUrl, videoId, { description }),
  youtubeRow(donorPasteUrl, videoId, { description }),
];

const completeSpread = '32 HP / 32 Atk / 2 Spe';
const moveSet = ['Protect', 'Fake Out', 'Helping Hand', 'Knock Off'];
const defaultSpecs = () =>
  mbPokemon.map((pokemon, index) => ({
    pokemon,
    item: mbItems[index],
    ability: 'Ability',
    nature: 'Adamant',
    spread: completeSpread,
    moves: [...moveSet],
  }));
const pasteFromSpecs = (specs) =>
  specs
    .map((spec) =>
      [
        `${spec.pokemon}${spec.item ? ` @ ${spec.item}` : ''}`,
        spec.ability ? `Ability: ${spec.ability}` : '',
        spec.spread === null ? '' : `EVs: ${spec.spread}`,
        spec.nature ? `${spec.nature} Nature` : '',
        ...spec.moves.map((move) => `- ${move}`),
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n');
const teamFromSpecs = (id, pasteUrl, specs, options = {}) => {
  const paste = options.paste ?? pasteFromSpecs(specs);
  return {
    id,
    name: id,
    creator: 'Creator',
    regulation: options.regulation ?? 'M-C',
    publishedAt: '2026-09-15T00:00:00Z',
    pasteUrl,
    replicaCode: null,
    replicaStatus: 'Open',
    reports: options.reports ?? [
      {
        event: 'Original tournament',
        rank: '1st',
        sourceUrl: 'https://example.test/result',
      },
    ],
    members: parsePaste(paste),
    paste,
    pasteNotes: 'Original notes',
    sheetIds: ['sheet-id'],
    ...(options.pasteError ? { pasteError: options.pasteError } : {}),
  };
};
const pairFor = (
  original = originalPasteUrl,
  donor = donorPasteUrl,
  id = videoId
) => ({
  originalPasteUrl: original,
  donorPasteUrl: donor,
  videoUrl: `https://www.youtube.com/watch?v=${id}`,
});

test('extracts one explicitly labeled original and donor from a video description', () => {
  assert.deepEqual(linkedSpreadPairs(rows()), [
    {
      originalPasteUrl,
      donorPasteUrl,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    },
  ]);
});

test('deduplicates identical discovery rows and sorts unique relationships', () => {
  const secondVideoId = 'aaaaaaaaaaa';
  const secondDescription = `Original paste: ${originalPasteUrl}\n\nTeam with EVs: ${donorPasteUrl}`;
  assert.deepEqual(
    linkedSpreadPairs([
      ...rows(),
      ...rows(),
      youtubeRow(originalPasteUrl, secondVideoId, {
        description: secondDescription,
      }),
      youtubeRow(donorPasteUrl, secondVideoId, {
        description: secondDescription,
      }),
    ]),
    [
      {
        originalPasteUrl,
        donorPasteUrl,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      },
      {
        originalPasteUrl,
        donorPasteUrl,
        videoUrl: `https://www.youtube.com/watch?v=${secondVideoId}`,
      },
    ]
  );
});

test('requires labels, exactly one supported paste per paragraph, and candidate membership', () => {
  const anotherPasteUrl = youtubePasteUrl('aaaaaaaaaaaaaaaa');
  const unlabelledDescription = `Two unlabelled links: ${originalPasteUrl} ${donorPasteUrl}`;
  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, {
        description: unlabelledDescription,
      }),
      youtubeRow(donorPasteUrl, videoId, {
        description: unlabelledDescription,
      }),
    ]),
    []
  );

  const multiLinkDescription = `${description}\n\nTournament team: ${originalPasteUrl} ${anotherPasteUrl}`;
  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, {
        description: multiLinkDescription,
      }),
      youtubeRow(donorPasteUrl, videoId, {
        description: multiLinkDescription,
      }),
      youtubeRow(anotherPasteUrl, videoId, {
        description: multiLinkDescription,
      }),
    ]),
    []
  );

  const missingCandidateDescription = `${description}\n\nTournament team: ${anotherPasteUrl}`;
  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, {
        description: missingCandidateDescription,
      }),
      youtubeRow(donorPasteUrl, videoId, {
        description: missingCandidateDescription,
      }),
    ]),
    []
  );

  assert.deepEqual(
    linkedSpreadPairs([youtubeRow(originalPasteUrl, videoId, { description })]),
    []
  );
});

test('rejects ambiguous, same-paste, or inconsistent per-video references', () => {
  const otherOriginal = youtubePasteUrl('aaaaaaaaaaaaaaaa');
  const ambiguousDescription = `${description}\n\nTournament team: ${otherOriginal}`;
  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, {
        description: ambiguousDescription,
      }),
      youtubeRow(donorPasteUrl, videoId, {
        description: ambiguousDescription,
      }),
      youtubeRow(otherOriginal, videoId, {
        description: ambiguousDescription,
      }),
    ]),
    []
  );

  const samePasteDescription = `Original team: ${originalPasteUrl}\n\nMy team with EVs: ${originalPasteUrl}`;
  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, {
        description: samePasteDescription,
      }),
    ]),
    []
  );

  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, { description }),
      youtubeRow(donorPasteUrl, videoId, {
        description: `Open team sheet: ${donorPasteUrl}\n\nMy version: ${originalPasteUrl}`,
      }),
    ]),
    []
  );
});

test('ignores unsupported direct links and non-candidate paste URLs', () => {
  const unsupported = 'https://example.com/paste';
  const candidateDescription = `Original team: ${originalPasteUrl}\n\nMy version: ${donorPasteUrl}\n\nOriginal team: ${unsupported}`;
  assert.deepEqual(
    linkedSpreadPairs([
      youtubeRow(originalPasteUrl, videoId, {
        description: candidateDescription,
      }),
    ]),
    []
  );
});

test('fills only missing EVs and preserves source records with live attribution', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs());
  const originalSnapshot = structuredClone(original);
  const donorSnapshot = structuredClone(donor);
  const result = enrichLinkedSpreads([original, donor], [pairFor()]);
  const enriched = result.teams[0];
  const member = enriched.members[0];
  const source = activeSpreadSource(member);

  assert.equal(result.enriched, 1);
  assert.equal(result.spread_conflict, 0);
  assert.equal(member.spread, completeSpread);
  assert.equal(member.nature, 'Adamant');
  assert.match(member.set, new RegExp(`EVs: ${completeSpread}`));
  assert.equal(source.pasteUrl, donorPasteUrl);
  assert.deepEqual(source.videoUrls, [
    `https://www.youtube.com/watch?v=${videoId}`,
  ]);
  assert.equal(source.sourceSet, donor.members[0].set);
  assert.equal(source.originalSet, original.members[0].set);
  assert.equal(source.borrowedNature, false);
  assert.equal(source.appliedSignature, memberSetSignature(member));
  assert.equal(enriched.id, originalSnapshot.id);
  assert.deepEqual(enriched.reports, originalSnapshot.reports);
  assert.equal(enriched.paste, originalSnapshot.paste);
  assert.equal(enriched.pasteNotes, originalSnapshot.pasteNotes);
  assert.deepEqual(result.teams[1], donorSnapshot);

  const removed = enrichLinkedSpreads(result.teams, []);
  assert.equal(removed.teams[0].members[0].spread, null);
  assert.equal(removed.teams[0].members[0].nature, 'Adamant');
  assert.equal(removed.teams[0].members[0].spreadSource, undefined);
});

test('borrows a missing Nature with EVs but preserves published Nature and EVs', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  originalSpecs[0].nature = null;
  originalSpecs[1].spread = '32 HP / 32 Def / 2 Spe';
  const donorSpecs = defaultSpecs();
  donorSpecs[0].nature = 'Jolly';
  donorSpecs[1].spread = completeSpread;
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, donorSpecs);
  const result = enrichLinkedSpreads([original, donor], [pairFor()]);

  assert.equal(result.teams[0].members[0].spread, completeSpread);
  assert.equal(result.teams[0].members[0].nature, 'Jolly');
  assert.equal(result.teams[0].members[0].spreadSource.borrowedNature, true);
  assert.equal(result.teams[0].members[1].spread, originalSpecs[1].spread);
  assert.equal(result.teams[0].members[1].nature, 'Adamant');
  assert.equal(result.teams[0].members[1].spreadSource, undefined);
});

test('matches shuffled members and moves by resolved functional and cosmetic forms', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0] = {
    ...originalSpecs[0],
    pokemon: 'Charizard',
    item: 'Charizardite X',
    spread: null,
  };
  originalSpecs[1] = {
    ...originalSpecs[1],
    pokemon: 'Sinistcha',
    item: 'Item',
  };
  const donorSpecs = originalSpecs
    .slice()
    .reverse()
    .map((spec) => ({
      ...spec,
      pokemon:
        spec.pokemon === 'Charizard'
          ? 'Charizard-Mega-X'
          : spec.pokemon === 'Sinistcha'
            ? 'Sinistcha-Masterpiece'
            : spec.pokemon,
      spread: spec.spread ?? completeSpread,
      moves: spec.moves.slice().reverse(),
    }));
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, donorSpecs);
  const result = enrichLinkedSpreads([original, donor], [pairFor()]);

  assert.equal(result.enriched, 1);
  assert.equal(result.teams[0].members[0].spread, completeSpread);
  assert.equal(result.teams[0].members[0].spreadSource.pasteUrl, donorPasteUrl);
});

test('does not enrich from roster similarity without an explicit relationship', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs());
  const result = enrichLinkedSpreads([original, donor], []);

  assert.equal(result.enriched, 0);
  assert.equal(result.teams[0].members[0].spread, null);
  assert.equal(result.teams[0].members[0].spreadSource, undefined);
});

test('requires matching known fields and complete target evidence', () => {
  const cases = [
    ['item', (specs) => (specs[0].item = 'Different Item')],
    ['ability', (specs) => (specs[0].ability = 'Different Ability')],
    ['nature', (specs) => (specs[0].nature = 'Jolly')],
    ['move', (specs) => (specs[0].moves[0] = 'Tackle')],
    ['regulation', null],
    [
      'resolved form',
      (specs) => {
        specs[0].pokemon = 'Floette';
        specs[0].item = 'Item';
      },
    ],
    ['donor error', null],
  ];
  for (const [name, mutate] of cases) {
    const originalSpecs = defaultSpecs();
    originalSpecs[0].spread = null;
    if (name === 'resolved form') {
      originalSpecs[0].pokemon = 'Floette-Eternal';
      originalSpecs[0].item = 'Item';
    }
    const donorSpecs = defaultSpecs();
    mutate?.(donorSpecs);
    const original = teamFromSpecs(
      'original-id',
      originalPasteUrl,
      originalSpecs
    );
    const donor = teamFromSpecs('donor-id', donorPasteUrl, donorSpecs, {
      regulation: name === 'regulation' ? 'M-B' : 'M-C',
      ...(name === 'donor error' ? { pasteError: 'Unavailable' } : {}),
    });
    const result = enrichLinkedSpreads([original, donor], [pairFor()]);
    assert.equal(result.enriched, 0, name);
    assert.equal(result.teams[0].members[0].spread, null, name);
  }

  for (const missingEvidence of [
    (specs) => (specs[0].ability = null),
    (specs) => (specs[0].moves = specs[0].moves.slice(0, 3)),
  ]) {
    const originalSpecs = defaultSpecs();
    originalSpecs[0].spread = null;
    missingEvidence(originalSpecs);
    const original = teamFromSpecs(
      'original-id',
      originalPasteUrl,
      originalSpecs
    );
    const donor = teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs());
    const result = enrichLinkedSpreads([original, donor], [pairFor()]);
    assert.equal(result.enriched, 0);
    assert.equal(result.teams[0].members[0].spread, null);
  }
});

test('rejects invalid raw donor EV text even when import normalization drops its token', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  const donorSpecs = defaultSpecs();
  donorSpecs[0].spread = `${completeSpread} / not-an-EV`;
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, donorSpecs);

  assert.equal(donor.members[0].spread, completeSpread);
  const result = enrichLinkedSpreads([original, donor], [pairFor()]);
  assert.equal(result.enriched, 0);
  assert.equal(result.teams[0].members[0].spread, null);
});

test('does not replace a nonblank invalid original EV value', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = '---';
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs());
  const result = enrichLinkedSpreads([original, donor], [pairFor()]);

  assert.equal(result.enriched, 0);
  assert.equal(result.teams[0].members[0].spread, '---');
});

test('blocks conflicting donors and deterministically attributes agreeing donors', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  originalSpecs[0].nature = null;
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donorSpecs = defaultSpecs();
  const conflictingSpecs = defaultSpecs();
  conflictingSpecs[0].spread = '32 HP / 32 Def / 2 Spe';
  conflictingSpecs[0].nature = 'Jolly';
  const donor = teamFromSpecs('donor-id', donorPasteUrl, donorSpecs);
  const conflicting = teamFromSpecs(
    'conflicting-donor',
    'https://pokepast.es/aaaaaaaaaaaaaaaa',
    conflictingSpecs
  );
  const links = [
    pairFor(originalPasteUrl, donorPasteUrl, videoId),
    pairFor(originalPasteUrl, conflicting.pasteUrl, 'bbbbbbbbbbb'),
  ];
  const conflicted = enrichLinkedSpreads([original, donor, conflicting], links);
  assert.equal(conflicted.enriched, 0);
  assert.equal(conflicted.spread_conflict, 1);
  assert.equal(conflicted.teams[0].members[0].spread, null);
  assert.equal(conflicted.teams[0].members[0].nature, null);

  const agreeingSpecs = defaultSpecs();
  const agreeing = teamFromSpecs(
    'agreeing-donor',
    'https://pokepast.es/aaaaaaaaaaaaaaaa',
    agreeingSpecs
  );
  const result = enrichLinkedSpreads(
    [original, donor, agreeing],
    [
      pairFor(originalPasteUrl, donorPasteUrl, videoId),
      pairFor(originalPasteUrl, agreeing.pasteUrl, 'ccccccccccc'),
      pairFor(originalPasteUrl, agreeing.pasteUrl, 'bbbbbbbbbbb'),
    ]
  );
  assert.equal(result.enriched, 1);
  assert.equal(result.spread_conflict, 0);
  assert.equal(
    result.teams[0].members[0].spreadSource.pasteUrl,
    agreeing.pasteUrl
  );
  assert.deepEqual(result.teams[0].members[0].spreadSource.videoUrls, [
    'https://www.youtube.com/watch?v=bbbbbbbbbbb',
    'https://www.youtube.com/watch?v=ccccccccccc',
  ]);
});

test('evaluates all donors before mutation and resets or retains only compatible attribution', () => {
  const firstSpecs = defaultSpecs();
  firstSpecs[0].spread = null;
  const middleSpecs = defaultSpecs();
  middleSpecs[0].spread = null;
  const original = teamFromSpecs('original-id', originalPasteUrl, firstSpecs);
  const middle = teamFromSpecs(
    'middle-id',
    'https://pokepast.es/aaaaaaaaaaaaaaaa',
    middleSpecs
  );
  const donor = teamFromSpecs(
    'donor-id',
    'https://pokepast.es/bbbbbbbbbbbbbbbb',
    defaultSpecs()
  );
  const chained = enrichLinkedSpreads(
    [original, middle, donor],
    [
      pairFor(originalPasteUrl, middle.pasteUrl, 'bbbbbbbbbbb'),
      pairFor(middle.pasteUrl, donor.pasteUrl, 'ccccccccccc'),
    ]
  );
  assert.equal(chained.teams[0].members[0].spread, null);
  assert.equal(chained.teams[1].members[0].spread, completeSpread);

  const linked = enrichLinkedSpreads(
    [original, donor],
    [pairFor(originalPasteUrl, donor.pasteUrl)]
  );
  const freshOriginal = teamFromSpecs(
    original.id,
    original.pasteUrl,
    firstSpecs
  );
  const retained = enrichLinkedSpreads([freshOriginal, donor], [], {
    active: false,
    previousTeams: linked.teams,
  });
  assert.equal(retained.enriched, 1);
  assert.equal(retained.teams[0].members[0].spread, completeSpread);
  assert.ok(activeSpreadSource(retained.teams[0].members[0]));

  const changedSpecs = firstSpecs.map((spec) => ({
    ...spec,
    moves: [...spec.moves],
  }));
  changedSpecs[0].moves[0] = 'Tackle';
  const changedOriginal = teamFromSpecs(
    original.id,
    original.pasteUrl,
    changedSpecs
  );
  const notRetained = enrichLinkedSpreads([changedOriginal, donor], [], {
    active: false,
    previousTeams: linked.teams,
  });
  assert.equal(notRetained.teams[0].members[0].spread, null);
  assert.equal(notRetained.teams[0].members[0].spreadSource, undefined);

  const reset = resetLinkedSpreads(linked.teams);
  assert.equal(reset[0].members[0].spread, null);
  assert.equal(reset[0].members[0].spreadSource, undefined);
});

test('invalidates the active donor label after edits to any set-defining field', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  const enriched = enrichLinkedSpreads(
    [
      teamFromSpecs('original-id', originalPasteUrl, originalSpecs),
      teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs()),
    ],
    [pairFor()]
  ).teams[0].members[0];
  assert.ok(activeSpreadSource(enriched));
  const invalidSpread = structuredClone(enriched);
  invalidSpread.spread = null;
  assert.equal(memberSetSignature(invalidSpread), null);
  const invalidForm = structuredClone(enriched);
  invalidForm.pokemon = 'Not a Pokémon';
  assert.equal(memberSetSignature(invalidForm), null);

  const edits = [
    (member) => (member.pokemon = 'Pikachu'),
    (member) => (member.item = 'Different Item'),
    (member) => (member.ability = 'Different Ability'),
    (member) => (member.nature = 'Jolly'),
    (member) => (member.moves[0] = 'Tackle'),
    (member) => (member.spread = '32 HP / 32 Def / 2 Spe'),
  ];
  for (const edit of edits) {
    const changed = structuredClone(enriched);
    edit(changed);
    assert.equal(activeSpreadSource(changed), null);
  }
});

test('saved catalog inference and spread provenance round-trip and reject malformed metadata', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  const enriched = enrichLinkedSpreads(
    [
      teamFromSpecs('original-id', originalPasteUrl, originalSpecs),
      teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs()),
    ],
    [pairFor()]
  ).teams[0];
  enriched.regulationInference = {
    method: 'video-date',
    publishedAt: '2026-06-17T02:00:00Z',
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
  const saved = newSavedTeam(enriched);
  let value = null;
  const storage = {
    getItem: (key) => {
      assert.equal(key, storageKey);
      return value;
    },
    setItem: (key, next) => {
      assert.equal(key, storageKey);
      value = next;
    },
  };
  saveTeam(storage, saved);
  const loaded = readSavedTeams(storage)[0];
  assert.deepEqual(
    loaded.original.regulationInference,
    enriched.regulationInference
  );
  assert.deepEqual(
    loaded.members[0].spreadSource,
    enriched.members[0].spreadSource
  );

  const invalidSource = structuredClone(saved);
  invalidSource.members[0].spreadSource.videoUrls = [
    'https://youtube.com/watch?v=NgnKt46TIjs',
  ];
  const before = value;
  assert.throws(() => saveTeam(storage, invalidSource));
  assert.equal(value, before);

  const invalidInference = structuredClone(saved);
  invalidInference.original.regulationInference.publishedAt = 'yesterday';
  assert.throws(() => saveTeam(storage, invalidInference));

  const legacy = newSavedTeam(
    teamFromSpecs('legacy-id', originalPasteUrl, defaultSpecs())
  );
  saveTeam(storage, legacy);
  const legacyLoaded = readSavedTeams(storage).find(
    (entry) => entry.id === legacy.id
  );
  assert.equal(legacyLoaded.original.regulationInference, undefined);
  assert.equal(legacyLoaded.members[0].spreadSource, undefined);
});

test('active refresh removes prior attribution after donor errors or regulation conflicts', () => {
  const originalSpecs = defaultSpecs();
  originalSpecs[0].spread = null;
  const original = teamFromSpecs(
    'original-id',
    originalPasteUrl,
    originalSpecs
  );
  const donor = teamFromSpecs('donor-id', donorPasteUrl, defaultSpecs());
  const previous = enrichLinkedSpreads([original, donor], [pairFor()]);
  for (const rejectedDonor of [
    { ...previous.teams[1], pasteError: 'Unavailable' },
    { ...previous.teams[1], regulation: 'M-B' },
  ]) {
    const result = enrichLinkedSpreads(
      [previous.teams[0], rejectedDonor],
      [pairFor()],
      { active: true }
    );
    assert.equal(result.teams[0].members[0].spread, null);
    assert.equal(result.teams[0].members[0].spreadSource, undefined);
    assert.equal(
      result.teams[0].members[0].pokemon,
      original.members[0].pokemon
    );
  }
});
