# Changelog

## [2.1.0](https://github.com/axeptio/axeptio-gtm-public-template/compare/v2.0.1...v2.1.0) (2026-08-05)


### Features

* **template:** select the Brands or Publishers SDK per Project ID ([10e1fcc](https://github.com/axeptio/axeptio-gtm-public-template/commit/10e1fcc4af6948a344308c139652a5bf91435fbd))
* **template:** select the Brands or Publishers SDK per Project ID ([2f207a8](https://github.com/axeptio/axeptio-gtm-public-template/commit/2f207a8676883f50be9d196d42cdf569fbbd3b98))


### Bug Fixes

* **ci:** make the gallery sync step re-runnable ([83ab9c7](https://github.com/axeptio/axeptio-gtm-public-template/commit/83ab9c7f271f12f5f18fa08e5c2957e6614f323a))
* **ci:** open a PR for the gallery sync instead of pushing to master ([b7c2df2](https://github.com/axeptio/axeptio-gtm-public-template/commit/b7c2df2d6540d0865d09372b9dd5366cc466a9ba))
* **ci:** open a PR for the gallery sync instead of pushing to master ([19b3bf4](https://github.com/axeptio/axeptio-gtm-public-template/commit/19b3bf40b99ca29e4f20f3f2edb4a25bb2d331f4))
* **template:** warn on an empty product value, not just a truthy one ([cbb1c84](https://github.com/axeptio/axeptio-gtm-public-template/commit/cbb1c847fe296365266306e547c6f3198ffd2ed1))


### Documentation

* **template:** record why both SDK URLs must be classic scripts ([a162cee](https://github.com/axeptio/axeptio-gtm-public-template/commit/a162cee129dd63a83f79346348efbc144b4d26c3))

## [2.0.1](https://github.com/axeptio/axeptio-gtm-public-template/compare/v2.0.0...v2.0.1) (2026-07-28)


### Bug Fixes

* **ci:** make the validator run on Python 3.7+ instead of 3.10+ ([1ca8699](https://github.com/axeptio/axeptio-gtm-public-template/commit/1ca8699ecfddabb62442b8964dbcc9cc7f070ab3))
* **template:** declare the categories required by the gallery ([be386c0](https://github.com/axeptio/axeptio-gtm-public-template/commit/be386c07a8dc875e537ca9aebca5570c5b6f32b9))
* **template:** declare the categories required by the gallery ([06d5a30](https://github.com/axeptio/axeptio-gtm-public-template/commit/06d5a30b0eb79730241bd99e2ce9c9aaab1195e6))

## [2.0.0](https://github.com/axeptio/axeptio-gtm-public-template/compare/v1.1.0...v2.0.0) (2026-07-28)


### ⚠ BREAKING CHANGES

* restore the Apache 2.0 licence required by the GTM Gallery

### Bug Fixes

* **metadata:** restore gallery latest-version marker ([7be2059](https://github.com/axeptio/axeptio-gtm-public-template/commit/7be205976984716d65cb089baa9a25ffe3b2ce15))
* **metadata:** restore gallery latest-version marker ([96b2d1d](https://github.com/axeptio/axeptio-gtm-public-template/commit/96b2d1d2ed8352b677b446d34b01e99c8178908c))
* restore the Apache 2.0 licence required by the GTM Gallery ([1f9f691](https://github.com/axeptio/axeptio-gtm-public-template/commit/1f9f691299daca4b997a4b39644b902a13c7bece))

## [1.1.0](https://github.com/axeptio/axeptio-gtm-public-template/compare/v1.0.0...v1.1.0) (2026-07-27)


### Features

* early consent update from the Axeptio cookie before the SDK loads ([dbb64f3](https://github.com/axeptio/axeptio-gtm-public-template/commit/dbb64f399143940e38263fa1e8918ef21a91d5a3))


### Bug Fixes

* only apply consent types granted write access ([799d5b5](https://github.com/axeptio/axeptio-gtm-public-template/commit/799d5b5b66a4b12682a944f259df3ea6ffb83ad1))
* require at least one row when Consent Mode v2 is enabled ([efbd71a](https://github.com/axeptio/axeptio-gtm-public-template/commit/efbd71af7830d9a55cd12666863dd40e636b88eb))
* remove wait_for_update from access_consent permissions ([e143799](https://github.com/axeptio/axeptio-gtm-public-template/commit/e143799cfb789b059d008263e2ab016e7a41b866))
* correct typos in template help text ([ee50c02](https://github.com/axeptio/axeptio-gtm-public-template/commit/ee50c025ef099e9f355e9658eb5e7299b8c196bd))

## [1.0.0](https://github.com/axeptio/axeptio-gtm-public-template/compare/v0.1.0...v1.0.0) (2026-07-27)


### ⚠ BREAKING CHANGES

* replace Apache 2.0 with Axeptio license notice (from v1.0.0)

### Features

* replace Apache 2.0 with Axeptio license notice (from v1.0.0) ([9971689](https://github.com/axeptio/axeptio-gtm-public-template/commit/9971689500f4046ba84bdaae0dbae04de0d153cc))


### Bug Fixes

* **ci:** correct the merge-policy claim and harden the metadata commit step ([546e0ad](https://github.com/axeptio/axeptio-gtm-public-template/commit/546e0ad9b1b58c4f2f662a2fa600a40a4e282780))
* configure release-please to update VERSION file on release ([32daedd](https://github.com/axeptio/axeptio-gtm-public-template/commit/32daeddca9e9148bb634131885e776e621eecc4b))
* pin auto-release.yml to a commit SHA, not [@master](https://github.com/master) ([d5f3a1a](https://github.com/axeptio/axeptio-gtm-public-template/commit/d5f3a1a09da2caa6d777d48f1991da650453a691))
* pin create-release-pr.yml to a commit SHA, not [@master](https://github.com/master) ([ee7621b](https://github.com/axeptio/axeptio-gtm-public-template/commit/ee7621b6a317e7b9b6ed91fb11b0882ac16952d3))
* point release-please at master, not the detected default branch ([9f50184](https://github.com/axeptio/axeptio-gtm-public-template/commit/9f501841fb39aa213ca4f4ce4122f00f91030707))
* point release-please at master, not the detected default branch ([2568adb](https://github.com/axeptio/axeptio-gtm-public-template/commit/2568adbbd04fb1e91739a366ec59789f1b09f83f))
* restore release-please, authenticated as axeptio-bot ([7a0e48f](https://github.com/axeptio/axeptio-gtm-public-template/commit/7a0e48fced3bca17185baa1dc49d9deae3f6ae31))
* restore release-please, authenticated as axeptio-bot ([bb96cf3](https://github.com/axeptio/axeptio-gtm-public-template/commit/bb96cf3ba95050cc654c2ec855424a64ebfaa9b7))
* revert the phantom 0.1.1 release created on develop ([b89a97e](https://github.com/axeptio/axeptio-gtm-public-template/commit/b89a97e3f1fe4f9539dbf90edb2aeeb6abce9901))
* revert the phantom 0.1.1 release created on develop ([de94407](https://github.com/axeptio/axeptio-gtm-public-template/commit/de94407d8ffe210e9478d6042e7e4aa9b7ee1edf))


### Documentation

* add CHANGELOG stub ([06546b8](https://github.com/axeptio/axeptio-gtm-public-template/commit/06546b8c5e43be6a1ff0ddb7cde21183e4797218))
* clarify auto-release.yml lives on master, not develop ([7f2c924](https://github.com/axeptio/axeptio-gtm-public-template/commit/7f2c924ae09b05a45fafe01ecddfc2fa1464ba51))
* clarify create-release-pr.yml lives on develop, not master ([750cb66](https://github.com/axeptio/axeptio-gtm-public-template/commit/750cb6690f93ba345fc0a186574dff384dfbdc88))
* note the automated gallery sync in CONTRIBUTING ([8411bad](https://github.com/axeptio/axeptio-gtm-public-template/commit/8411baddf120b5adcd7825620a97a4ca26b54229))
* replace README with pointer to help center (CMPP) ([cf4ed54](https://github.com/axeptio/axeptio-gtm-public-template/commit/cf4ed54828bb2dbe3df0b16208e39d4466e06a93))
* replace README with pointer to help center (CMPP) ([d6c377d](https://github.com/axeptio/axeptio-gtm-public-template/commit/d6c377dfae35123a687c87eea53e64166cd28f10))


### Miscellaneous

* release 1.0.0 ([1bb78ea](https://github.com/axeptio/axeptio-gtm-public-template/commit/1bb78ead1b13059b617bbfecfa4d5297697a3a53))

## Changelog

All notable changes to this project will be documented in this file.

See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.
