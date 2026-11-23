/*
 * C1R (RICERCA-5x5x5x5-OTTIMIZZAZIONE-CLI-2026-10-05, "Piano cure raffinato" point 1) — the provider-readiness
 * snapshot: the local disk snapshot the resume reads so the session shows at once and the provider's readiness is
 * verified in the background (stale-while-revalidate, web.dev/articles/stale-while-revalidate; codex models-manager
 * `OnlineIfUncached`; hermes `cache_only` callers "still get a warm catalog").
 *
 * The snapshot is pure local I/O: no network, no key material ever persisted, and every failure reads as
 * "not verified" — the fail-closed side of the declared risk (a provider shown ready when it is not).
 *
 * NOTE (anchor naming): `harness-ui/src/provider-state-anchor.mjs` already exists with ANOTHER contract (P4: the
 * provider-state anchor inside the journal's history). This module is deliberately separate and lives on the CLI
 * side, where the resume path and the status bar read it.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {
  PROVIDER_STATE_SCHEMA,DEFAULT_PROVIDER_STATE_TTL_MS,
  readProviderStateSnapshot,writeProviderStateSnapshot,isProviderStateFresh,providerStateFromProbe,
} from '../../src/provider/provider-state-snapshot.ts';

function tempFolder(t:import('node:test').TestContext){
  const root=mkdtempSync(join(tmpdir(),'talos-provider-state-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return root;
}

test('C1R-S1: a missing snapshot reads as missing, with no provider state invented',t=>{
  const root=tempFolder(t);
  const read=readProviderStateSnapshot({file:join(root,'provider-state.json')});
  assert.equal(read.missing,true);
  assert.equal(read.savedAt,null);
  assert.deepEqual(read.providers,{});
});

test('C1R-S2: a written snapshot round-trips: same entries, savedAt stamped, not missing',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  const providers={
    openrouter:{state:'available' as const,verified:false,checkedAt:1_000,latencyMs:120},
    ollama:{state:'unverified' as const,verified:null,checkedAt:2_000,latencyMs:null},
  };
  assert.equal(writeProviderStateSnapshot({file,now:3_000,providers}),true);
  const read=readProviderStateSnapshot({file});
  assert.equal(read.missing,false);
  assert.equal(read.savedAt,3_000);
  assert.equal(read.providers.openrouter?.state,'available');
  assert.equal(read.providers.openrouter?.checkedAt,1_000);
  assert.equal(read.providers.ollama?.state,'unverified');
  assert.equal(read.providers.ollama?.verified,null);
});

test('C1R-S3: a corrupt snapshot file fails toward missing, never toward a state',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  writeFileSync(file,'{not json at all','utf8');
  const read=readProviderStateSnapshot({file});
  assert.equal(read.missing,true);
  assert.deepEqual(read.providers,{});
});

test('C1R-S4: a snapshot of another schema is not this snapshot: missing',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  writeFileSync(file,JSON.stringify({schema:'someone.elses.v9',savedAt:1,providers:{openrouter:{state:'available',checkedAt:1}}}),'utf8');
  const read=readProviderStateSnapshot({file});
  assert.equal(read.missing,true);
  assert.deepEqual(read.providers,{});
});

test('C1R-S5: an entry of the wrong shape is dropped; a sound entry survives',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  writeProviderStateSnapshot({file,now:1_000,providers:{
    openrouter:{state:'available',verified:false,checkedAt:900,latencyMs:5},
    broken:{state:'somehow',verified:false,checkedAt:900},
    keyless:{checkedAt:900},
  } as any});
  const read=readProviderStateSnapshot({file});
  assert.deepEqual(Object.keys(read.providers),['openrouter']);
});

test('C1R-S6: freshness: within the TTL fresh, beyond it stale, without a checkedAt never fresh',()=>{
  const entry={state:'available' as const,verified:false,checkedAt:1_000,latencyMs:5};
  assert.equal(isProviderStateFresh(entry,1_000+DEFAULT_PROVIDER_STATE_TTL_MS-1),true);
  assert.equal(isProviderStateFresh(entry,1_000+DEFAULT_PROVIDER_STATE_TTL_MS),false);
  assert.equal(isProviderStateFresh({state:'available'} as any,1_000),false);
  assert.equal(isProviderStateFresh(null,1_000),false);
});

test('C1R-S7: the kernel probe answer maps to a snapshot entry, and to nothing when it cannot be read',()=>{
  const now=7_000;
  /* review of 0.6.2 (B1): the kernel's three verdicts (provider-probe.mjs, CLI-REQ-06). No verdict or `null` = there was no key to
     judge (a local engine): reached, and nothing says the key was left unjudged. `false` with `collegato` = a public catalogue,
     which says nothing of the key: that is «not verified», in the state itself. */
  assert.deepEqual(providerStateFromProbe({provider:'ollama',esito:'collegato',millisecondi:42,httpStatus:200},now),
    {state:'available',verified:null,checkedAt:now,latencyMs:42});
  assert.deepEqual(providerStateFromProbe({provider:'ollama',esito:'collegato',credenzialeVerificata:null,millisecondi:42},now),
    {state:'available',verified:null,checkedAt:now,latencyMs:42});
  assert.deepEqual(providerStateFromProbe({provider:'deepinfra',esito:'collegato',credenzialeVerificata:false,millisecondi:42},now),
    {state:'unverified',verified:false,checkedAt:now,latencyMs:42});
  assert.deepEqual(providerStateFromProbe({provider:'openrouter',esito:'collegato',credenzialeVerificata:true,millisecondi:42},now),
    {state:'available',verified:true,checkedAt:now,latencyMs:42});
  assert.equal(providerStateFromProbe({provider:'openrouter',esito:'irraggiungibile',millisecondi:9},now)?.state,'unavailable');
  assert.equal(providerStateFromProbe({provider:'openrouter',esito:'non-autorizzato',credenzialeVerificata:false},now)?.state,'unavailable');
  assert.equal(providerStateFromProbe({provider:'openrouter',esito:'errore',httpStatus:500},now)?.state,'unavailable');
  assert.equal(providerStateFromProbe({provider:'openrouter',esito:'non-provabile'},now)?.state,'unverified');
  assert.equal(providerStateFromProbe({provider:'openrouter',esito:'non-sondabile'},now)?.state,'unverified');
  assert.equal(providerStateFromProbe(null,now),null);
  assert.equal(providerStateFromProbe({provider:'openrouter'},now),null);
});

test('C1R-S8: the snapshot never holds key material: only state, verified, checkedAt and latencyMs are written',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  const secret='sk-or-v1-0123456789abcdefSECRET';
  const entry=providerStateFromProbe({provider:'openrouter',esito:'collegato',millisecondi:10,motivo:`OpenRouter accepted ${secret}`},1_000);
  assert.ok(entry);
  writeProviderStateSnapshot({file,now:1_000,providers:{openrouter:entry}});
  const text=readFileSync(file,'utf8');
  assert.ok(!text.includes(secret),'the probe detail (and with it anything credential-shaped) must not reach the snapshot');
  assert.deepEqual(Object.keys(JSON.parse(text).providers.openrouter).sort(),['checkedAt','latencyMs','state','verified']);
});

test('C1R-S9: the write is atomic (no temporary left behind) and a failed write never throws nor destroys the old snapshot',t=>{
  const root=tempFolder(t);
  const file=join(root,'provider-state.json');
  writeProviderStateSnapshot({file,now:1_000,providers:{openrouter:{state:'available',verified:false,checkedAt:900,latencyMs:5}}});
  assert.deepEqual(readdirSync(root).filter(name=>name.includes('.tmp-')),[]);
  assert.equal(writeProviderStateSnapshot({file:join(root,'no','such','folder','provider-state.json'),now:1_000,providers:{}}),false);
  assert.equal(readProviderStateSnapshot({file}).providers.openrouter?.state,'available');
});

test('C1R-S10: the schema constant is declared for the writer and the reader to agree on',()=>{
  assert.equal(PROVIDER_STATE_SCHEMA,'talos.cli.provider-state.v1');
});
