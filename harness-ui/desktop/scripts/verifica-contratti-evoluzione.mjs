import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class EvolutionContractError extends Error {
  constructor(message, code = 'EVOLUTION_CONTRACT_INVALID') {
    super(message);
    this.name = 'EvolutionContractError';
    this.code = code;
  }
}

const REQUIRED_SCHEMAS = Object.freeze([
  'common.schema.json',
  'feature-contract.schema.json',
  'semantic-changeset.schema.json',
  'runtime-manifest.schema.json',
  'extension-manifest.schema.json',
  'ui-contribution.schema.json',
  'verification-dossier.schema.json',
  'lineage-attestation.schema.json',
]);

function fail(message, code) {
  throw new EvolutionContractError(message, code);
}

function walk(value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const item of Object.values(value)) walk(item, visit);
}

function decodePointerToken(value) {
  return value.replaceAll('~1', '/').replaceAll('~0', '~');
}

function resolveJsonPointer(document, fragment) {
  if (fragment === '' || fragment === '#') return document;
  if (!fragment.startsWith('#/')) return undefined;
  let current = document;
  for (const raw of fragment.slice(2).split('/')) {
    const token = decodePointerToken(raw);
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token)) return undefined;
    current = current[token];
  }
  return current;
}

export function validateSchemaSet(schemaFiles) {
  if (!(schemaFiles instanceof Map)) fail('Serve una mappa dei JSON Schema.', 'EVOLUTION_SCHEMA_SET_INVALID');

  for (const name of REQUIRED_SCHEMAS) {
    if (!schemaFiles.has(name)) fail(`Schema obbligatorio assente: ${name}.`, 'EVOLUTION_SCHEMA_MISSING');
  }

  const ids = new Map();
  for (const [name, schema] of schemaFiles) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) fail(`${name}: root non valida.`);
    if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') fail(`${name}: draft JSON Schema inatteso.`);
    if (typeof schema.$id !== 'string' || schema.$id === '') fail(`${name}: $id assente.`);
    if (ids.has(schema.$id)) fail(`$id duplicato: ${schema.$id}.`, 'EVOLUTION_SCHEMA_ID_DUPLICATE');
    ids.set(schema.$id, name);

    if (name !== 'common.schema.json') {
      if (schema.type !== 'object' || schema.additionalProperties !== false) {
        fail(`${name}: il confine durevole deve essere un oggetto strict.`, 'EVOLUTION_SCHEMA_NOT_STRICT');
      }
      const version = schema.properties?.schema?.const;
      if (typeof version !== 'string' || !/^talos\.evolution\.[a-z0-9-]+\.v1$/u.test(version)) {
        fail(`${name}: discriminante schema v1 assente o invalida.`, 'EVOLUTION_SCHEMA_VERSION_INVALID');
      }
      if (!Array.isArray(schema.required) || !schema.required.includes('schema')) {
        fail(`${name}: il campo schema deve essere obbligatorio.`, 'EVOLUTION_SCHEMA_VERSION_INVALID');
      }
    }
  }

  for (const [name, schema] of schemaFiles) {
    const refs = [];
    walk(schema, (node) => {
      if (typeof node.$ref === 'string') refs.push(node.$ref);
    });
    for (const ref of refs) {
      const [filePart, fragmentPart = ''] = ref.split('#', 2);
      const targetName = filePart || name;
      if (/^[a-z][a-z0-9+.-]*:/iu.test(targetName)) {
        fail(`${name}: $ref esterno non ammesso nel contratto v1: ${ref}.`, 'EVOLUTION_SCHEMA_EXTERNAL_REF');
      }
      const target = schemaFiles.get(targetName);
      if (!target) fail(`${name}: $ref irrisolto: ${ref}.`, 'EVOLUTION_SCHEMA_REF_MISSING');
      const fragment = fragmentPart === '' ? '' : `#${fragmentPart}`;
      if (resolveJsonPointer(target, fragment) === undefined) {
        fail(`${name}: frammento $ref irrisolto: ${ref}.`, 'EVOLUTION_SCHEMA_REF_MISSING');
      }
    }
  }

  return { schemas: schemaFiles.size };
}

function blockFrom(text, startToken) {
  const start = text.indexOf(startToken);
  if (start < 0) return null;
  let depth = 0;
  let opened = false;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') { depth += 1; opened = true; }
    else if (text[i] === '}') {
      depth -= 1;
      if (opened && depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function validateProtoContract(proto) {
  const text = String(proto);
  if (!/^syntax\s*=\s*"proto3";/mu.test(text)) fail('evolution.proto deve usare proto3.', 'EVOLUTION_PROTO_SYNTAX');
  if (!/^package\s+talos\.evolution\.v1;/mu.test(text)) fail('Package Protobuf v1 inatteso.', 'EVOLUTION_PROTO_PACKAGE');
  if (/\bmap\s*</u.test(text)) fail('Le mappe Protobuf non fanno parte del wire v1.', 'EVOLUTION_PROTO_MAP_FORBIDDEN');
  if (/google\.protobuf\.Any/u.test(text)) fail('google.protobuf.Any non è ammesso nel root protocol v1.', 'EVOLUTION_PROTO_ANY_FORBIDDEN');
  if (!text.includes('Serialized Protobuf bytes MUST NOT')) fail('Manca la regola anti-hash canonico sui byte Protobuf.', 'EVOLUTION_PROTO_CANONICAL_RULE_MISSING');

  for (const message of [
    'ProtocolVersion', 'HashDigest', 'RuntimeIdentity', 'ClientHello', 'SupervisorHello',
    'ProtocolReject', 'RuntimeReady', 'CandidateCreateRequest', 'CandidateFreezeRequest',
    'EvolutionStatusRequest', 'ProtocolError', 'Envelope',
  ]) {
    if (!new RegExp(`\\bmessage\\s+${message}\\s*\\{`, 'u').test(text)) {
      fail(`Messaggio Protobuf obbligatorio assente: ${message}.`, 'EVOLUTION_PROTO_MESSAGE_MISSING');
    }
  }

  const envelope = blockFrom(text, 'message Envelope');
  if (!envelope || !/\boneof\s+body\s*\{/u.test(envelope)) fail('Envelope.oneof body assente.', 'EVOLUTION_PROTO_ENVELOPE_INVALID');
  const tags = [...envelope.matchAll(/=\s*(\d+)\s*;/gu)].map((match) => Number(match[1]));
  const seen = new Set();
  for (const tag of tags) {
    if (seen.has(tag)) fail(`Tag Envelope duplicato: ${tag}.`, 'EVOLUTION_PROTO_TAG_DUPLICATE');
    seen.add(tag);
  }
  for (const expected of [1, 2, 3, 4, 10, 11, 12, 20, 21, 22, 23, 24, 30, 31, 34, 35, 40, 41, 42, 43, 90]) {
    if (!seen.has(expected)) fail(`Tag Envelope obbligatorio assente: ${expected}.`, 'EVOLUTION_PROTO_TAG_MISSING');
  }
  return { envelopeTags: tags.length };
}

export function validateWitContract(wit) {
  const text = String(wit);
  if (!/^package\s+talos:extension@0\.1\.0;/mu.test(text)) fail('Package WIT inatteso.', 'EVOLUTION_WIT_PACKAGE');
  if (!/\bworld\s+extension\s*\{/u.test(text)) fail('World WIT extension assente.', 'EVOLUTION_WIT_WORLD');

  const imports = [...text.matchAll(/^\s*import\s+([a-z][a-z0-9-]*)\s*;/gmu)].map((match) => match[1]).sort();
  const expected = ['git', 'state', 'ui', 'workspace'];
  if (JSON.stringify(imports) !== JSON.stringify(expected)) {
    fail(`Import WIT non consentiti: ${imports.join(', ') || '<nessuno>'}.`, 'EVOLUTION_WIT_IMPORTS');
  }

  for (const exported of ['describe', 'invoke-tool', 'invoke-action']) {
    if (!new RegExp(`^\\s*export\\s+${exported}:`, 'mu').test(text)) {
      fail(`Export WIT obbligatorio assente: ${exported}.`, 'EVOLUTION_WIT_EXPORT_MISSING');
    }
  }
  if (/^\s*import\s+(?:wasi|filesystem|sockets|network|process|environment)\b/gmu.test(text)) {
    fail('Import ambient WIT non ammesso.', 'EVOLUTION_WIT_AMBIENT_IMPORT');
  }
  return { imports };
}

export function validateProtocolReadme(readme) {
  const text = String(readme);
  for (const marker of [
    '4-byte little-endian unsigned payload length',
    '1 MiB',
    'PIPE_REJECT_REMOTE_CLIENTS',
    'Serialized Protobuf bytes are never the canonical cryptographic identity',
    'Never reuse a field number',
  ]) {
    if (!text.includes(marker)) fail(`Regola protocollo assente dal README: ${marker}.`, 'EVOLUTION_PROTOCOL_POLICY_MISSING');
  }
}

export async function verifyEvolutionContracts({
  protocolRoot = resolve(dirname(dirname(fileURLToPath(import.meta.url))), '../evolution-protocol'),
  readText = (path) => readFile(path, 'utf8'),
  listDir = (path) => readdir(path),
} = {}) {
  const schemaDir = resolve(protocolRoot, 'schemas');
  const names = (await listDir(schemaDir)).filter((name) => name.endsWith('.schema.json')).sort();
  const schemas = new Map();
  for (const name of names) {
    let parsed;
    try { parsed = JSON.parse(await readText(resolve(schemaDir, name))); }
    catch (error) { fail(`${name}: JSON non leggibile: ${error?.message ?? error}.`, 'EVOLUTION_SCHEMA_JSON_INVALID'); }
    schemas.set(name, parsed);
  }

  const schemaResult = validateSchemaSet(schemas);
  const protoResult = validateProtoContract(await readText(resolve(protocolRoot, 'proto/evolution.proto')));
  const witResult = validateWitContract(await readText(resolve(protocolRoot, 'wit/talos-extension.wit')));
  validateProtocolReadme(await readText(resolve(protocolRoot, 'README.md')));

  return Object.freeze({
    schemas: schemaResult.schemas,
    envelopeTags: protoResult.envelopeTags,
    witImports: witResult.imports,
  });
}

async function main() {
  const result = await verifyEvolutionContracts();
  process.stdout.write(
    `Contratti evoluzione verificati: ${result.schemas} schema, ${result.envelopeTags} tag Envelope, import WIT ${result.witImports.join(', ')}.\n`,
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Contratti evoluzione non validi.'}\n`);
    process.exitCode = 1;
  });
}
