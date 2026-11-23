/*
 * Stress test 0.5.4, F-B-004 (S3) and suspicion 1:
 * - `memory add --json`, `checkpoint undo --json`: the JSON `message` was the bare code (TITLE_REQUIRED, CHECKPOINT_NOT_FOUND),
 *   with no sentence and no next step; `checkpoint undo` with nothing to undo exited 70 as an internal failure;
 * - `tasks add --title x --description y` said "Unknown option" although `tasks update` takes those options;
 * - `memory add --content X` saved a memory titled "--content": `req()` took the first value, option or not.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {exitCodeForError,renderSafeTalosFailure,renderTalosFailureLine,safeTalosFailure} from '../../src/errors.ts';
import {runMemoryCommand,runNotesCommand,runTasksCommand} from '../../src/commands/services-cli.ts';

const coded=(code:string,extra:Record<string,unknown>={})=>Object.assign(new Error(code),{code,...extra});
const json=(error:unknown)=>JSON.parse(renderSafeTalosFailure('json',error).text).error;

test('the JSON error of a bare code carries a sentence and a next step, not the code again',()=>{
  const missing=json(coded('TITLE_REQUIRED'));
  assert.equal(missing.code,'TITLE_REQUIRED');
  assert.notEqual(missing.message,'TITLE_REQUIRED');
  assert.match(missing.message,/missing its title/u);
  assert.equal(typeof missing.todo,'string');
  const none=json(coded('CHECKPOINT_NOT_FOUND'));
  assert.match(none.message,/no checkpoint/u);
  assert.match(none.todo,/talos checkpoint list/u);
});

test('a message that is already a sentence is kept as it is',()=>{
  assert.equal(json(Object.assign(new Error('Unknown option: --x'),{code:'CLI_USAGE_ERROR'})).message,'Unknown option: --x');
});

test('the same words on the screen, and nothing to undo is not an internal failure',()=>{
  const line=renderTalosFailureLine(safeTalosFailure(coded('CHECKPOINT_NOT_FOUND')));
  assert.match(line,/no checkpoint/u);
  assert.doesNotMatch(line,/could not finish this action/u);
  assert.notEqual(exitCodeForError(coded('CHECKPOINT_NOT_FOUND')),70);
  assert.match(renderTalosFailureLine(safeTalosFailure(coded('DESCRIPTION_REQUIRED'))),/missing its description/u);
});

/* The add commands: no service is reached when the arguments are wrong, so a context with no project is enough. */
const ctx={projectRoot:'Z:\\nowhere',paths:new Proxy({},{get:(_target,key)=>typeof key==='string'?`Z:\\nowhere\\${key}`:undefined}),repoRoot:'Z:\\nowhere',io:{writeOut(){},writeErr(){}},invocation:{outputFormat:'json'}} as any;
const refusal=async(run:()=>Promise<unknown>)=>{try{await run();}catch(error){return error as {code?:string;hint?:string};}return null;};

test('an option is never taken as the title of a new memory, task or note',async()=>{
  const memory=await refusal(()=>runMemoryCommand(ctx,['add','--content','X']));
  assert.equal(memory?.code,'TITLE_REQUIRED');
  assert.match(String(memory?.hint),/talos memory add <title> <content>/u);
  const task=await refusal(()=>runTasksCommand(ctx,['add','--priority','high']));
  assert.equal(task?.code,'TITLE_REQUIRED');
  const note=await refusal(()=>runNotesCommand(ctx,['add','--body','B']));
  assert.equal(note?.code,'TITLE_REQUIRED');
  const unknown=await refusal(()=>runMemoryCommand(ctx,['add','--colour','blue']));
  assert.equal(unknown?.code,'TITLE_REQUIRED');
});

test('add takes the same options as update (--title, --content, --description, --body)',async()=>{
  /* past the parsing, the facade is reached: the refusal is no longer about the arguments */
  const notArguments=(error:{code?:string}|null)=>!error||!/_REQUIRED$|CLI_USAGE_ERROR/u.test(String(error.code))&&!/Unknown option/u.test(String((error as Error).message));
  assert.ok(notArguments(await refusal(()=>runTasksCommand(ctx,['add','--title','x','--description','y']))));
  assert.ok(notArguments(await refusal(()=>runMemoryCommand(ctx,['add','--title','t','--content','c']))));
  assert.ok(notArguments(await refusal(()=>runNotesCommand(ctx,['add','--title','t','--body','b']))));
});
