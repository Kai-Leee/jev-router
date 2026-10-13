# Changelog

This file records releases of the release branch, `main`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Experiments on the `research` branch are not
versioned; they use decision IDs such as D029.

## Releasing

1. Move the `Unreleased` entries under a new `## [X.Y.Z] - YYYY-MM-DD` heading. Start the entry with a `Goal:` line.
2. Run `npm version X.Y.Z --no-git-tag-version` and set the same version in `.codex-plugin/plugin.json`.
   `npm test` fails if the two versions differ or the changelog has no heading for the version.
3. Merge the change into `main` through a pull request.
4. Tag the merge commit on `main`: `git tag -a vX.Y.Z -m vX.Y.Z` and `git push origin vX.Y.Z`.

Each goal that reaches `main` is one release. Before 1.0.0, a goal that adds features or breaks
behavior bumps the minor version, and a fix-only goal bumps the patch version.

## [Unreleased]

## [0.3.0] - 2026-10-13

Goal: rename the product from Jev Router to Pointsman and give it a logo.

### Changed

- The product name is now Pointsman. The package name is `pointsman` and its description is
  "Jev 판단을 따르겠습니다." ("I'll follow Jev's judgment.").
- README, agent entry files, technical specification, benchmark guides, dashboard title and sign-in hint use the new name.
- Kept unchanged so existing records and links still work: the GitHub repository URL and clone directory
  `jev-router`, Docker labels `org.jev-router.*`, the adapter ID `jev-router-standalone-docker-v1`, and
  Jev-specific names (`jev-ai` MCP plugin, `bin/jev.mjs`, `jev-*` skills).

### Added

- Pixel-art logo in `docs/brand/` (SVG, and PNG at 512, 256 and 64 px) shown at the top of each README:
  a frog seen from behind, glancing back, pulling a rail switch lever with its tongue.

## [0.2.0] - 2026-10-13

Goal: a public release branch with its own docs, license, sign-in, versioning and CI.

### Added

- README in English, Korean and Chinese, and English `*.en.md` versions of the Korean usage documents.
- Apache-2.0 license. Live Jev use requires accepting the Jev AI Terms of Use and Privacy Policy.
- `npm run login` and a Claude Code SessionStart sign-in prompt.
- This changelog and a test that keeps the package, plugin and changelog versions in step.
- CI on pull requests to `main`: tests on macOS with Node 22 and in Docker with Node 24 and 26, plus a Markdown link check.
- `npm run mcp:fetch` installs the pinned jev-mcp binary after checking SHA-256; Linux x64 and arm64 are now pinned.
- `npm run check:links` checks relative links, heading anchors and links into the research branch.

### Changed

- Research and analysis documents moved from `main` to the `research` branch.
- The MCP configs no longer contain absolute paths. The Codex plugin uses the shared `.mcp.json`.

## [0.1.0] - 2026-10-09

State of `main` at commit 80eb79a, before versioning started:

- Server-side Jev AI client, offline evaluation CLI, isolated benchmark runners and local usage dashboard.
- Document-driven routing contracts and the D029 live single vs. split run.
- Input projection v3 (D031), checked by offline replay only.
