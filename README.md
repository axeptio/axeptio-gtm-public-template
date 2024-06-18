# Axeptio CMP Google Tag Manager Template

![Axeptio Logo](/assets/logo-axeptio.svg)
https://axept.io

This tag allows you to add the Axeptio SDK to your Google Tag Manager container.

You configure:
- Your Project ID
- Your CookieVersion

By using variables, you can dynamically set the CookieVersion based on a dataLayer variable, the Hostname, or other parameters.

## Axeptio Settings

You can customize the Axeptio settings:

- Cookie lifespan
- Cookie domain
- DataLayer name
- Transport URL (Server Side Tracking)

## Consent Mode V2

The Axeptio CMP template allows you to configure Google Consent Mode V2 with the default value.

You can choose the region or leave it blank to set it to ALL.

In the granted and denied fields, add the purposes:

- analytics_storage
- ad_storage
- ad_user_data
- ad_personalization

Example : analytics_storage, ad_storage, ad_user_data, ad_personalization

## Axeptio Setup

- Add the template from the gallery: [Axeptio GTM Public Template](https://tagmanager.google.com/gallery/#/owners/axeptio/templates/axeptio-gtm-public-template)
- In the Tags section, add the Axeptio tag
- Configure your projectId and CookieVersion
- Configure the AxeptioSettings
- Add the trigger: Consent Initialization
- Publish your project, the widget is installed.

## Support

If you encounter any issues during the installation of our Google Tag Manager tag, you can send an email to: help@axeptio.eu

- [English support](https://support.axeptio.eu/hc/en-gb)

- [French support](https://support.axeptio.eu/hc/fr)

