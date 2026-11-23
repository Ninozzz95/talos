/* FA-E2E-01: real CLI, ConPTY, kernel/tools, temporary project and fake provider. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {test} from 'node:test';
import {MODE_NAME,approvalVisible,assertHeightBudgeted,idleFooter,modeOf} from './checks.ts';
import {answerApproval,exitTalos,stage,toComposer,turn} from './harness.ts';
import {WRITE_CONTENT} from './fake-provider.ts';
import type {TerminalSession} from './terminal.ts';

const s=stage({name:'s32',files:{'README.md':'# Full access acceptance\n'}});
/* the mockup's mode row (checks.ts), named as this file names the modes */
const mode=(name:string)=>(screen:{text:string})=>modeOf(screen)===(MODE_NAME[name]??name);
const confirmation=(screen:{text:string})=>screen.text.includes('Enable Full access?');
async function next(t:TerminalSession,name:string){t.press('shift+tab');await t.waitFor(`mode ${name}`,mode(name));}

for(const size of [{cols:60,rows:24},{cols:100,rows:30},{cols:120,rows:36}]){
  test(`FA-E2E-01 ${size.cols}x${size.rows}: confirmation, real tools, manual and restart`,{timeout:180_000},async()=>{
    const t=s.launch([],size);
    try{
      await toComposer(t);
      await turn(t,s.fake,`Hello, project ${size.cols}.`);
      await next(t,'accept edits');await next(t,'plan');
      t.press('shift+tab');
      const prompt=await t.waitFor('confirmation before Full access',confirmation);
      assert.ok(mode('plan')(prompt));assertHeightBudgeted(prompt);
      assert.ok(prompt.text.includes('Cancel')&&prompt.text.includes('without asking'));
      t.press('enter');await t.waitFor('Cancel is the default',screen=>!confirmation(screen)&&mode('plan')(screen));
      t.press('shift+tab');await t.waitFor('confirm again',confirmation);
      t.press('down');await t.settled();t.press('enter');
      await t.waitFor('Full access enabled',screen=>!confirmation(screen)&&mode('Full access')(screen));
      const before=s.fake.chatRequests().length;
      await t.submit(`${size.cols}: TOOLS Read, list and write notes.`);
      const done=await t.waitFor('all real tools completed without permission prompts',screen=>{
        assert.equal(approvalVisible(screen),false,'Full access must not ask for these permitted tools');
        return s.fake.chatRequests().length>=before+4&&idleFooter(screen)&&screen.text.includes('Done: used 3 tools.');
      },{timeout:40_000});
      assert.equal(readFileSync(join(s.profile.project,'notes.txt'),'utf8'),WRITE_CONTENT);
      assert.match(done.text,/^ full access(?: · ctx [^·]+)? · shift\+tab/mu,'the mode row starts with full access');
      assertHeightBudgeted(done);
      /* the approved mockup folds the calls into groups; the full transcript (Ctrl+O) draws each call with why it ran */
      t.press('ctrl+o');
      const full=await t.waitFor('the full transcript',x=>/^ Transcript · /mu.test(x.text),{timeout:10_000});
      assert.ok(full.lines.some(line=>/Full access/u.test(line)&&/Read|Shell|Write/u.test(line)),
        `a tool row explains why it ran:\n${full.text}`);
      t.press('ctrl+o');
      await t.waitFor('back to the prompt',x=>!/^ Transcript · /mu.test(x.text)&&idleFooter(x),{timeout:10_000});
      await next(t,'manual');
      await t.submit(`${size.cols}: TOOLS Do that again in manual.`);
      await t.waitFor('manual asks again',screen=>approvalVisible(screen)&&screen.text.includes('cmd /c dir /b'),{timeout:30_000});
      await answerApproval(t,'\u001b');
      await t.waitFor('manual turn interrupted',screen=>!approvalVisible(screen)&&idleFooter(screen));
      await next(t,'accept edits');await next(t,'plan');await next(t,'Full access');
      assert.equal(confirmation(t.screen()),false,'no second consent in the same session');
      /* The kernel starts a turn on fork. Finish a text turn first so the fork does not continue interrupted tools. */
      await turn(t,s.fake,`${size.cols}: Ready to branch.`);
      const beforeFork=s.fake.chatRequests().length;
      await t.submit('/fork last');
      await t.waitFor('a real fork leaves Full access and completes',screen=>mode('manual')(screen)&&idleFooter(screen)&&s.fake.chatRequests().length>beforeFork);
      await next(t,'accept edits');await next(t,'plan');
      t.press('shift+tab');await t.waitFor('the fork requires its own consent',confirmation);
      t.press('down');await t.settled();t.press('enter');
      await t.waitFor('the fork consent succeeds',screen=>!confirmation(screen)&&mode('Full access')(screen));
      await next(t,'manual');
      assert.ok(await exitTalos(t));
    }finally{await t.close();}
    const restarted=s.launch(['--resume','last'],size);
    try{
      await toComposer(restarted);
      await next(restarted,'accept edits');await next(restarted,'plan');
      restarted.press('shift+tab');await restarted.waitFor('restart requires new consent',confirmation);
      restarted.press('esc');await restarted.waitFor('restart cancellation keeps plan',screen=>!confirmation(screen)&&mode('plan')(screen));
      assert.ok(await exitTalos(restarted));
    }finally{await restarted.close();}
  });
}
