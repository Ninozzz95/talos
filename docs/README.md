# AVM Documentation

Official documentation for the AVM workspace.

## Quick Commands

```bash
./talos up                 # Docker-first clean checkout
./talos dev                # Native development bootstrap and stack
./talos doctor             # Read-only readiness report
./talos doctor --repair    # Repair ignored native runtime state
```

Windows Command Prompt users can run the equivalent `talos.cmd` commands.
That wrapper resolves Git for Windows explicitly and preserves the child
command exit code. On Unix, `bash ./talos <command>` is an equivalent fallback
when checkout permissions do not mark the launcher executable.

## Start Here

- [Deployment plans](deployment.md): development and production plans for TALOS and KADMOS.
- [Kadmos architecture overview](architecture/overview.md): core architecture and execution model.
- [Security model](architecture/security-model.md): policy, secrets, network, and execution safety.
- [Benchmark methodology](benchmarks/methodology.md): AVM ON/OFF comparison rules.
- [TALOS theme engine](talos/theme-engine.md): appearance, themes, motion, and safe customization.

## Architecture

- [Failure policy](architecture/failure-policy.md)
- [JMP protocol](architecture/jmp-protocol.md)
- [Validator contract](architecture/validator-contract.md)
- [Naming contract](architecture/naming-contract.md)
- [TALOS and KADMOS experience blueprint](architecture/talos-kadmos-experience-blueprint.md)
- [Odysseus to TALOS feature gap audit](architecture/odysseus-to-talos-feature-gap-audit.md)

Private implementation plans and progress logs live under `docs/superpowers/`
and are intentionally not part of the public documentation set.
