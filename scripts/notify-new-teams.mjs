import { sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { connect } from 'node:http2';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUNDLE_ID = 'com.maxwellward.championsatlas';
const APPLE_TEAM_ID = '48TY2FP59S';
const COLLAPSE_ID = 'catalog-new-teams';
const APNS_HOSTS = [
  'https://api.push.apple.com',
  'https://api.sandbox.push.apple.com',
];
const REQUIRED_ENV = ['APNS_KEY_ID', 'APNS_KEY_P8', 'FIREBASE_SERVICE_ACCOUNT'];
const FIRESTORE = 'https://firestore.googleapis.com/v1/';

export function newTeamsAlert(known, current) {
  if (!known) return null;
  const seen = new Set(known);
  const count = current.ids.filter((id) => !seen.has(id)).length;
  if (!count) return null;
  return {
    title: `${count} new Reg ${current.regulation} ${count === 1 ? 'team' : 'teams'}`,
    body: 'Open Browse to see them.',
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
  request.on('end', () =>
    done({ status, reason: body ? JSON.parse(body).reason : '' })
  );
  request.on('error', reject);
  request.end(payload);
  return promise;
}

async function deliver(sessions, authorization, deviceToken, payload) {
  for (const session of sessions) {
    const { status, reason } = await send(
      session,
      authorization,
      deviceToken,
      payload
    );
    if (status === 200) return 'sent';
    if (status === 410) return 'dead';
    if (status !== 400 || reason !== 'BadDeviceToken')
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
  const current = JSON.parse(
    await readFile(
      join(hostingDir, 'catalog', `current-${manifest.bundleHash}.json`),
      'utf8'
    )
  );

  const accessToken = await googleAccessToken(account);
  const documents = `${FIRESTORE}projects/${account.project_id}/databases/(default)/documents`;
  const state = await firestore(accessToken, `${documents}/pushState/catalog`);
  const known = state ? JSON.parse(state.fields.known.stringValue) : null;
  const alert = newTeamsAlert(known, current);
  let summary = known
    ? 'No new teams; nothing sent.'
    : 'Stored the first baseline; nothing sent.';

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
      connect(host).on('error', () => undefined)
    );
    const counts = { sent: 0, dead: 0, failed: 0 };
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
        } else {
          counts.failed++;
          console.error(`Notification ${outcome}`);
        }
      }
    } finally {
      for (const session of sessions) session.close();
    }
    if (counts.failed)
      throw new Error(
        `${counts.failed} of ${names.length} notifications failed; the baseline was not advanced.`
      );
    summary = `Sent "${alert.title}" to ${counts.sent} device(s); removed ${counts.dead} stale token(s).`;
  }

  await firestore(accessToken, `${documents}/pushState/catalog`, {
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        known: {
          stringValue: JSON.stringify([
            ...new Set([...(known ?? []), ...current.ids]),
          ]),
        },
      },
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
