import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createEditorState} from '../../src/tui/editor.ts';
import {routeInput} from '../../src/tui/input-router.ts';
import {closeOverlay,createTuiAppComponent,createTuiAppState,queuedActionPreview,reduceAppAction,selectExplicitModel,slashCommandIntent} from '../../src/tui/app.ts';

test('model and provider shortcuts open overlays instead of mutating composer text',()=>{
  let state=createTuiAppState(createEditorState('draft'));
  state=reduceAppAction(state,{type:'key-action',action:'model-picker'});
  assert.deepEqual(state.overlay,{kind:'model'});
  assert.equal(state.focus.current,'model-picker');
  assert.equal(state.editor.text,'draft');
  state=closeOverlay(state);
  assert.equal(state.focus.current,'composer');
  state=reduceAppAction(state,{type:'key-action',action:'provider-picker'});
  assert.deepEqual(state.overlay,{kind:'provider'});
  assert.equal(state.editor.text,'draft');
});

test('focused model picker consumes arrows before composer/history handlers',()=>{
  const routed=routeInput({ch:'',key:{downArrow:true},focus:'model-picker',composerText:'draft',commandMenuOpen:false});
  assert.deepEqual(routed,{kind:'action',action:'picker-down'});
});

test('slash actions converge on the same overlays and redraw reducer as shortcuts',()=>{
  assert.deepEqual(slashCommandIntent('/model'),{kind:'open-overlay',overlay:{kind:'model'}});
  assert.deepEqual(slashCommandIntent('/help'),{kind:'open-overlay',overlay:{kind:'help'}});
  assert.deepEqual(slashCommandIntent('/resume'),{kind:'open-overlay',overlay:{kind:'session',action:'resume'}});
  assert.deepEqual(slashCommandIntent('/fork'),{kind:'open-overlay',overlay:{kind:'session',action:'fork'}});
  assert.deepEqual(slashCommandIntent('/model openai:gpt-5-mini'),{kind:'select-model',id:'openai:gpt-5-mini'});
  assert.deepEqual(slashCommandIntent('/resume s1'),{kind:'session-id',action:'resume',id:'s1'});
  assert.deepEqual(slashCommandIntent('/fork s1'),{kind:'session-id',action:'fork',id:'s1'});
  assert.deepEqual(slashCommandIntent('/redraw'),{kind:'key-action',action:'redraw'});

  let state=createTuiAppState();
  state=reduceAppAction(state,{type:'key-action',action:'redraw'});
  assert.equal(state.redrawNonce,1);
});

test('explicit /model selection persists through the same catalog helper before changing controller state',async()=>{
  const calls:string[]=[];
  const catalog={selectModel:async(id:string,scope:string)=>{calls.push(`persist:${scope}:${id}`);}} as any;
  await selectExplicitModel('openai:gpt-5-mini',catalog,id=>calls.push(`controller:${id}`));
  assert.deepEqual(calls,['persist:project-user:openai:gpt-5-mini','controller:openai:gpt-5-mini']);
});

test('reasoning and tool expansion are semantic app state, not composer mutations',()=>{
  let state=createTuiAppState(createEditorState('draft'));
  state=reduceAppAction(state,{type:'key-action',action:'reasoning-toggle'});
  state=reduceAppAction(state,{type:'key-action',action:'tool-details'});
  assert.equal(state.reasoningVisible,true);
  assert.equal(state.expandedTools,true);
  assert.equal(state.editor.text,'draft');
});

test('app component is created by dependency injection so importing app state never requires Ink',()=>{
  const component=createTuiAppComponent({createElement(){return null;},Fragment:Symbol('Fragment')} as any,{Box(){},Text(){}} as any);
  assert.equal(typeof component,'function');
});


test('session overlay commits the React-selected row into the session picker model before confirm',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/sessionPickerRef\.current[\s\S]{0,500}model\.select\(selected\)[\s\S]{0,120}model\.confirm\(\)/u);
});


test('app consumes the shared theme for every required visual surface',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createTuiTheme\(capabilities\)/u);
  for(const surface of ['boot','transcript','picker','approval','tool','footer'])assert.match(source,new RegExp(`themeColor\\(theme,'${surface}'\\)`,'u'));
});

test('app keeps cinematic boot mounted until visual completion and passes terminal width',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/completeBoot/u);
  assert.match(source,/onComplete:\(\)=>setBoot/u);
  assert.match(source,/width:columns/u);
});

test('boot skip forwards the triggering key through the extracted shell-input planner',async()=>{
  const app=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const planner=await readFile(new URL('../../src/tui/shell-input.ts',import.meta.url),'utf8');
  assert.match(app,/decideShellInput/u);
  assert.match(planner,/bootActive[\s\S]{0,260}boot\.runtimeReady[\s\S]{0,260}routeInput/u);
});

test('busy status indicator renders immediately above the composer instead of above the transcript',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const root=source.indexOf("return h(Ink.Box,{key:`main-");
  assert.notEqual(root,-1);
  const view=source.slice(root);
  const transcript=view.indexOf('...messages.map');
  const status=view.indexOf('h(StatusIndicator');
  const composer=view.indexOf("h(Ink.Box,{borderStyle:'single',flexDirection:'column'},h(Ink.Text,null,'> '");
  assert.ok(transcript>=0&&status>=0&&composer>=0);
  assert.ok(status>transcript,'status indicator must come after transcript content');
  assert.ok(status<composer,'status indicator must be immediately before the composer region');
});


test('busy input is represented as a visible queue rather than a RUN_IN_PROGRESS rejection',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/queuedActions/u);
  assert.match(source,/deriveShellLayout/u);
  const layout=await readFile(new URL('../../src/tui/shell-layout.ts',import.meta.url),'utf8');
  assert.match(layout,/queueRosterLine/u);
  assert.match(source,/parsed\.name==='queue'/u);
  assert.match(source,/controller\.dispatchQueue/u);
  assert.match(source,/controller\.clearQueue/u);
  assert.doesNotMatch(source,/RUN_IN_PROGRESS/u);
});


test('queued action previews neutralize terminal controls bidi and line breaks',()=>{
  const preview=queuedActionPreview('safe\u001b[2J\u202Ehidden\nnext');
  assert.equal(preview.includes('\u001b'),false);
  assert.equal(preview.includes('\u202e'),false);
  assert.match(preview,/\\u001b/u);
  assert.match(preview,/\\u202e/u);
  assert.equal(preview.includes('\n'),false);
});

test('submit consults the controller queue rather than a potentially stale React queue snapshot',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/state\.running\|\|controller\.queue\(\)\.length>0/u);
});


test('terminal shell order follows transcript activity composer shortcuts and main roster',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const root=source.indexOf("return h(Ink.Box,{key:`main-");
  assert.notEqual(root,-1);
  const view=source.slice(root);
  const transcript=view.indexOf('...messages.map');
  const status=view.indexOf('h(StatusIndicator');
  const composer=view.indexOf("h(Ink.Box,{borderStyle:'single',flexDirection:'column'},h(Ink.Text,null,'> '");
  const shortcuts=view.indexOf('shortcutLine');
  const roster=view.indexOf('rosterLine');
  assert.ok(transcript>=0&&status>=0&&composer>=0&&shortcuts>=0&&roster>=0);
  assert.ok(transcript<status);
  assert.ok(status<composer);
  assert.ok(composer<shortcuts);
  assert.ok(shortcuts<roster);
});

test('generic footer ownership moved to the pure shell layout and still excludes stable chrome fields',async()=>{
  const app=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const source=await readFile(new URL('../../src/tui/shell-layout.ts',import.meta.url),'utf8');
  assert.match(app,/footerLine/u);
  assert.match(source,/residualFooterFields/u);
  const footerStart=source.indexOf('const footerFields:FooterField[]=');
  const footerEnd=source.indexOf('const footerLine=',footerStart);
  assert.ok(footerStart>=0&&footerEnd>footerStart);
  const footerSource=source.slice(footerStart,footerEnd);
  assert.doesNotMatch(footerSource,/id:'model'|id:'mode'|id:'context'|id:'run'|id:'queue'/u);
});


test('M2-D effective keymap flows from main through app shell-input routing and help without module-global mutation',async()=>{
  const main=await readFile(new URL('../../src/main.ts',import.meta.url),'utf8');
  const app=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const shellInput=await readFile(new URL('../../src/tui/shell-input.ts',import.meta.url),'utf8');
  const help=await readFile(new URL('../../src/tui/overlays/help-dialog.ts',import.meta.url),'utf8');
  assert.match(main,/assertValidKeymap/u);
  assert.match(main,/keymap:\s*effectiveKeymap/u);
  assert.match(app,/keymap\?:/u);
  assert.match(app,/keymap:effectiveKeymap/u);
  assert.match(app,/helpDialogText\(effectiveKeymap\)/u);
  assert.match(shellInput,/keymap/u);
  assert.match(shellInput,/routeInput\(\{[\s\S]{0,220}keymap/u);
  assert.match(help,/helpDialogText\(keymap/u);
  assert.doesNotMatch(app,/setEffectiveKeymap|GLOBAL_KEYMAP/u);
});

test('M8-A RED — /mcp opens an in-process typed MCP center instead of the generic child CLI bridge',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createMcpFacade/u);
  assert.match(source,/mcpCenter/u);
  assert.match(source,/renderMcpCenterLines/u);
  const special=source.indexOf("parsed.name==='mcp'");
  const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/mcp must have an explicit in-process branch');
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/mcp must return before the generic child-process CLI path');
});

test('M8-B RED — /hooks opens an in-process typed Hook Center before the generic child CLI bridge',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createHookFacade/u);
  assert.match(source,/hookCenter/u);
  assert.match(source,/renderHookCenterLines/u);
  const special=source.indexOf("parsed.name==='hooks'");
  const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/hooks must have an explicit in-process branch');
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/hooks must return before generic child-process routing');
});

test('M8-C RED — /plugins opens an in-process Plugin Center before the generic child CLI bridge',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createPluginFacade/u);
  assert.match(source,/pluginCenter/u);
  assert.match(source,/renderPluginCenterLines/u);
  const special=source.indexOf("parsed.name==='plugins'");
  const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/plugins must have an explicit in-process branch');
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/plugins must return before generic child CLI routing for its center/actions');
});

test('M9-A RED — /memory opens an in-process Memory Center before the generic child CLI bridge',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createMemoryFacade/u);
  assert.match(source,/memoryCenter/u);
  assert.match(source,/renderMemoryCenterLines/u);
  const special=source.indexOf("parsed.name==='memory'");
  const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/memory must have an explicit in-process branch');
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/memory must return before generic child CLI routing for its center');
});

test('M9-B RED — /notes opens a native in-process Notes Center and link/unlink use explicit ids before child CLI routing',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createNotesFacade/u);
  assert.match(source,/notesCenter/u);
  assert.match(source,/renderNotesCenterLines/u);
  const special=source.indexOf("parsed.name==='notes'");
  const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/notes must have an explicit in-process branch');
  assert.match(source.slice(special,child<0?undefined:child),/notesFacade\(\)\.link/u);
  assert.match(source.slice(special,child<0?undefined:child),/notesFacade\(\)\.unlink/u);
  assert.match(source.slice(special,child<0?undefined:child),/session\|task\|research/u);
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/notes list/link/unlink must return before generic child routing');
});

test('M9-B RED — Notes Center composer attach is explicit and never auto-submits a model run',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('if(notesCenter)');
  const end=source.indexOf('if(memoryCenter)',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/composerReference/u);
  assert.match(block,/setEditorText|updateEditor/u);
  assert.doesNotMatch(block,/controller\.send|controller\.start|controller\.resume/u);
});

test('M9-C RED — /tasks opens an in-process Task Board and explicit edge actions return before child CLI routing',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createTaskBoardFacade/u);assert.match(source,/tasksCenter/u);assert.match(source,/renderTasksCenterLines/u);
  const special=source.indexOf("parsed.name==='tasks'");const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/tasks must have an explicit in-process branch');
  const block=source.slice(special,child<0?undefined:child);
  for(const token of ['depend','undepend','evidence','unevidence','assign','unassign','schedule','unschedule'])assert.match(block,new RegExp(token,'u'));
  assert.ok(child<0||block.includes('return;'),'/tasks list and edge operations must return before generic child routing');
});

test('M9-C RED — Task Board overlay is metadata-only and cannot start resume cancel or run linked work',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('if(tasksCenter)');const end=source.indexOf('if(notesCenter)',start);
  assert.ok(start>=0&&end>start);const block=source.slice(start,end);
  assert.doesNotMatch(block,/controller\.(send|start|resume|cancel)|dispatchQueue|runAutomation/u);
});

test('M9-D RED — /library opens a native in-process Library Center before generic child CLI routing',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createLibraryFacade/u);assert.match(source,/libraryCenter/u);assert.match(source,/renderLibraryCenterLines/u);
  const special=source.indexOf("parsed.name==='library'");const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/library must have an explicit in-process branch');
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/library list must return before generic child CLI routing');
});

test('M9-D RED — Library Center preview dedupe attach and detach are explicit composer-only actions',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('if(libraryCenter)');const end=source.indexOf('if(tasksCenter)',start);
  assert.ok(start>=0&&end>start);const block=source.slice(start,end);
  assert.match(block,/\.preview\(/u);assert.match(block,/\.duplicates\(/u);assert.match(block,/\.prepareContextReference\(/u);
  assert.match(block,/attachLibraryContextToken/u);assert.match(block,/detachLibraryContextToken/u);assert.match(block,/setEditorText/u);
  assert.doesNotMatch(block,/controller\.(send|start|resume|cancel)|dispatchQueue|runAutomation/u);
});


test('M10-A RED — /research opens a first-class in-process Research Center before generic child CLI routing',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createResearchFacade/u);assert.match(source,/researchCenter/u);assert.match(source,/renderResearchCenterLines/u);
  const special=source.indexOf("parsed.name==='research'");const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/research must have an explicit in-process branch');
  assert.ok(child<0||source.slice(special,child).includes('return;'),'/research list must return before generic child routing');
});

test('M10-A RED — Research Center live controls stay same-process and use research-specific owner APIs',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('if(researchCenter)');
  assert.ok(start>=0,'Research Center input block must exist');
  const candidates=['if(libraryCenter)','if(tasksCenter)','if(notesCenter)','if(memoryCenter)'].map(token=>source.indexOf(token,start+1)).filter(index=>index>start);
  const end=candidates.length?Math.min(...candidates):source.indexOf('const vimOwnsInput',start);
  const block=source.slice(start,end>start?end:undefined);
  assert.match(block,/\.pause\(/u);assert.match(block,/\.resume\(/u);assert.match(block,/\.cancel\(/u);assert.match(block,/\.exportFile\(/u);
  assert.doesNotMatch(block,/runtime\.cancel|controller\.cancel|execFileAsync/u,'research cancel must never degrade to generic runtime cancel or a child process');
});


test('M10-B RED — /automations opens a first-class in-process Automation Center before generic child CLI routing',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createAutomationFacade/u);assert.match(source,/automationCenter/u);assert.match(source,/renderAutomationCenterLines/u);
  const special=source.indexOf("parsed.name==='automations'");const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0);assert.ok(child<0||source.slice(special,child).includes('return;'));
});


test('M10-C RED — /forge opens a first-class in-process Forge Center before generic child CLI routing',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createForgeFacade/u);assert.match(source,/forgeCenter/u);assert.match(source,/renderForgeCenterLines/u);
  const special=source.indexOf("parsed.name==='forge'");const child=source.indexOf('execFileAsync(',special);
  assert.ok(special>=0,'/forge must have an explicit in-process branch');assert.ok(child<0||source.slice(special,child).includes('return;'));
});

test('M10-C RED — Forge Center owner controls call versioned rollback/enable seams and never model tool_create',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const start=source.indexOf('if(forgeCenter)');assert.ok(start>=0);const next=source.indexOf('if(automationCenter)',start+1);const block=source.slice(start,next>start?next:undefined);
  assert.match(block,/\.rollback\(/u);assert.match(block,/\.setEnabled\(/u);assert.doesNotMatch(block,/tool_create|installaToolForgiato/u);
});


test('Esc interrupt RED — active-run Escape uses queue-preserving controller.interrupt while Ctrl+C keeps aggressive cancel',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const action=source.indexOf("if(action==='interrupt')");
  assert.ok(action>=0);
  const block=source.slice(action,action+900);
  assert.match(block,/key\?\.escape[\s\S]{0,180}controller\.interrupt\(/u);
  assert.doesNotMatch(block,/key\?\.escape[\s\S]{0,180}controller\.cancel\(/u);
  assert.match(block,/ctrlC\(state\.running\)[\s\S]{0,180}cancelActiveRun/u);
});

test('productization RED-P6 — MarkdownView wires a per-view parse memo behind an explicit text+width React memo boundary',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/const MarkdownView=React\.memo\(/u,'MarkdownView must be a memoized child boundary');
  assert.match(source,/markdownRenderPropsEqual/u,'the memoized child must use the explicit text+width comparator');
  assert.match(source,/createMarkdownParseMemo/u,'the app must instantiate the per-view parse memo instead of leaving the helper unused');
  assert.match(source,/parseMemoRef\.current\.get\(text\)/u,'Markdown blocks must come from the retained per-view memo');
});

test('input-fast-path RED-I3 — ordinary composer text updates a dedicated subscribed ComposerView before global coordinator invalidation',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/createComposerStore/u,'TuiApp must own a stable composer store');
  assert.match(source,/const ComposerView=React\.memo\(/u,'composer rendering must be isolated behind a memoized child');
  assert.match(source,/useSyncExternalStore\(/u,'ComposerView must subscribe directly to the focused editor store');
  assert.match(source,/composerStoreRef/u,'the composer store must survive root rerenders');

  const inputStart=source.indexOf('Ink.useInput');
  assert.ok(inputStart>=0,'input handler must exist');
  const immediate=source.indexOf("coordinator.immediate('input'",inputStart);
  const fastDecision=source.indexOf('composerFastTextInput',inputStart);
  const fastUpdate=source.indexOf('composerStore.update',inputStart);
  assert.ok(immediate>inputStart,'semantic coordinator fallback must remain');
  assert.ok(fastDecision>inputStart&&fastDecision<immediate,'fast-path eligibility must be decided before global coordinator invalidation');
  assert.ok(fastUpdate>fastDecision&&fastUpdate<immediate,'eligible text must update only the composer store before the fallback path');

  const submitStart=source.indexOf('const submit=async');
  assert.ok(submitStart>=0);
  const submitBlock=source.slice(submitStart,submitStart+2200);
  assert.match(submitBlock,/currentEditor\(\)\.text/u,'submit must read the synchronous store snapshot, not stale root editor state');

  const root=source.indexOf('return h(Ink.Box,{key:\`main-');
  assert.ok(root>=0);
  const rootBlock=source.slice(root);
  assert.match(rootBlock,/h\(ComposerView/u,'root must render the dedicated composer child');
  assert.doesNotMatch(rootBlock,/\.\.\.visual\.map|\bvisual\.map/u,'root must no longer render composer segments from root shell-layout state');
});

test('local-editor-fast-path RED-L3 — eligible local cursor/delete actions update composer store before global coordinator fallback',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/composerFastEditorAction/u,'app must import/use the local editor eligibility seam');
  assert.match(source,/applyComposerFastEditorAction/u,'app must apply local editor actions through the pure existing-editor seam');

  const inputStart=source.indexOf('Ink.useInput');
  assert.ok(inputStart>=0);
  const immediate=source.indexOf("coordinator.immediate('input'",inputStart);
  const decision=source.indexOf('composerFastEditorAction',inputStart);
  const apply=source.indexOf('applyComposerFastEditorAction',inputStart);
  const update=source.indexOf('composerStore.update',decision);
  assert.ok(immediate>inputStart,'semantic fallback coordinator must remain');
  assert.ok(decision>inputStart&&decision<immediate,'local action eligibility must be decided before global invalidation');
  assert.ok(apply>decision&&apply<immediate,'local action application must happen before global invalidation');
  assert.ok(update>decision&&update<immediate,'eligible local action must update only the composer store before fallback');

  const fastBlock=source.slice(decision,immediate);
  assert.doesNotMatch(fastBlock,/word-left|word-right|select-left|select-right|history-prev|history-next|kill-start|kill-end|kill-word|yank|undo|redo/u,'deferred semantic actions must not leak into the local fast branch');
  assert.match(source,/if\(action==='delete-forward'\)[\s\S]{0,180}currentEditor\(\)\.text\.length===0[\s\S]{0,180}inkApp\.exit/u,'empty Delete global exit fallback must remain intact');
  assert.match(source,/const handleSemanticAction=/u,'compatibility fallback must remain');
});

test('history-fast-path RED-H4 — invisible history cursors use refs and history planning bypasses the global coordinator',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/planComposerHistoryAction/u,'app must use the pure history planner');
  assert.match(source,/historyIndexRef/u,'history index must be retained synchronously without root state');
  assert.match(source,/reverseIndexRef/u,'reverse-search index must be retained synchronously without root state');
  assert.doesNotMatch(source,/const \[historyIndex,setHistoryIndex\]=React\.useState/u,'invisible history index must not remain root React state');
  assert.doesNotMatch(source,/const \[reverseIndex,setReverseIndex\]=React\.useState/u,'invisible reverse-search index must not remain root React state');
  assert.doesNotMatch(source,/setHistoryIndex\(|setReverseIndex\(/u,'history cursor writes must not schedule root renders');
  assert.match(source,/const \[history,setHistory\]=React\.useState/u,'the retained prompt history rows remain ordinary app/session state');

  const inputStart=source.indexOf('Ink.useInput');
  assert.ok(inputStart>=0);
  const immediate=source.indexOf("coordinator.immediate('input'",inputStart);
  const planner=source.indexOf('planComposerHistoryAction',inputStart);
  const historyRefWrite=source.indexOf('historyIndexRef.current=',planner);
  const reverseRefWrite=source.indexOf('reverseIndexRef.current=',planner);
  const storeWrite=source.indexOf('composerStore.replace',planner);
  assert.ok(immediate>inputStart,'semantic coordinator fallback must remain');
  assert.ok(planner>inputStart&&planner<immediate,'history planner must run before global coordinator invalidation');
  assert.ok(historyRefWrite>planner&&historyRefWrite<immediate,'history index ref must update before fallback');
  assert.ok(reverseRefWrite>planner&&reverseRefWrite<immediate,'reverse index ref must update before fallback');
  assert.ok(storeWrite>planner&&storeWrite<immediate,'eligible history plan must update only the composer store before fallback');

  const historyMove=source.indexOf('const historyMove=');
  const reverseSearch=source.indexOf('const reverseSearch=');
  assert.ok(historyMove>=0&&reverseSearch>historyMove);
  assert.match(source.slice(historyMove,historyMove+1200),/historyIndexRef\.current/u,'fallback history movement must use the same history ref authority');
  assert.match(source.slice(historyMove,historyMove+1200),/reverseIndexRef\.current/u,'fallback history movement must reset the same reverse-search ref');
  assert.match(source.slice(reverseSearch,reverseSearch+900),/reverseIndexRef\.current/u,'fallback reverse search must use the same reverse-search ref');
});

test('paste-ime-fast-path RED-Paste3 — bracketed paste uses Ink usePaste only while composer owns paste',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/composerOwnsPaste/u,'app must use the pure paste-ownership seam');
  assert.match(source,/applyComposerFastPasteInput/u,'explicit paste must converge on the shared TALOS paste application seam');

  const pasteStart=source.indexOf('Ink.usePaste');
  assert.ok(pasteStart>=0,'Ink 7.1.1 usePaste must own explicit bracketed paste for the focused composer');
  const pasteBlock=source.slice(pasteStart,pasteStart+2200);
  assert.match(pasteBlock,/isActive:\s*pasteOwner/u,'usePaste must be active only under fail-closed composer ownership');
  assert.match(pasteBlock,/composerStore\.update\([\s\S]{0,240}applyComposerFastPasteInput/u,'explicit paste must update only the focused composer store');
  assert.doesNotMatch(pasteBlock,/\.trim\(|replace\([^\n]*\\r|replaceAll\([^\n]*\\r/u,'explicit paste fast path must not trim or normalize TALOS input');
});

test('paste-ime-fast-path RED-Paste4 — multi-char useInput paste or IME updates composer before global coordinator fallback',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/composerFastPasteInput/u,'app must use the routed multi-character paste/IME eligibility seam');
  assert.match(source,/applyComposerFastPasteInput/u);

  const inputStart=source.indexOf('Ink.useInput');
  assert.ok(inputStart>=0);
  const immediate=source.indexOf("coordinator.immediate('input'",inputStart);
  const single=source.indexOf('composerFastTextInput',inputStart);
  const pasteDecision=source.indexOf('composerFastPasteInput',inputStart);
  const pasteApply=source.indexOf('applyComposerFastPasteInput',inputStart);
  const historyPlan=source.indexOf('planComposerHistoryAction',inputStart);
  assert.ok(immediate>inputStart);
  assert.ok(single>inputStart&&single<pasteDecision,'single-character fast path remains the first text fast path');
  assert.ok(pasteDecision>single&&pasteDecision<immediate,'multi-char paste/IME eligibility must run before global coordinator invalidation');
  assert.ok(pasteApply>pasteDecision&&pasteApply<immediate,'eligible multi-char input must use shared insertPaste semantics before global invalidation');
  assert.ok(historyPlan>pasteApply&&historyPlan<immediate,'existing history fast path must remain after text/paste handling and before fallback');

  const fastBlock=source.slice(pasteDecision,immediate);
  assert.match(fastBlock,/composerStore\.update/u);
  assert.doesNotMatch(fastBlock,/setAppState|\.trim\(|replace\([^\n]*\\r/u,'paste/IME fast path must not mutate root state or normalize input');
  assert.match(source,/coordinator\.immediate\('input'/u,'semantic fallback must remain for rejected ownership cases');
});


test('command-menu-fast-path RED-CM4 — CommandMenuView subscribes locally instead of rendering transient rows in the root',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/const CommandMenuView=React\.memo\(/u,'command-menu rendering needs its own memoized child boundary');

  const viewStart=source.indexOf('const CommandMenuView=React.memo(');
  const appStart=source.indexOf('return function TuiApp',viewStart);
  assert.ok(viewStart>=0&&appStart>viewStart);
  const view=source.slice(viewStart,appStart);
  assert.match(view,/useSyncExternalStore\(composerStore\.subscribe/u,'CommandMenuView must subscribe to the existing authoritative composer/query store');
  assert.match(view,/useSyncExternalStore\(selectionStore\.subscribe/u,'CommandMenuView must subscribe only to its local selection store');
  assert.match(view,/commandMenuItems\(editor\.text\)/u,'rows must be derived locally through the existing TALOS ranking function');

  assert.doesNotMatch(source,/const commandRows=commandMenuItems\(currentEditor\(\)\.text\)/u,'root TuiApp must no longer derive per-keystroke command rows');
  const root=source.lastIndexOf('return h(Ink.Box,{key:');
  assert.ok(root>=0);
  assert.match(source.slice(root),/h\(CommandMenuView/u,'root must mount the dedicated command-menu child');
});

test('command-menu-fast-path RED-CM5 — eligible command query text updates local stores before global coordinator invalidation',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/commandMenuFastTextInput/u,'app must import/use the fail-closed command-menu query seam');
  assert.match(source,/commandMenuSelectionStore/u,'app must own a stable local command-menu selection store');

  const inputStart=source.indexOf('Ink.useInput');
  assert.ok(inputStart>=0);
  const immediate=source.indexOf("coordinator.immediate('input'",inputStart);
  const decision=source.indexOf('commandMenuFastTextInput',inputStart);
  const editorUpdate=source.indexOf('composerStore.update',decision);
  const reset=source.indexOf('commandMenuSelectionStore.reset',decision);
  assert.ok(immediate>inputStart,'semantic coordinator fallback must remain');
  assert.ok(decision>inputStart&&decision<immediate,'command-menu query eligibility must be decided before global invalidation');
  assert.ok(editorUpdate>decision&&editorUpdate<immediate,'accepted query text must update the existing composerStore before fallback');
  assert.ok(reset>decision&&reset<immediate,'accepted query text must reset only local command-menu selection before fallback');

  const fastBlock=source.slice(decision,immediate);
  assert.doesNotMatch(fastBlock,/setAppState|setPickerSelection/u,'accepted command-query text must not schedule root React state');
  assert.match(fastBlock,/return;/u,'accepted command-query text must return before coordinator fallback');
});

test('command-menu-fast-path RED-CM6 — movement backspace and confirm use latest local command selection without changing other pickers',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');

  const moveStart=source.indexOf('const movePicker=');
  const backspaceStart=source.indexOf('const pickerBackspace=',moveStart);
  const confirmStart=source.indexOf('const confirmPicker=',backspaceStart);
  const semanticStart=source.indexOf('const handleSemanticAction=',confirmStart);
  assert.ok(moveStart>=0&&backspaceStart>moveStart&&confirmStart>backspaceStart&&semanticStart>confirmStart);

  const moveBlock=source.slice(moveStart,backspaceStart);
  assert.match(moveBlock,/focus\.current==='command-menu'[\s\S]{0,500}commandMenuSelectionStore\.move/u,'command-menu navigation must use the local selection store');
  assert.match(moveBlock,/setPickerSelection/u,'model/provider/session picker movement must retain the existing root state path');

  const backspaceBlock=source.slice(backspaceStart,confirmStart);
  assert.match(backspaceBlock,/focus\.current==='command-menu'[\s\S]{0,800}deleteBackward/u,'command-menu backspace must preserve existing editor deletion');
  assert.match(backspaceBlock,/commandMenuSelectionStore\.reset/u,'query deletion must reset local selected row');
  assert.match(backspaceBlock,/next\.text\.length===0[\s\S]{0,300}closeFocus/u,'deleting the final slash must preserve command-menu close behavior');

  const confirmBlock=source.slice(confirmStart,semanticStart);
  assert.match(confirmBlock,/commandMenuSelectionStore\.getSnapshot\(\)\.selected/u,'confirm must read the latest synchronous local selected index');
  assert.match(confirmBlock,/commandMenuItems\(currentEditor\(\)\.text\)/u,'confirm must derive rows from the latest authoritative composer text');
  assert.match(confirmBlock,/completeCommandSelection/u,'completed command text must retain the existing completion helper');
  assert.match(confirmBlock,/const selected=pickerSelection\.selected/u,'non-command pickers must retain their existing pickerSelection authority');
});

test('transcript-virtualization RED-TV4 — mounted transcript rows report real Ink layout height only to a local measurement store',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/const MeasuredTranscriptRow=React\.memo\(/u,'measured transcript row boundary is missing');
  const start=source.indexOf('const MeasuredTranscriptRow=React.memo(');
  const end=source.indexOf('const TranscriptView=React.memo(',start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.match(block,/React\.useRef/u,'measured row must own a stable Ink Box ref');
  assert.match(block,/Ink\.useBoxMetrics\(/u,'exact installed Ink useBoxMetrics must provide real layout height');
  assert.match(block,/hasMeasured/u,'zero pre-layout metrics must not become measurement authority');
  assert.match(block,/measurementStore\.measure/u,'measured height must be written only to the transcript-local store');
  assert.doesNotMatch(block,/setState\(|setAppState\(|setViewport\(/u,'measurement reporting must not mutate application semantic state');
});

test('transcript-virtualization RED-TV5 — TranscriptView mounts only the dynamic-height planned window',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.match(source,/const TranscriptView=React\.memo\(/u,'dedicated virtualized transcript child is missing');
  const start=source.indexOf('const TranscriptView=React.memo(');
  const appStart=source.indexOf('return function TuiApp',start);
  assert.ok(start>=0&&appStart>start);
  const block=source.slice(start,appStart);
  assert.match(block,/React\.useSyncExternalStore\(measurementStore\.subscribe/u,'TranscriptView must subscribe directly to measurement changes');
  assert.match(block,/planTranscriptVirtualWindow/u,'TranscriptView must plan rows from terminal-height geometry');
  assert.match(block,/MeasuredTranscriptRow/u,'only planned rows may enter expensive transcript rendering');

  const root=source.lastIndexOf('return h(Ink.Box,{key:');
  assert.ok(root>=0);
  const rootBlock=source.slice(root);
  assert.match(rootBlock,/h\(TranscriptView/u,'root must mount the virtualized transcript boundary');
  assert.doesNotMatch(rootBlock,/\.\.\.transcriptRows\.map/u,'root must no longer directly mount the legacy item-count transcript window');
});

test('transcript-virtualization RED-TV6 — search copy and navigation remain semantic-full-transcript operations',async()=>{
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  const semanticStart=source.indexOf('const transcriptItemsForCurrentView=');
  assert.ok(semanticStart>=0);
  const semanticBlock=source.slice(semanticStart,semanticStart+4200);
  assert.match(semanticBlock,/state\.transcript\.items/u,'semantic transcript authority must remain the full transcript model');
  assert.match(semanticBlock,/items\.find\(\(item:TranscriptItem\)=>item\.id===preferred\)/u,'copy/selection must resolve by semantic item id, not mounted row');
  assert.match(semanticBlock,/transcriptViewportForIndex\(view,items\.length,index\)/u,'search jump/navigation must remain based on semantic indexes');
  assert.match(source,/transcriptSearchMatches\(items,transcriptSearch\.query/u,'search must continue scanning semantic items');
  assert.match(source,/if\(action==='page-up'\)[\s\S]{0,240}reduceViewport/u,'existing page navigation reducer must remain');
  assert.match(source,/const \[transcriptRaw,setTranscriptRaw\]=React\.useState/u,'raw-mode authority must remain unchanged');
});
