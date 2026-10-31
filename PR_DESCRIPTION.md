TD-065 slice 1 of 4 adds pipeline definition create/update/delete, build cancellation, build/runs tags, and explicit folder list/create/delete.
All writes remain behind the shared, default-off `ADO_AXI_WRITES=1` switch.
Tagging uses `pipeline build tag` or `pipeline runs tag`; folder commands require an explicit operation.

Following slices:

- Slice 2 of 4: run artifact list/download/upload and releases.
- Slice 3 of 4: repository create/update/delete/import and policy create/update/delete.
- Slice 4 of 4: wiki administration.
