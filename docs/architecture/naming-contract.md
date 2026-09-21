# Naming Contract

This repository uses one stable vocabulary across code, docs, CLI output, and UI copy.

## Terms

- **AVM**: the architecture and technology category, Agnostic Agent Virtual Machine.
- **Kadmos**: the deterministic engine, PHP core package, and CLI product name.
- **Talos**: the visual web shell and demo/product experience around Kadmos.
- **JMP**: JSON Mutation Protocol, the command envelope emitted by LLMs and validated before execution.

## PHP Contract

- Composer package: `kadmos/core`
- Production namespace: `Kadmos\`
- Test namespace reservation: `Kadmos\Tests\`

AVM is not a PHP namespace. Existing runtime code must not instantiate `\AVM\...` classes.

## Product Copy Contract

Use **Kadmos AVM** when introducing the full system.
Use **Kadmos Engine** for the deterministic execution core.
Use **Talos UI** for the browser interface.
Use **JMP validator** for the Node.js stateless validation service.

## Rationale

The distinction keeps the project defensible:

- AVM describes the idea.
- Kadmos identifies the executable engine.
- Talos identifies the user-facing proof lab.
- JMP identifies the protocol boundary that prevents raw LLM output from mutating systems directly.

