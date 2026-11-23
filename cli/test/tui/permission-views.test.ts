/*
 * Stage 7.21 (mockup permissions «project · you», «denied by you · allowed once · blocked · 4 min ago»; owner 03/10): the rules
 * and the last decisions as /permissions shows them.
 */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import test from 'node:test';
import {actionLabel,recentViews,ruleViews} from '../../src/tui/permission-views.ts';

const ROOT=process.platform==='win32'?'C:\\work\\shop':'/work/shop';
const NOW=Date.parse('2026-10-01T15:00:00Z');

test('a rule says where it is saved, as the mockup\'s project and you',()=>{
  assert.deepEqual(ruleViews([
    {rule:'Bash(npm test:*)',effect:'allow',origin:'project',scopes:['project']},
    {rule:'Bash(git push:*)',effect:'ask',origin:'project-user',scopes:['project-user']},
    {rule:'Read(.env*)',effect:'deny',origin:'user',scopes:['user']},
  ]).map(row=>row.meta),['project','you','all projects']);
});

test('a decision: what was asked in a few words, what came of it, when, why a block, the rule a would add',()=>{
  const views=recentViews([
    {at:'2026-10-01T14:56:00Z',action:{tool:'Bash',command:'rm -rf dist'},outcome:'denied'},
    {at:'2026-10-01T14:54:00Z',action:{tool:'Edit',resource:join(ROOT,'src','auth','login.ts')},outcome:'allowed-once'},
    {at:'2026-10-01T14:00:00Z',action:{tool:'Write',resource:join(ROOT,'..','elsewhere.txt')},outcome:'blocked',code:'PATH_NOT_ALLOWED'},
    {at:'2026-10-01T13:00:00Z',action:{tool:'Bash',command:'npm test && npm publish'},outcome:'allowed-always'},
  ],{projectRoot:ROOT,now:NOW});
  assert.deepEqual(views.map(v=>[v.label,v.outcome,v.bad,v.meta]),[
    ['rm -rf dist','denied by you',true,'4 min ago'],['Edit src/auth/login.ts','allowed once',false,'6 min ago'],
    [`Write ${join(ROOT,'..','elsewhere.txt')}`,'blocked',true,'1 h ago'],['npm test && npm publish','always allowed',false,'2 h ago']]);
  assert.equal(views[0]!.desc,'from the approval card');
  assert.equal(views[2]!.desc,'This path is outside the folders TALOS may use.');
  assert.equal(views[3]!.desc,'from the approval card, saved as a rule');
  assert.equal(views[0]!.rule,'Bash(rm -rf dist)');
  assert.equal(views[3]!.rule,null,'a command of two segments is never remembered');
  assert.equal(actionLabel({tool:'Mcp',serverId:'github',operation:'create_issue'},ROOT),'github · create_issue');
});
