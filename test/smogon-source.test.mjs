import assert from 'node:assert/strict';
import test from 'node:test';
import { teamEligibilityError } from '../scripts/champions-eligibility.mjs';
import {
  parseShowdownTeam,
  smogonEntries,
  smogonTeam,
} from '../scripts/smogon-source.mjs';
import { hasCompleteEvs } from '../src/lib/paste.ts';

const payload = (team, format = 'gen9championsbssregmc') =>
  ']' + JSON.stringify({ team, format });

test('unpacks a Showdown team into paste text', () => {
  const { paste, format } = parseShowdownTeam(
    payload(
      'Charizard-Mega-Y||CharizarditeY|Drought|Flamethrower,SolarBeam,AncientPower,Roost|Modest|20,,2,26,,18||||50|]Scizor||Leftovers|technician|BulletPunch,KnockOff,Uturn,Roost|adamant|22,30,14,,,||||50|'
    )
  );
  assert.equal(format, 'gen9championsbssregmc');
  assert.equal(
    paste,
    'Charizard-Mega-Y @ Charizardite Y\nAbility: Drought\nEVs: 20 HP / 2 Def / 26 SpA / 18 Spe\nModest Nature\n- Flamethrower\n- Solar Beam\n- Ancient Power\n- Roost\n\nScizor @ Leftovers\nAbility: Technician\nEVs: 22 HP / 30 Atk / 14 Def\nAdamant Nature\n- Bullet Punch\n- Knock Off\n- U-turn\n- Roost'
  );
});

test('rejects unusable Showdown payloads', () => {
  for (const text of [
    ']{"team":null}',
    payload('Scizor||Leftovers|technician|Roost|adamant|252,,,,,||||50|'),
    payload('Scizor||Leftovers|technician|NotAMove|adamant|22,,,,,||||50|'),
  ])
    assert.throws(
      () => parseShowdownTeam(text),
      (error) => error.reason === 'invalid_payload'
    );
});

test('builds a singles team from a Showdown sample', () => {
  const entry = smogonEntries.find(({ id }) => id === 'smogon-bss-m-c-2053196');
  const packed =
    'Charizard-Mega-Y||CharizarditeY|Drought|Flamethrower,SolarBeam,AncientPower,Roost|Modest|20,,2,26,,18||||50|]Hippowdon||RockyHelmet|SandStream|Earthquake,IceFang,SlackOff,Yawn|Impish|32,,10,,24,||||50|]Aegislash||FocusSash|StanceChange|Poltergeist,ShadowSneak,SwordsDance,RockSlide|Jolly|,32,1,,1,32||||50|]Primarina||SitrusBerry|Torrent|SparklingAria,Moonblast,AquaJet,Encore|Modest|32,,17,4,,13||||50|]Meowscarada||ChoiceScarf|Protean|FlowerTrick,TripleAxel,Uturn,KnockOff|Jolly|1,32,1,,,32||||50|]Lucario-Mega-Z||LucarioniteZ|AuraGuard|VacuumWave,NastyPlot,DarkPulse,FlashCannon|Modest|32,,9,6,,19||||50|';
  const team = smogonTeam(entry, payload(packed));
  assert.equal(team.format, 'singles');
  assert.equal(team.pasteUrl, '');
  assert.equal(team.replicaCode, 'S337AEHGUF');
  assert.equal(team.regulation, 'M-C');
  assert.equal(hasCompleteEvs(team), true);
  assert.equal(teamEligibilityError(team), null);
  assert.deepEqual(
    team.reports.map(({ event }) => event),
    ['Pokémon Showdown team', 'Smogon BSS sample teams collection']
  );
  assert.throws(
    () => smogonTeam(entry, payload(packed, 'gen9championsbssregmb')),
    (error) => error.reason === 'format_conflict'
  );
});
