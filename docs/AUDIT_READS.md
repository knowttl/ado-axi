# Audit reads (TD-064)

Every command below uses GET and returns TOON through the normal CLI output boundary.
Pass `--org`, `--project`, or `--profile` as for other commands.
Lists default to `--limit 100`; the limit must be a positive integer.
Every list reports `count: N of T <collection>` and `omitted: T-N`, including empty lists.
All server pages are counted, while at most the requested number of top-level records are retained.
Team APIs use offset pagination; user entitlement and other paged audit APIs use continuation tokens.

| Command | Required selectors | Scope |
| --- | --- | --- |
| `repo policy list` | `--repo <repository-id>`; optional `--branch <branch>` | Project |
| `repo policy show <id>` | Policy configuration ID | Project |
| `security group list` | Optional `--scope <descriptor>` | Organization |
| `security group show <descriptor>` | Graph group descriptor | Organization |
| `security membership list <descriptor>` | Graph descriptor; optional `--direction up` (default) or `down` | Organization |
| `security permission list` | `--namespace <id>`; optional `--token <resource-token>` and `--subject <descriptor>` | Organization |
| `security permission show` | `--namespace <id> --token <resource-token>`; optional `--subject <descriptor>` | Organization |
| `service-endpoint list` | None | Project |
| `service-endpoint show <id>` | Endpoint ID | Project |
| `variable-group list` | None | Project |
| `variable-group show <id>` | Variable group ID | Project |
| `pipeline variable list` | `--pipeline <definition-id>`, positional definition ID, or `--id <definition-id>` | Project |
| `pipeline show <id>` | Build definition ID | Project |
| `agent list` | `--pool <id>` | Organization |
| `agent show <id>` | Agent ID and `--pool <id>` | Organization |
| `pool list` | None | Organization |
| `pool show <id>` | Pool ID | Organization |
| `queue list` | None | Project |
| `queue show <id>` | Queue ID | Project |
| `user list` | None | Organization |
| `user show <id>` | User entitlement ID | Organization |
| `team list` | None | Project |
| `team member list` | `--team <name-or-id>` | Project |
| `project show [<name-or-id>]` | Defaults to selected project | Organization |
| `repo show <name-or-id>` | Repository name or ID; `--repo` also accepted | Project |

`pipeline variable-group`, `pipeline agent`, `pipeline pool`, and `pipeline queue` are aliases for their top-level groups.
`security group membership list` aliases `security membership list`.
`team list-member` aliases `team member list`.
Detail IDs may also be passed with `--id`.
Permission reads return ACLs, inherited-permission flags, and ACE allow/deny bitmasks; they do not calculate effective access across group memberships.

`--full` expands metadata and text, while `--fields a,b` selects list columns after masking.
Nested arrays and variable collections are also bounded by `--limit`; truncated nested collections include their total and omitted counts.
Default text previews are limited to 1,200 characters; use `--full` for complete text.
Secret variable values are always `***`, including in nested variable groups and build definitions.
Authorization, credential, password, token credential, certificate, provider-data, and capability fields are masked recursively.
Endpoint authorization, data, and URLs are always withheld because their free-form values can embed credentials.
API failure messages and suggestions never include the untrusted server response, which can echo secrets.

Offline verification uses synthetic responses at the HTTP boundary and never needs an Azure DevOps account.
Run `npm run build`, `npm test`, and `npm run bench -- --surface-only`.
The surface benchmark measures each command case in `benchmark/tool-surface.json` without making network requests or writing benchmark reports.
