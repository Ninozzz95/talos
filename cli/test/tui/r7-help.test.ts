/*
 * Stage 7.17 (mockup help; Claude Code /help tabs, Gemini CLI /help commands and keys): /help is the mockup's sheet — every
 * command in its group, / searches, the one under the cursor says what it does, Enter opens it as if typed; Keys lists the
 * mockup's ten keys. The ? key keeps its card of keys. Mount: the REAL TuiApp (r5a-s-fixture.ts), a temp profile.
 */
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import test,{after} from 'node:test';
import {hermeticProfile} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';
import {SLASH_COMMANDS} from '../../src/tui/slash-commands.ts';

const env=hermeticProfile();after(()=>env.restore());
const ENTER='\r',TAB='\t',ESC='\x1b';
const flat=(lines:readonly string[])=>lines.map(line=>line.trim()).join(' ');

test('stage 7.17: /help lists every command; / finds one and Enter opens it; Keys has the mockup\'s keys',async()=>{
  /* a folder outside git: the command it opens answers in one line */
  const root=join(env.root,'..',`help-${Date.now()}`);mkdirSync(root,{recursive:true});
  const app=await mountR5a({cols:120,rows:40,root,paths:env.paths});
  try{
    await app.type('/help');app.press(ENTER);
    const s=await app.waitFor('the sheet',x=>new RegExp(`── Help TALOS \\d+\\.\\d+ · ${SLASH_COMMANDS.length} commands`,'u').test(x.text));
    assert.match(s.text,/› \/resume +Session +│ \/resume \[session-id\]/u);
    assert.match(s.text,/Enter opens its panel\./u);
    app.press(TAB);
    const keys=await app.waitFor('the keys',x=>/ctrl\+o +Transcript and search/u.test(x.text));
    assert.match(keys.text,/drag +select · copies on release/u);
    app.press(TAB);await app.waitFor('back to the commands',x=>/› \/resume/u.test(x.text));
    /* two Enters read in one chunk (ConPTY merges what is typed fast) are still two Enters: keep the search, open it */
    await app.type('/diff');app.press(ENTER+ENTER);
    await app.waitFor('/diff ran',x=>/This folder is not a git repository: \/diff needs git\./u.test(flat(x.lines)));
    assert.doesNotMatch((await app.screen()).text,/── Help/u);
    app.press(ESC);
  }finally{app.unmount();}
});
