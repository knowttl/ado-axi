# Repository administration (TD-065 slice 3 of 4)

Repository create/update/delete/import and policy create/update/delete require `ADO_AXI_WRITES=1`.
The shared command boundary rejects disabled mutations, including the `repos` alias, before authentication or HTTP requests.
Existing repository and policy reads remain available with writes disabled.
Repository mutations accept `--config <path>` for profile-file selection.
Inspection and import-status hints preserve the selected profile file, profile, organization, and project with shell-safe quoting.
Slice 4 adds wiki administration.

```sh
ado-axi repo create --name SyntheticRepo
ado-axi repo update --repo SyntheticRepo --name RenamedRepo
ado-axi repo update --repo RenamedRepo --default-branch main --disabled false
ado-axi repo delete --repo RenamedRepo --confirm-delete
ado-axi repo import --repo EmptyRepo --source-url https://example.com/public/repo.git
ado-axi repo import --repo EmptyRepo --source-url https://example.com/private/repo.git --service-endpoint <endpoint-id>
ado-axi repo policy create --policy-json '{"type":{"id":"fa4e907d-c16b-4a4c-9dfa-4906e5d171dd"},"isEnabled":true,"isBlocking":true,"settings":{"minimumApproverCount":2,"scope":[{"repositoryId":"11111111-1111-4111-8111-111111111111","refName":"refs/heads/main","matchKind":"Exact"}]}}'
ado-axi repo policy update 7 --policy-json '{"isEnabled":false}' --if-rev 3
ado-axi repo policy delete 7 --if-rev 4 --confirm-delete
```

## Repositories

Create resolves the selected project and sends its ID with the repository name.
Update, delete, and import accept a repository ID or name through `--repo`.
They precheck the target and use the returned immutable repository ID for the mutation.
Update sends only the requested name, default branch, and disabled status rather than replacing other repository fields.
Branch names normalize to `refs/heads/...`.
At least one update field is required; `--disabled` accepts explicit `true` or `false`.

Deletion requires `--confirm-delete` before the precheck runs.
The repository PATCH and DELETE APIs have no documented ETag/revision predicate, so these commands do not claim atomic concurrency protection.
A resource can change between precheck and mutation.
Review the target before confirming deletion.
An already absent repository is a successful no-op.

Import queues the Git Import Requests API against an existing empty repository; the service enforces import eligibility.
It does not create the destination repository or wait for the import to complete.
Supply a credential-free HTTPS Git URL with `--source-url`.
URLs containing embedded credentials, query parameters, or fragments are refused without echoing the URL.
For authenticated sources, reference an existing service endpoint with `--service-endpoint`.
The command never reads or prints service endpoint authorization.
Output reports the import request ID and status, with a raw read command to check progress.

## Policies

Pass policy JSON through `--policy-json`; `--config <path>` selects the saved profile configuration file.
Both create and update use the saved default profile or `--profile <name>` when org/project flags are omitted.
Create accepts a policy configuration JSON object with `type.id`, `settings`, `isEnabled`, and `isBlocking`.
The type ID is a GUID; settings depend on that Azure DevOps policy type.
For branch policies, put repository and branch scope in `settings.scope`, as shown above.
Update accepts any subset of those four fields and merges them into the fetched configuration.
Supply complete nested settings when replacing `settings`; nested fields are not merged.
Do not include the policy's `id` or `revision` in the JSON.

Update sends the fetched revision with the PUT request.
Optional `--if-rev` rejects a stale caller revision before writing.
Delete requires both `--if-rev` and `--confirm-delete`, then checks the fetched revision before DELETE.
DELETE has no documented atomic revision predicate, so a concurrent update can occur between the precheck and deletion.
An already absent policy is a successful no-op.

Mutation output includes identifiers, revisions, and selected repository state rather than raw policy settings, import parameters, or repository URLs.
API error details are withheld because those details can echo credentials.
