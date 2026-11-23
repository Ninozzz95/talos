/*
 * R2 lane T (gate E3, Q-R2-3): every kernel tool has an English label, verb and argument labels, read from ONE table.
 * The kernel's own tool list is the oracle: the schemas are imported from `talosHarness.mjs` (ATTREZZI_OPENAI :1975,
 * ATTREZZI_ESTESI_OPENAI :3376) and `carica_skill` is read from its source (:9254), so a tool added to the kernel
 * without a row in the table turns this test red instead of reaching the screen as a raw name (review D-05).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {AREAS} from '../../src/i18n/en.ts';
import * as display from '../../src/tui/tool-display.ts';

const KERNEL_FILE=fileURLToPath(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url));
const kernel:any=await import(pathToFileURL(KERNEL_FILE).href);
const SKILL=/name: 'carica_skill',[\s\S]{0,400}?properties: \{ nome:/u.exec(readFileSync(KERNEL_FILE,'utf8'));
const KERNEL_TOOLS:Record<string,string[]>=Object.fromEntries([...kernel.ATTREZZI_OPENAI,...kernel.ATTREZZI_ESTESI_OPENAI]
  .map((tool:any)=>[tool.function.name,Object.keys(tool.function.parameters?.properties??{})]));
if(SKILL)KERNEL_TOOLS.carica_skill=['nome'];

/* Copied from cli/test/acceptance/checks.ts ITALIAN_WORDS (lane D owns that file), plus the gate §1.3 inventory: the 8
   Italian tool names, their humanised words, and the 11 Italian argument keys. */
const ITALIAN=['interrotto','richiesta','fornitore','traffico','giro','leggi','scrivi','percorso','contenuto','comando','tipo','catalogo','modelli','Agente esterno',"l'owner",'nessuna risposta',
  'elenca','cerca','prova','naviga','delega_sottotask','delega','sottotask','carica_skill','carica',
  'descrizione','testo','nome','titolo','cartella','parte','affermazioni','fonti',
  /* G02: the unified kernel's new Italian argument keys (continua: F001b, desktop 7d0d34b43). */
  'dentro','modalita','azione','continua',
  /* C2b: the optional model of a sub-agent (delega_sottotask), 08/10/2026 */
  'modello',
  /* r4 (09/10/2026): the Italian keys of the automation tools */
  'istruzioni','pianificazione','permessi','coordinazione','ripeti','contesto','prossimo giro'];
function italianOn(text:string):string[]{return ITALIAN.filter(word=>new RegExp(`(^|[^\\p{L}])${word.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}([^\\p{L}]|$)`,'iu').test(text));}

test('R2 T + G02: the unified kernel exposes 71 tools with 98 argument keys (gate §1.3 measured 46 and 53 before G02; F001b added continua; F-020 list_children and stop_child; BUG-14 added timeout and background to shell and prova; C2b added modello to delega_sottotask; r4 added 3 provider and 8 automation tools with 9 keys; the shell\'s network added network)',()=>{
  assert.ok(SKILL,'carica_skill is still declared in talosHarness.mjs');
  /* C5 and the ChatGPT plan (realigned 13/10/2026 to r4 de8f33317): 77 tools and 88 keys became 68 and 95 — eighteen list/search/command tools
     became eight (`*_find`, `*_control`), `chatgpt_account` is new, and the find tools page (`sort`, `limit`, `cursor`, `response_format`…). */
  /* r4 2bd1b3e27 (G6): goal_status, goal_create, goal_update — 68 became 71 */
  /* r4 feat/remoto-modulo (fused 19/10/2026): file_changes_undo and the three phone tools — 71 became 75 */
  /* r4 integra/2026-10-25 (realigned 25/10/2026): artifact_update, remote_control, the three device-folder tools and remote_device_send_file — 75 became 81 */
  /* r4 c5ce4e453 (the window that grows): local_model_window — 81 became 82 */
  /* blocked folders step B (Desktop block 11 7321786af): remote_phone_folder_unblock — 82 became 83 */
  /* r4 blocks 13-18: view_image, local_page, report_problem — 83 became 86 */
  /* r4 candidate d387110d1: talos_help, app_settings, local_model — 86 became 89 */
  /* candidate 04/11/2026 (FE-008): steps_update — 89 became 90 */
  /* candidate f304d1c9a (computer use): computer_use_places_list and computer_use_places_remove — 90 became 92 */
  /* candidate bb3c61b4d (realigned 06/11/2026): computer_use (decision 129) and browser_page (decision 201) — 92 became 94 */
  /* «One line», step 3 (measured 11/11/2026 on the line): kernel 90050ecf1 (FE-081 scene 1+4) declares blocco_aggiorna — 94 became 95 */
  assert.equal(Object.keys(KERNEL_TOOLS).length,95);
  /* and their keys objective, criteria, reason (status was already there): 95 became 98 */
  /* and their keys from_turn, include, phone: 98 became 101 */
  /* and the new tools' keys: 101 became 106 */
  /* and its key tokens: 106 became 107 */
  /* and their keys port, look, kind: 107 became 110 */
  /* and the keys of those three tools: 110 became 115 */
  /* and its key steps (FE-008): 115 became 116 */
  /* and the places' key type (computer_use_places_remove; name was already there, measured): 116 became 117 */
  /* computer_use's one key `task` was already delega_sottotask's, browser_page has none (measured 06/11/2026): still 117 */
  /* and blocco_aggiorna's keys blocco, sorgente, modifiche (measured 11/11/2026): 117 became 120 */
  /* the kernel of desktop 0.2.4 (block 6, 4cc08aa10): naviga's key images (the page's photos) is new; view_image's new key url was
     already naviga's (measured 20/11/2026): 120 became 121 */
  assert.equal(new Set(Object.values(KERNEL_TOOLS).flat()).size,121);
  assert.deepEqual(KERNEL_TOOLS.naviga,['url','images']);
  assert.ok(KERNEL_TOOLS.view_image.includes('url'),'view_image declares the web address of the image');
  assert.equal((display as any).argumentLabel('images'),'page images');
  assert.deepEqual(KERNEL_TOOLS.blocco_aggiorna,['blocco','sorgente','modifiche']);
  assert.deepEqual(KERNEL_TOOLS.computer_use,['task']);
  assert.deepEqual(KERNEL_TOOLS.browser_page,[]);
  /* child_control's enum gained 'retry' (decisions 198-199): the key still reads "action", the value is an English word */
  assert.equal((display as any).argumentLabel('action'),'action');
  /* Owner 09/10/2026 («Segue il modo + si chiede»): the model asks for the network of one command with `network`. */
  assert.equal((display as any).argumentLabel('network'),'network');
  /* C2b (desktop, realigned 08/10/2026 to 06b4dc0a4): the one new key is the optional model of a sub-agent, and it is an Italian word: it reads "model" on the screen. */
  assert.ok(KERNEL_TOOLS.delega_sottotask.includes('modello'),'delega_sottotask declares the optional model');
  assert.equal((display as any).argumentLabel('modello'),'model');
  /* BUG-14 (desktop, realigned 08/10/2026 to 156689e4e): the two keys are the only difference, and both are plain English words on the screen. */
  assert.deepEqual(KERNEL_TOOLS.shell,['comando','descrizione','timeout','background','network']);
  assert.deepEqual(KERNEL_TOOLS.prova,['timeout','background']);
  assert.deepEqual(['timeout','background'].map(key=>(display as any).argumentLabel(key)),['timeout','background']);
});

test('R2 T: every kernel tool has a row in the one table, and the table has no row the kernel does not know',()=>{
  const table=(display as any).KERNEL_TOOL_NAMES as readonly string[];
  assert.ok(Array.isArray(table),'tool-display.ts exports KERNEL_TOOL_NAMES');
  assert.deepEqual([...table].sort(),Object.keys(KERNEL_TOOLS).sort());
  for(const name of Object.keys(KERNEL_TOOLS))assert.equal((display as any).isKernelTool(name),true,name);
  assert.equal((display as any).isKernelTool('Read'),false,'a renderer key is not a kernel tool');
});

test('R2 T: every kernel tool is shown with an English label and verb, never its raw name (Q-R2-3)',()=>{
  const failures:string[]=[];
  for(const name of Object.keys(KERNEL_TOOLS)){
    const view=display.toolDisplay(name);
    if(view.raw!==name)failures.push(`${name}: raw is ${view.raw}`);
    for(const [field,text] of [['label',view.label],['verb',view.verb]] as const){
      if(!text||/_/u.test(text))failures.push(`${name}: ${field} ${JSON.stringify(text)} is empty or a code`);
      const found=italianOn(text);if(found.length)failures.push(`${name}: ${field} ${JSON.stringify(text)} has Italian ${found.join(', ')}`);
    }
  }
  assert.deepEqual(failures,[]);
  assert.equal(display.toolDisplay('shell').label,'Shell','Q-R2-3: the shell is shown as "Shell"');
  assert.equal(display.toolDisplay('leggi').label,'Read file','Q-R2-3: "Read file  src/app.ts"');
});

test('R2 T: every argument key of every kernel tool has an English label',()=>{
  const failures:string[]=[];
  for(const [name,keys] of Object.entries(KERNEL_TOOLS))for(const key of keys){
    const label=(display as any).argumentLabel(key) as string;
    if(!label||/_/u.test(label)||italianOn(label).length)failures.push(`${name}.${key}: ${JSON.stringify(label)}`);
  }
  assert.deepEqual(failures,[]);
  assert.deepEqual(['percorso','contenuto','comando'].map(key=>(display as any).argumentLabel(key)),['path','content','command']);
});

test('candidate bb3c61b4d: computer_use and browser_page reach the screen with their own English label and verb',()=>{
  const use=display.toolDisplay('computer_use',{task:'Open the calculator'});
  assert.deepEqual([use.label,use.verb,use.primaryArg],['Use the computer','Using the computer','Open the calculator']);
  const page=display.toolDisplay('browser_page',{});
  assert.deepEqual([page.label,page.verb,page.primaryArg],['Browser page','Reading the Browser page',null]);
  const retry=display.toolDisplay('child_control',{action:'retry',childId:'c1'});
  assert.equal(retry.primaryArg,'retry');
});

test('R2 T: the primary argument is the value the screen shows beside the label',()=>{
  assert.equal(display.toolDisplay('leggi',{percorso:'src/app.ts'}).primaryArg,'src/app.ts');
  assert.equal(display.toolDisplay('shell',{comando:'npm test',descrizione:'Run the tests'}).primaryArg,'npm test');
  assert.equal(display.toolDisplay('cerca',{nome:'app.ts'}).primaryArg,'app.ts','cerca falls back from testo to nome');
  assert.equal(display.toolDisplay('prova',{}).primaryArg,null,'a tool without arguments has no primary argument');
  assert.equal(display.toolDisplay('leggi').primaryArg,null,'no arguments, no value');
  assert.equal(display.toolDisplay('document_create',{report:{blocks:[]}}).primaryArg,null,'an object is never a primary argument');
});

test('R2 T: each kernel tool names the permission tool the engine judges it as',()=>{
  const expected:Record<string,string>={view_image:'Read',elenca:'Read',cerca:'Read',leggi:'Read',scrivi:'Write',research_deposit:'Write',file_edit:'Edit',shell:'Bash',prova:'Bash',naviga:'WebFetch',web_search:'WebFetch'};
  for(const name of Object.keys(KERNEL_TOOLS))assert.equal(display.toolDisplay(name).permissionTool,expected[name]??'TalosService',name);
});

test('R2 T: an unknown tool (MCP, plugin, forged, other) gets a humanised English name and keeps its raw name',()=>{
  const cases:[string,string,string][]=[
    ['mcp__github__create_issue','Create issue (github MCP)','Mcp'],
    ['plugin__lint__run_check','Run check (lint plugin)','Plugin'],
    ['forge_log-water-intake','Log water intake (forged tool)','TalosService'],
    ['fetchWeatherReport','Fetch weather report','TalosService'],
  ];
  for(const [name,label,permission] of cases){
    const view=display.toolDisplay(name);
    assert.deepEqual([view.label,view.raw,view.permissionTool],[label,name,permission],name);
  }
  assert.equal(display.toolDisplay('mcp__github__get_file',{path:'README.md'}).primaryArg,'README.md','an unknown tool shows a path-like argument');
});

test('R2 T: every word of the tools area of the dictionary is English',()=>{
  const failures=Object.entries(AREAS.tools).filter(([,text])=>italianOn(text).length).map(([id,text])=>`${id}: ${text}`);
  assert.deepEqual(failures,[]);
  assert.ok(Object.keys(AREAS.tools).every(id=>id.startsWith('tool.')),'every id of the tools area starts with tool.');
});

/* C5 (r4 de8f33317): the names of before stay readable — an approval card for a command keeps its old type, a saved conversation shows them. */
test('C5: the names of before are exactly the kernel\'s own rename map, each with an English label, and none is a kernel tool',()=>{
  const legacy=(display as any).LEGACY_TOOL_NAMES as readonly string[];
  assert.deepEqual([...legacy].sort(),Object.keys(kernel.ATTREZZI_RINOMINATI).sort());
  for(const name of legacy){
    assert.equal((display as any).isKernelTool(name),false,`${name} is no longer offered to the model`);
    assert.equal((display as any).isKnownTool(name),true,name);
    const view=display.toolDisplay(name,{childId:'c-1',id:'r-1',query:'q'});
    assert.notEqual(view.label,name);assert.doesNotMatch(view.label,/_/u,`${name} is shown as words`);
    assert.equal(view.permissionTool,'TalosService');
    assert.ok(Object.hasOwn(KERNEL_TOOLS,kernel.ATTREZZI_RINOMINATI[name].nuovo),`${name} points to a tool the kernel declares`);
  }
  assert.equal(display.toolDisplay('stop_child',{childId:'c-1'}).primaryArg,'c-1');
  assert.equal(display.toolDisplay('child_control',{childId:'c-1',action:'stop'}).primaryArg,'stop');
  assert.equal((display as any).isKnownTool('Read'),false);
});

test('0.6.11: the three tools of the deferred-tools bridge are exactly the kernel\'s, each with an English label, and none is a kernel tool',async()=>{
  const bridge:any=await import(pathToFileURL(fileURLToPath(new URL('../../../harness-ui/src/kernel/ponte-attrezzi.mjs',import.meta.url))).href);
  const names=(display as any).BRIDGE_TOOL_NAMES as readonly string[];
  assert.deepEqual([...names].sort(),[...bridge.NOMI_DEL_PONTE].sort());
  for(const name of names){
    assert.equal((display as any).isKernelTool(name),false,name);
    assert.equal((display as any).isKnownTool(name),true,name);
    const view=display.toolDisplay(name,{name:'notes_create',queries:['notes create']});
    assert.notEqual(view.label,name);assert.doesNotMatch(view.label,/_/u,`${name} is shown as words`);
    assert.equal(view.permissionTool,'TalosService');
  }
  assert.equal(display.toolDisplay('tool_search').label,'Find tools');
});
