/*
 * R5b D7 (owner decision Q-R5-17): the things TALOS does that the others hide are visible. `/status` keeps its R4 block and
 * adds the sandbox verdict, the permission rules counted by scope, the open tasks and the notes, and the session's usage;
 * a fact that could not be read says so instead of vanishing. `/help` groups the commands (session, model and turn, view,
 * work surfaces, extensions). Before R5b `/status` showed session, running, model, mode and tools only, and `/help` was one
 * flat list of 37 commands.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {sessionStatusText} from '../../src/tui/shell-model.ts';
import {permissionRuleCounts,statusFactLines,usageLine} from '../../src/tui/status-view.ts';
import {SLASH_COMMANDS,slashCommandHelp} from '../../src/tui/slash-commands.ts';
import {projectId} from '../../src/paths.ts';

const env=hermeticProfile();after(()=>env.restore());

test('R5b D7: the /status facts — sandbox, rules by scope, tasks and notes, usage — and honest unknowns',()=>{
  const lines=statusFactLines({sandbox:true,rules:{user:{allow:2,ask:0,deny:1},project:{allow:1,ask:1,deny:0},projectUser:{allow:0,ask:0,deny:0}},work:{open:3,doing:1,notes:5},usage:'↑12k ↓3k · ctx 42% · ~$0.010'});
  assert.deepEqual(lines,[
    '  sandbox  verified: commands run isolated',
    '  rules    allow 3 · ask 1 · deny 1 (user 3 · project 2 · yours here 0)',
    '  work     tasks open 3 (in progress 1) · notes 5',
    '  usage    ↑12k ↓3k · ctx 42% · ~$0.010',
  ]);
  assert.deepEqual(statusFactLines({sandbox:false,rules:{user:{allow:0,ask:0,deny:0},project:{allow:0,ask:0,deny:0},projectUser:{allow:0,ask:0,deny:0}},work:null,usage:null}),[
    '  sandbox  none: commands run unsandboxed',
    '  rules    none: every action follows the mode',
    '  work     tasks and notes not available here',
    '  usage    nothing measured yet',
  ]);
  assert.match(statusFactLines({sandbox:null,rules:null,work:null,usage:null}).join('\n'),/sandbox  not checked yet[\s\S]*rules    could not be read/u);
  const block=sessionStatusText({session:'abc',running:false,model:'m:x',mode:'default',tools:1,facts:{sandbox:true,rules:null,work:null,usage:null}});
  assert.match(block,/^  tools    1 call so far\n  sandbox  verified/mu,'the R4 block first, then the facts');
});

test('R5b D7: the rules are counted in each scope\'s own file',async()=>{
  const root=join(env.root,'rules-project');mkdirSync(join(root,'.talos-cli'),{recursive:true});
  await mkdir(env.paths.configRoot,{recursive:true});
  await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2,permissions:{allow:['Read(*)','Bash(git status)'],ask:[],deny:['Bash(rm:*)']}}));
  await writeFile(join(root,'.talos-cli','config.json'),JSON.stringify({version:2,permissions:{allow:['Bash(npm test)'],ask:['Write(*)'],deny:[]}}));
  const counts=await permissionRuleCounts({paths:env.paths,projectRoot:root});
  assert.deepEqual(counts,{user:{allow:2,ask:0,deny:1},project:{allow:1,ask:1,deny:0},projectUser:{allow:0,ask:0,deny:0}});
  await writeFile(join(env.paths.configRoot,'config.json'),'{broken');
  assert.equal(await permissionRuleCounts({paths:env.paths,projectRoot:root}),null,'unreadable: said, not zero');
  await writeFile(join(env.paths.configRoot,'config.json'),JSON.stringify({version:2}));
  assert.ok(projectId(root));
});

test('R5b D7: usage in one line from the status bar\'s own words; nothing measured says so',async()=>{
  const {usageFacts}=await import('../../src/tui/usage-view.ts');
  const facts=usageFacts({model:'ollama:qwen3',usage:{prompt_tokens:12000,completion_tokens:3400},contextStatus:null,compactions:1});
  const line=usageLine(facts.snapshot,'ollama:qwen3');
  assert.ok(line,'a measured run gives a line');
  assert.match(line!,/↑12k ↓3.4k/u);assert.match(line!,/cmp 1/u);
  assert.doesNotMatch(line!,/model /u,'only usage, not the model');
  assert.equal(usageLine(null,'m:x'),null);
});

test('R5b D7: /help groups the commands, every command once',()=>{
  const help=slashCommandHelp();
  const groups=['Session','Model and turn','View','Work','Extensions'];
  let at=-1;for(const heading of groups){const next=help.indexOf(`${heading}\n`);assert.ok(next>at,`${heading} in order`);at=next;}
  for(const command of SLASH_COMMANDS)assert.equal(help.split('\n').filter(line=>line.startsWith(`  /${command.name} `)||line===`  /${command.name}`||line.startsWith(`  /${command.name} —`)).length,1,command.name);
  const section=(heading:string)=>help.slice(help.indexOf(`${heading}\n`)).split('\n\n')[0]!;
  assert.match(section('Session'),/\/undo/u);assert.match(section('View'),/\/theme/u);assert.match(section('Work'),/\/notes/u);assert.match(section('Extensions'),/\/mcp/u);assert.match(section('Model and turn'),/\/effort/u);
});

test('R5b D7 /status in the real app: the block ends with the four facts',async()=>{
  const root=join(env.root,'status-project');mkdirSync(root,{recursive:true});
  const app=await mountR5a({cols:110,rows:40,root,paths:env.paths});
  try{
    await app.type('/status');app.press('\r');
    /* stage 7.11 (owner 03/10): the Settings sheet's Status tab keeps these facts after the mockup's rows */
    const s=await app.waitFor('the status tab',x=>/── Settings this project/u.test(x.text)&&/Work {10}/u.test(x.text));
    assert.match(s.text,/Sandbox {7}(not checked yet|verified on this computer|none: commands run as you)/u);
    assert.match(s.text,/Rules {9}none of your own/u);
    assert.match(s.text,/Work {10}tasks open 0 · notes 0/u);
    await sleep(20);
  }finally{app.unmount();}
});
