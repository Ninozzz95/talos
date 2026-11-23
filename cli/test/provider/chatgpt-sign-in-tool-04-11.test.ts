/*
 * Decision 116 C, §8 (04/11/2026): the kernel's `chatgpt_account` gets the action `sign_in`, which puts the desktop's and the phone's
 * «Sign in and resume» card in the conversation. The CLI has no such card, so its host answers `sign_in` itself: in the preview with
 * no permission card (`carta:false`, the kernel's shape for «nothing to approve»), and in the run with the person's command. The kernel
 * host is never reached for it; every other action still is. Hermes: the Codex sign-in is the person's command (hermes_cli/auth.py:2370);
 * OpenAI «Sign in with ChatGPT — errors and recovery»: on a confirmed disconnection, ask the user to sign in again.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {providerExclusionsHost} from '../../src/runtime/talos-composition.ts';

/* a stand-in kernel host that records what reaches it */
const fakeRepo=()=>{
  const root=mkdtempSync(join(tmpdir(),'talos-signin-'));const src=join(root,'harness-ui','src');mkdirSync(src,{recursive:true});
  writeFileSync(join(src,'fornitori-per-il-modello.mjs'),"export const visti=[];export function creaOspiteFornitori(){return()=>async(name,args,opts)=>{visti.push([name,args?.action,opts?.fase]);return{ok:true,testo:'kernel',carta:true};};}\n");
  writeFileSync(join(src,'openrouter-fornitori.mjs'),'export function slugDelFornitore(){return null;}\n');
  return root;
};
const access={stato:()=>({collegato:false}),esci:async()=>({revocaConfermata:true})};

test('sign_in is answered by the CLI with no card, in the preview and in the run; the kernel host never sees it',async()=>{
  const root=fakeRepo();
  try{
    const host=(await providerExclusionsHost(root,{},access))!({});
    const preview=await host('chatgpt_account',{action:'sign_in'},{fase:'anteprima'});
    assert.equal(preview.ok,true);assert.equal(preview.carta,false);
    assert.match(preview.testo,/talos provider login chatgpt/u);assert.match(preview.testo,/no sign-in card in this terminal/u);
    const run=await host('chatgpt_account',{action:' Sign_In '},{fase:'esegui'});
    assert.equal(run.ok,true);assert.equal(run.carta,undefined);assert.match(run.testo,/talos provider login chatgpt/u);
    assert.doesNotMatch(run.testo,/card is now in the conversation|Sign in and resume/u);
    /* N4 of the 116 C review (04/11 15:29): clients show the card only on `schedaChatgpt:true`, which only a host that placed it sends */
    assert.equal('schedaChatgpt' in preview,false);assert.equal('schedaChatgpt' in run,false);
    const kernel=await import(new URL(`file:///${join(root,'harness-ui','src','fornitori-per-il-modello.mjs').replace(/\\/gu,'/')}`).href);
    assert.deepEqual(kernel.visti,[]);
    /* the other way: the other actions still reach the kernel host, the disconnect's card included */
    const out=await host('chatgpt_account',{action:'disconnect'},{fase:'anteprima'});
    assert.equal(out.carta,true);assert.deepEqual(kernel.visti,[['chatgpt_account','disconnect','anteprima']]);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('without a keyring sign_in says the plan cannot be connected here, still with no card',async()=>{
  const root=fakeRepo();
  try{
    const host=(await providerExclusionsHost(root,{},null))!({});
    const preview=await host('chatgpt_account',{action:'sign_in'},{fase:'anteprima'});
    assert.equal(preview.carta,false);assert.match(preview.testo,/system keyring is not available/u);
  }finally{rmSync(root,{recursive:true,force:true});}
});
