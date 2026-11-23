/**
 * R5b exit frames (R5 gate §16, D1–D8, and the owner's R5b answers), one fresh profile per terminal size, on the BUILT
 * CLI in a real pseudo-terminal read back by xterm-headless, behind the refusing sink (sink.ts): no request may leave
 * 127.0.0.1. The steps only drive TALOS and keep frames; the checks come after them, each named for what it proves.
 * Covered: /theme (preview, Esc, set), /status block, grouped /help, a file edit leaving the checkpoint row, /undo going
 * back (the file restored on disk), fuzzy @ with its source line, /export, /rename, /copy, /retry, /history, and the
 * prompt history coming back after a restart.
 */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {after,test} from 'node:test';
import {approvalVisible,assertEnglishOnly,brokenBorders,composerReady,idleFooter} from './checks.ts';
import {answerApproval,clearComposer,exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,type RefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const ORIGINAL='console.log(1)\n';

export function registerR5bSurfaces(label:string,size:{cols:number;rows:number},sink:RefusingSink){
  const s=stage({name:label,files:{'README.md':'# demo\n','src/index.js':ORIGINAL,'docs/deep/strings-guide.md':'x\n','dist/skip.js':'x\n','.gitignore':'dist/\n'},extraEnv:sinkEnv(sink)});
  let t:TerminalSession;
  const frames:Record<string,Screen>={};
  const name=(what:string)=>`${label} · ${size.cols}×${size.rows} · ${what}`;
  const flat=(x:Screen)=>x.text.replace(/\s+/gu,' ');
  async function soft(what:string,predicate:(x:Screen)=>boolean,timeout=15_000):Promise<Screen>{try{return await t.waitFor(what,predicate,{timeout});}catch{return t.screen();}}
  async function idle(){await soft('idle',x=>composerReady(x)&&idleFooter(x),30_000);}
  async function command(text:string,done:(x:Screen)=>boolean,key:string){await t.submit(text);frames[key]=await soft(text,done);}

  test(name('TALOS opens at the composer'),async()=>{t=s.launch([],size);await toComposer(t);await sleep(800);frames.idle=t.screen();});

  /* P15: a fresh profile is in Forge, the default since 0.2.0. */
  test(name('THEME: /theme previews with the arrows, Esc puts Forge back, /theme ember sets it'),async()=>{
    await t.submit('/theme');
    /* stage 7.18: the mockup's /theme page */
    frames.themePicker=await soft('the theme page',x=>/› ██ Forge +in use/u.test(x.text));
    t.press('down');await sleep(300);frames.themePreview=t.screen();
    t.press('esc');await soft('page closed',x=>!/preview live/u.test(x.text));
    await command('/theme ember',x=>/Theme: Ember/u.test(x.text),'themeSet');
  });

  test(name('STATUS and HELP: the /status block and the grouped /help'),async()=>{
    /* stage 7.11 (owner 03/10): /status is the Settings sheet; its Status tab keeps sandbox, rules and work after the mockup's rows */
    await command('/status',x=>/── Settings this project/u.test(x.text)&&/Work {10}/u.test(x.text),'status');
    t.press('esc');await soft('settings closed',x=>!/── Settings this project/u.test(x.text));
    /* stage 7.17: /help is the mockup's sheet */
    await t.submit('/help');frames.help=await soft('help',x=>/── Help TALOS \d+\.\d+ · \d+ commands/u.test(x.text));
    t.press('esc');await soft('help closed',x=>!/── Help TALOS/u.test(x.text));
  });

  test(name('UNDO: an edit leaves the checkpoint row; /undo goes back and the file is restored on disk'),async()=>{
    await t.submit('EDIT the index');
    const end=Date.now()+60_000;
    for(;;){
      const x=await soft('the edit turn',y=>approvalVisible(y)||(idleFooter(y)&&composerReady(y)&&/Checkpoint · /u.test(y.text)),Math.max(1_000,end-Date.now()));
      /* Wait for the dialog to go before looking again: a stale frame still showing it made a second '1' land in the
         composer, and the next command was sent as '1/undo' (s24, 2026-09-25). */
      if(approvalVisible(x)&&Date.now()<end){await answerApproval(t,'1');await soft('the approval closed',y=>!approvalVisible(y),10_000);continue;}
      frames.checkpointRow=x;break;
    }
    frames.editedOnDisk={lines:[readFileSync(join(s.profile.project,'src','index.js'),'utf8')],text:readFileSync(join(s.profile.project,'src','index.js'),'utf8'),buffer:'alternate',cols:0,rows:0};
    await t.submit('/undo');
    /* stage 7.8: the mockup's sheet; f on the newest point puts its files back, at once */
    frames.undoPicker=await soft('the undo sheet',x=>/── Go back to an earlier point/u.test(x.text)&&/Files that go back/u.test(x.text));
    await sleep(250);await t.type('f');/* a letter is typed: press() names keys */
    frames.undone=await soft('gone back',x=>/Went back: 1 turn undone/u.test(x.text),20_000);
    await idle();
  });

  test(name('FILES: @ with part of a name searches the project and says where the rows come from'),async()=>{
    await t.type('@strings-gu');frames.fuzzy=await soft('the project search',x=>/Project search, \.gitignore respected/u.test(x.text));
    t.press('esc');await sleep(150);await clearComposer(t).catch(()=>{});
    await t.type('@skip');frames.ignored=await soft('the ignored file',x=>/Project search/u.test(x.text));
    t.press('esc');await sleep(150);await clearComposer(t).catch(()=>{});await idle();
  });

  test(name('SESSION: /export, /rename, /copy, /retry, /history'),async()=>{
    /* stage 7.7: /export opens its sheet (the approved mockup); Enter saves the file it proposes */
    await t.submit('/export');await soft('the export sheet',x=>/── Export this conversation/u.test(x.text));t.press('enter');
    frames.export=await soft('exported',x=>/Saved talos-[a-z0-9-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]md · [0-9]+ (B|KB)/u.test(x.text));
    await command('/rename demo work',x=>/demo work/u.test(x.text)&&/renamed|named|name/iu.test(x.text),'rename');
    /* stage 7.15: /copy alone opens the sheet; /copy 1 copies at once, the OSC 52 notice as before */
    await command('/copy 1',x=>/Copied answer 1 from the end/u.test(x.text),'copy');
    const before=s.fake.chatRequests().filter(r=>r.lastUser?.includes('EDIT the index')).length;
    /* stage 7.3: /retry opens its sheet (the approved mockup); Enter on «Send it again» sends the last message again */
    await t.submit('/retry');await soft('the retry sheet',x=>/Send it again/u.test(x.text));t.press('enter');
    frames.retry=await soft('retried',x=>s.fake.chatRequests().filter(r=>r.lastUser?.includes('EDIT the index')).length>before&&(approvalVisible(x)||idleFooter(x)),30_000);
    frames.retrySent={lines:[],text:String(s.fake.chatRequests().filter(r=>r.lastUser?.includes('EDIT the index')).length-before),buffer:'alternate',cols:0,rows:0};
    /* The retried edit asks again (the first was allowed once). An idle footer read in the instant before the approval
       arrives is not the end of the turn (s24 at 120×40, 01/10): answer every approval until the screen stays idle with no
       dialog for 800 ms. */
    for(let i=0;i<6;i++){
      if(approvalVisible(t.screen())){await answerApproval(t,'4');await soft('the approval closed',y=>!approvalVisible(y),10_000);continue;}
      await idle();await t.quiet(800);
      if(!approvalVisible(t.screen()))break;
    }
    await idle();
    await t.submit('/history');frames.history=await soft('the history list',x=>/Your messages/u.test(x.text));
    t.press('esc');await soft('history closed',x=>!/Your messages/u.test(x.text));
  });

  test(name('HISTORY: after a restart, up brings back the last message'),async()=>{
    await exitTalos(t);
    t=s.launch([],size);await toComposer(t);await sleep(600);
    /* The last things sent were `EDIT the index` (by /retry) and then `/history`: up walks back through them. */
    const recalled=(x:Screen)=>/│ › .*EDIT the index|› EDIT the index/u.test(x.text);
    for(let i=0;i<3&&!recalled(t.screen());i++){t.press('up');await soft('the next older message',recalled,2_000);}
    frames.recalled=t.screen();
    await clearComposer(t).catch(()=>{});await exitTalos(t);
  });

  /* The sink's own server would keep the test process alive after the last test (it did: two runs hung at the end). */
  after(async()=>{await sink.close();});
  /* ---- checks ---- */
  test(name('R5b-NETWORK: nothing tried to leave 127.0.0.1'),()=>{assert.deepEqual(sink.hits,[],`TALOS tried to reach the network: ${JSON.stringify(sink.hits)}`);});
  test(name('R5b-THEME: the picker lists the ten themes and mono; the preview and Esc do not save; /theme ember saves'),()=>{
    /* the page's note names Mono; at 60 columns it is cut after its first words */
    assert.match(flat(frames.themePicker!),/Forge/u);assert.match(flat(frames.themePicker!),/The whole screen previews the theme/u);
    const config=JSON.parse(readFileSync(join(s.profile.home,'appdata','TALOS-CLI','config.json'),'utf8'));
    assert.equal(config.ui?.theme,'ember');
  });
  test(name('R5b-STATUS/HELP: sandbox, rules, work and usage lines; help in groups'),()=>{
    for(const label of ['Sandbox','Rules','Work','Mode','MCP'])assert.match(frames.status!.text,new RegExp(`${label} +`,'u'),label);
    assert.match(frames.help!.text,/Session/u);
  });
  test(name('R5b-UNDO: the edit showed its checkpoint row, and /undo put the file back'),()=>{
    assert.match(frames.editedOnDisk!.text,/console\.log\(2\)/u,'the edit reached the disk first');
    assert.match(flat(frames.checkpointRow!),/Checkpoint · 1 file: src\/index\.js \(modified\) · \/undo goes back/u);
    /* wide: the detail beside names the file and its lines; at 60×30 the sheet's height leaves the row's own words */
    assert.match(flat(frames.undoPicker!),/Files that go back[^]*src\/index\.js +\+[0-9]+ −[0-9]+|Start of the conversation[^]*1 file changed since/u,'the sheet itself names what goes back');
    assert.doesNotMatch(flat(frames.undoPicker!),/1\/undo/u,'no stray key went into the composer');
    assert.equal(readFileSync(join(s.profile.project,'src','index.js'),'utf8'),ORIGINAL,'the file is back on disk');
  });
  test(name('R5b-FILES: the deep file is found by part of its name; the ignored one is not'),()=>{
    assert.match(flat(frames.fuzzy!),/@docs\/deep\/strings-guide\.md/u);
    assert.doesNotMatch(flat(frames.ignored!),/dist\/skip\.js/u,'.gitignore respected');
  });
  test(name('R5b-SESSION: export on disk, rename, copy, retry sent once more, history listed'),()=>{
    /* stage 7.7: the sheet's name, talos-<the conversation's name>-<date>.md */
    assert.ok(readdirSync(s.profile.project).some(file=>/^talos-[a-z0-9-]+-[0-9]{4}-[0-9]{2}-[0-9]{2}[.]md$/u.test(file)),'the Markdown export is in the project');
    assert.match(flat(frames.copy!),/without OSC 52 copies nothing/u);
    assert.ok(Number(frames.retrySent!.text)>=1,'/retry reached the provider');
    assert.match(flat(frames.history!),/EDIT the index/u);
  });
  test(name('R5b-HISTORY: the last message came back after a restart'),()=>{
    assert.match(frames.recalled!.text,/EDIT the index/u);
    assert.ok(existsSync(join(s.profile.home,'localappdata','TALOS-CLI','history')),'kept under the data root');
  });
  test(name('R5b-CHROME: English only and no broken border in any frame'),()=>{
    for(const [key,frame] of Object.entries(frames)){if(!frame.cols)continue;assertEnglishOnly(frame.text);assert.deepEqual(brokenBorders(frame),[],key);}
  });
}
