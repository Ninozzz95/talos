import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startNodeProbe} from '../probes/node-probe.mjs';
async function fixture(fn) {const d=await fs.mkdtemp(path.join(os.tmpdir(),'node-probe-fixture-'));try{await fn(d);}finally{await fs.rm(d,{recursive:true,force:true});}}
test('probe requires an explicit absolute output path',async()=>{await assert.rejects(startNodeProbe({directory:'relative'}));});
test('probe rejects invalid sampling configuration',()=>fixture(async d=>{for(const intervalMs of [0,10,NaN,1.5])await assert.rejects(startNodeProbe({directory:d,intervalMs}));await assert.rejects(startNodeProbe({directory:d,maxPendingSamples:0}));}));
test('real Node probe writes complete process-local trace',()=>fixture(async d=>{const p=await startNodeProbe({directory:d,intervalMs:25});await delay(85);const end=await p.stop();assert.equal(end.complete,true);const rows=(await fs.readFile(p.file,'utf8')).trim().split('\n').map(JSON.parse);assert.equal(rows[0].event,'probe_start');assert.equal(rows.at(-1).event,'probe_stop');assert.ok(rows.some(r=>r.event==='sample'&&r.rss_bytes>0));assert.ok(rows.every(r=>r.scope==='single_node_process'));}));
test('bounded queue accounts for discarded probe samples',()=>fixture(async d=>{const p=await startNodeProbe({directory:d,intervalMs:100000,maxPendingSamples:1});let drops=0;for(let i=0;i<20;i++)if(!p.sample())drops++;const end=await p.stop();assert.ok(drops>0);assert.equal(end.dropped_samples,drops);}));
test('stop is idempotent and sampling stops',()=>fixture(async d=>{const p=await startNodeProbe({directory:d});const a=await p.stop(),b=await p.stop();assert.deepEqual(a,b);assert.equal(p.sample(),false);}));
test('parallel probes cannot overwrite each other',()=>fixture(async d=>{const a=await startNodeProbe({directory:d}),b=await startNodeProbe({directory:d});assert.notEqual(a.file,b.file);await Promise.all([a.stop(),b.stop()]);}));
test('probe does not record environment values or process arguments',()=>fixture(async d=>{process.env.AUDIT_TEST_SECRET='SENSITIVE_TEST_SENTINEL';try{const p=await startNodeProbe({directory:d});p.sample();await p.stop();const text=await fs.readFile(p.file,'utf8');assert.ok(!text.includes(process.env.AUDIT_TEST_SECRET));assert.ok(!text.includes('argv'));assert.ok(!text.includes('cwd'));}finally{delete process.env.AUDIT_TEST_SECRET;}}));
