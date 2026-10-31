# Boards read commands (TD-063)

Discover relation types, saved query results, area paths, and iteration paths without writing to Azure DevOps.
All requests made by these commands use GET.

```sh
ado-axi work-item link types --limit 10
ado-axi work-item link types --full
ado-axi query run "Shared Queries/Open bugs" --limit 10 --fields id,title,state
ado-axi query run 11111111-1111-4111-8111-111111111111 --fields id,Custom.Priority
ado-axi area list --depth 2 --limit 20
ado-axi iteration list --depth 2 --full
```

Saved query paths are relative to the selected project; quote paths containing spaces.
Saved queries use the same work-item rendering and field selection as `work-item list`.
The default limit is 30 and is sent to the query endpoint as `$top`, including when `--full` is passed.
Counts report the number of work items shown, never an exhaustive query total.
Linked queries display distinct source and target work items within the server response, bounded by the display limit.
An empty query explicitly reports zero work items.

Area and iteration lists include the project root and join child names into usable backslash-separated paths.
Iteration dates are shown as `YYYY-MM-DD`, or blank when no dates are configured.
The default depth is 10; depth 0 includes only the root.
Counts are scoped to the fetched tree at that depth, and help points out deeper branches.
The default display limit is 50; `--full` displays every fetched path without changing depth.
`left-out` counts fetched paths omitted from display, excluding descendants beyond the requested depth.

Link types show the reference name, display name, usage, and enabled status.
The default limit is 50; `--full` displays every returned type.
All four commands support `--fields` and the usual org/project/profile selectors.
