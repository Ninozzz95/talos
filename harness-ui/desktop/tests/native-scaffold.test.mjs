import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NativeScaffoldError,
  validateLockfile,
  validateMemberManifest,
  validateToolchain,
  validateUnsafeBoundary,
  verifyNativeScaffold,
} from '../scripts/verifica-native-scaffold.mjs';

test('E0-3 — lo scaffold Rust reale ha quattro crate e zero dipendenze third-party', async () => {
  const result = await verifyNativeScaffold();
  assert.deepEqual(result, { rust: '1.98.1', members: 4, thirdPartyDependencies: 0 });
});

test('E0-3 AL CONTRARIO — floating stable non è una toolchain accettabile', () => {
  assert.throws(
    () => validateToolchain('[toolchain]\nchannel = "stable"\nprofile = "minimal"\ncomponents = ["rustfmt","clippy"]\ntargets=["x86_64-pc-windows-msvc"]'),
    (error) => error instanceof NativeScaffoldError && error.code === 'NATIVE_TOOLCHAIN_VERSION',
  );
});

test('E0-3 AL CONTRARIO — una dipendenza crates.io entra solo con una nuova decisione', () => {
  const manifest = [
    '[package]',
    'name = "evolution-wire"',
    'version.workspace = true',
    'edition.workspace = true',
    'rust-version.workspace = true',
    'publish = false',
    '[dependencies]',
    'serde = "1"',
  ].join('\n');
  assert.throws(
    () => validateMemberManifest('evolution-wire', manifest),
    (error) => error instanceof NativeScaffoldError && error.code === 'NATIVE_EXTERNAL_DEPENDENCY',
  );
});

test('E0-3 AL CONTRARIO — Cargo.lock con registry source non appartiene allo scaffold zero-deps', () => {
  assert.throws(
    () => validateLockfile('version = 4\n[[package]]\nname="evolution-wire"\nversion="0.1.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"'),
    (error) => error instanceof NativeScaffoldError && error.code === 'NATIVE_LOCK_EXTERNAL_SOURCE',
  );
});

test('E0-3 AL CONTRARIO — unsafe fuori dal crate Windows è vietato per costruzione', () => {
  assert.throws(
    () => validateUnsafeBoundary(new Map([
      ['evolution-wire', '#![forbid(unsafe_code)]\nfn f(){ unsafe { core::hint::unreachable_unchecked(); } }'],
      ['talos-supervisor', '#![forbid(unsafe_code)]'],
      ['talos-extension-host', '#![forbid(unsafe_code)]'],
      ['talos-windows-sandbox', '#![deny(unsafe_op_in_unsafe_fn)]'],
    ])),
    (error) => error instanceof NativeScaffoldError && error.code === 'NATIVE_UNSAFE_BOUNDARY',
  );
});

test('E0-3 AL CONTRARIO — anche il crate Windows non usa unsafe prima della tranche che lo autorizza', () => {
  assert.throws(
    () => validateUnsafeBoundary(new Map([
      ['evolution-wire', '#![forbid(unsafe_code)]'],
      ['talos-supervisor', '#![forbid(unsafe_code)]'],
      ['talos-extension-host', '#![forbid(unsafe_code)]'],
      ['talos-windows-sandbox', '#![deny(unsafe_op_in_unsafe_fn)]\nfn f(){ unsafe { } }'],
    ])),
    (error) => error instanceof NativeScaffoldError && error.code === 'NATIVE_UNSAFE_TOO_EARLY',
  );
});
