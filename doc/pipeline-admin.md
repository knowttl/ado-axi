# Pipeline administration (TD-065)

All remote mutations default off.
Set `ADO_AXI_WRITES=1` only for an authorized write.
The shared command boundary refuses disabled writes before authentication or HTTP requests.

```sh
ado-axi pipeline create --definition '{"name":"Synthetic CI","type":"build","queue":{"id":1},"repository":{"id":"11111111-1111-4111-8111-111111111111","type":"TfsGit"},"process":{"type":2,"yamlFilename":"azure-pipelines.yml"}}'
ado-axi pipeline update 42 --definition '{"name":"Renamed CI"}' --if-rev 7
ado-axi pipeline delete 42 --if-rev 8 --confirm-delete
ado-axi pipeline build tag add 101 --tag verified
ado-axi pipeline build tag remove 101 --tag verified
ado-axi pipeline runs tag add 101 --tag verified
ado-axi pipeline build cancel 101
ado-axi pipeline folder list --limit 20
ado-axi pipeline folder create --path '\Team'
ado-axi pipeline folder delete --path '\Team' --confirm-delete
```

Create accepts a BuildDefinition JSON object for the Build Definitions API.
Supply the repository, queue, and process required by your definition type.
Update shallowly merges the supplied top-level fields into the current definition, so supply complete nested objects when replacing them.
Omit `id` and `revision` from the JSON.
Updates always send the fetched revision for the API's optimistic concurrency check; optional `--if-rev` additionally rejects a stale caller revision before PUT.
Definition mutation output contains only identifiers and revisions, and API error details are withheld because definitions can contain secret variables or credential-bearing repository URLs.

Definition deletion requires both `--if-rev` and `--confirm-delete`.
The revision precheck and DELETE are separate requests, so a concurrent modification can happen between them.
Folder deletion requires `--confirm-delete` and checks existence first, but has no atomic concurrency guard.
Review the target before confirming either delete.
An absent folder is a successful no-op.

Build and pipeline run IDs identify the same underlying build resource for tags.
`pipeline runs tag` aliases `pipeline build tag`.
Tags use individual add/remove endpoints and preserve other tags without a read-modify-write replacement.
Cancellation checks build status first and reports completed or cancelling builds as no-ops.

Folder listing stays read-only and returns at most `--limit` rows (default 100), including when `--full` expands fields.
The result reports the returned and total folder counts and an expansion hint when rows are omitted.
Folder paths use absolute backslash syntax; quote them to preserve backslashes in your shell.
