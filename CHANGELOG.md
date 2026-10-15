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

## [0.3.5] - 2026-10-16

Goal: restore visibility of post-D067 experiments without implying a newer controlled efficiency result.

### Added

- Korean/English D068–D085 results timeline with source links, completed development and preserved-repair observations,
  repeated-run denominators, feature activation limits and local Codex status.

### Changed

- README and measurement-note links now expose later results beside the highlighted completed D067 cohort.
- Clarified that later successes exist, while changed checks, hosts and policies prevent a single pooled savings claim.

## [0.3.4] - 2026-10-15

Goal: make released/research/local capabilities explicit and publish reproducible measured token and time aggregates.

### Changed

- Added bilingual capability and skill/decomposition guidance distinguishing main, public research and local development.
- Expanded the three README measurement tables with reported token sums and the completed Jev-decomposition condition.
- Linked the historical technical draft to the dated capability audit.

### Added

- Public redacted aggregate evidence with cache-aware token accounting and source hashes.
- D067 completed workflow reductions: 28.74% time / 41.42% reported tokens for Jev decomposition;
  21.84% time / 46.50% reported tokens for Jev decomposition plus relations, each one observation.
- Separately scoped Codex/Jev decomposition-adapter observation; no new completed-development claim.

## [0.3.3] - 2026-10-15

Goal: describe Pointsman as Jev + DAG task routing and publish a scoped, completed benchmark result.

### Changed

- English, Korean and Chinese READMEs explain dependency-based task routing and distinguish the
  released client/tools from the advanced DAG research runner.
- Updated the package tagline and MCP plugin description while preserving plugin identity and configuration.
- Replaced the old status/limitations summary with measured highlights and direct research links.

### Added

- Korean and English measurement notes for D067: the selected successful Jev decomposition/dependency
  condition used 21.84% less development-stage time and 58.52% less historical API-rate-equivalent cost
  than the structured Claude baseline. Both passed 85 public and 63 independent checks. The notes
  specify one observation per condition, measurement boundaries, cost basis and reproduction commands.

## [0.3.2] - 2026-10-14

Goal: show the M8ven score badge at the top of the READMEs.

### Added

- The English, Korean and Chinese READMEs show the M8ven score badge below the mascot, linking to the
  M8ven listing for this repository.

## [0.3.1] - 2026-10-13

Goal: move the public repository to its new name, Kai-Leee/pointsman.

### Changed

- The GitHub repository is now https://github.com/Kai-Leee/pointsman. READMEs, usage guides, the technical
  specification and the link checker point at the new URL and clone directory `pointsman`. The old
  jev-router URL redirects.
- Identifiers that existing records depend on stay unchanged: Docker labels `org.jev-router.*` and the adapter
  ID `jev-router-standalone-docker-v1`.

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
