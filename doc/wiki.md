# Wiki commands (TD-065 slice 4 of 4)

This final slice completes TD-065's staged delivery: pipeline administration, artifacts and Classic releases, repositories and policies, and wikis.
Artifact file upload remains subject to the clean API support limitation documented in [artifacts and releases](artifacts-releases.md).

```sh
ado-axi wiki list --limit 20
ado-axi wiki page get --wiki <wiki-id> --path /Home
ado-axi wiki page get --wiki <wiki-id> --path /Home --full
ADO_AXI_WRITES=1 ado-axi wiki page create --wiki <wiki-id> --path /Home --file ./Home.md
ADO_AXI_WRITES=1 ado-axi wiki page update --wiki <wiki-id> --path /Home --content '# Updated page'
ADO_AXI_WRITES=1 ado-axi wiki page update --wiki <wiki-id> --path /Home --file ./Home.md --if-match '"<page-etag>"'
```

## Context and reads

Use `--org`, `--project`, `--profile`, and `--config` as for other commands.
Follow-up commands preserve the selected context and quote shell arguments safely.
Wiki list and page get are read-only and stay available without `ADO_AXI_WRITES=1`.

List returns at most `--limit` rows, defaulting to 100, with a total and omitted count.
Its default columns are ID, name, and type.
`--full` adds repository metadata without lifting the row limit, and `--fields` selects list fields.
Raw wiki URLs are withheld because they can contain credentials.

Page get requires a wiki identifier or name with `--wiki` and a page path with `--path`.
Relative page paths normalize to a leading slash.
The result includes page ID, path, server ETag, original character count, and Markdown content.
Content defaults to a 4000-character preview, with a `--full` hint only when it is truncated.
Credential-bearing URLs and links containing common token/signature query parameters are redacted in both preview and full output.
This output redaction does not modify stored page content.
API error details are withheld to protect secrets.

## Create and update

Both mutations pass the shared default-off `ADO_AXI_WRITES=1` boundary before file reads, credentials, or HTTP requests.
Supply exactly one content source: `--content <text>` or `--file <UTF-8-Markdown-path>`.
An explicit empty `--content=` is accepted.

Create reads the target path first and refuses to overwrite an existing page.
It then calls the Wiki Pages create-or-update endpoint without an update ETag.
Azure DevOps requires an `If-Match` ETag to update an existing page; creation does not supply that update permission.

Update reads the current page and sends the exact returned ETag in `If-Match`.
Optional `--if-match` additionally asserts an ETag from an earlier caller read before the PUT is attempted.
Pass the entire value, including quotes; for example, a header value of `"abc"` is supplied as `--if-match '"abc"'`.
A missing ETag or stale caller ETag refuses the update.
A concurrent edit that fails the server's precondition is returned without retrying or dropping the guard.
Mutation output includes page ID, path, and the new ETag, with a context-preserving read hint.
