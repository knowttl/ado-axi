# Work-item writes

Work-item mutating commands are `create`, `update`, `delete` (including `--destroy`), `comment`, `link add`, and `link remove`.
ado-axi executes writes immediately; the host must keep these commands disabled unless writes are enabled.
There is no local write-enable switch.

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
