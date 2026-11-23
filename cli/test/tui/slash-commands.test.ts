import assert from 'node:assert/strict';
import test from 'node:test';
import {parseSlashCommand,SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';

const REQUIRED=['help','model','permissions','plan','diff','status','context','compact','mcp','hooks','plugins','memory','notes','tasks','library','research','automations','forge','doctor','clear','redraw','exit'];

test('all mandatory v1 slash commands from the approved spec are registered',()=>{
  for(const n of REQUIRED)assert.ok(SLASH_COMMANDS.some(x=>x.name===n),`missing /${n}`);
});

test('slash parser separates command and args and suggests typo',()=>{
  assert.deepEqual(parseSlashCommand('/model openai:gpt'),{name:'model',args:['openai:gpt'],suggestions:[]});
  const x=parseSlashCommand('/permisisons');assert.ok(x.suggestions.includes('permissions'));
});

test('slash completion returns ordered prefix matches for command palette and exact completion',async()=>{
 const {completeSlashCommand}=await import('../../src/tui/slash-commands.ts');
 assert.deepEqual(completeSlashCommand('/sta').slice(0,2),['/status']);
 assert.ok(completeSlashCommand('/').includes('/model'));
 assert.deepEqual(completeSlashCommand('hello'),[]);
});
