import { sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:http2';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bestEvidence, youtubeChannelNames } from '../src/lib/catalog.ts';

const BUNDLE_ID = 'com.maxwellward.championsatlas';
const APPLE_TEAM_ID = '48TY2FP59S';
const COLLAPSE_ID = 'catalog-new-teams';
const APNS_HOSTS = [
  'https://api.push.apple.com',
  'https://api.sandbox.push.apple.com',
];
const REQUIRED_ENV = ['APNS_KEY_ID', 'APNS_KEY_P8', 'FIREBASE_SERVICE_ACCOUNT'];
const FIRESTORE = 'https://firestore.googleapis.com/v1/';

const listFormat = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export function newTeamsAlert(bundle) {
  const ids = new Set(bundle.latestBatch?.ids);
  const current = bundle.currentRegulation;
  const teams = bundle.teams.filter(
    (team) => ids.has(team.id) && team.regulation === current
  );
  if (!teams.length) return null;
  const counts = new Map();
  for (const team of teams) {
    const best = bestEvidence(team, current);
    const source =
      youtubeChannelNames(team.reports)[0] ??
      (best.platform === 'Tournament' ? best.event.trim() : '');
    if (source) counts.set(source, (counts.get(source) ?? 0) + 1);
  }
  const sources = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([source]) => source);
  const shown = sources.slice(0, 3);
  if (sources.length > 3) shown.push(`${sources.length - 3} more`);
  return {
    title: `${teams.length} new Reg ${current} ${teams.length === 1 ? 'team' : 'teams'}`,
    body: shown.length ? listFormat.format(shown) : 'Tap to see them',
  };
}

function jwt(header, claims, signInput) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode(header)}.${encode(claims)}`;
  return `${input}.${signInput(Buffer.from(input)).toString('base64url')}`;
}

async function googleAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 600,
    },
    (input) => sign('RSA-SHA256', input, account.private_key)
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok)
    throw new Error(`Google sign-in failed: HTTP ${response.status}.`);
  return (await response.json()).access_token;
}

async function firestore(accessToken, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
  });
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`Firestore request failed: HTTP ${response.status}.`);
  return response.json();
}

function failureReason(body) {
  try {
    return JSON.parse(body).reason;
  } catch {
    return body;
  }
}

function send(session, authorization, deviceToken, payload) {
  const { promise, resolve: done, reject } = Promise.withResolvers();
  const request = session.request({
    ':method': 'POST',
    ':path': `/3/device/${deviceToken}`,
    authorization,
    'apns-topic': BUNDLE_ID,
    'apns-push-type': 'alert',
    'apns-collapse-id': COLLAPSE_ID,
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
  });
  let status = 0;
  let body = '';
  request.setEncoding('utf8');
  request.on('response', (headers) => {
    status = headers[':status'];
  });
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => done({ status, reason: failureReason(body) }));
  request.on('error', reject);
  request.end(payload);
  return promise;
}

export async function deliver(sessions, authorization, deviceToken, payload) {
  for (const session of sessions) {
    const { status, reason } = await send(
      session,
      authorization,
      deviceToken,
      payload
    );
    if (status === 200) return 'sent';
    if (status === 410) return 'dead';
    if (status === 400 && reason === 'BadDeviceToken') continue;
    if (status >= 400 && status < 500 && status !== 403 && status !== 429)
      return `rejected: ${status} ${reason}`;
    return `failed: ${status} ${reason}`;
  }
  return 'dead';
}

export async function notifyNewTeams({
  hostingDir = '.cache/hosting',
  env = process.env,
} = {}) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]);
  if (missing.length)
    throw new Error(
      `Missing required environment variable(s): ${missing.join(' ')}`
    );
  const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const manifest = JSON.parse(
    await readFile(join(hostingDir, 'catalog', 'manifest.json'), 'utf8')
  );
  const bundle = JSON.parse(
    await readFile(
      join(hostingDir, 'catalog', `bundle-${manifest.bundleHash}.json`),
      'utf8'
    )
  );
  const batch = bundle.latestBatch;
  if (!batch) return 'No batch of new teams yet; nothing sent.';

  const accessToken = await googleAccessToken(account);
  const documents = `${FIRESTORE}projects/${account.project_id}/databases/(default)/documents`;
  const state = await firestore(accessToken, `${documents}/pushState/catalog`);
  if (state?.fields?.announced?.stringValue === batch.addedAt)
    return 'No new teams; nothing sent.';
  const alert = newTeamsAlert(bundle);
  let summary =
    'The latest batch has no current-regulation teams; nothing sent.';

  if (alert) {
    const names = [];
    let pageToken = '';
    do {
      const page = await firestore(
        accessToken,
        `${documents}/pushTokens?pageSize=300&mask.fieldPaths=uid&pageToken=${encodeURIComponent(pageToken)}`
      );
      names.push(...(page?.documents ?? []).map((document) => document.name));
      pageToken = page?.nextPageToken ?? '';
    } while (pageToken);

    const authorization = `bearer ${jwt(
      { alg: 'ES256', kid: env.APNS_KEY_ID },
      { iss: APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) },
      (input) =>
        sign('sha256', input, {
          key: env.APNS_KEY_P8,
          dsaEncoding: 'ieee-p1363',
        })
    )}`;
    const payload = JSON.stringify({ aps: { alert } });
    const sessions = APNS_HOSTS.map((host) =>
      connect(host).on('error', (error) =>
        console.error(`APNs connection to ${host} failed: ${error.message}`)
      )
    );
    const counts = { sent: 0, dead: 0, rejected: 0, failed: 0 };
    try {
      for (const name of names) {
        const outcome = await deliver(
          sessions,
          authorization,
          name.split('/').pop(),
          payload
        );
        if (outcome === 'sent') counts.sent++;
        else if (outcome === 'dead') {
          counts.dead++;
          await firestore(accessToken, `${FIRESTORE}${name}`, {
            method: 'DELETE',
          });
        } else if (outcome.startsWith('rejected')) {
          counts.rejected++;
          console.error(`Notification ${outcome}`);
        } else {
          counts.failed++;
          console.error(`Notification ${outcome}`);
        }
      }
    } finally {
      for (const session of sessions) session.close();
    }
    if (counts.failed && !counts.sent)
      throw new Error(
        `${counts.failed} of ${names.length} notifications failed and none were sent; the batch was not marked as announced.`
      );
    summary = `Sent "${alert.title}" to ${counts.sent} device(s); removed ${counts.dead} stale token(s); ${counts.rejected} rejected; ${counts.failed} failed.`;
  }

  await firestore(accessToken, `${documents}/pushState/catalog`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: { announced: { stringValue: batch.addedAt } },
    }),
  });
  return summary;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  console.log(await notifyNewTeams());
}
