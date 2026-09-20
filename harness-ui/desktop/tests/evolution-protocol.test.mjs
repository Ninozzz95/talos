import test from 'node:test';
import assert from 'node:assert/strict';

import {
  EvolutionContractError,
  validateProtoContract,
  validateProtocolReadme,
  validateSchemaSet,
  validateWitContract,
  verifyEvolutionContracts,
} from '../scripts/verifica-contratti-evoluzione.mjs';

test('E0-2 — i contratti Evolution v1 reali sono coerenti e chiusi', async () => {
  const result = await verifyEvolutionContracts();
  assert.equal(result.schemas, 8);
  assert.ok(result.envelopeTags >= 20);
  assert.deepEqual(result.witImports, ['git', 'state', 'ui', 'workspace']);
});

function minimalSchema(id, version = 'talos.evolution.test.v1') {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: id,
    type: 'object',
    additionalProperties: false,
    required: ['schema'],
    properties: { schema: { const: version } },
  };
}

test('E0-2 AL CONTRARIO — un $ref locale irrisolto viene rifiutato', () => {
  const files = new Map([
    ['common.schema.json', {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://talos.local/evolution/schemas/common.schema.json',
      $defs: { id: { type: 'string' } },
    }],
    ['feature-contract.schema.json', {
      ...minimalSchema('https://talos.local/evolution/schemas/feature-contract.schema.json', 'talos.evolution.feature-contract.v1'),
      properties: {
        schema: { const: 'talos.evolution.feature-contract.v1' },
        id: { $ref: 'common.schema.json#/$defs/nonexistent' },
      },
    }],
  ]);
  for (const name of [
    'semantic-changeset.schema.json', 'runtime-manifest.schema.json', 'extension-manifest.schema.json',
    'ui-contribution.schema.json', 'verification-dossier.schema.json', 'lineage-attestation.schema.json',
  ]) files.set(name, minimalSchema(`https://talos.local/evolution/schemas/${name}`, `talos.evolution.${name.replace('.schema.json', '')}.v1`));

  assert.throws(
    () => validateSchemaSet(files),
    (error) => error instanceof EvolutionContractError && error.code === 'EVOLUTION_SCHEMA_REF_MISSING',
  );
});

test('E0-2 AL CONTRARIO — due schema non possono condividere lo stesso $id', () => {
  const common = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://talos.local/evolution/schemas/common.schema.json',
    $defs: {},
  };
  const files = new Map([['common.schema.json', common]]);
  for (const name of [
    'feature-contract.schema.json', 'semantic-changeset.schema.json', 'runtime-manifest.schema.json',
    'extension-manifest.schema.json', 'ui-contribution.schema.json',
    'verification-dossier.schema.json', 'lineage-attestation.schema.json',
  ]) {
    files.set(name, minimalSchema('https://talos.local/evolution/schemas/duplicato.schema.json', `talos.evolution.${name.replace('.schema.json', '')}.v1`));
  }
  assert.throws(
    () => validateSchemaSet(files),
    (error) => error instanceof EvolutionContractError && error.code === 'EVOLUTION_SCHEMA_ID_DUPLICATE',
  );
});

test('E0-2 AL CONTRARIO — map e Any non entrano nel root protocol Protobuf', () => {
  const valid = [
    'syntax = "proto3";',
    'package talos.evolution.v1;',
    '// Serialized Protobuf bytes MUST NOT be canonical.',
    ...['ProtocolVersion','HashDigest','RuntimeIdentity','ClientHello','SupervisorHello','ProtocolReject','RuntimeReady','CandidateCreateRequest','CandidateFreezeRequest','EvolutionStatusRequest','ProtocolError'].map((n) => `message ${n} {}`),
    'message Envelope {',
    ' uint32 protocol_version = 1; string connection_id = 2; string message_id = 3; string trace = 4;',
    ' oneof body { string a = 10; string b = 11; string c = 12; string d = 20; string e = 21; string f = 22; string g = 23; string h = 24; string i = 30; string j = 31; string k = 34; string l = 35; string m = 40; string n = 41; string o = 42; string p = 43; string q = 90; }',
    '}',
  ].join('\n');
  assert.throws(() => validateProtoContract(valid + '\nmessage Bad { map<string,string> x = 1; }'), /mappe Protobuf/i);
  assert.throws(() => validateProtoContract(valid + '\nmessage Bad { google.protobuf.Any x = 1; }'), /Any/);
});

test('E0-2 AL CONTRARIO — un import ambient aggiunto al WIT viene rifiutato', () => {
  const wit = [
    'package talos:extension@0.1.0;',
    'world extension {',
    ' import workspace;',
    ' import git;',
    ' import state;',
    ' import ui;',
    ' import network;',
    ' export describe: func();',
    ' export invoke-tool: func();',
    ' export invoke-action: func();',
    '}',
  ].join('\n');
  assert.throws(
    () => validateWitContract(wit),
    (error) => error instanceof EvolutionContractError && error.code === 'EVOLUTION_WIT_IMPORTS',
  );
});

test('E0-2 AL CONTRARIO — la policy deve dire esplicitamente che Protobuf non è canonical hashing', () => {
  assert.throws(
    () => validateProtocolReadme('4-byte little-endian unsigned payload length\n1 MiB\nPIPE_REJECT_REMOTE_CLIENTS\nNever reuse a field number'),
    (error) => error instanceof EvolutionContractError && error.code === 'EVOLUTION_PROTOCOL_POLICY_MISSING',
  );
});
