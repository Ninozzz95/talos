import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const url=new URL('../../src/components/artifact-card.js',import.meta.url);
const api=await import(url.href).catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND'&&e.url===url.href)return{};throw e;});
const LIB='lib-00000000-0000-4000-8000-000000000001';
const PAGE='/api/v1/pagine/'+ 'c'.repeat(43)+'/Same.html';
const evento={id:'volatile30',titolo:'Exact <p> title',voceLibreriaId:LIB};
function dom(){const doc={body:{tagName:'body'},createElement:tag=>{const node=new EventTarget();Object.assign(node,{tagName:tag,children:[],attributes:{},dataset:{},style:{},hidden:false,isConnected:true,ownerDocument:doc});let disabled=false;Object.defineProperty(node,'disabled',{get:()=>disabled,set:v=>{disabled=v;if(v&&doc.activeElement===node)doc.activeElement=doc.body;}});node.focus=()=>doc.activeElement=node;node.append=(...a)=>node.children.push(...a);node.setAttribute=(k,v)=>node.attributes[k]=v;node.classList={add:()=>{}};node.insertBefore=(n,b)=>node.children.splice(node.children.indexOf(b),0,n);return node;}};doc.activeElement=doc.body;return doc;}
function setup(options={}){assert.equal(typeof api.creaCardArtefatto,'function');const calls=[],opened=[],navigations=[],tabs=[];const c=api.creaCardArtefatto({evento,sessionId:'session /雪',API:p=>p,fetchFn:async(...args)=>{calls.push(args);return{ok:true,json:async()=>({data:{indirizzo:PAGE}})};},apriFn:(...args)=>{opened.push(args);const tab={opener:{owner:true},closed:false,location:{replace:u=>navigations.push(u)},close(){this.closed=true;}};tabs.push(tab);return tab;},ancoraValida:()=>true,...options},{document:dom()});return Object.assign(c,{calls,opened,navigations,tabs});}
test('ARTIFACT30-UI-IDENTITY: exact session and Library id reach existing capability, never volatile URL or raw HTML',async()=>{
 const c=setup();assert.equal(c.apri.disabled,true);assert.equal(c.frame.hidden,true);await c.pronta;
 assert.equal(c.calls.length,1);assert.equal(c.calls[0][0],'/api/v1/sessions/session%20%2F%E9%9B%AA/pagine');assert.deepEqual(JSON.parse(c.calls[0][1].body),{voceId:LIB});assert.equal(c.calls[0][1].credentials,'same-origin');
 assert.equal(c.frame.src,PAGE);assert.equal(c.frame.hidden,false);assert.equal(c.apri.disabled,false);assert.equal(c.frame.attributes.sandbox,'allow-scripts');assert.equal(c.frame.attributes.referrerpolicy,'no-referrer');
 c.apri.dispatchEvent(new Event('click'));await c.apertura;assert.deepEqual(c.opened,[['about:blank','_blank']]);assert.deepEqual(c.navigations,[PAGE]);assert.equal(c.tabs[0].opener,null);
});
test('ARTIFACT30-UI-REPLAY: a fresh card resolves the saved Library reference again rather than caching a capability',async()=>{
 const a=setup(),b=setup();await Promise.all([a.pronta,b.pronta]);assert.equal(a.calls.length,1);assert.equal(b.calls.length,1);assert.deepEqual(a.calls[0],b.calls[0]);assert.equal(a.frame.src,PAGE);assert.equal(b.frame.src,PAGE);
});
test('ARTIFACT30-UI-DELETED: explicit error, no fallback, no retry and no opening after Library deletion',async()=>{
 let attempts=0;const c=setup({fetchFn:async()=>{attempts++;return{ok:false,status:404,json:async()=>({error:{message:'Questa voce non esiste più'}})};}});await c.pronta;
 assert.equal(attempts,1);assert.equal(c.frame.hidden,true);assert.equal(c.apri.disabled,true);assert.equal(c.frame.src,undefined);assert.match(c.stato.textContent,/non esiste più/);assert.match(c.stato.textContent,/Libreria/);assert.equal(c.stato.attributes.role,'status');
 c.apri.dispatchEvent(new Event('click'));assert.equal(c.opened.length,0);
});
test('ARTIFACT30-UI-INVALID: malformed explicit Library reference refuses fetch and never silently falls back',async()=>{
 for(const value of['../x',42,{},null,'']){let attempts=0;const c=setup({evento:{...evento,voceLibreriaId:value},fetchFn:async()=>attempts++});await c.pronta;assert.equal(attempts,0);assert.equal(c.apri.disabled,true);assert.equal(c.frame.src,undefined);assert.match(c.stato.textContent,/riferimento/i);}
});
test('ARTIFACT30-UI-FOREIGN-URL: malformed server capability cannot navigate outside the page route',async()=>{
 for(const indirizzo of ['https://evil.example','/api/v1/pagine/cap30/x.html',PAGE+'?other=1',PAGE.replace('Same.html','%2E%2E%2Fsecret'),PAGE.replace('Same.html','%zz')]){
 const c=setup({fetchFn:async()=>({ok:true,json:async()=>({data:{indirizzo}})})});await c.pronta;assert.equal(c.frame.src,undefined);assert.equal(c.apri.disabled,true);}
});
test('ARTIFACT30-UI-STALE: late response and open after session change have no effect',async()=>{
 let valid=true,release;const c=setup({ancoraValida:()=>valid,fetchFn:()=>new Promise(r=>release=r)});await Promise.resolve();valid=false;release({ok:true,json:async()=>({data:{indirizzo:PAGE}})});await c.pronta;assert.equal(c.frame.src,undefined);assert.equal(c.apri.disabled,true);
 const d=setup({ancoraValida:()=>valid});valid=true;await d.pronta;assert.equal(d.frame.src,PAGE);valid=false;d.apri.dispatchEvent(new Event('click'));assert.equal(d.opened.length,0);
});
test('ARTIFACT30-UI-UNMOUNT: a disconnected card cannot apply an asynchronous result',async()=>{
 let release;const c=setup({fetchFn:()=>new Promise(r=>release=r)});await Promise.resolve();c.card.isConnected=false;release({ok:true,json:async()=>({data:{indirizzo:PAGE}})});await c.pronta;assert.equal(c.frame.src,undefined);
});
test('ARTIFACT30-UI-LEGACY: old events keep live route with an honest temporary-preview warning',async()=>{
 const c=setup({evento:{id:'a /雪',titolo:'old'}});await c.pronta;assert.equal(c.calls.length,0);assert.equal(c.frame.src,'/api/v1/artifacts/a%20%2F%E9%9B%AA');assert.match(c.stato.textContent,/temporanea/);assert.equal(c.apri.disabled,false);
});
test('ARTIFACT30-UI-MOUNT: legacy card created before insertion still initializes its frame',async()=>{
 const doc=dom();const create=doc.createElement;doc.createElement=tag=>{const n=create(tag);n.isConnected=false;return n;};
 const c=api.creaCardArtefatto({evento:{id:'legacy',titolo:'old'},sessionId:'s'},{document:doc});c.card.isConnected=true;await c.pronta;assert.equal(c.frame.src,'/api/v1/artifacts/legacy');assert.equal(c.apri.disabled,false);
});
test('ARTIFACT30-UI-WIRING: app passes the event and captured session to the component; no event HTML interpolation',()=>{
 const app=readFileSync(new URL('../../src/legacy/app.js',import.meta.url),'utf8');assert.ok(/appendArtifactCard\(evento\)/.test(app));assert.ok(/creaCardArtefatto\(/.test(app));assert.ok(/state\.realSession\.id === sessionId/.test(app));
});
test('ARTIFACT30-UI-OPEN-RENEW: each explicit open renews a capability; blank tab has no opener while waiting',async()=>{
 let count=0,release;const fresh=PAGE.replace('c'.repeat(43),'d'.repeat(43));const c=setup({fetchFn:async()=>++count===1?{ok:true,json:async()=>({data:{indirizzo:PAGE}})}:new Promise(r=>release=r)});await c.pronta;
 c.apri.dispatchEvent(new Event('click'));await Promise.resolve();assert.equal(count,2);assert.equal(c.apri.disabled,true);assert.equal(c.tabs[0].opener,null);assert.deepEqual(c.navigations,[]);
 c.apri.dispatchEvent(new Event('click'));assert.equal(count,2);assert.equal(c.tabs.length,1);
 release({ok:true,json:async()=>({data:{indirizzo:fresh}})});await c.apertura;assert.deepEqual(c.navigations,[fresh]);assert.equal(c.apri.disabled,false);
});
test('ARTIFACT30-UI-OPEN-FAILED: failure closes the new tab, with no stale navigation, retry or fallback',async()=>{
 let count=0;const c=setup({fetchFn:async()=>++count===1?{ok:true,json:async()=>({data:{indirizzo:PAGE}})}:{ok:false,status:404,json:async()=>({error:{message:'Voce rimossa'}})}});await c.pronta;c.apri.dispatchEvent(new Event('click'));await c.apertura;
 assert.equal(count,2);assert.equal(c.tabs[0].closed,true);assert.deepEqual(c.navigations,[]);assert.match(c.stato.textContent,/Voce rimossa/);assert.equal(c.stato.hidden,false);
});
test('ARTIFACT30-UI-POPUP-BLOCKED: no renewal if a direct gesture cannot open a tab',async()=>{
 let count=0;const c=setup({apriFn:()=>null,fetchFn:async()=>{count++;return{ok:true,json:async()=>({data:{indirizzo:PAGE}})}}});await c.pronta;c.apri.dispatchEvent(new Event('click'));await c.apertura;assert.equal(count,1);assert.equal(c.stato.hidden,false);assert.match(c.stato.textContent,/browser/i);
});
test('ARTIFACT30-UI-OPEN-STALE: a session change during explicit renewal closes only the newly opened tab',async()=>{
 let valid=true,count=0,release;const c=setup({ancoraValida:()=>valid,fetchFn:async()=>++count===1?{ok:true,json:async()=>({data:{indirizzo:PAGE}})}:new Promise(r=>release=r)});await c.pronta;c.apri.dispatchEvent(new Event('click'));valid=false;release({ok:true,json:async()=>({data:{indirizzo:PAGE}})});await c.apertura;
 assert.equal(c.tabs[0].closed,true);assert.deepEqual(c.navigations,[]);assert.equal(count,2);
});
test('ARTIFACT30-UI-OPEN-FOCUS: renewal restores keyboard focus only when the person did not move elsewhere',async()=>{
 const c=setup();await c.pronta;c.apri.focus();c.apri.dispatchEvent(new Event('click'));await c.apertura;assert.equal(c.card.ownerDocument.activeElement,c.apri);
 let count=0,release;const d=setup({fetchFn:async()=>++count===1?{ok:true,json:async()=>({data:{indirizzo:PAGE}})}:new Promise(r=>release=r)});await d.pronta;d.apri.focus();d.apri.dispatchEvent(new Event('click'));const other={tagName:'input'};d.card.ownerDocument.activeElement=other;release({ok:true,json:async()=>({data:{indirizzo:PAGE}})});await d.apertura;assert.equal(d.card.ownerDocument.activeElement,other);
});
