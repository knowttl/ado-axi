# Artifacts and releases (TD-065 slice 2 of 4)

This slice adds Build artifact reads/downloads and Classic release administration.
Slice 3 covers repositories and policies; slice 4 covers wikis.

```sh
ado-axi pipeline runs artifact list 42 --limit 20
ado-axi pipeline runs artifact download 42 --name drop --out ./drop.zip
ado-axi pipeline runs artifact download 42 --name drop --out ./drop.zip --force
ado-axi pipeline release list --definition 4 --limit 20
ado-axi pipeline release show 12 --full
ADO_AXI_WRITES=1 ado-axi pipeline release create --definition 4 --draft true
ADO_AXI_WRITES=1 ado-axi pipeline release create --definition 4 --description 'Verified deployment' --artifacts '[{"alias":"_CI","instanceReference":{"id":"42"}}]'
```

Artifact list/download and release list/show remain remote reads and work without `ADO_AXI_WRITES=1`.
Release create passes through the shared, default-off write boundary before authentication or HTTP requests.
These release commands address the Classic Releases service at `vsrm.dev.azure.com`, rather than YAML pipeline deployments.

## Artifact downloads

List output includes the artifact ID, name, type, and the size advertised by the server when available.
It reports the total artifact count, bounds rows by `--limit` (default 100), and offers an expansion hint when rows are omitted.
`--full` does not lift the row limit or expose signed download URLs and opaque artifact resource data.

Download names the artifact with `--name` and requires an explicit local ZIP destination with `--out`.
The parent directory must exist and be writable.
The CLI requests the ZIP through the selected organization's Build Artifacts API without printing or following a response-supplied download URL.
ZIP availability depends on the artifact resource type supported by that API.
The maximum download is 100 MiB (104,857,600 bytes), enforced while reading even when the server omits Content-Length.
Output reports the saved path, downloaded byte count, and maximum byte count.
The CLI completes the bounded download before opening the output, preserving existing content when the transfer fails.
It uses exclusive file creation by default; only `--force` permits overwriting an existing destination.
Downloads save the archive and do not extract it.

Artifact upload is intentionally not exposed.
The Build Artifacts create endpoint registers an existing artifact resource; it does not accept local artifact file bytes.
Publishing files would require a separate container or deduplicated storage upload protocol, which is outside this slice's clean API support condition.

## Classic releases

Release lists accept an optional numeric `--definition` filter.
They count continuation pages while retaining at most `--limit` rows, defaulting to 100.
`--full` expands fields without expanding that row bound.
Release detail truncates long strings by default and bounds nested collections with the same `--limit`.
Secret variables, authorization fields, and URLs are masked before output, including with `--full` or selected list fields.
API failure details are withheld because those details can echo secrets.

Create requires a numeric release definition ID.
Without `--artifacts`, the release service selects the definition's default artifact versions.
To select versions, supply the release artifact aliases and instance IDs as a JSON array.
`--description` sets the release description, and `--draft true|false` controls draft creation.
Omitting `--draft` uses the service default, which can start deployments according to the release definition.
Use `--draft true` when creating a release that should remain a draft.
Create output contains only its ID, name, and status, with a hint to inspect the new release.
