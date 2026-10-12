# Changelog

This file records releases of the release branch, `main`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Experiments on the `research` branch are not
versioned; they use decision IDs such as D029.

## Releasing

1. Move the `Unreleased` entries under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
2. Run `npm version X.Y.Z --no-git-tag-version` and set the same version in `.codex-plugin/plugin.json`.
   `npm test` fails if the two versions differ or the changelog has no heading for the version.
3. Merge the change into `main` through a pull request.
4. Tag the merge commit on `main`: `git tag -a vX.Y.Z -m vX.Y.Z` and `git push origin vX.Y.Z`.

Before 1.0.0, a minor bump marks new features or breaking changes, and a patch bump marks fixes.

## [Unreleased]

### Added

- README in English, Korean and Chinese, and English `*.en.md` versions of the Korean usage documents.
- Apache-2.0 license. Live Jev use requires accepting the Jev AI Terms of Use and Privacy Policy.
- `npm run login` and a Claude Code SessionStart sign-in prompt.
- This changelog and a test that keeps the package, plugin and changelog versions in step.

### Changed

- Research and analysis documents moved from `main` to the `research` branch.
- The MCP configs no longer contain absolute paths. The Codex plugin uses the shared `.mcp.json`.

## [0.1.0] - 2026-10-09

State of `main` at commit 80eb79a, before versioning started:

- Server-side Jev AI client, offline evaluation CLI, isolated benchmark runners and local usage dashboard.
- Document-driven routing contracts and the D029 live single vs. split run.
- Input projection v3 (D031), checked by offline replay only.
