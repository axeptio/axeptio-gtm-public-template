# CI and testing

Five layers, each catching a class the one below cannot. The first three gate every
pull request; the last two need credentials and never block a merge.

| Layer | Command | Gates PRs | Catches |
| --- | --- | --- | --- |
| Unit scenarios | `npm test` | yes | wrong routing decisions in the sandboxed JS |
| Template contract | `npm run validate` | yes | drift *between* the template's sections |
| Hermetic browser | `npm run e2e` | yes | the settings-then-inject ordering, permission failures |
| GTM compile | `npm run gtm:compile` | no | anything GTM's own compiler rejects |
| Live container | `npm run e2e:live` | no | the real SDK failing to boot |

`npm test` runs the first two together — the contract validator is wired in through
`test/template-contract.test.mjs` so it cannot be forgotten.

## Why five

Each layer exists because a real defect slipped through everything cheaper.

**Unit scenarios** are the `___TESTS___` block, run headlessly against the real
sandboxed source. They are the same scenarios the GTM UI runs, so they must stay
portable: no assertion that only works here.

**The contract validator** covers what a scenario structurally cannot see. Scenarios
call `runCode()` with a hand-written `data` object and, exactly as in the GTM UI, run
with permission checks stubbed out. So a consent type added to `allowedConsentTypes`
without a matching `access_consent` grant stays green here and aborts the tag before
`injectScript` in production — the SDK never loads at all. That coupling used to be
enforced by a code comment.

**The hermetic browser suite** runs the same sandboxed source in Chromium with the
template's real permissions enforced, and proves an SDK loaded as a classic
`<script>` actually sees `window.axeptioSettings`. The URL is permission-checked as
written and then rewritten to a local stub, so nothing leaves the machine.

**The GTM compile check** is the only thing that reaches Google's compiler. `npm test`
runs the sandboxed source in a Node `vm` — full ECMAScript — so anything GTM's
restricted subset rejects passes locally and fails on import. It is non-destructive:
an ephemeral workspace, a `quick_preview`, then the workspace is deleted.

**The live suite** loads a real container and the genuine ~700 KB bundle. It is the
only layer that can tell you the SDK itself broke.

A defect that reaches production has, by definition, escaped all five. When that
happens, add the check to the cheapest layer that could have caught it.

## Running the credentialled layers locally

No login step. The script resolves the account, container and service account from
the repository variables via `gh`, and mints its own token:

```bash
npm run gtm:compile    # ask GTM to compile template.tpl
npm run gtm:dry-run    # report whether a publish would happen
npm run gtm:publish    # what CI runs on master
```

You need `gcloud` authenticated (`gcloud auth list`), `gh` authenticated, and
`roles/iam.serviceAccountTokenCreator` on the CI service account.

### Why not Application Default Credentials

The obvious route does not work here. The `tagmanager.*` scopes are restricted in the
Axeptio Workspace, so `gcloud auth application-default login` is refused with **"This
app is blocked"** — plain, with `--scopes`, and with `--impersonate-service-account`
alike.

So locally the script mints a token through the gcloud CLI instead, impersonating the
CI service account. The user consent stays on the default scopes the org already
allows; the restricted scopes are requested when minting the *service account's*
token, where no user consent is involved. A useful side effect: a local run uses the
same identity as CI.

In CI, Workload Identity Federation supplies Application Default Credentials
normally, and none of this applies. There is no service-account key anywhere, which
matters because this repository is public.

### The live suite

```bash
GTM_TEST_PUBLIC_ID=GTM-XXXXXXX \
AXEPTIO_TEST_CLIENT_ID=<24-char id> \
npm run e2e:live
```

If every test times out waiting for `window.axeptioSettings`, check DNS before
suspecting the template. Content blockers and corporate resolvers commonly blackhole
`googletagmanager.com`, and the symptom is silence — the tag simply never fires:

```bash
dscacheutil -q host -a name www.googletagmanager.com   # 0.0.0.0 means blackholed
E2E_HOST_RESOLVER_RULES="MAP www.googletagmanager.com $(dig +short www.googletagmanager.com @1.1.1.1 | head -1)" \
  npm run e2e:live
```

That overrides resolution for the test browser only, leaving the system alone.

## The CI container

`gtm-e2e.yml` publishes to a container used for nothing else, because publishing sets
the live version for every page carrying that container ID.

It is seeded by hand once: import `template.tpl` as a custom template named
**Axeptio CMP** — the name the sync script looks it up by — then create two tags from
it, Brands and Publishers, each on a trigger matching a different page path. CI
replaces the template's code on every run; the tags persist across versions.

The trigger paths are a contract with `e2e/fixtures/`:

| Fixture | Trigger condition |
| --- | --- |
| `live-brands.html` | Page Path contains `live-brands` |
| `live-publishers.html` | Page Path contains `live-publishers` |

Renaming a fixture silently stops its tag firing, and the symptom is an absent banner
rather than a 404. The two conditions must stay mutually exclusive: when both tags
fired from one trigger, two competing CMPs loaded on the same page.

The service account needs **Publish** on the container, not Edit — creating a version
needs Approve and publishing needs Publish, so Edit fails halfway through the first
run.

## Constraints worth knowing before changing any of this

**GTM's API quota is 0.25 requests per second**, enforced over a 100-second window and
hard-capped: raising the per-user limit in Cloud Console does nothing. Both GTM
workflows share a `gtm-api` concurrency group for that reason, and the script spaces
its calls 4 seconds apart.

Sharing that group is also why the compile check runs on pull requests only. When it
also ran on `master`, the two workflows queued against each other on every merge and
one was cancelled before starting. Nothing is lost: on `master` the e2e workflow
publishes, and `create_version` fails loud on `compilerError` — a stronger check than
`quick_preview`, because it actually produces a version.

**Standard Tag Manager allows three workspaces per container.** The script reaps
orphaned `ci-sync-*` workspaces before claiming one, so a killed run cannot silently
consume a third of the budget.

**GTM rewrites the JSON blocks it stores**, escaping `'`, `=`, `&`, `<` and `>` as
`\uXXXX`. `template.tpl` came from a GTM export and is already in that form, so a PUT
round-trips byte-for-byte and the "skip if unchanged" check works. One hand-typed
apostrophe breaks that permanently: the stored copy can then never equal the file, and
every run would publish a new container version. Check 2 in
`scripts/validate-template.mjs` enforces it.

**Fork pull requests get neither secrets nor an OIDC token.** The GTM workflows skip
themselves rather than failing, so an outside contributor sees three green gating
checks and no confusing red ones.
