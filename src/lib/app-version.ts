const VERSION_URL = '/version.json';
const MINIMUM_PROBE_INTERVAL_MS = 30_000;
const RELOAD_GUARD_KEY = 'champions-atlas:update-reload:v1';

export function parseBuildId(payload: string): string | null {
  try {
    const parsed: unknown = JSON.parse(payload);
    const buildId = (parsed as { buildId?: unknown } | null)?.buildId;
    return typeof buildId === 'string' ? buildId : null;
  } catch {
    return null;
  }
}

export function shouldReload(
  running: string | undefined,
  served: string | null
): boolean {
  return Boolean(running && served && running !== served);
}

export async function readServedBuildId(
  options: { url?: string; fetchImpl?: typeof fetch } = {}
): Promise<string | null> {
  const { url = VERSION_URL, fetchImpl = fetch } = options;
  try {
    const response = await fetchImpl(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return parseBuildId(await response.text());
  } catch {
    return null;
  }
}

export function claimAutoReload(
  served: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> = sessionStorage
): boolean {
  try {
    if (storage.getItem(RELOAD_GUARD_KEY) === served) return false;
    storage.setItem(RELOAD_GUARD_KEY, served);
    return true;
  } catch {
    return false;
  }
}

export function watchForUpdate(options: {
  running: string | undefined;
  onStale: (served: string) => void;
}): () => void {
  let lastEventProbe = 0;
  let probing = false;

  const probe = async (fromEvent: boolean) => {
    if (!options.running || probing) return;
    if (document.visibilityState !== 'visible') return;
    if (fromEvent && Date.now() - lastEventProbe < MINIMUM_PROBE_INTERVAL_MS)
      return;
    probing = true;
    if (fromEvent) lastEventProbe = Date.now();
    try {
      const served = await readServedBuildId();
      if (served && shouldReload(options.running, served))
        options.onStale(served);
    } finally {
      probing = false;
    }
  };

  void probe(false);
  const onEvent = () => void probe(true);
  document.addEventListener('visibilitychange', onEvent);
  window.addEventListener('pageshow', onEvent);
  return () => {
    document.removeEventListener('visibilitychange', onEvent);
    window.removeEventListener('pageshow', onEvent);
  };
}
