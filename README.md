# ado-axi (Azure DevOps axi)

This is a fork of [jeffreyhaen/ado-axi](https://github.com/jeffreyhaen/ado-axi), maintained at [knowttl/ado-axi](https://github.com/knowttl/ado-axi).

[![npm](https://img.shields.io/npm/v/%40knowttl%2Fado-axi.svg)](https://www.npmjs.com/package/@knowttl/ado-axi)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)

<p align="center">
  <img src="assets/ado-axi-header.png" alt="ado-axi for Azure DevOps">
</p>

Agent-ergonomic CLI for **Azure DevOps** - work items, pull requests, repositories, Git refs, pipelines,
and a raw REST escape hatch, in token-efficient [TOON](https://toonformat.dev/) output.

`ado-axi` is an Azure DevOps [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface): a CLI
designed for autonomous agents rather than humans. It talks to the Azure DevOps REST API
directly (no `az` round trips except for token acquisition), supports multiple organizations
with different authentication through profiles, and answers with minimal schemas plus
contextual next-step hints.

## Why AXI: CLI vs MCP vs AXI

Across extensive [AXI benchmark studies](https://axi.md/) (over 900 runs), agent-first CLIs achieve **100% task success** at **~50% fewer turns** and **50–66% lower cost** than MCP.

This repository ships the harness behind its own measurements: 19 Azure DevOps scenarios, recorded
against a private organization and replayed offline with the `o200k_base` tokenizer. The recordings
stay local — see [`BENCHMARK.md`](BENCHMARK.md) for the method and for how to reproduce these
numbers against your own organization.

| Interface | Context (Turn 0) | Output | Measured payload | Write Safety | Guidance |
|---|---|---|---|---|---|
| **`ado-axi`** | Skill frontmatter always; body loaded on demand (see [recorded surface measurements](BENCHMARK.md#tool-surface-benchmark)) | **TOON** | **-94.5%** vs raw REST JSON (-90.0% mean per scenario) | ✅ **Opt-in writes; idempotent + CAS guards; no policy bypass** | Structured hints (`help[]`) |
| **Raw CLI** (`az devops`) | ~0 tokens | JSON / ASCII | Baseline (full REST payloads, slow startup) | ❌ Direct mutations | Human text / exit codes |
| **Azure DevOps MCP** | **16,356 tokens** (40 tool schemas, v2.10.0) | JSON-RPC | Highest overhead (full schemas resent every turn) | Varies | Schema validation errors |

## Install

Install globally (recommended for repeated use):

```sh
npm install -g @knowttl/ado-axi
ado-axi --help
```

For a one-off invocation without installing:

```sh
npx -y @knowttl/ado-axi --help
```

## Agent integration

Install the skill globally so an agent loads the usage guide on demand:

```sh
npx skills add knowttl/ado-axi --skill ado-axi -g
```

Omit `-g` to install the skill for the current project only.

## Configure

Profiles live in `~/.ado-axi/config.json` (override with `./ado-axi.config.json` or
`$ADO_AXI_CONFIG`):

Configuration writes require [write enablement](#behavior).

```sh
ADO_AXI_WRITES=1 ado-axi config init --org acme --project Platform --name acme --auth az
ADO_AXI_WRITES=1 ado-axi config init --org contoso --project Web --name contoso --auth pat --pat-env ADO_CONTOSO_PAT
ado-axi doctor
```

```json
{
  "defaultProfile": "acme",
  "profiles": {
    "acme": { "org": "acme", "project": "Platform", "auth": "az" },
    "contoso": { "org": "contoso", "project": "Web", "auth": "pat", "patEnv": "ADO_CONTOSO_PAT" }
  }
}
```

- `org` — the Azure DevOps organization name or organization-root URL (`acme` or `https://dev.azure.com/acme`).
- `project` — the default project inside that organization. Saves passing `--project` on commands requiring project context.
- `auth: "az"` — uses the Azure CLI (`az account get-access-token`). Add `"tenant": "<id>"`
  when the organization lives in another Entra tenant.
- `auth: "pat"` — reads a personal access token from the env var named in `patEnv`.
- Any command accepts `--profile <name>`, `--org <org>`, `--project <project>` — before or
  after the command — and `$ADO_AXI_ORG` / `$ADO_AXI_PROJECT` work too. An org that matches a
  configured profile inherits that profile's authentication. Organization-root URLs such as
  `https://dev.azure.com/acme` or `https://acme.visualstudio.com` are normalized to the org name,
  including in environment variables and profiles; project/API paths in `--org` are rejected.
- Project context is never guessed. Pass `--project`, set `$ADO_AXI_PROJECT`, or use a
  project-specific profile. Use `ado-axi project list --org <org>` to discover projects.

## Use

For the mutating examples below, first enable writes as described in [Behavior](#behavior).

```sh
ado-axi                                   # dashboard: your work items, active project PRs, recent runs
ado-axi work-item list --assigned-to @me  # open work items
ado-axi work-item get 4211 --comments
ado-axi work-item list --fields id,created,System.AssignedTo,Custom.EventSeverity
ado-axi work-item get 4211 --full
ado-axi work-item comment 4211 --body "**Status:** ready"
ado-axi work-item update 4211 --state "In Progress"
ado-axi work-item update 4211 --add-tags agent-claimed --if-rev 7   # compare-and-swap claim
ado-axi work-item link add 4211 --pr 812                            # attach the pull request
ado-axi work-item link list 4211
ado-axi work-item link types
ADO_AXI_WRITES=1 ado-axi work-item attach 4211 --file ./evidence.png --comment "Test evidence" --if-rev 7
ado-axi work-item attachment get 4211 --name evidence.png --out ./download.png
ado-axi query run "Shared Queries/Open bugs" --limit 10
ado-axi area list --depth 2
ado-axi iteration list --depth 2
ado-axi pr list --reviewer @me
ado-axi pr comments 812 --full
ado-axi pr thread list 812
ado-axi pr thread reply 812 --thread 5 --body "Fixed in 3f2a1c9" --resolve
ado-axi pr update 812 --draft false --auto-complete true
ado-axi pr checks 812
ado-axi pr diff 812 --limit 50
ado-axi pr reviewer add 812 --reviewer jane@example.com
ado-axi pr complete 812 --squash --delete-source-branch
ado-axi pr abandon 812
ado-axi pr approve 812
ado-axi repo file /src/Program.cs --repo Web --ref main
ado-axi ref list --repo Web --limit 50
ado-axi repo create --name SyntheticRepo
ado-axi repo update --repo SyntheticRepo --default-branch main
ado-axi repo policy update 7 --policy-json '{"isEnabled":false}' --if-rev 3
ado-axi ref create --repo Web --name feature/agent --source main
ado-axi ref delete --repo Web --name feature/agent --old-object-id <40-hex>
ado-axi pipeline runs --result failed
ado-axi pipeline update 42 --definition '{"name":"CI"}' --if-rev 7
ado-axi pipeline build tag add 98231 --tag verified
ado-axi pipeline folder list --limit 20
ado-axi pipeline runs artifact list 98231 --limit 20
ado-axi pipeline runs artifact download 98231 --name drop --out ./drop.zip
ado-axi pipeline release list --limit 20
ado-axi pipeline timeline 98231
ado-axi pipeline logs 98231 --failed-only --tail 200
ado-axi pipeline logs 98231 --tail 200
ado-axi pipeline watch 98231 --interval 10 --timeout 1800
ado-axi test results 98231                # failing tests of a run, with error messages
ado-axi api _apis/wiki/wikis               # anything not covered by a command
cat payload.bin | ado-axi api POST _apis/wit/attachments --query 'fileName=payload.bin' --content-type application/octet-stream
```

Use `work-item attach` to upload and link a local file, and `work-item attachment get` to download it by name.
See [attachment usage and recovery](doc/work-item-writes.md#attachments-td-062) for file requirements, size limits, revision guards, output fields, and overwrite behavior.

`work-item list --limit` bounds the WIQL request and displayed items; the count reports only the number shown because WIQL results may not be exhaustive.

See [Boards read commands](doc/boards-reads.md) for relation type discovery, saved queries, area and iteration paths, and their limit and count semantics.

`work-item list --fields` accepts `id,type,title,state,assignee,created,changed` and any field reference name, including `System.*`, `Microsoft.VSTS.*`, and `Custom.*`.
Unknown aliases and API-rejected reference names produce errors.
`work-item get --full` includes the complete description plus every non-System field, keyed by reference name under `fields`; extra text fields are limited to 1200 characters with a truncation marker.

## Behavior

- **Idempotent mutations.** `work-item update`, `pr update`, reviewer changes, `pr thread resolve`,
  `pr complete`, `pr abandon`, `work-item link add`, and `ref create|delete` report an already
  applied request as a no-op and exit 0.
- **Compare-and-swap.** `--if-rev <n>` on `work-item update|link add` fails instead of overwriting a
  concurrently changed item. Calculated `--add-tags`/`--remove-tags` changes automatically test the
  revision read before merging, even without `--if-rev`; conflicts fail without retrying.
  `ref delete` sends the branch's current object ID as its guard.
- **Work-item deletion and link removal (TD-068, TD-063).** See [work-item writes](https://github.com/knowttl/ado-axi/blob/main/doc/work-item-writes.md) for commands, revision guards, permanent destruction confirmation, and the DELETE race window.
- **Pipeline administration (TD-065).** Definition create/update/delete, build and run tags, cancellation, and folder administration are available.
  See [pipeline administration](https://github.com/knowttl/ado-axi/blob/main/doc/pipeline-admin.md) for JSON definitions, revision guards, delete confirmations, and bounded folder reads.
- **Artifacts and releases (TD-065 slice 2 of 4).** List run artifacts, download a named ZIP to explicit `--out`, and list/show/create Classic releases.
  Downloads cap at 100 MiB, report byte counts, and never overwrite without `--force`.
  Artifact reads/downloads and release list/show work with writes disabled; release create requires `ADO_AXI_WRITES=1`.
  See [artifacts and releases](https://github.com/knowttl/ado-axi/blob/main/doc/artifacts-releases.md) for commands, deployment behavior, and the artifact upload limitation.
- **Repository and policy administration (TD-065 slice 3 of 4).** Repository create/update/delete/import and policy create/update/delete use the same default-off write boundary.
  See [repository administration](https://github.com/knowttl/ado-axi/blob/main/doc/repository-admin.md) for JSON policy settings, revision behavior, import authentication, and concurrency limits.
- **BREAKING CHANGE: writes default off.** Set `ADO_AXI_WRITES=1` to enable work-item, PR, pipeline, repository, and policy mutations, `ref create|delete`, and `config init|add`.
  Without that exact value, the CLI refuses these commands before any request or local write with code `WRITES_DISABLED` and an enablement hint.
  Raw `api` requests also require enablement for methods other than GET, HEAD, and OPTIONS, including implicit POST from a body or piped stdin.
  Native read commands, including WIQL queries, and help remain available without enablement.
- **Missing flag values fail.** Value-taking flags such as `--if-rev`, `--old-object-id`, and context
  selectors require a value; a bare flag is a usage error (exit 2), not an omitted guard or selector.
- **Policy is never bypassed.** `pr complete` sends the current source commit and separates
  completed, queued, conflict, policy-blocked, and failed outcomes — run `pr checks` first.
- **Failure triage in one call.** `pipeline timeline` names the failing stage/job/step with its
  error issue and log id, `pipeline logs --failed-only` opens that log, and `test results`
  summarizes test totals and failing tests with their error messages.
- **Bounded output.** Lists take `--limit`/`--fields`, detail views truncate with a `--full` escape
  hatch, and `repo file` refuses folders and binaries.
- **ADO REST URLs.** `api` accepts relative paths or full HTTPS REST URLs on `dev.azure.com`, `vsrm.dev.azure.com`, `vssps.dev.azure.com`, `almsearch.dev.azure.com`, and `vsaex.dev.azure.com`.
  For relative paths, `--host` accepts `dev` (default), `vsrm`, `vssps`, `almsearch`, or `vsaex`.
  Full URLs supply org/project/host/query, select matching profile authentication, and do not inherit default project context.
  Conflicting flags or profiles from another org fail locally; credentials, custom ports, fragments, dot segments, and duplicate query keys in URLs are rejected.
- **Piped input.** `api` sends piped stdin as the raw request body when `--body` is omitted;
  work-item and PR descriptions plus every comment command read stdin when their content flag is omitted.
  For Markdown or multiline comments, use a quoted heredoc — never `--body "..."` with backticks,
  `$`, `!`, or quotes. See [safe shell-input guidance](SKILL.md#safe-shell-input).
- **Markdown comments.** Work item comments use Markdown by default; pass `--format html` only for raw HTML.
- **Exit codes.** 0 success (including no-ops), 1 runtime error, 2 usage error. `pipeline watch`
  exits non-zero on failed, cancelled, timed-out, and unexpected runs (poll interval and timeout in
  seconds, 10s/1800s by default). It stops when the configured timeout is reached.

Every command takes `--help` and answers with a concise reference; that is where per-command
detail lives, alongside the agent-facing guide in [SKILL.md](SKILL.md).

### Read-only audit evidence (TD-064)

Audit reads cover repository policies, security groups and permissions, service endpoints, variable groups, pipeline variables and definitions, agents, pools, queues, users, teams, projects, and repositories.
Lists use TOON, default to `--limit 100`, and report both the total and how many records were omitted.
`--full` expands fields without lifting collection limits or revealing secret variables, service connection credentials, or agent capabilities.

```sh
ado-axi repo policy list --repo <repository-id> --limit 10
ado-axi security group list
ado-axi service-endpoint show <endpoint-id> --full
ado-axi pipeline variable-group list --limit 10
ado-axi pipeline variable list --pipeline <definition-id>
ado-axi pipeline agent list --pool <pool-id>
ado-axi user list --limit 10
ado-axi team member list --team <team-id>
ado-axi project show
ado-axi repo show <repository-id>
```

See [audit command reference](docs/AUDIT_READS.md) for every list/show command, required selectors, pagination, and masking rules.

## Design

Built against the ten AXI principles: TOON output, 3-4 field default schemas, truncation with
`--full`, pre-computed aggregates (review tallies, run failure counts, totals), definitive
empty states, structured errors on stdout with exit code 2 for usage errors, a content-first
no-argument dashboard, contextual next-step hints, and concise per-command help.

## Development

```sh
pnpm install
pnpm run build
pnpm test
```

### Releasing

The `.github/workflows/release-please.yml` workflow manages release pull requests from conventional commits on `main`.
Merging a release pull request creates the tag and GitHub release, then builds and tests that tag before publishing the packed tarball to npm using OIDC trusted publishing with provenance.
GitHub Actions checks run only for release publication; run the development checks locally for other changes.

## License

MIT

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## See also

- [AXI — agent eXperience interface](https://axi.md/) · [kunchenguid/axi](https://github.com/kunchenguid/axi)
- [TOON — token-optimized object notation](https://toonformat.dev/) · [toonformat/toon](https://github.com/toonformat/toon)
