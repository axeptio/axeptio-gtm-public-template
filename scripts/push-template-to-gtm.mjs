#!/usr/bin/env node
// Drives template.tpl into the CI Tag Manager container through the Tag Manager
// API v2.
//
// Two jobs, one script:
//
//   --compile-only   Ask GTM to compile the template and report whether it would
//                    build. This is the only way CI can reach Google's own
//                    compiler, which is what actually decides whether the
//                    sandboxed JS is legal, the parameters block is well-formed
//                    and the permissions are coherent. The local suite cannot:
//                    it runs the sandboxed source in a Node vm, which is full
//                    ECMAScript, so anything GTM's restricted subset rejects
//                    passes locally. Non-destructive — no version, no publish —
//                    so it is safe on every pull request.
//
//   (default)        Publish the template to the container, so the live-container
//                    e2e suite always tests the current template rather than a
//                    manually-imported, possibly stale copy.
//
// Ported from axeptio/axeptio-sgtm-public-template's push-template-to-staging.mjs,
// adapted for a web container and for the checks this repo needs. Copied rather
// than shared: that repo is a sibling, and a public repo cannot call reusable
// workflows from an internal one (see docs/release-automation.md).
//
// Auth: Application Default Credentials. In CI these come from
// google-github-actions/auth via Workload Identity Federation — there is no
// service-account key anywhere, which matters because this repository is public.
// Locally, run `npm run gtm:login`, which is:
//
//   gcloud auth application-default login \
//     --impersonate-service-account=gtm-ci@axeptio-gtm-ci.iam.gserviceaccount.com
//
// Impersonation rather than a scoped user login, for two reasons.
//
// First, it is the only thing that works here. The tagmanager.* scopes are
// restricted in the axeptio Workspace, so `application-default login --scopes=...`
// is refused with "This app is blocked" before the browser flow completes. Under
// impersonation the *user* consent stays on the default scopes the org already
// allows, and the restricted scopes are requested when minting the service
// account's token, where no user consent is involved.
//
// Second, it makes a local run use the same identity as CI, so "works on my
// machine" means rather more than usual. It needs roles/iam.serviceAccountTokenCreator
// on the service account.
//
// The SCOPES list below is honoured for service-account credentials, where the
// library requests them as it mints the token — which covers both CI and the
// impersonated local case. It is silently ignored for a plain user credential,
// whose scopes are fixed at login; that is why a bare `application-default login`
// fails every call with ACCESS_TOKEN_SCOPE_INSUFFICIENT.
//
// The identity must also be a member of the GTM container with Publish (Approve
// is the floor for create_version; publishing needs Publish).
//
// Env:
//   GTM_ACCOUNT_ID     (required) numeric account id, not the GTM-XXXXXXX public id
//   GTM_CONTAINER_ID   (required) numeric container id
//   GTM_TEMPLATE_NAME  (optional) template display name; default "Axeptio CMP"
//   GTM_VERSION_NAME   (optional) label for the created version; default "ci <sha>"
//   GTM_API_MIN_INTERVAL_MS (optional) min spacing between calls; default 4000.
//                      GTM's quota is 0.25 QPS enforced over a 100-second window
//                      and is hard-capped — raising it in Cloud Console does
//                      nothing — so this is a real constraint, not politeness.
//   GITHUB_SHA / GITHUB_OUTPUT  consumed when present.
//
// Node built-ins plus google-auth-library. No googleapis SDK.

import { readFileSync, appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GoogleAuth } from 'google-auth-library';

const TPL_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'template.tpl');
const API_BASE = 'https://tagmanager.googleapis.com/tagmanager/v2';
const REPO = 'axeptio/axeptio-gtm-public-template';

// The workflow env names and the repository variable names deliberately differ:
// the script speaks GTM_ACCOUNT_ID, while the variables carry a TEST_ prefix to
// make it obvious in repo settings that they point at the CI container and not a
// production one.
const REPO_VARIABLE = {
  GTM_ACCOUNT_ID: 'GTM_TEST_ACCOUNT_ID',
  GTM_CONTAINER_ID: 'GTM_TEST_CONTAINER_ID',
};

// Union of every scope the flow touches. delete.containers is the one that is easy
// to miss: it is needed to remove the ephemeral workspace and appears nowhere else.
const SCOPES = [
  'https://www.googleapis.com/auth/tagmanager.edit.containers',
  'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
  'https://www.googleapis.com/auth/tagmanager.publish',
  'https://www.googleapis.com/auth/tagmanager.delete.containers',
];

// --- CLI / env ----------------------------------------------------------------

const args = process.argv.slice(2);
const compileOnly = args.includes('--compile-only');
const dryRun = args.includes('--dry-run');

const accountId = resolveSetting('GTM_ACCOUNT_ID');
const containerId = resolveSetting('GTM_CONTAINER_ID');
const templateName = process.env.GTM_TEMPLATE_NAME?.trim() || 'Axeptio CMP';
const sha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
const versionName = process.env.GTM_VERSION_NAME?.trim() || `ci ${sha}`;
const minIntervalMs = Number(process.env.GTM_API_MIN_INTERVAL_MS || 4000);
if (!Number.isFinite(minIntervalMs) || minIntervalMs < 0) {
  fail('GTM_API_MIN_INTERVAL_MS must be a non-negative number.');
}

const containerPath = `accounts/${accountId}/containers/${containerId}`;

// CI passes these explicitly. Locally, read them from the repository variables so
// nobody has to know or copy the numeric ids — they are not secret, they are just
// tedious, and a wrong container id is an unpleasant thing to debug.
function resolveSetting(name) {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return fromEnv;

  const variable = REPO_VARIABLE[name] || name;
  try {
    const value = execFileSync('gh', ['variable', 'get', variable, '--repo', REPO], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (value) {
      console.log(`  ${name} from repository variable ${variable}: ${value}`);
      return value;
    }
  } catch {
    // gh missing, unauthenticated, or the variable is unset — fall through to the
    // instruction below rather than reporting a confusing gh error.
  }

  fail(
    `${name} is not set, and repository variable ${variable} could not be read from ${REPO}.\n` +
    '  Either export it, or authenticate gh (`gh auth login`) so it can be looked up.',
  );
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function setOutput(key, value) {
  console.log(`  ${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

// --- Rate-limited API client --------------------------------------------------

const auth = new GoogleAuth({ scopes: SCOPES });
let client;
let lastCallAt = 0;
let cachedToken = null;

// Two ways to get a token, chosen by environment rather than by trial:
//
//   CI     Application Default Credentials, populated by Workload Identity
//          Federation. No key, no browser, nothing to store.
//
//   local  A token minted through the gcloud CLI, impersonating the same service
//          account. This exists because the browser route is unavailable here:
//          the axeptio Workspace blocks `gcloud auth application-default login`
//          with "This app is blocked", both plain and with
//          --impersonate-service-account. The CLI path reuses the gcloud
//          credentials you already have, so it needs no new consent, and it runs
//          as the same identity CI does. It needs
//          roles/iam.serviceAccountTokenCreator on the service account.
//
// Deterministic rather than fallback-on-failure: an ADC token that merely lacks
// scopes succeeds locally and then fails at the API, which would make the retry
// logic hard to reason about.
function mintTokenViaGcloud() {
  if (cachedToken) return cachedToken;
  const serviceAccount = resolveSetting('GCP_SERVICE_ACCOUNT');
  try {
    cachedToken = execFileSync('gcloud', [
      'auth', 'print-access-token',
      `--impersonate-service-account=${serviceAccount}`,
      `--scopes=${SCOPES.join(',')}`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    fail(
      `Could not mint a token as ${serviceAccount}.\n` +
      '  Check that gcloud is authenticated (`gcloud auth list`) and that you hold\n' +
      '  roles/iam.serviceAccountTokenCreator on that service account.',
    );
  }
  return cachedToken;
}

async function getAccessToken() {
  if (process.env.CI) {
    if (!client) client = await auth.getClient();
    const { token } = await client.getAccessToken();
    // Fail fast rather than sending "Authorization: Bearer undefined", which turns
    // a credential problem into an opaque 401.
    if (!token) throw new Error('ADC returned no access token; check the workload identity configuration.');
    return token;
  }
  return mintTokenViaGcloud();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class ApiError extends Error {
  constructor(status, method, path, body) {
    super(`${method} ${path} -> ${status}: ${body}`);
    this.status = status;
  }
}

async function api(method, path, { query, body } = {}) {
  if (!client) client = await auth.getClient();

  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  for (let attempt = 0; ; attempt++) {
    const wait = lastCallAt + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();

    const token = await getAccessToken();

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();

    // GTM answers 403 for quota exhaustion, not 429, so retrying blindly on 403
    // would mask a genuine permission problem. Distinguish on the message.
    const quotaExhausted = res.status === 403 && /quota|rate limit/i.test(text);
    if (res.status === 429 || res.status >= 500 || quotaExhausted) {
      if (attempt >= 5) throw new ApiError(res.status, method, path, `after ${attempt + 1} attempts: ${text}`);
      const backoff = Math.min(60000, 2 ** attempt * 1000);
      console.warn(`  ${res.status} on ${method} ${path}; retrying in ${backoff}ms`);
      await sleep(backoff);
      continue;
    }

    // The single most likely local failure, and the least self-explanatory: a user
    // credential's scopes are fixed at login, so ADC created without the tagmanager
    // scopes fails every call. Say what to run rather than echoing Google's error.
    if (!res.ok && /ACCESS_TOKEN_SCOPE_INSUFFICIENT/.test(text)) {
      throw new Error(
        'Credentials lack the Tag Manager scopes.\n' +
        '  Run `npm run gtm:login` and try again.\n' +
        '  (A plain `gcloud auth application-default login` is not enough: a user\n' +
        '   credential cannot have scopes added after the fact.)',
      );
    }

    if (!res.ok) throw new ApiError(res.status, method, path, text);
    return text ? JSON.parse(text) : {};
  }
}

// --- Flow ---------------------------------------------------------------------

// Compared loosely on trailing whitespace only. The bodies must otherwise match
// byte-for-byte, and they do: GTM re-serialises the JSON blocks with ' = & < >
// escaped as \uXXXX, and template.tpl is kept in exactly that form — enforced by
// check 2 in scripts/validate-template.mjs. Without that invariant this comparison
// would never match and every run would publish a new container version.
const norm = (s) => (s || '').replace(/\s+$/, '');

async function findTemplate(workspacePath) {
  const res = await api('GET', `${workspacePath}/templates`);
  const match = (res.template || []).find((t) => t.name === templateName);
  if (!match) {
    throw new Error(
      `No template named "${templateName}" in container ${containerId}. ` +
      'Import template.tpl once through the GTM UI (Templates -> New -> Import), then re-run.',
    );
  }
  return match;
}

// Standard Tag Manager allows only 3 workspaces per container, so a leaked one
// from a killed run is not cosmetic — it consumes a third of the budget. Sweep
// anything this script left behind before claiming another.
async function reapOrphanedWorkspaces() {
  const res = await api('GET', `${containerPath}/workspaces`);
  const orphans = (res.workspace || []).filter((w) => (w.name || '').startsWith('ci-sync-'));
  for (const orphan of orphans) {
    console.log(`  reaping orphaned workspace ${orphan.workspaceId} (${orphan.name})`);
    try {
      await api('DELETE', orphan.path);
    } catch (err) {
      console.warn(`  could not delete ${orphan.workspaceId}: ${err.message}`);
    }
  }
}

async function main() {
  const localData = readFileSync(TPL_PATH, 'utf8');

  await reapOrphanedWorkspaces();

  const workspace = await api('POST', `${containerPath}/workspaces`, {
    body: { name: `ci-sync-${sha}`, description: `Automated template check for ${versionName}` },
  });
  const workspacePath = workspace.path;
  console.log(`Created ephemeral workspace ${workspace.workspaceId}`);

  // create_version consumes the workspace, so a 404 on cleanup is expected and
  // benign. Warn only on a genuine failure, and never let cleanup mask the real
  // error on the failure path.
  let workspaceLives = true;
  const deleteWorkspace = async () => {
    if (!workspaceLives) return;
    workspaceLives = false;
    try {
      await api('DELETE', workspacePath);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        console.warn(`  workspace cleanup: ${err.message}`);
      }
    }
  };

  try {
    const template = await findTemplate(workspacePath);
    const unchanged = norm(template.templateData) === norm(localData);

    if (compileOnly) {
      // Always write and compile, even when the container already matches: the
      // point is to compile THIS commit's template, and "the live version already
      // compiled" says nothing about the version under review.
      await api('PUT', template.path, {
        query: { fingerprint: template.fingerprint },
        body: { ...template, templateData: localData },
      });
      const preview = await api('POST', `${workspacePath}:quick_preview`);

      // GTM reports a failed compile in-band with HTTP 200, so not checking this
      // flag would turn a broken template into a green build.
      if (preview.compilerError) {
        throw new Error(
          'GTM failed to compile template.tpl. The sandboxed JS, ___TEMPLATE_PARAMETERS___ ' +
          'or ___WEB_PERMISSIONS___ is not valid for a custom template.',
        );
      }
      if (preview.syncStatus?.mergeConflict || preview.syncStatus?.syncError) {
        throw new Error(`quick_preview reported a dirty syncStatus: ${JSON.stringify(preview.syncStatus)}`);
      }

      console.log('GTM compiled template.tpl successfully.');
      setOutput('compiles', 'true');
      setOutput('changed', unchanged ? 'false' : 'true');
      await deleteWorkspace();
      return;
    }

    if (unchanged) {
      console.log('Container already matches template.tpl; nothing to publish.');
      await deleteWorkspace();
      setOutput('changed', 'false');
      return;
    }

    if (dryRun) {
      console.log('[dry-run] Template differs; a real run would update, version and publish.');
      await deleteWorkspace();
      setOutput('changed', 'true');
      return;
    }

    // Replace only templateData and echo the rest back, so nothing else on the
    // resource is disturbed. fingerprint guards against a concurrent edit landing
    // between the GET and this PUT.
    await api('PUT', template.path, {
      query: { fingerprint: template.fingerprint },
      body: { ...template, templateData: localData },
    });
    console.log('Updated templateData in the ephemeral workspace.');

    const created = await api('POST', `${workspacePath}:create_version`, {
      body: { name: versionName, notes: `Automated sync of template.tpl at ${sha}` },
    });
    if (created.compilerError) throw new Error('create_version reported a compilerError; not publishing.');
    if (created.syncStatus?.mergeConflict || created.syncStatus?.syncError) {
      throw new Error(`create_version reported a dirty syncStatus: ${JSON.stringify(created.syncStatus)}`);
    }
    const version = created.containerVersion;
    if (!version?.containerVersionId) {
      throw new Error('create_version returned no container version; nothing to publish.');
    }
    console.log(`Created container version ${version.containerVersionId}`);

    await api('POST', `${containerPath}/versions/${version.containerVersionId}:publish`, {
      query: { fingerprint: version.fingerprint },
    });
    console.log(`Published version ${version.containerVersionId}.`);

    await deleteWorkspace();
    setOutput('changed', 'true');
    setOutput('published_version', version.containerVersionId);
  } catch (err) {
    await deleteWorkspace();
    throw err;
  }
}

main().catch((err) => fail(err.stack || err.message));
