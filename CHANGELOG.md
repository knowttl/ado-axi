# Changelog

All notable changes to ado-axi are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.5.1](https://github.com/knowttl/ado-axi/compare/v0.5.0...v0.5.1) (2026-10-31)


### Features

* add wiki commands with guarded page updates ([#13](https://github.com/knowttl/ado-axi/issues/13)) ([5917be4](https://github.com/knowttl/ado-axi/commit/5917be441984048ce6bdf17e6aab93fd054cd507))

## [0.5.0](https://github.com/knowttl/ado-axi/compare/v0.4.8...v0.5.0) (2026-10-31)


### ⚠ BREAKING CHANGES

* add work-item deletion and link removal with opt-in writes ([#6](https://github.com/knowttl/ado-axi/issues/6))

### Features

* add Boards query and classification read commands ([#4](https://github.com/knowttl/ado-axi/issues/4)) ([6745d7f](https://github.com/knowttl/ado-axi/commit/6745d7fc5afe82104a0e25aa4413ae7c3b10c6b5))
* add bounded Azure DevOps audit reads with secret masking ([#5](https://github.com/knowttl/ado-axi/issues/5)) ([e7e52d0](https://github.com/knowttl/ado-axi/commit/e7e52d0582d6bc8d9db06ae2bb4d5bcad032d613))
* add pipeline administration commands ([#8](https://github.com/knowttl/ado-axi/issues/8)) ([30fc429](https://github.com/knowttl/ado-axi/commit/30fc429fd3b9061337f342d046d6203eb78a6915))
* add pipeline artifact downloads and Classic releases ([#9](https://github.com/knowttl/ado-axi/issues/9)) ([477d335](https://github.com/knowttl/ado-axi/commit/477d3353770965a6f4f2f3c6b5ac218690978261))
* add repository and policy administration commands ([#10](https://github.com/knowttl/ado-axi/issues/10)) ([420d4d8](https://github.com/knowttl/ado-axi/commit/420d4d8a4f4402a51a4d92d3faaba0c8ef2d9bc7))
* add work-item attachment uploads and downloads ([#7](https://github.com/knowttl/ado-axi/issues/7)) ([1cd466d](https://github.com/knowttl/ado-axi/commit/1cd466d235d4c1b230c77432cb149f8fd2b75de0))
* add work-item deletion and link removal with opt-in writes ([#6](https://github.com/knowttl/ado-axi/issues/6)) ([72042f2](https://github.com/knowttl/ado-axi/commit/72042f26246cfe109cbbbdbae1266bb37b0090f3))
* ado-axi 0.2.0 - AXI CLI for Azure DevOps ([8be3ddd](https://github.com/knowttl/ado-axi/commit/8be3ddd56dd1f4796eb7095a21a06b6eb33bd0ea))
* deepen PR ref and pipeline workflows ([21203b0](https://github.com/knowttl/ado-axi/commit/21203b0b1d47ae41cb45e3fdac2cd25d3bc1e558))
* **pipeline:** add timeline and failed-only log triage ([03213b6](https://github.com/knowttl/ado-axi/commit/03213b645d26474ba0f7032a809a6cdb0aef16b5))
* **pr:** manage review comment threads ([3d4399b](https://github.com/knowttl/ado-axi/commit/3d4399be932729a616c3df5c13363c2211cca400))
* **repo:** read a single file at a branch or commit ([1f91112](https://github.com/knowttl/ado-axi/commit/1f911127f8c389bda49f527fdf68d1315dc8c78a))
* store work item comments as Markdown ([dacdcf9](https://github.com/knowttl/ado-axi/commit/dacdcf98b6b64b29bd14f3282c5bbf84edb2949f))
* support abandoning draft pull requests ([5e1a562](https://github.com/knowttl/ado-axi/commit/5e1a56219664552753e506ce8d73482c907aa44c))
* support Markdown work item descriptions ([d35e7a1](https://github.com/knowttl/ado-axi/commit/d35e7a1b244f3de69748868e120b88beba34a1d2))
* support safe Azure DevOps URLs ([b41c63b](https://github.com/knowttl/ado-axi/commit/b41c63b1e9a99d6d6e0cdd0b21ffd65535c856cf))
* **test:** add test results for pipeline runs ([75aa3ce](https://github.com/knowttl/ado-axi/commit/75aa3cecd3c645c0390dd2ccb0e4719768e1f767))
* **work-item:** compare-and-swap updates, tag mutation, json-patch escape hatch ([f71b8dc](https://github.com/knowttl/ado-axi/commit/f71b8dc8179bb23371f8e811337ad76a1cd69bd5))
* **work-item:** list and add work item links ([d5f6047](https://github.com/knowttl/ado-axi/commit/d5f6047b23370d355096e9d599148579fee9c15d))


### Bug Fixes

* correct test summaries and enforce pipeline watch deadlines ([9a360d7](https://github.com/knowttl/ado-axi/commit/9a360d75b86a521c5dd27ff7332a4f1ffb253d2a))
* correct work-item counts, field selection, and full details ([#3](https://github.com/knowttl/ado-axi/issues/3)) ([5e703b0](https://github.com/knowttl/ado-axi/commit/5e703b0297c478cbce86681bac422e094e60a1e1))
* **help:** list pr thread in the pr subcommand line ([c0fe7ae](https://github.com/knowttl/ado-axi/commit/c0fe7ae8d55fabbd512a036e340bb8d0d1d242d7))
* **pipeline:** read build logs as text/plain and ignore empty log ids ([7842cbc](https://github.com/knowttl/ado-axi/commit/7842cbc0d72a377644ee1cd59a91a4bebd280f28))
* **pr:** honor --full for thread comments, add pr comments alias and --id flag ([6e830af](https://github.com/knowttl/ado-axi/commit/6e830afad3c63e5279306543c4d17b7e8759c95b))
* **pr:** return the browsable pull request URL ([a479dea](https://github.com/knowttl/ado-axi/commit/a479dea29f65622a442dbb478ab8e23dba23e68e))
* **pr:** use PR project in URL fallback ([d9171aa](https://github.com/knowttl/ado-axi/commit/d9171aa8558baa891fa921c0f39d974ecb5d8c17))
* reject missing flag values and guard calculated tag updates ([e6c6000](https://github.com/knowttl/ado-axi/commit/e6c60002b540d8d20086d91cbf50518573568f57))
* reject missing flag values and guard computed tag updates ([eadef70](https://github.com/knowttl/ado-axi/commit/eadef7077a0eca290f7685cbb6e9e0d99ea2cfe8))
* reject non-JSON successful responses ([f94eb20](https://github.com/knowttl/ado-axi/commit/f94eb20e9526dbf63ad4bfb47f682a66973b29a9))
* resolve az CLI via cross-spawn to fix Windows ENOENT false-negative ([9899a42](https://github.com/knowttl/ado-axi/commit/9899a42b81c7d009753830d088c4ebb6c66ca618))
* restore repository paths converted by Git Bash ([0ee34e9](https://github.com/knowttl/ado-axi/commit/0ee34e997af8185ed9f65973f013d256d96a2aa0))
* scope pull request lookups to the selected project ([5d21291](https://github.com/knowttl/ado-axi/commit/5d212918391c67a9e9288f17400a4a1352a66be4))
* support piped request bodies ([a9cda8e](https://github.com/knowttl/ado-axi/commit/a9cda8e5fba9e5593acd99bb78981128094358d8))
* treat empty piped stdin as absent ([e0c33a4](https://github.com/knowttl/ado-axi/commit/e0c33a4107ae2f5226482c802b5e44830f940050))


### Performance Improvements

* lazy-load command handlers for version fast path ([5b99762](https://github.com/knowttl/ado-axi/commit/5b997626c17a7798f8aea4ff31613e97886a3cc1))

## [Unreleased]

## [0.4.8] - 2026-10-30

### Fixed

- Reject non-JSON successful responses with `RESPONSE_INVALID`, reporting HTTP status and content
  type without exposing the body. Explicitly requested text responses and empty successful responses remain supported.

## [0.4.7] - 2026-10-20

### Fixed

- Include the selected project in PR lookups without `--repo`, preventing results from other projects.

## [0.4.6] - 2026-10-16

### Documentation

- Clarify in the agent skill that ADO text uses `#id` for work items, `!id` for Azure DevOps PRs, and full URLs for GitHub PRs.

### Fixed

- Aggregate every page of published test runs with run details; report counts for the selected
  outcome and keep `--full` within the displayed result limit
- Enforce the `pipeline watch` deadline during authentication, HTTP requests, and response-body
  reads; cancel pending requests and Azure CLI authentication without retrying writes
- Rename the dashboard's project-wide PR section to `active-pull-requests` instead of implying
  that it contains only the current user's pull requests
- Reject bare value-taking flags with a usage error instead of silently dropping guards such as
  `--if-rev`/`--old-object-id` or falling back to default context selectors; preserve boolean flags
  and explicit empty strings, and reject empty numeric values
- Automatically guard calculated `work-item update --add-tags`/`--remove-tags` patches with the
  revision read before merging; refuse concurrent changes without retrying or losing another
  writer's tags, preserve no-ops, and exclude the guard from the reported change count

## [0.4.5] - 2026-10-06

### Changed

- Normalize organization-root URLs in `--org`, environment variables, profiles, and `config init`;
  reject project/API paths in organization values with actionable local errors
- `api` accepts full HTTPS Azure DevOps REST URLs on the four supported hosts, preserving URL
  context and query parameters instead of inheriting default project context; conflicting flags,
  mismatched profiles, unsafe URLs, and path traversal fail before authentication
- Clarify session org/project selection in the agent skill without automatically choosing a project

## [0.4.4] - 2026-09-30

### Changed

- `pr comment --file` and `repo file` restore repository paths that Git for Windows converted to
  Windows paths; ambiguous `/bin` or `/usr/bin` paths and other Windows paths are still rejected
  with a `MSYS_NO_PATHCONV=1` hint

### Documentation & Infrastructure

- Add a reproducible benchmark harness: `pnpm run bench:capture` records and scrubs Azure DevOps
  traffic locally, `pnpm run bench` replays it offline and regenerates `BENCHMARK.md`
- Ship the harness, not the data: captured payloads, `benchmark/targets.json` and
  `benchmark/results.json` stay git-ignored so every operator measures their own organization
- Scrub fixtures default-deny: only provably safe strings survive, entity ids are shifted by a
  random offset, and capture refuses to write a fixture that still contains recorded data
- Add `pnpm run bench:surface` to measure MCP tool schemas against the skill and `--help` surface
- Replace the unsourced payload claim in `README.md` with measured numbers: -94.5% weighted
  against raw REST JSON, and 86 always-loaded skill tokens against 16,356 MCP schema tokens

## [0.4.3] - 2026-09-14

### Changed

- Work-item and pull-request descriptions plus all three comment commands now accept piped stdin when their content flag is omitted, enabling shell-safe Markdown and multiline content

### Documentation & Infrastructure

- Run the workflows on `actions/checkout@v6`, `actions/setup-node@v6` and
  `pnpm/action-setup@v6`; the older actions targeted Node 20, which GitHub runs on
  Node 24 with a deprecation warning.

## [0.4.2] - 2026-09-10

### Changed

- `work-item comment` stores comments as Markdown by default and accepts `--format html` for raw HTML; it uses the `7.1-preview.4` comments API required for format selection

## [0.4.1] - 2026-09-07

### Changed

- Publish the CLI as `@jeffreyhaen/ado-axi` with a GitHub Actions npm release workflow

### Fixed

- `pr --help` now lists `thread` in its subcommand line
- `pr get` and `pr create` now return the browsable pull request URL.
  Azure DevOps populates neither `_links.web.href` nor a web-facing `url` on pull request responses, so `url` was reporting the GUID-based `_apis` REST endpoint, which serves JSON rather than opening the pull request.
  The link is now derived from the repository's `webUrl`, falling back to the canonical `org/project/_git/repo/pullrequest/<id>` form.

## [0.4.0] - 2026-08-30

### Added

- `pr abandon <id>` safely abandons an active pull request, refuses completed ones, and reports an already abandoned request as a no-op
- `pr list --status draft` filters to draft pull requests, paging past non-draft results until the requested `--limit` is reached
- `pipeline timeline <run-id>` returns the stage/job outline plus every failing leaf step with its parent path, first error issue, and log id in one call
- `pipeline logs <run-id> --failed-only` reads the first failing step's log directly and names any further failed steps
- `work-item link list|add <id>` reads and creates relations — parent/child/related work items plus pull request, commit, and branch artifact links — with `--comment`, `--if-rev` compare-and-swap, and no-op detection on duplicates
- `work-item get <id> --relations` now renders the resolved link list it already fetched
- `repo file <path> --repo <name>` reads a single file's content at the default branch, a `--ref` branch tip, or an exact `--commit`, with line/character truncation, a `--full` escape hatch, and explicit folder/binary refusals
- `pr thread list|reply|resolve|reopen <id>` closes the review loop: bounded thread listings with an unresolved tally, replies (piped stdin supported), `--resolve` in the same call, and no-op detection on unchanged status
- `test results <run-id>` aggregates published test runs into one passed/failed/not-run tally and lists failing tests with their error messages (`--outcome`, `--run`, `--limit`, `--full`)

### Fixed

- `pipeline logs` now requests `text/plain`; Azure DevOps was answering the `application/json` Accept header with a single-line JSON envelope, which made `--tail` return one unreadable 700k-character line instead of the last N log lines
- Timeline steps without a log (manual validation, skipped steps) report `log.id: 0`; these are no longer offered as `--log 0` and no longer make `--failed-only` open the wrong log
- `pipeline logs` no longer prints every log id of a run in `help` (59 ids on a real run) and points at `pipeline timeline` instead

### Documentation

- README behavior sections condensed into one bullet list; per-command detail stays in `--help` and SKILL.md

## [0.3.2] - 2026-08-25

### Added

- `work-item create` and `work-item update` accept `--description-format markdown|html`, letting agents explicitly select Azure DevOps multiline-field rendering while retaining the prior behavior when omitted

### Documentation

- Documented description-format selection and Azure DevOps' irreversible Markdown-to-HTML conversion constraint for agents

## [0.3.1] - 2026-08-21

### Changed

- Command handlers are lazy-loaded so `--version` and help paths start faster

### Documentation

- Documented Agent Skills installation and safe mutation/concurrency guidance

## [0.3.0] - 2026-08-20

### Added

- `pr update <id>` for title, description (including piped multiline stdin), draft, and auto-complete changes with read-before-write no-op detection
- `pr complete <id>` with current-source-commit concurrency, squash/source-branch options, policy-safe completion, and completed/queued/conflict/policy-blocked/failed outcomes
- `pr checks <id>` aggregates policy evaluations and PR statuses into bounded passed/failed/pending summaries; `--full` expands actionable details
- `pr diff <id>` returns bounded iteration change/path metadata with `--limit`, `--full`, and explicit truncation hints
- `pr reviewer list|add|remove <id>` manages reviewers while preserving existing `pr approve`; duplicate adds and absent removes are no-ops
- `ref list|create|delete` adds bounded Git ref workflows with strict branch normalization, source resolution, old-object-ID concurrency, and repeat-safe no-ops
- `pipeline watch <run-id>` polls with configurable interval/timeout, rate-limit backoff, compact terminal outcomes, and non-zero failure/cancellation/timeout semantics
- `ado-axi pr comments <id>` (alias `pr threads`) — shorthand for `pr get <id> --threads`
- `pr get` accepts `--id <n>` in addition to the positional id
- `work-item update --if-rev <n>` — compare-and-swap via a JSON-Patch `test /rev` op; fails with `PRECONDITION_FAILED` instead of silently overwriting a concurrently changed item
- `work-item update --add-tags a,b` / `--remove-tags c` — in-place tag mutation that preserves unrelated tags (case-insensitive, deduplicated)
- `work-item get` now reports `rev`, `reason`, and `changed-by`
- `api --content-type json|json-patch|merge-patch|text|<media type>` — makes the raw REST bridge usable for work item writes, which require `application/json-patch+json`

### Fixed

- PR checks use the required Azure DevOps `7.1-preview.1` API version for policy evaluations and PR statuses
- PR completion now reports asynchronous `mergeStatus: queued` responses as queued instead of failed
- CI now covers Windows on Node 20 in addition to the supported Linux Node 20/22 matrix
- `work-item update --tags` (and the new `--remove-tags`) now emit a JSON-Patch `replace` op for `System.Tags` when tags already exist — Azure DevOps *merges* tags on `add`, so removing a tag silently did nothing
- HTTP 412 now maps to `PRECONDITION_FAILED` (e.g. `VS403351: Test Operation for path /rev failed`) instead of a generic `API_ERROR`
- `pr get --threads --full` now prints complete comment text; `--full` previously only applied to the description
- `TF200016` (project not found) errors now point at a missing `--org` and `ado-axi config list` instead of `project list`
- `az` (auth) is now spawned via `cross-spawn` instead of a raw `child_process.execFile`. On Windows, `az` is a `.cmd` shim, which Node's shell-less spawn cannot execute (fails with ENOENT); this previously surfaced as spurious "not signed in" / auth failures even when `az` was installed and logged in. Also adds a clearer error message when `az` is genuinely missing from PATH.

## [0.2.0] - 2026-07-28

Initial public release.

### Added

- `ado-axi` (no args) — dashboard: active profile, your open work items, active pull requests, recent pipeline runs
- `ado-axi work-item list|get|create|update|comment` — WIQL-backed listing with `--state`, `--type`, `--assigned-to @me`, `--iteration @current`, `--area`, `--tag`, `--search`, and a raw `--query` escape hatch
- `ado-axi pr list|get|create|approve|comment` — pull requests with a pre-computed review tally, reviewer votes, merge status, and file/line review comments
- `ado-axi pipeline list|runs|run|logs` — pipeline definitions, runs with a failure count, queueing a run with `--variables`/`--parameters`, and log tails
- `ado-axi repo list|branches` — repositories and branches
- `ado-axi project list` — the 30 most recently updated projects, with `--name <filter>` and `--limit`
- `ado-axi api [METHOD] <path>` — raw Azure DevOps REST bridge for wikis, test plans, code search, artifacts, and anything else without a dedicated command; `--host dev|vsrm|vssps|almsearch`, `--no-project`, `--raw`
- `ado-axi doctor` — authentication check for every configured profile, reporting the identity each resolves to
- `ado-axi config list|init|path` — profile management in `~/.ado-axi/config.json`
- `ado-axi update` — self-update via the `axi-sdk-js` built-in
- Profiles: each carries its own `org`, `project`, `auth` (`az` or `pat`), optional `tenant`, and `patEnv`, so several organizations with different authentication work side by side
- Auth: Azure CLI token (`az account get-access-token`, tenant-aware) or a personal access token read from an environment variable — tokens are never written to disk
- Resolution order: `--profile` → `--org`/`--project` → `$ADO_AXI_ORG`/`$ADO_AXI_PROJECT` → `defaultProfile` in the config file. An `--org` matching a configured profile inherits that profile's authentication
- Selector flags (`--profile`, `--org`, `--project`, `--config`) are accepted before the command as well as after it
- Direct Azure DevOps REST API transport — no `az devops` round trips, `az` is used only to mint a token
- Structured errors on stdout with actionable `help` steps, unknown flags rejected by name, exit code 2 for usage errors
- Truncation of HTML-backed descriptions, comments, and logs with size hints and a `--full` escape hatch; `--fields a,b` narrows list columns
- Idempotent mutations: setting a work item field or a pull request vote to its current value reports a no-op and exits 0
- `SKILL.md` in the repo root for on-demand agent discovery

[Unreleased]: https://github.com/jeffreyhaen/ado-axi/compare/v0.4.7...HEAD
[0.4.7]: https://github.com/jeffreyhaen/ado-axi/compare/v0.4.6...v0.4.7
[0.4.4]: https://github.com/jeffreyhaen/ado-axi/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/jeffreyhaen/ado-axi/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/jeffreyhaen/ado-axi/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/jeffreyhaen/ado-axi/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/jeffreyhaen/ado-axi/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/jeffreyhaen/ado-axi/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/jeffreyhaen/ado-axi/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jeffreyhaen/ado-axi/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/jeffreyhaen/ado-axi/releases/tag/v0.2.0
