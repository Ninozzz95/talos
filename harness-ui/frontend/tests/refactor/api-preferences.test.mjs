import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient, ApiError, publicProblem } from '../../src/services/api-client.ts';
import { createWorkspacePreferences, WORKSPACE_PREFERENCES_KEY as KEY, workspacePreferenceKey } from '../../src/services/workspace-preferences.ts';
const memory = initial => { const data = new Map(initial ?? []); return { data, getItem:k=>data.get(k) ?? null, setItem:(k,v)=>data.set(k,v) }; };
const envelope = (data, init) => Response.json({ok:true, data}, init);

test('API: JSON methods share the envelope and preserve path resolution', async () => {
  const calls = [], network = [];
  const api = createApiClient({ resolvePath:p=>'/embedded'+p, network:v=>network.push(v), fetchFn: async (...args)=>{calls.push(args); return envelope({value:1});} });
  assert.deepEqual(await api.get('/api/v1/sessions'), {value:1});
  assert.equal(calls[0][0], '/embedded/api/v1/sessions');
  assert.equal(calls[0][1].cache, 'no-store');
  await api.post('/api/v1/item', {text:'a'});
  assert.equal(calls[1][1].body, '{"text":"a"}');
  assert.equal(calls[1][1].headers['Content-Type'], 'application/json');
  for(const method of ['PATCH','DELETE','PUT']) await api.request(method, '/api/v1/item');
  assert.deepEqual(calls.map(c=>c[1].method), ['GET','POST','PATCH','DELETE','PUT']);
  assert.equal('body' in calls[3][1], false);
  assert.deepEqual(network,[true,true,true,true,true]);
});

test('API: HTTP failure is a reached server; problem fields survive but private fields do not', async () => {
  const network=[]; let calls=0;
  const api=createApiClient({network:v=>network.push(v),fetchFn:async()=>{calls++;return Response.json({ok:false,error:{code:'CTX_STALE_REVISION',message:'Rileggi',title:'Cambiato',explanation:'Una nuova revisione',action:'Aggiorna',riprovabile:true,doctorReference:'d1',secret:'NEVER'}},{status:409});}});
  await assert.rejects(api.get('/context'), error=>error instanceof ApiError && error.code==='CTX_STALE_REVISION' && error.status===409 && error.problem.action==='Aggiorna' && error.doctorReference==='d1' && !('secret' in error.problem));
  assert.deepEqual(network,[true]); assert.equal(calls,1,'no implicit retry');
});

test('API: wrong JSON returns a stable error and never exposes the raw body', async () => {
  const api=createApiClient({fetchFn:async()=>new Response('<html>private content</html>',{status:502})});
  await assert.rejects(api.get('/x'), e=>e.code==='INTERNAL_ERROR' && e.message==='Risposta locale non valida' && !JSON.stringify(e).includes('private content'));
});

test('API: cancellation in flight is not a network outage', async () => {
  const c=new AbortController(), network=[];
  const reason=new Error('view changed');
  const api=createApiClient({network:v=>network.push(v),fetchFn:async(_p,opts)=>new Promise((_r,reject)=>opts.signal.addEventListener('abort',()=>reject(opts.signal.reason),{once:true}))});
  const run=api.get('/x',{signal:c.signal});c.abort(reason);
  await assert.rejects(run,e=>e===reason); assert.deepEqual(network,[]);
});

test('API: a pre-cancelled request never reaches transport', async () => {
  let calls=0; const c=new AbortController();c.abort();
  const api=createApiClient({fetchFn:async()=>{calls++;return envelope(null);}});
  await assert.rejects(api.get('/x',{signal:c.signal}),{name:'AbortError'});assert.equal(calls,0);
});

test('API: abort during decoding cannot publish stale data', async () => {
  const c=new AbortController();
  const api=createApiClient({fetchFn:async()=>({ok:true,status:200,json:async()=>{c.abort();return {ok:true,data:'stale'};}})});
  await assert.rejects(api.get('/x',{signal:c.signal}),{name:'AbortError'});
});

test('API: serialization and observer errors are not network failures', async () => {
  let calls=0;const observations=[];
  const api=createApiClient({network:v=>{observations.push(v);throw Error('observer');},fetchFn:async()=>{calls++;return envelope('done');}});
  const circular={};circular.self=circular;
  await assert.rejects(api.post('/x',circular), TypeError);assert.equal(calls,0);assert.deepEqual(observations,[]);
  assert.equal(await api.get('/x'),'done');assert.deepEqual(observations,[true]);
});

test('API: genuine network failure is observed exactly once and retains original error', async () => {
  const err=new TypeError('offline'), observations=[];
  const api=createApiClient({network:v=>observations.push(v),fetchFn:async()=>{throw err;}});
  await assert.rejects(api.get('/x'),e=>e===err);assert.deepEqual(observations,[false]);
});

test('API: public problem normalizer does not spread arbitrary properties', () => {
  assert.deepEqual(publicProblem(null),{code:'INTERNAL_ERROR',message:'Richiesta locale non riuscita'});
  assert.deepEqual(publicProblem({code:'NO',message:'Stop',riprovabile:'true',data:{apiKey:'hidden'}}),{code:'NO',message:'Stop'});
});

test('PREFS: future data is never overwritten, even after explicit local edits', () => {
  const raw='{"version":9,"density":"future-value","custom":"keep exact"}';const storage=memory([[KEY,raw]]), prefs=createWorkspacePreferences(()=>storage);
  prefs.update({density:'compact'});prefs.setPreset('global','research');
  assert.equal(storage.data.get(KEY),raw);assert.equal(prefs.persistenceProblem,'future-version');assert.equal(prefs.read().density,'compact');assert.equal(prefs.persistent,false);
});

test('PREFS: damaged data is preserved byte-for-byte before an explicit replacement', () => {
  const raw='  {broken'; const storage=memory([[KEY,raw]]), prefs=createWorkspacePreferences(()=>storage);
  assert.equal(storage.data.size,1,'startup never writes');
  prefs.update({density:'compact'});
  assert.equal(storage.data.get(KEY+'.recovery.0'),raw);
  assert.equal(JSON.parse(storage.data.get(KEY)).density,'compact');assert.equal(prefs.persistent,true);
});

test('PREFS: full backup slots do not silently delete the damaged original', () => {
  const storage=memory([[KEY,'broken'],...Array.from({length:8},(_,i)=>[KEY+'.recovery.'+i,'previous '+i])]);
  const prefs=createWorkspacePreferences(()=>storage);prefs.update({restoreWorkspace:false});
  assert.equal(storage.data.get(KEY),'broken');assert.equal(prefs.persistenceProblem,'recovery-full');assert.equal(prefs.read().restoreWorkspace,false);
});

test('PREFS: a quota error reports temporary state and keeps stored preferences', () => {
  const raw='{"version":2,"density":"comfortable"}';
  const storage=memory([[KEY,raw]]);storage.setItem=()=>{throw Error('quota');};
  const prefs=createWorkspacePreferences(()=>storage);prefs.update({density:'compact'});
  assert.equal(prefs.persistenceProblem,'write-failed');assert.equal(prefs.read().density,'compact');assert.equal(storage.data.get(KEY),raw);
});

test('PREFS: explicit writes preserve newer unrelated values from another instance', () => {
  const storage=memory(), a=createWorkspacePreferences(()=>storage), b=createWorkspacePreferences(()=>storage);
  a.update({density:'compact'});b.setPreset('global','focus');
  assert.equal(b.read().density,'compact');assert.equal(JSON.parse(storage.data.get(KEY)).presets.global,'focus');
  a.update({restoreWorkspace:false});assert.equal(a.presetFor('global'),'focus');
});

test('PREFS: density adoption is visual only, one time, and never overrides a v2 choice', () => {
  const storage=memory(),prefs=createWorkspacePreferences(()=>storage);
  prefs.adoptLegacyDensity('compatta');prefs.adoptLegacyDensity('comoda');
  assert.equal(prefs.read().density,'compact');assert.equal(storage.data.size,0);
  prefs.update({density:'comfortable'});prefs.adoptLegacyDensity('compatta');assert.equal(prefs.read().density,'comfortable');
  const persisted=createWorkspacePreferences(()=>storage);persisted.adoptLegacyDensity('compatta');assert.equal(persisted.read().density,'comfortable');
});

test('PREFS: consumers receive the same change and can unsubscribe independently', () => {
  const prefs=createWorkspacePreferences(()=>memory());let a=0,b=0;
  const stop=prefs.subscribe(()=>a++);prefs.subscribe(()=>{throw Error('listener');});prefs.subscribe(()=>b++);
  prefs.update({density:'compact'});assert.equal(a,1);assert.equal(b,1);stop();prefs.update({density:'comfortable'});assert.equal(a,1);assert.equal(b,2);
});

test('PREFS: workspace keys share layouts across sessions while missing paths remain distinct', () => {
  assert.equal(workspacePreferenceKey('C:/Work/Talos/','a'),workspacePreferenceKey('c:\\Work\\Talos','b'));
  assert.notEqual(workspacePreferenceKey(null,'a'),workspacePreferenceKey(null,'b'));
  assert.notEqual(workspacePreferenceKey('/Case','a'),workspacePreferenceKey('/case','a'));
  assert.equal(workspacePreferenceKey(null,null),'global');
  const prefs=createWorkspacePreferences(()=>memory());prefs.setPreset('global','research');prefs.setPreset('session:a','focus');
  assert.equal(prefs.presetFor('unknown'),'research');assert.equal(prefs.presetFor('session:a'),'focus');assert.equal(prefs.presetFor('__proto__'),'research');
});
