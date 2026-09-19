import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class NativeScaffoldError extends Error {
  constructor(message, code = 'NATIVE_SCAFFOLD_INVALID') {
    super(message);
    this.name = 'NativeScaffoldError';
    this.code = code;
  }
}

const MEMBERS = Object.freeze([
  'evolution-wire',
  'talos-supervisor',
  'talos-windows-sandbox',
  'talos-extension-host',
]);

function fail(message, code) {
  throw new NativeScaffoldError(message, code);
}

function requireText(text, marker, code = 'NATIVE_SCAFFOLD_MARKER_MISSING') {
  if (!String(text).includes(marker)) fail(`Marcatore native scaffold assente: ${marker}.`, code);
}

export function validateToolchain(text) {
  requireText(text, 'channel = "1.98.1"', 'NATIVE_TOOLCHAIN_VERSION');
  requireText(text, 'profile = "minimal"', 'NATIVE_TOOLCHAIN_PROFILE');
  requireText(text, '"rustfmt"', 'NATIVE_TOOLCHAIN_COMPONENT');
  requireText(text, '"clippy"', 'NATIVE_TOOLCHAIN_COMPONENT');
  requireText(text, '"x86_64-pc-windows-msvc"', 'NATIVE_TOOLCHAIN_TARGET');
}

export function validateWorkspaceManifest(text) {
  requireText(text, 'resolver = "3"', 'NATIVE_WORKSPACE_RESOLVER');
  requireText(text, 'edition = "2024"', 'NATIVE_WORKSPACE_EDITION');
  requireText(text, 'rust-version = "1.98.1"', 'NATIVE_WORKSPACE_RUST_VERSION');
  requireText(text, 'unsafe_op_in_unsafe_fn = "deny"', 'NATIVE_WORKSPACE_UNSAFE_POLICY');
  requireText(text, 'undocumented_unsafe_blocks = "deny"', 'NATIVE_WORKSPACE_UNSAFE_POLICY');
  for (const member of MEMBERS) requireText(text, `"crates/${member}"`, 'NATIVE_WORKSPACE_MEMBER');
}

export function validateMemberManifest(name, text) {
  requireText(text, `name = "${name}"`, 'NATIVE_CRATE_NAME');
  requireText(text, 'version.workspace = true', 'NATIVE_CRATE_WORKSPACE_INHERITANCE');
  requireText(text, 'edition.workspace = true', 'NATIVE_CRATE_WORKSPACE_INHERITANCE');
  requireText(text, 'rust-version.workspace = true', 'NATIVE_CRATE_WORKSPACE_INHERITANCE');
  requireText(text, 'publish = false', 'NATIVE_CRATE_PUBLISH_FORBIDDEN');

  let dependencySection = false;
  for (const raw of String(text).split(/\r?\n/u)) {
    const trimmed = raw.trim();
    if (/^\[[^\]]+\]$/u.test(trimmed)) {
      dependencySection = /^\[(?:target\.[^\]]+\.)?(?:build-)?dependencies(?:\.[^\]]+)?\]$/u.test(trimmed);
      continue;
    }
    if (!dependencySection) continue;
    const line = raw.replace(/#.*$/u, '').trim();
    if (!line) continue;
    if (!/^[A-Za-z0-9_-]+\s*=\s*\{[^}]*\bpath\s*=\s*"[^"]+"[^}]*\}\s*$/u.test(line)) {
      fail(`${name}: E0-3 ammette solo dipendenze path locali: ${line}`, 'NATIVE_EXTERNAL_DEPENDENCY');
    }
  }
}

export function validateLockfile(text) {
  requireText(text, 'version = 4', 'NATIVE_LOCK_VERSION');
  if (/^source\s*=|^checksum\s*=/gmu.test(text)) {
    fail('Cargo.lock E0-3 contiene una sorgente esterna.', 'NATIVE_LOCK_EXTERNAL_SOURCE');
  }
  const packages = [...String(text).matchAll(/^name\s*=\s*"([^"]+)"\s*$/gmu)].map((m) => m[1]).sort();
  const expected = [...MEMBERS].sort();
  if (JSON.stringify(packages) !== JSON.stringify(expected)) {
    fail(`Cargo.lock non descrive esattamente i quattro crate E0-3: ${packages.join(', ')}.`, 'NATIVE_LOCK_PACKAGE_SET');
  }
}

export function validateUnsafeBoundary(sources) {
  for (const [name, text] of sources) {
    if (name === 'talos-windows-sandbox') {
      requireText(text, '#![deny(unsafe_op_in_unsafe_fn)]', 'NATIVE_WINDOWS_UNSAFE_POLICY');
      continue;
    }
    requireText(text, '#![forbid(unsafe_code)]', 'NATIVE_SAFE_CRATE_UNSAFE_POLICY');
    if (/\bunsafe\b/u.test(text.replace('#![forbid(unsafe_code)]', ''))) {
      fail(`${name}: unsafe compare fuori dal crate Windows.`, 'NATIVE_UNSAFE_BOUNDARY');
    }
  }
}

export function validateWindowsContainmentSource(text) {
  requireText(text, 'PROC_THREAD_ATTRIBUTE_JOB_LIST', 'NATIVE_WINDOWS_CREATE_TIME_JOB');
  requireText(text, 'JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE', 'NATIVE_WINDOWS_KILL_ON_CLOSE');
  requireText(text, 'CREATE_SUSPENDED', 'NATIVE_WINDOWS_CREATE_SUSPENDED');
  requireText(text, 'IsProcessInJob', 'NATIVE_WINDOWS_MEMBERSHIP_CHECK');
  const policy = /const BASE_LIMIT_FLAGS:\s*u32\s*=\s*([^;]+);/u.exec(String(text));
  if (!policy || !policy[1].includes('JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE')) {
    fail('M1-D richiede KILL_ON_JOB_CLOSE nella policy base.', 'NATIVE_WINDOWS_KILL_ON_CLOSE');
  }
  if (/BREAKAWAY/u.test(policy[1])) {
    fail('M1-D non autorizza flag di breakaway nella policy base.', 'NATIVE_WINDOWS_BREAKAWAY_POLICY');
  }
}

export async function verifyNativeScaffold({
  nativeRoot = resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'native'),
  readText = (path) => readFile(path, 'utf8'),
  listDir = (path) => readdir(path),
} = {}) {
  validateToolchain(await readText(resolve(nativeRoot, 'rust-toolchain.toml')));
  validateWorkspaceManifest(await readText(resolve(nativeRoot, 'Cargo.toml')));
  validateLockfile(await readText(resolve(nativeRoot, 'Cargo.lock')));

  const crateDir = resolve(nativeRoot, 'crates');
  const actual = (await listDir(crateDir)).sort();
  const expected = [...MEMBERS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`Crate native inattesi/mancanti: ${actual.join(', ')}.`, 'NATIVE_WORKSPACE_MEMBER_SET');
  }

  const sources = new Map();
  for (const name of MEMBERS) {
    const manifest = await readText(resolve(crateDir, name, 'Cargo.toml'));
    validateMemberManifest(name, manifest);
    const sourceName = name === 'talos-supervisor' || name === 'talos-extension-host' ? 'src/main.rs' : 'src/lib.rs';
    sources.set(name, await readText(resolve(crateDir, name, sourceName)));
  }
  validateUnsafeBoundary(sources);
  validateWindowsContainmentSource(
    await readText(resolve(crateDir, 'talos-windows-sandbox', 'src/windows.rs')),
  );

  const dependenciesPolicy = await readText(resolve(nativeRoot, 'DEPENDENCIES.md'));
  requireText(dependenciesPolicy, '**Direct third-party Rust dependencies: none.**', 'NATIVE_DEPENDENCY_POLICY');
  requireText(dependenciesPolicy, 'Git dependencies are forbidden by default.', 'NATIVE_DEPENDENCY_POLICY');

  return Object.freeze({
    rust: '1.98.1',
    members: MEMBERS.length,
    thirdPartyDependencies: 0,
    windowsContainment: true,
  });
}

async function main() {
  const result = await verifyNativeScaffold();
  process.stdout.write(
    `Native scaffold verificato: Rust ${result.rust}, ${result.members} crate, ${result.thirdPartyDependencies} dipendenze third-party, Job Object M1-D presente.\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Native scaffold non valido.'}\n`);
    process.exitCode = 1;
  });
}
