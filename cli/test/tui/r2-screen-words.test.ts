/*
 * R2 lane D (gate E1, E2, E10; owner decisions Q-R2-1, Q-R2-2, Q-R2-4, Q-R2-10): the CLI's own screen words come from
 * the one English dictionary, the kernel enum values the centers used to print raw are shown in English, every error
 * the app shows goes through lane E's anatomy, and the kernel-contract markers stay byte-identical.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {en,t} from '../../src/i18n/index.ts';
import {describeError,errorViewLines} from '../../src/i18n/error-view.ts';
import {EXECUTION_TEXT} from '../../src/runtime/brokered-executor.ts';
import {KEYBINDINGS,keybindingHelp} from '../../src/tui/keybindings.ts';
import {SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';
import {helpDialogOverlay} from '../../src/tui/overlays/help-dialog.ts';
import {TOO_SMALL_TEXT} from '../../src/tui/regions/budget.ts';
import {mainRosterLine,terminalShortcutStrip} from '../../src/tui/components/terminal-shell.ts';
import {activityHeader} from '../../src/tui/activity-line.ts';
import {createMemoryCenterModel,renderMemoryCenterLines} from '../../src/tui/overlays/memory-center.ts';
import {createNotesCenterModel,renderNotesCenterLines} from '../../src/tui/overlays/notes-center.ts';
import {createTasksCenterModel,renderTasksCenterLines} from '../../src/tui/overlays/tasks-center.ts';
import {createLibraryCenterModel,renderLibraryCenterLines} from '../../src/tui/overlays/library-center.ts';
import {screenErrorText} from '../../src/tui/app.ts';
import {assertEnglishOnly} from '../acceptance/checks.ts';

const appSource=readFileSync(new URL('../../src/tui/app.ts',import.meta.url),'utf8');

test('R2 D: the kernel writer and format values the centers print are English (gate §1.5: Writer: modello|persona)',()=>{
  const memory:any={state:'ready',scope:{kind:'global'},error:null,rows:[{id:'m-1',title:'Alpha',content:'Body',kind:'preference',createdAt:null,updatedAt:null,
    provenance:{writer:'modello',writerEvidence:'persisted',scope:'global',scopeEvidence:'derived-store-contract'},
    duplicateControl:{mode:'m',normalization:'n',onCreateDuplicate:'c',onUpdate:'u',semanticDetection:false,merge:false},usage:{status:'unavailable',reason:'r'},cost:{status:'unavailable',reason:'r'}}]};
  const notes:any={state:'ready',error:null,rows:[{id:'n-1',title:'Note',content:'Body',format:'testo',formatEvidence:'persisted',writer:'persona',writerEvidence:'persisted',createdAt:null,updatedAt:null,relations:[]}]};
  const tasks:any={state:'ready',error:null,legacyRows:[],rows:[{id:'t-1',title:'Task',description:null,status:'todo',priority:'normal',writer:'modello',writerEvidence:'persisted',createdAt:null,updatedAt:null,dependencies:[],evidence:[],agents:[],schedules:[]}]};
  const library:any={state:'ready',error:null,legacyRows:[],rows:[{id:'lib-1',name:'Doc',mediaType:'text/plain',fileType:'document',origin:'uploaded',creator:{type:'persona',model:null,provider:null},session:null,createdAt:null,updatedAt:null,context:{token:null,autoAttach:false,autoSubmit:false,persistence:'composer-only-until-send'}}]};
  const memoryText=renderMemoryCenterLines(createMemoryCenterModel(memory,0)).join('\n');
  const notesText=renderNotesCenterLines(createNotesCenterModel(notes,0)).join('\n');
  const tasksText=renderTasksCenterLines(createTasksCenterModel(tasks,0)).join('\n');
  const libraryText=renderLibraryCenterLines(createLibraryCenterModel(library,0)).join('\n');
  for(const text of [memoryText,notesText,tasksText,libraryText]){assertEnglishOnly(text);assert.doesNotMatch(text,/\b(?:persona|modello|testo)\b/u);}
  assert.match(memoryText,new RegExp(`Writer: ${t('screen.writer.modello')} \\(persisted\\)`,'u'));
  assert.match(notesText,new RegExp(`Writer: ${t('screen.writer.persona')} \\(persisted\\)`,'u'));
  assert.match(notesText,new RegExp(`Format: ${t('screen.noteFormat.testo')}`,'u'));
  assert.match(libraryText,new RegExp(`Creator: ${t('screen.writer.persona')}`,'u'));
});

test('R2 D: chrome, statuses, help and the too-small notice read the dictionary (Q-R2-10: everything on acceptance frames)',()=>{
  assert.equal(TOO_SMALL_TEXT,t('screen.layout.tooSmall',{columns:40,rows:12}));
  assert.equal(TOO_SMALL_TEXT,'Terminal too small — need 40×12','the acceptance notice keeps its bytes');
  for(const command of SLASH_COMMANDS)assert.equal(command.description,en[`screen.slash.${command.name}` as keyof typeof en],`/${command.name}`);
  for(const binding of KEYBINDINGS)assert.equal(binding.description,en[`screen.key.${binding.id}` as keyof typeof en],`key ${binding.id}`);
  assert.match(keybindingHelp(),new RegExp(`Enter — ${t('screen.key.submit')}`,'u'));
  const help=helpDialogOverlay();
  assert.equal(help.head?.[0]?.text,t('screen.help.title'));
  assert.equal(help.foot?.[0]?.text,t('screen.help.close'));
  assert.match(mainRosterLine({kind:'idle',model:'m',width:80}),new RegExp(`main · ${t('screen.status.ready')} · model m`,'u'));
  assert.equal(activityHeader({running:true,reasoning:null,tools:[]},{kind:'thinking',startedAt:0}),t('screen.activity.thinking'));
  assert.match(terminalShortcutStrip({mode:'default',running:true,queueCount:0,width:200}),new RegExp(t('screen.shortcut.interrupt').replace(/[+/]/gu,'\\$&'),'u'));
});

test('R2 D: every error the app shows goes through describeError/errorViewLines (Q-R2-4, gate E6)',()=>{
  const error=Object.assign(new Error('raw kernel text: Il fornitore non risponde.'),{code:'PROVIDER_REQUEST_ERROR'});
  assert.equal(screenErrorText(error),errorViewLines(describeError(error)).join('\n'));
  assert.equal(screenErrorText(error,t('screen.action.modelPicker')).split('\n')[0],t('screen.error.context',{context:t('screen.action.modelPicker'),what:describeError(error).what}));
  assert.equal(screenErrorText(error,'Steering',{rejected:true}).split('\n')[0],t('screen.error.rejected',{context:'Steering',what:describeError(error).what}));
  assert.match(screenErrorText({code:'PROVIDER_STORE_UNAVAILABLE'},'Key test',{note:t('screen.provider.keyNotSaved')}).split('\n')[0],/The key was not saved\.$/u);
  assert.doesNotMatch(screenErrorText({code:'PROVIDER_STORE_UNAVAILABLE'},'Key test'),/raw kernel text/u,'a code-only error carries no message');
  /* No handler builds its own "… failed: <message>" line any more, and none prints a bare code in parentheses. */
  const inline=[...appSource.matchAll(/addLocal\((?:[^;]*?)(?:error instanceof Error\?error\.message|error\?\.message|errorCode\(error\)|String\(error\))/gu)].map(match=>match[0].slice(0,120));
  assert.deepEqual(inline,[],`handlers that print the raw error:\n${inline.join('\n')}`);
});

test('R2 D: EXECUTION_TEXT reads the dictionary except its kernel-contract markers, which stay byte-identical (gate E2)',()=>{
  assert.equal(EXECUTION_TEXT.isolation.host,t('screen.exec.isolation.host'));
  assert.equal(EXECUTION_TEXT.reason.hostNoBroker,t('screen.exec.reason.hostNoBroker'));
  assert.equal(EXECUTION_TEXT.reason.timedOut(120_000),t('screen.exec.reason.timedOut',{seconds:120}));
  assert.equal(EXECUTION_TEXT.shellSessionRequired,t('screen.exec.shellSessionRequired'));
  assert.equal(EXECUTION_TEXT.marker.stoppedOnRequest,'⛔ Stopped on request:');
  assert.equal(EXECUTION_TEXT.marker.stoppedOnRequestSentence,'the command was stopped while it ran.');
  assert.equal(EXECUTION_TEXT.marker.timedOut(120_000),'⛔ Stopped when the 120 seconds ran out: it did not finish on its own.');
  assert.ok(!Object.values(en).some(value=>value.includes('⛔ Stopped on request:')||value.includes('Fermato')),'a marker never enters the display dictionary');
});

test('R2 D: app.ts reads its words from the dictionary and its errors from the error anatomy',()=>{
  assert.match(appSource,/from '\.\.\/i18n\/index\.ts'/u);
  assert.match(appSource,/from '\.\.\/i18n\/error-view\.ts'/u);
});
