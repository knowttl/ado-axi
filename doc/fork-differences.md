# Maintained fork

This repository is maintained independently from [jeffreyhaen/ado-axi](https://github.com/jeffreyhaen/ado-axi), from which it was forked.
It retains the upstream Azure DevOps CLI and builds on it; the upstream project may evolve independently.

Changes in this fork since the common ancestor include:

- Opt-in writes with `ADO_AXI_WRITES=1`, including guards for destructive operations.
- Boards queries and classification reads, bounded audit reads with secret masking, and work-item attachments.
- Pipeline, repository, policy, and wiki administration, plus artifact downloads and Classic releases.
- Raw API pagination, file input, and HEAD requests.

See the [installation instructions](https://github.com/knowttl/ado-axi/blob/main/README.md#install) to install or update the maintained fork, or invoke it once.
Its releases and issue tracker are maintained in [knowttl/ado-axi](https://github.com/knowttl/ado-axi).
