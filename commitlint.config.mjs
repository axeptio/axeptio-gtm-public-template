// Conventional Commits rules, shared by the CI lint workflow.
// See https://www.conventionalcommits.org and https://commitlint.js.org
// Must be .mjs (ESM): wagoid/commitlint-github-action rejects a .js config.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allowed commit types. `feat` and `fix` drive the semantic-version bump
    // (release-please); the rest are non-release housekeeping types.
    'type-enum': [
      2,
      'always',
      [
        'feat', // a new feature (minor bump)
        'fix', // a bug fix (patch bump)
        'docs', // documentation only
        'chore', // tooling / maintenance, no production code change
        'refactor', // code change that neither fixes a bug nor adds a feature
        'perf', // performance improvement
        'test', // adding or fixing tests
        'ci', // CI / GitHub Actions changes
        'build', // build system or external dependencies
        'revert', // reverts a previous commit
      ],
    ],
    // Scopes are encouraged but optional. Keep this as a warning (level 1) so
    // contributors aren't blocked, while still nudging toward known areas.
    'scope-enum': [1, 'always', ['template', 'metadata', 'docs', 'ci', 'release']],
  },
};
