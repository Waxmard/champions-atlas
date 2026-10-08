import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchWithRetry, isTransient } from './catalog-sources.mjs';

const transientCodes = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'EAI_AGAIN',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'EPIPE',
]);

const transientError = (error) =>
  error.name !== 'AbortError' &&
  (error.name === 'TimeoutError' ||
    error.cause?.name === 'TimeoutError' ||
    transientCodes.has(error.code) ||
    transientCodes.has(error.cause?.code));

export async function fetchCached(
  name,
  address,
  {
    cache,
    validate,
    refresh = false,
    offline = false,
    allowStale = false,
    fetchOptions = { redirect: 'error' },
    missingMessage = `Missing cached file: ${name}`,
  }
) {
  const path = resolve(cache, name);
  const validated = (text) => {
    if (text.length > 5000000)
      throw new Error('Source response exceeds size limit');
    validate(text);
    return text;
  };
  const readCached = async () => validated(await readFile(path, 'utf8'));
  if (!refresh) {
    try {
      return await readCached();
    } catch (error) {
      if (offline && error.code !== 'ENOENT') throw error;
    }
  }
  if (offline) throw new Error(missingMessage);

  let response;
  let text;
  try {
    response = await fetchWithRetry(address, fetchOptions);
    if (!response.ok) throw new Error(`${response.status} fetching ${address}`);
    text = await response.text();
  } catch (refreshError) {
    const eligible =
      response && !response.ok
        ? isTransient(response.status)
        : transientError(refreshError);
    if (!allowStale || !eligible) throw refreshError;
    let cached;
    let cacheFailure;
    try {
      cached = await readCached();
    } catch (cacheError) {
      cacheFailure = cacheError;
    }
    if (cacheFailure)
      throw new Error(
        `Cached source ${name} is unusable after failed refresh: ${cacheFailure.message}`,
        { cause: refreshError }
      );
    console.warn(
      `Using validated cached source ${name} (${address}) after refresh failure: ${refreshError.cause?.code || refreshError.code || refreshError.message}`
    );
    return cached;
  }
  validated(text);
  await writeFile(path, text);
  return text;
}
