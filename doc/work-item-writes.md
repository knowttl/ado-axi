# Work-item writes

Before running these examples, follow [write enablement](../README.md#behavior).

## Attachments (TD-062)

```sh
ado-axi work-item attach 42 --file ./evidence.bin --comment "Test evidence" --if-rev 7
ado-axi work-item attachment get 42 --name evidence.bin --out ./download.bin
```

`attach` requires `ADO_AXI_WRITES=1` and a readable regular local file.
Temporary paths supplied by a host work like any other local path.
The upload name is the path's basename.
Uploads and downloads are limited to 25 MiB (26,214,400 bytes).
Oversized local files are refused before any API request; downloads enforce the cap even without a Content-Length header.
The command reads the work item's revision before upload and adds an AttachedFile relation with a JSON Patch `/rev` test.
`--if-rev` selects an explicit expected revision and refuses a stale value before uploading.
Without it, the revision read immediately before upload becomes the guard.
Success reports attachment `id`, `name`, `size` in bytes, and the new work-item `rev`.

Uploading and linking are separate Azure DevOps operations.
If the relation fails, `ATTACHMENT_UNLINKED` reports the uploaded attachment's `id`, `url`, `name`, and `size` structurally, without the API response body.
Re-read the work item and inspect its relations before retrying.
Reuse that URL in an AttachedFile relation through `ado-axi api PATCH _apis/wit/workitems/<id> --body '<json-patch>'`, with a `test /rev` operation followed by the relation addition.
Rerunning `attach` uploads a new copy; it does not reuse the previously uploaded attachment.

`attachment get` remains available with writes disabled.
It selects AttachedFile relations by exact name and refuses duplicate names, listing candidate attachment IDs and URLs.
Use `work-item link list <id> --full` to inspect names and comments.
The download defaults to `./<name>`; use `--out <path>` to select a destination.
Names must be plain filenames.
An existing destination is preserved unless `--force` is supplied.
Size and API failures occur before the output is opened, preserving existing content even with `--force`.
Success reports attachment `id`, `name`, absolute `path`, `bytes` written, and `sha256`.

## Delete or destroy a work item (TD-068)

```sh
ado-axi work-item get 42
ado-axi work-item delete 42 --if-rev 7
# Permanent destruction instead of recycling:
ado-axi work-item delete 42 --if-rev 7 --destroy --confirm-destroy
```

Use the revision from `get`; a positive `--if-rev` is required for either operation.
The default moves the item to the recycle bin, where Azure DevOps can restore it.
`--destroy` permanently destroys the item and requires the explicit `--confirm-destroy` flag in addition to the revision.
The command reads and compares the revision immediately before issuing DELETE.
Unlike JSON-Patch updates, DELETE has no atomic revision predicate, so there is a small race window in which another writer can change the item after the check and before deletion.
Do not rely on this check as an atomic compare-and-swap.
The TOON result reports `moved to recycle bin` or `permanently destroyed`, with `checked-rev` identifying the revision checked before the request.
Stale revisions refuse the write; API failures are surfaced without retrying.
An absent or inaccessible item remains an error rather than being reported as successfully destroyed.

## Remove a relation (TD-063)

```sh
ado-axi work-item link list 42
ado-axi work-item link remove 42 --index 1 --if-rev 7
```

Use the zero-based `index` and `rev` from the list response.
Indexes refer to the complete relation array, including artifacts, hyperlinks, and attachments.
Removal requires an explicit revision because another writer may have changed the relation order since the list was read.
The command re-reads the item, refuses a stale revision or missing index, and sends a JSON Patch with `test /rev` followed by `remove /relations/<index>`.
The test and removal apply atomically.
Revision conflicts fail without automatic retries; re-list and review the relation before retrying.
The TOON result reports the removed relation's index, type, target, and new item revision.
Repeating the old command fails its revision guard rather than removing the next relation at that index.
