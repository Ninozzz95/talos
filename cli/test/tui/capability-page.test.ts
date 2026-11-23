/* C8 of the redesign: Capability. The tools of the last request with the PC's estimate, the facades' rows with their badges, and each key a real action. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {capabilitySheet,sheetStep,type SheetState} from '../../src/tui/panel/commands.ts';
import {capabilityTools,toolTokens,type CapabilityData} from '../../src/tui/panel/capability-page.ts';
import {asPage,pageRows} from '../../src/tui/panel/page.ts';
import {panelKey} from '../../src/tui/panel/sheet.ts';

const text=(row:readonly {text:string}[])=>row.map(segment=>segment.text).join('');
const all=(rows:readonly (readonly {text:string}[])[])=>rows.map(text).join('\n');
const press=(sheet:SheetState,key:string)=>sheetStep(sheet,panelKey(sheet.panel,{name:key}));
const TOOLS=[{type:'function',function:{name:'leggi_file',description:'Reads a file of the project.\nMore words.',parameters:{type:'object'}}},{type:'function',function:{name:'mcp__github__issues',description:'Lists issues',parameters:{}}},{nonsense:true}];
const trust=(trusted:boolean)=>({projectTrusted:true,state:trusted?'trusted':'added',trusted,currentFingerprint:null,trustedFingerprint:null,changed:false});
const DATA:CapabilityData={tools:capabilityTools(TOOLS),skills:[],
  connectors:[{id:'github',launch:{command:'npx',argumentCount:1},trust:trust(true),permission:{configuredAllowlist:[],effectiveTools:['issues'],missingAllowlistedTools:[],perCallApproval:'not-applied'},health:{state:'healthy',checkedAt:null,latencyMs:42,phase:null,message:null},server:{name:'gh',version:'1.0'},protocol:null,capabilities:null,logs:[]}] as any,
  plugins:[{id:'p1',name:'prettier-guard',description:'Formats',trust:{projectTrusted:true,scopeTrusted:true,effectiveTrusted:false},quarantine:{active:true,reason:'by hand',quarantinedAt:null,reviewedFingerprint:null},guardError:null}] as any,
  hooks:[{id:'fmt',events:['after-tool'],launch:{command:'prettier --write'},trust:trust(false),quarantine:{active:false,reason:null,quarantinedAt:null,reviewedFingerprint:null},lastExecutions:[],lastDryRun:null}] as any};

test('the tools are those of the last request, estimated as the PC does, and a malformed one is left out',()=>{
  assert.deepEqual(DATA.tools!.map(tool=>tool.name),['leggi_file','mcp__github__issues']);
  assert.equal(DATA.tools![0]!.tokens,Math.ceil(Buffer.byteLength(JSON.stringify(TOOLS[0]),'utf8')/3.5));
  assert.equal(toolTokens({a:'é'}),Math.ceil(Buffer.byteLength('{"a":"é"}','utf8')/3.5),'bytes, not characters');
  const shown=all(pageRows(asPage(capabilitySheet(DATA)).panel,120,24));
  assert.match(shown,/── Capability Tools, skills and connectors/u);assert.match(shown,/Tools +Skills +Connectors +Plugins +Hooks/u);
  assert.match(shown,/2 tools offered in the last request · ~\d+ tokens of schema per turn \(estimate\)/u);
  assert.match(shown,/Reads a file of the project\./u);assert.doesNotMatch(shown,/More words/u.source.length?/\n *More words\n/u:/x/u);
  /* s89 found it cut at the split: an empty list's words wrap in the list's column, every one of them shown */
  const empty=all(pageRows(asPage(capabilitySheet({...DATA,tools:null})).panel,120,24)).replace(/[ │]*\n[ │]*/gu,' ');
  assert.match(empty,/No request sent yet in this chat: the tools appear after the first turn\./u);
});

test('connectors, plugins and hooks say their trust, and each key is the center\'s action',()=>{
  const connectors=asPage(capabilitySheet(DATA,{tab:2}));
  assert.match(all(pageRows(connectors.panel,120,24)),/github +Trusted/u);assert.match(all(pageRows(connectors.panel,120,24)),/answers · 42 ms/u);
  assert.deepEqual(press(connectors,'Enter').action,{kind:'capability',tab:2,verb:'probe',id:'github'});
  assert.deepEqual(press(connectors,'u').action,{kind:'capability',tab:2,verb:'untrust',id:'github'});
  const plugins=asPage(capabilitySheet(DATA,{tab:3}));
  assert.match(all(pageRows(plugins.panel,120,24)),/prettier-guard +Quarantined/u);
  assert.deepEqual(press(plugins,'q').action,{kind:'capability',tab:3,verb:'quarantine',id:'p1'});
  const hooks=asPage(capabilitySheet(DATA,{tab:4,selectedId:'fmt'}));
  assert.match(all(pageRows(hooks.panel,120,24)),/fmt +To trust/u);
  assert.deepEqual(press(hooks,'d').action,{kind:'capability',tab:4,verb:'dry-run',id:'fmt'});
  assert.equal(press(asPage(capabilitySheet(DATA)),'t').action,null,'a tool offers no action');
  assert.equal(press(asPage(capabilitySheet({...DATA,hooks:[]},{tab:4})),'d').action,null);
  assert.match(all(pageRows(asPage(capabilitySheet({...DATA,hooks:[]},{tab:4})).panel,120,24)),/No hooks configured\./u);
});
