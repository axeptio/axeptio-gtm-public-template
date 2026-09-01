<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-axeptio-white.svg">
    <img src="assets/logo-axeptio.svg" alt="Axeptio" width="180">
  </picture>
</p>

# Axeptio CMP — Google Tag Manager Template

[![GTM Gallery](https://img.shields.io/badge/GTM_Gallery-Axeptio_CMP-4285F4?logo=googletagmanager&logoColor=white)](https://tagmanager.google.com/gallery/#/owners/axeptio/templates/axeptio-gtm-public-template)
[![Release](https://img.shields.io/github/v/release/axeptio/axeptio-gtm-public-template)](https://github.com/axeptio/axeptio-gtm-public-template/releases)
[![License](https://img.shields.io/github/license/axeptio/axeptio-gtm-public-template)](./LICENSE)
[![Validate gallery contract](https://github.com/axeptio/axeptio-gtm-public-template/actions/workflows/validate-gallery.yml/badge.svg)](https://github.com/axeptio/axeptio-gtm-public-template/actions/workflows/validate-gallery.yml)

The official [Axeptio](https://www.axept.io/) consent management tag for Google Tag Manager
(web containers).

The tag loads the Axeptio CMP on your site, applies your cookie configuration, and wires
Axeptio's consent decisions into
[Google Consent Mode v2](https://support.axeptio.eu/articles/274002), so Google tags fire
according to the visitor's choices. Consent Mode is on by default for new tags.

**[▶ Axeptio CMP in the Community Template Gallery](https://tagmanager.google.com/gallery/#/owners/axeptio/templates/axeptio-gtm-public-template)**

## Installing

In your GTM **web** container: **Templates → Tag Templates → Search Gallery**, look for
**Axeptio CMP**, and add it to your workspace. Then create a tag from the template and set at
least the **Project ID**.

Trigger it on **Consent Initialization — All Pages** so Consent Mode defaults are set before
every other tag fires, not just before the CMP loads. Consent Mode is on by default for new
tags, so check that your Axeptio project has it enabled too.

Step-by-step setup, screenshots and Consent Mode guidance live in the Help Center:

👉 **[Axeptio Help Center — Google Consent Mode v2](https://support.axeptio.eu/articles/274002)**

### Testing a version before it reaches the gallery

The gallery serves the released template, and Google picks a new version up two to three days after
it is published — so a fix you have been told is "in" is not installable there yet. Every release
carries the template as a downloadable file for exactly that window:

1. Open [Releases](https://github.com/axeptio/axeptio-gtm-public-template/releases) and download
   `axeptio-cmp-<version>.tpl` from the version you want.
2. In GTM: **Templates → Tag Templates → New**, then the **⋮** menu at the top right → **Import**,
   and choose the file.
3. Create a tag from it as above.

> [!WARNING]
> A template imported this way is a **separate object** from the gallery one. It receives no gallery
> updates, and a container can end up holding both — two Axeptio templates, and a tag pointing at
> whichever one you picked. Import a pre-release build into a **test container, never a production
> one**, and delete it once the version reaches the gallery.

For the very latest unreleased state rather than a release, `template.tpl` on the `develop` branch is
the same file. It moves whenever `develop` moves, so note the commit if you report anything against
it.

## Configuration

| Field | Default | What it does |
| --- | --- | --- |
| **Project ID** | — | Your Axeptio project identifier, from the project's settings menu. Accepts a GTM variable. |
| **Axeptio product** | `brands` | Which Axeptio product the Project ID belongs to. See [below](#choosing-brands-or-publishers). |
| **Cookies Version** | — | Loads a named cookie configuration. Left empty, the configuration's `pages` property decides. |

<details>
<summary><strong>Regions and geolocation</strong></summary>

| Field | What it does |
| --- | --- |
| Let Axeptio pick the configuration from the visitor's location | Asks Axeptio which configuration this visitor should be shown, instead of pinning one above. Off by default. See [below](#letting-axeptio-pick-the-configuration). |
| Visitor country (GTM variable) | A variable holding the visitor's ISO 3166-1 alpha-2 country (`FR`) or ISO 3166-2 subdivision (`US-CA`), typically from a CDN or server-side geolocation header. Left empty, the two fields above are always used. |
| Projects by region | One row per set of regions, each naming the **Project ID**, the **Axeptio product** and optionally the **Cookies Version** to load there. The first matching row replaces those fields above. See [below](#serving-brands-in-some-countries-and-tcf-in-others). |

</details>

<details>
<summary><strong>Cookie settings</strong></summary>

| Field | Default | What it does |
| --- | --- | --- |
| User cookies duration (in days) | `180` | How long the visitor's choices are remembered. |
| User cookies domain | — | Set to a parent domain to share one consent across subdomains. |
| User cookies secure | on | Restricts the consent cookie to HTTPS. |
| Consent cookie metadata prefix | `$$` | The prefix the SDK stores its bookkeeping keys under. Change it only if your project sets `metadataPrefix` — otherwise the tag reads the visitor's stored choices under the wrong keys. This field is passed to the SDK and wins over a `metadataPrefix` row in Additional Settings; a row on its own is honoured for both. |
| dataLayer Name | — | Set only if your container uses a non-default dataLayer name. |
| Trigger GTM Events | on | Whether Axeptio pushes its events to the dataLayer. *Update Only* fires just `axeptio_update`. |

</details>

<details>
<summary><strong>Server-side and first-party proxy</strong></summary>

| Field | What it does |
| --- | --- |
| First-party proxy base URL | Routes the SDK's own requests through a host you control instead of Axeptio's. See [First-party proxy](#first-party-proxy). Accepts a GTM variable. |
| Server-side URL | Your server-side container URL, for forwarding consent. Pair with the [sGTM template](#related-templates). Accepts a GTM variable. With a proxy set, leave this empty so consent goes through the proxy — if set, this URL wins. |

</details>

<details>
<summary><strong>Google Consent Mode v2</strong></summary>

| Field | What it does |
| --- | --- |
| Activate Google Consent Mode v2 | Master switch, **on by default for new tags**. A new tag left with an empty Default Settings table therefore denies `analytics_storage`, `ad_storage`, `ad_user_data` and `ad_personalization` in every region and grants `security_storage`. Untick the box and nothing below applies. A tag you saved with the box unticked keeps it unticked — GTM stores the explicit value and never rewrites a saved tag when a template default changes. |
| Default Settings | Per-region defaults for all seven consent types: `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`, `functionality_storage`, `personalization_storage`, `security_storage`. `security_storage` defaults to **Granted** (denying it breaks sign-in and fraud prevention); `functionality_storage` and `personalization_storage` default to **Not set**, which sends no default for them and so leaves Google's own default of granted — a Brands site only ever updates the four advertising and analytics types, so a denied default there would never be lifted. Leaving the table empty denies those four in every region and grants `security_storage` — it does not mean "no default". |
| Wait for update (ms) | How long Google tags wait for the visitor's stored choice before using the defaults above. Defaults to `500`, which covers the replay from the consent cookie when the tag replays it inline. With [Let Axeptio pick the configuration](#letting-axeptio-pick-the-configuration) ticked the replay waits for the geolocation lookup first, so set `1500`–`2000` there. Raise it (2000 is common) in any case if tags fire before the banner on a first visit. |
| Redact Ads Data | Stops advertising cookies being set while `ad_storage` is denied. |
| Pass through URL parameters | Preserves ad click information across pages when cookies are denied. |

Consent Mode must also be enabled on the Axeptio project itself, in the
[Axeptio back-office](https://support.axeptio.eu/articles/274002): without it the SDK never
sends a consent update, and the denied defaults above stay in place for every Google tag.

Whenever the tag skips the replay of a returning visitor's stored consent, or falls back on a
setting it cannot use, it names the reason in GTM Preview — and only there, never in production.

</details>

<details>
<summary><strong>Additional Axeptio Settings</strong></summary>

A key/value table for any other SDK setting — see the
[advanced settings documentation](https://support.axeptio.eu/en/articles/274040).

</details>

### First-party proxy

Set **First-party proxy base URL** and the SDK stops calling Axeptio directly: the project
configuration, the consent POST, the SDK's lazy-loaded chunks, its fonts, its favicons and the
partner templates are all requested under that URL, on the `/client`, `/api/v1`, `/static`,
`/fonts`, `/favicons` and `/static-eu` paths. It must be an absolute `http(s)` URL with no query
string and no fragment — the SDK appends its own paths to it — and trailing slashes are trimmed
for you.

The **SDK script itself still loads from `static.axept.io`**. A gallery template's permissions are
fixed when the version is published, so this tag cannot inject a script from a host chosen per
container; only the requests the SDK makes after it boots can move.

The ready-made proxy is the
[axeptio-sgtm-public-template](https://github.com/axeptio/axeptio-sgtm-public-template)
server-side tag: mount it in your sGTM container and give it a **Proxy Base Path** matching the
path part of the base URL you enter here — `https://sgtm.example.com/axeptio` pairs with
`/axeptio`. Any reverse proxy exposing the six namespaces above works too.

**Server-side URL** wins for consent: set it and the SDK posts consent there rather than through
the proxy, so leave it empty unless the two are genuinely different hosts. The setting can also be
spelled as a `proxyBaseUrl` row in Additional Settings; the field wins over the row, and both the
override and a URL the tag cannot use are named in GTM Preview.

### Choosing Brands or Publishers

Axeptio ships two products, and **they are different SDKs**:

| Product | Loads | For |
| --- | --- | --- |
| **Brands** (standard CMP) | `static.axept.io/sdk.js` | Most sites |
| **Publishers** (TCF) | `static.axept.io/tcf/sdk.js` | Sites needing an IAB TCF banner |

The **Axeptio product** field must match the product your Project ID belongs to — unless you
let Axeptio pick the configuration, in which case the answer decides the flow and the field is
only the fallback. A Publishers Project ID with the product left on Brands loads the wrong SDK
and no TCF banner appears.

#### Letting Axeptio pick the configuration

Tick **Let Axeptio pick the configuration from the visitor's location** (under *Regions and
geolocation*) and the tag asks Axeptio which configuration this visitor should be shown,
instead of you pinning one in the fields above.

What happens on the page, in order:

1. The Consent Mode defaults go out first, as they always do — they have to precede every
   other tag, and they do not depend on which banner ends up loading.
2. The tag makes **one extra request**, to
   `https://headless-api.axeptio.tech/public/geolocation/<your project ID>.js`. Axeptio locates
   the visitor and answers with the flow — Brands or Publishers — and the configuration id its
   own targeting rules select for that project, looking at **both** flows and preferring the
   more specific match (a configuration naming the visitor's country beats one that only
   matches their regulation; on an exact tie, TCF wins).
3. The tag loads the SDK the answer named, with that configuration, and only then replays a
   returning visitor's stored consent — a stored choice is only replayed once the tag knows
   which product and configuration it belongs to.

**Raise Wait for update if you use Consent Mode.** Because step 3 now waits for step 2, the
replay of a returning visitor's stored choice sits behind a network round trip rather than
happening inline. The default `500` ms was sized for the inline replay; with this box ticked,
`1500`–`2000` is the value to set. The tag does not change it for you — the grace period is a
promise your tag makes to every other tag in the container.

**A failed lookup never costs you a banner.** If the request fails, if nothing matches the
visitor, if the answer is not one this template understands, or if the container is running a
template version published before the permission below existed, the tag falls back to the
**Axeptio product** and **Cookies Version** you configured — exactly what it would have loaded
with the box unticked. GTM Preview names what was resolved, or why it was not.

Two things worth knowing:

- **It applies to whichever project the tag ends up loading** — the Project ID above, or the
  one a *Projects by region* row chose. The table picks the project; this picks the
  configuration *within* it, and the flow it belongs to.
- **This is a new permission.** The tag now declares
  `https://headless-api.axeptio.tech/public/geolocation/*` alongside the two SDK URLs under
  `inject_script`, so GTM shows it when the template is added or updated. It is requested
  whether or not you tick the box; nothing is requested from that host unless you do.

One limit worth stating plainly: a request the service **accepts but never answers** has no
timeout. A GTM web template has no timer API at all, so the tag waits for the browser to
resolve the script one way or the other, and until it does no SDK loads and no banner appears.
That is the same exposure the SDK URL itself carries — `static.axept.io` hanging has always
had the same effect — and it is why the fallbacks above cover every answer the service *does*
give, including the ones it gives with an error status.

`Cookies Version` is still honoured — as the fallback. Leave it empty on a tag that relies on
the resolver, unless you want a specific configuration when the lookup cannot answer.

#### Serving Brands in some countries and TCF in others

The Axeptio SDK's own geolocated display selects between configurations *within* one product —
once a build has booted there is no path from Brands to Publishers. So the choice has to be
made in the container, before the SDK loads. There are two ways to make it, and they solve
different problems:

- **One project holding both a Brands and a TCF configuration**: tick
  [Let Axeptio pick the configuration](#letting-axeptio-pick-the-configuration) and Axeptio
  resolves across both flows for you. Nothing about the visitor's country needs to reach the
  container at all.
- **Two separate projects**: the **Projects by region** table below picks between them from a
  country variable you already have.

The two compose — a row picks the project, the resolver picks the configuration inside it.

The table makes the choice in the tag itself:

1. Set **Visitor country (GTM variable)** to a variable holding the visitor's country. GTM has no
   geolocation of its own, so it comes from your CDN or server-side container — a `CF-IPCountry`,
   `X-Geo-Country` or equivalent header, read by a Data Layer or JavaScript variable. ISO 3166-1
   alpha-2 (`FR`) or ISO 3166-2 (`US-CA`); case and surrounding spaces don't matter.
2. Fill **Projects by region**, one row per set of regions:

| Regions | Project ID | Axeptio product | Cookies Version |
| --- | --- | --- | --- |
| `FR, DE, IT` | `<your TCF project ID>` | Publishers (TCF) | `tcf-base` |
| `US` | `<your standard project ID>` | Brands (standard CMP) | `us-base` |

The first row whose **Regions** list the visitor's **exact** code wins; if none does, the first
row listing the **country part** of a subdivision wins — `US` for a visitor in `US-CA`. The
winning row replaces **both** the Project ID and the Axeptio product above, so the two can no
longer drift apart, and an exact `US-CA` row carves one state out of a `US` row wherever the two
sit in the table. A row listing a code an earlier row already covers can never apply; Preview
names it rather than leaving it looking configured.

**Set a Cookies Version per row when the projects share a domain.** Every Axeptio project on a
domain writes the same `axeptio_cookies` cookie, and the only thing inside it that tells the
projects apart is the configuration name. So when a row matches, the tag replays a returning
visitor's stored consent only if the cookie carries that row's **Cookies Version** — and if
neither the row nor the field above sets one, it skips the replay and says so rather than
applying one project's choices under another. Skipping costs only the head start: the SDK still
applies the visitor's real choices once it boots. Leave the column empty when every project uses
the same configuration name.

The **Consent cookie metadata prefix** (under *Cookie settings*) is shared by every row, so all
the projects listed here must use the same prefix.

GTM Preview names the row that matched (`visitor country FR matched per-region row 1; loading
project … (publishers)`), and equally says when no row matched the country, when the country
variable is empty or is not text, when a row's Regions or Project ID could not be used, when a
later row is shadowed by an earlier one, and when a stored consent could not be attributed to
this project.

The variable-only recipe still works and is unchanged: **Project ID** and **Axeptio product** both
accept GTM variables, so a pair of lookup tables driven from one country variable does the same
job. The table replaces two lookups that have to agree with one row that cannot disagree with
itself.

Two things to get right either way:

- **Give it a real default.** The top-level **Project ID** and **Axeptio product** are the
  default: they are what a visitor with no matching row — or no country at all — gets. A Project
  ID that isn't valid resolves to no configuration, and no banner loads at all; Preview says so
  when the resolved value is not a 24-character id, for a row and for the field alike.
- **Consent is stored per project.** A visitor whose detected country changes is asked again;
  their earlier choice under the other project is not carried over.

If **Cookies Version** is set, it applies to whichever project loads — leave it empty, or make
sure the version name exists in both.

## Troubleshooting

**Google tags report consent as denied (`gcs=G100`) although the visitor accepted.** A Consent
Mode `default` of `denied` is only lifted by a `consent update`, and the Axeptio SDK sends that
update from the `$$googleConsentMode` block stored in the visitor's `axeptio_cookies`. No block,
no update. That happens when Consent Mode is off on the Axeptio project, or when the stored
consent predates it (or was written by another configuration, metadata prefix or cookie-domain
scope). This tag's early replay reads the same block, so it cannot lift the state either — but
with **Google Consent Mode v2** ticked it logs the reason in Preview:

```text
Axeptio GTM tag: consent cookie has no Google Consent Mode block (Consent Mode is off in the Axeptio project, or the consent predates it); early consent skipped
```

Enable Consent Mode on the project, send the `consent update` from your own tags, or ask those
visitors to consent again. Worked example and checklist:
[issue #120](https://github.com/axeptio/axeptio-gtm-public-template/issues/120).

## Related templates

| Template | Purpose |
| --- | --- |
| [axeptio-gtm-public-variable](https://github.com/axeptio/axeptio-gtm-public-variable) | GTM **variable** exposing Axeptio consent state to your other tags |
| [axeptio-sgtm-public-template](https://github.com/axeptio/axeptio-sgtm-public-template) | **Server-side** GTM tag |

## Support

- **A bug in this template** — open an [issue](https://github.com/axeptio/axeptio-gtm-public-template/issues).
- **Your Axeptio account, configuration or billing** — [support@axeptio.eu](mailto:support@axeptio.eu).

## Versioning

Releases follow [Semantic Versioning](https://semver.org/); see
[CHANGELOG.md](./CHANGELOG.md) and the
[releases](https://github.com/axeptio/axeptio-gtm-public-template/releases).

The Community Template Gallery refreshes on Google's own schedule, so a new version usually
appears there **two to three days** after it is released here.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the commit message conventions, the gallery
contract this repository has to satisfy, and the licensing terms contributions are accepted
under.

## License

Licensed under the [Apache License 2.0](./LICENSE).

The [Community Template Gallery](https://developers.google.com/tag-platform/tag-manager/templates/gallery)
requires the `LICENSE` file to contain **only** Apache 2.0 — a template whose licence
does not match is removed from the gallery automatically. Do not replace it.
