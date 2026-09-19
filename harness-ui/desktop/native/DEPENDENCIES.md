# Native TALOS dependency policy

This workspace is part of the future TALOS trusted computing base.

## E0-3 state

**Direct third-party Rust dependencies: none.**

Only local path dependencies between crates in this workspace are present.

## Binding rules for future dependency additions

A third-party dependency may be added only in an implementation slice that:

1. has completed the project's fresh 10×4 research gate;
2. explains why the dependency is needed instead of the Rust standard library or an existing dependency;
3. pins resolution through the committed `Cargo.lock`;
4. identifies whether the crate uses:
   - `build.rs`;
   - proc macros;
   - native/C/C++ code or FFI;
   - generated code;
   - network access during build or test;
5. reviews license, source, maintenance and current security-advisory status;
6. updates the dependency policy/gates in the same reviewed change.

Wildcard dependency versions are forbidden.

Git dependencies are forbidden by default. Any exception must pin an immutable commit and explain why a registry release cannot be used.

## Build policy

CI and release builds use `--locked`.

Offline/vendored builds are a separate control from dependency trust. A vendored source tree is not considered safe merely because it is local.

## Unsafe Rust boundary

The intended architecture is:

- `evolution-wire`: unsafe forbidden;
- `talos-supervisor`: unsafe forbidden;
- `talos-extension-host`: unsafe forbidden;
- `talos-windows-sandbox`: the only crate that may contain narrowly reviewed Windows FFI/unsafe code when a later slice needs it.

No unsafe code is required in E0-3.
