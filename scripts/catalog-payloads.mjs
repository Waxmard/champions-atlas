import { normalize } from '../src/lib/catalog.ts';
import { parseVrPaste } from './catalog-sources.mjs';

function errorWithReason(reason, message) {
  const error = new Error(message);
  error.reason = reason;
  return error;
}

const isVrPasteUrl = (value) => value.startsWith('https://www.vrpastes.com/');
const vrPasteApi = (id) =>
  `https://vrpaste-backend.vercel.app/api/paste/${id}?lang=english`;

function validateProviderJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw errorWithReason(
      'invalid_payload',
      'Provider payload is not a JSON object'
    );
}

export const championRegulation = (value) => {
  if (typeof value !== 'string') return null;
  const text = normalize(value);
  return (
    /vgcregulation([a-z]{2})$/.exec(text)?.[1] ??
    /champions.*reg([a-z]{2})$/.exec(text)?.[1] ??
    null
  );
};

async function loadVictoryRoadPayload(candidate, fetchCached, refresh) {
  const id = candidate.pasteUrl.split('/').at(-1);
  let text;
  try {
    text = await fetchCached(
      `vr-${id}.json`,
      vrPasteApi(id),
      validateProviderJson,
      refresh
    );
  } catch (error) {
    throw error.reason
      ? error
      : errorWithReason('paste_unavailable', error.message);
  }
  try {
    return { ...parseVrPaste(JSON.parse(text)), provider: 'victory-road' };
  } catch (error) {
    throw error.reason
      ? error
      : errorWithReason('invalid_payload', `Invalid VR payload: ${id}`);
  }
}

async function loadPokepastePayload(candidate, fetchCached, refresh) {
  const key = candidate.pasteUrl.split('/').at(-1);
  let text;
  try {
    text = await fetchCached(
      `${key}.json`,
      `${candidate.pasteUrl}/json`,
      validateProviderJson,
      refresh
    );
  } catch (error) {
    throw error.reason
      ? error
      : errorWithReason('paste_unavailable', error.message);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw errorWithReason('invalid_payload', `Invalid paste payload: ${key}`);
  }
  return {
    paste: data.paste,
    notes: data.notes,
    publishedAt: '',
    provider: 'pokepaste',
    title: data.title,
  };
}

export function loadIndexPaste(candidate, fetchCached, refresh = false) {
  return isVrPasteUrl(candidate.pasteUrl)
    ? loadVictoryRoadPayload(candidate, fetchCached, refresh)
    : loadPokepastePayload(candidate, fetchCached, refresh);
}
