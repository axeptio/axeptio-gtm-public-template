# Axeptio CMP — Google Tag Manager Template

The official [Axeptio](https://www.axept.io/) consent management tag for Google Tag Manager
(web containers).

The tag loads the Axeptio CMP on your site, applies your cookie configuration, and — when
enabled — wires Axeptio's consent decisions into
[Google Consent Mode v2](https://support.axeptio.eu/articles/274002), so Google tags fire
according to the visitor's choices.

**[▶ Axeptio CMP in the Community Template Gallery](https://tagmanager.google.com/gallery/#/owners/axeptio/templates/axeptio-gtm-public-template)**

## Installing

In your GTM **web** container: **Templates → Tag Templates → Search Gallery**, look for
**Axeptio CMP**, and add it to your workspace. Then create a tag from the template and set at
least the **Project ID**.

Trigger it on **Initialization — All Pages** so the CMP loads before your other tags.

Step-by-step setup, screenshots and Consent Mode guidance live in the Help Center:

👉 **[Axeptio Help Center — Google Consent Mode v2](https://support.axeptio.eu/articles/274002)**

## Configuration

| Field | Default | What it does |
| --- | --- | --- |
| **Project ID** | — | Your Axeptio project identifier, from the project's settings menu. Accepts a GTM variable. |
| **Axeptio product** | `brands` | Which Axeptio product the Project ID belongs to. See [below](#choosing-brands-or-publishers). |
| **Cookies Version** | — | Loads a named cookie configuration. Left empty, the configuration's `pages` property decides. |

<details>
<summary><strong>Cookie settings</strong></summary>

| Field | Default | What it does |
| --- | --- | --- |
| User cookies duration (in days) | `180` | How long the visitor's choices are remembered. |
| User cookies domain | — | Set to a parent domain to share one consent across subdomains. |
| User cookies secure | on | Restricts the consent cookie to HTTPS. |
| dataLayer Name | — | Set only if your container uses a non-default dataLayer name. |
| Trigger GTM Events | on | Whether Axeptio pushes its events to the dataLayer. *Update Only* fires just `axeptio_update`. |

</details>

<details>
<summary><strong>Server-side</strong></summary>

| Field | What it does |
| --- | --- |
| Server-side URL | Your server-side container URL, for forwarding consent. Pair with the [sGTM template](#related-templates). |

</details>

<details>
<summary><strong>Google Consent Mode v2</strong></summary>

| Field | What it does |
| --- | --- |
| Activate Google Consent Mode v2 | Master switch. When on, at least one default-settings row is required. |
| Default Settings | Per-region defaults for `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization`. |
| Redact Ads Data | Stops advertising cookies being set while `ad_storage` is denied. |
| Pass through URL parameters | Preserves ad click information across pages when cookies are denied. |

</details>

<details>
<summary><strong>Additional Axeptio Settings</strong></summary>

A key/value table for any other SDK setting — see the
[advanced settings documentation](https://support.axeptio.eu/en/articles/274040).

</details>

### Choosing Brands or Publishers

Axeptio ships two products, and **they are different SDKs**:

| Product | Loads | For |
| --- | --- | --- |
| **Brands** (standard CMP) | `static.axept.io/sdk.js` | Most sites |
| **Publishers** (TCF) | `static.axept.io/tcf/sdk.js` | Sites needing an IAB TCF banner |

The **Axeptio product** field must match the product your Project ID belongs to. A Publishers
Project ID with the product left on Brands loads the wrong SDK and no TCF banner appears.

#### Serving Brands in some countries and TCF in others

Axeptio's geolocated display selects between configurations *within* one product — there is no
path from Brands to Publishers. Crossing that boundary needs two projects and a choice made in
the container, before the SDK loads.

Both **Project ID** and **Axeptio product** accept GTM variables, so drive them from one country
lookup:

| Country variable | Project ID | Axeptio product |
| --- | --- | --- |
| `^(FR\|DE\|IT)$` | `<your TCF project ID>` | `publishers` |
| *default* | `<your standard project ID>` | `brands` |

Two things to get right:

- **Give the lookup a real default.** A default that isn't a valid Project ID resolves to no
  configuration, and no banner loads at all.
- **Consent is stored per project.** A visitor whose detected country changes is asked again;
  their earlier choice under the other project is not carried over.

If **Cookies Version** is set, it applies to whichever project loads — leave it empty, or make
sure the version name exists in both.

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
