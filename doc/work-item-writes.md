# Work-item writes

Work-item mutating commands are `create`, `update`, `comment`, `link add`, and `link remove`.
ado-axi executes writes immediately; the host must keep these commands disabled unless writes are enabled.
There is no local write-enable switch.

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
