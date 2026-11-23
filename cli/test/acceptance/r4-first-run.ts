/**
 * R4 exit frames (review R4 row; gate §10, E14): the first launch in an empty folder with no provider, in a folder with
 * AGENTS.md, and with a key-requiring model and no key — one fresh profile per case and per terminal size. Every TALOS here
 * runs behind the refusing sink (sink.ts): no request may leave 127.0.0.1. What R4 must change is asserted as declared
 * reds owned by R4, each failing with its own id, until lane F lands (owner decisions Q-R4-1…4, 13, 14).
 */
import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {assertEnglishOnly,brokenBorders} from './checks.ts';
import {composerReady,idleFooter} from './checks.ts';
import {exitTalos,stage,toComposer} from './harness.ts';
import {sinkEnv,type RefusingSink} from './sink.ts';
import type {Screen,TerminalSession} from './terminal.ts';

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
/* Today's dialog and Q-R4-2's both offer "Trust this folder". */
const TRUST_CHOICE=/Trust this folder/u;
const highlighted=(s:Screen,label:string)=>s.lines.some(line=>new RegExp(`[›>]\\s*(\\[\\d\\]\\s*)?${label}`,'u').test(line));
/* A key-requiring provider the harness never reaches: the memory credential store holds no key, the runner drops
   secret-named variables, and the sink refuses any outbound request. */
const NO_KEY_MODEL='openai:gpt-test';

type Case={trust?:Screen;setup?:Screen;idle?:Screen;doctor?:{status:number|null;stdout:string;stderr:string};doctorJson?:{status:number|null;stdout:string}};

/** `sink` is started by the scenario file (top-level await), so every stage's profile carries its environment. */
export function registerFirstRun(label:string,size:{cols:number;rows:number},sink:RefusingSink){
  const name=(what:string)=>`${label} · ${size.cols}×${size.rows} · ${what}`;
  const env=sinkEnv(sink);
  const empty=stage({name:`${label}-empty`,files:{},useModel:false,extraEnv:env,trusted:false});
  const agents=stage({name:`${label}-agents`,files:{'AGENTS.md':'Always answer in English.\n','README.md':'# demo\n'},extraEnv:env,trusted:false});
  const noKey=stage({name:`${label}-nokey`,files:{'README.md':'# demo\n'},model:NO_KEY_MODEL,extraEnv:env,trusted:false});
  const cases:Record<'empty'|'agents'|'noKey',Case>={empty:{},agents:{},noKey:{}};

  /* The first launch: answer a trust question if one is asked (Q-R4-2: keys are ignored for 300 ms, so wait first, then
     move the highlight up to "Yes, trust this folder": No is the default since 02/11), then skip the boot and wait for the idle composer. */
  const SETUP_SHEET=/── Setup provider, key, model · step by step/u;
  async function firstLaunch(t:TerminalSession,c:Case){
    const first=await t.waitFor('the trust question or the boot',x=>TRUST_CHOICE.test(x.text)||/BOOT\s+\d+%|^│ ›/mu.test(x.text)/* UI Phase 0: the main screen is the composer */,{timeout:30_000});
    if(TRUST_CHOICE.test(first.text)){
      await sleep(1150);c.trust=t.screen(); /* the grace is one second since judge v2242 */
      for(let i=0;i<4&&!highlighted(t.screen(),'Yes, trust this folder');i++){t.press('up');await sleep(150);}
      t.press('enter');
    }
    /* P17 (owner decisions 2026-09-26), stage 7.10d: when something is missing the setup sheet opens; Esc ends it. */
    const next=await t.waitFor('the composer or the guided setup',x=>SETUP_SHEET.test(x.text)||(composerReady(x)&&idleFooter(x)&&!/BOOT\s+\d+%/u.test(x.text)),{timeout:30_000});
    if(SETUP_SHEET.test(next.text)){
      await sleep(300);c.setup=t.screen();
      t.press('esc');
      await t.waitFor('the setup skipped',x=>/Setup skipped/u.test(x.text),{timeout:10_000});
    }
    await toComposer(t);await sleep(1500);c.idle=t.screen();
  }

  test(name('an empty folder with no provider: first launch'),async()=>{
    const t=empty.launch([],size);await firstLaunch(t,cases.empty);await exitTalos(t);
    cases.empty.doctor=await empty.profile.talos(['doctor']);
    const json=await empty.profile.talos(['doctor','--json']);cases.empty.doctorJson={status:json.status,stdout:json.stdout};
  });
  test(name('a folder with AGENTS.md: first launch'),async()=>{
    const t=agents.launch([],size);await firstLaunch(t,cases.agents);await exitTalos(t);
  });
  test(name('a key-requiring model and no key: first launch'),async()=>{
    const t=noKey.launch([],size);await firstLaunch(t,cases.noKey);await exitTalos(t);
  });

  test(name('no request left 127.0.0.1 (gate E14)'),()=>{
    assert.deepEqual(sink.hits,[],`TALOS tried to reach the network: ${JSON.stringify(sink.hits)}`);
  });
  test(name('the idle frames are English and no row mixes a border with content'),()=>{
    for(const [key,c] of Object.entries(cases)){
      assertEnglishOnly(c.idle!.text,`D-05 ${key}`);
      assert.deepEqual(brokenBorders(c.idle!),[],`${key}: rows mix a border with content`);
    }
  });
  /* P17 (owner decisions 1, 2, 5): with no provider the first launch opens the guided setup at the provider step, a local
     engine that answers first; Esc skips it and says how to start it again. */
  test(name('with no provider the guided setup opens at the provider step, and Esc says how to come back'),()=>{
    const setup=cases.empty.setup;
    assert.ok(setup,`P17: no guided setup on the first launch with no provider:\n${cases.empty.idle!.text}`);
    /* stage 7.10d: the sheet opens on «1 Provider», the local engine that runs first */
    assert.match(setup.text,/1 Provider {3}2 Key {3}3 Model {3}4 Check/u);
    assert.match(setup.text,/› ○ Ollama Local \(no key\)/u,`the local engine that runs is not first:\n${setup.text}`);
    assert.match(cases.empty.idle!.text,/Setup skipped\. \/setup starts it again/u);
    assert.equal(cases.agents.setup,undefined,'a profile with a usable provider and model got the setup');
  });

  /* ---- R4 declared reds: each fails with its own id until lane F lands. ---- */
  test(name('R4: R4-TRUST an empty folder is asked, with No highlighted among the four choices (owner decision 2, 02/11)'),()=>{
    for(const key of ['empty','agents'] as const){
      const frame=cases[key].trust;
      assert.ok(frame,`R4-TRUST: the ${key} folder was never asked whether to trust it (Q-R4-1)`);
      for(const choice of ['Yes, trust this folder','Only this time','No'])assert.ok(frame.text.includes(choice),`R4-TRUST: the ${key} dialog has no "${choice}" choice (Q-R4-2)`);
      /* v1483 and decision 1635 (step 3): the folder that contains the project here also holds the home folder (profile.ts: <tmp>/project
         and <tmp>/user), and a folder above home is never saved, so the dialog does not offer it. Q-R4-2's fourth choice shows only
         where the containing folder can be saved (trust-authority.test.ts). */
      assert.ok(!frame.text.includes('Yes, and the folder that contains it'),`R4-TRUST: the ${key} dialog offers to save a folder above home:\n${frame.text}`);
      assert.ok(highlighted(frame,'No'),`R4-TRUST: "No" is not the highlighted choice when the ${key} dialog appears (Q-R4-2):\n${frame.text}`);
      /* P17: on a fresh profile the trust question is step 1 of the setup. */
      assert.match(frame.text,/TALOS · Setup · Trust this folder\?/u);
    }
  });
  test(name('R4: R4-LOADED the first frame says AGENTS.md was loaded'),()=>{
    assert.match(cases.agents.idle!.text,/Loaded AGENTS\.md/u,`R4-LOADED: no "Loaded AGENTS.md" line (Q-R4-13):\n${cases.agents.idle!.text}`);
  });
  /* P17 (decision 2): a chosen provider with no key opens the setup at its key step, without probing the provider. */
  test(name('R4: R4-KEY a missing key opens the setup at the key step of the chosen provider'),()=>{
    const setup=cases.noKey.setup;
    assert.ok(setup,`R4-KEY: no guided setup for a chosen provider with no key:\n${cases.noKey.idle!.text}`);
    /* stage 7.10d (owner 03/10): the sheet opens on «2 Key», the field naming the provider */
    assert.match(setup.text,/› OpenAI API key/u,`R4-KEY:\n${setup.text}`);
  });
  test(name('R4: R4-DOCTOR doctor says needs attention and exits 1 with no provider, keeping JSON ok'),()=>{
    const d=cases.empty.doctor!;
    assert.notEqual(d.status,0,`R4-DOCTOR: talos doctor exits 0 with no provider (Q-R4-14):\n${d.stdout}${d.stderr}`);
    assert.match(d.stdout,/needs attention/iu,`R4-DOCTOR: the headline does not say "needs attention":\n${d.stdout}`);
    const json=JSON.parse(cases.empty.doctorJson!.stdout);
    assert.equal(typeof json.ok,'boolean','R4-DOCTOR: the v1 `ok` field is gone (E12)');
    assert.equal(json.ready,false,`R4-DOCTOR: doctor --json has no ready:false with no provider: ${cases.empty.doctorJson!.stdout.slice(0,400)}`);
  });

  after(async()=>{await sink.close();});
}
