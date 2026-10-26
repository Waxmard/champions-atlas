import { youtubePrior } from './youtube-source.mjs';
import { youtubeIndexData } from './youtube-admission.mjs';

export function compatibleYoutubePrior(candidate, previousTeams, fromPayload) {
  const prior = youtubePrior(candidate, previousTeams);
  if (!prior || typeof prior.paste !== 'string') return null;
  const payload = { paste: prior.paste, notes: prior.pasteNotes };
  try {
    const team = fromPayload(candidate, payload);
    return team.id === prior.id && team.regulation === prior.regulation
      ? { ...prior, regulationInference: team.regulationInference }
      : null;
  } catch {
    return null;
  }
}

export function youtubeTeamFromPayload(
  candidate,
  payload,
  canonicalNames,
  fromIndex
) {
  const data = youtubeIndexData(candidate, payload);
  return fromIndex(data.candidate, data.payload, canonicalNames);
}
