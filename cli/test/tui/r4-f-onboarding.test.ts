/*
 * R4 lane F — the first frame says what is missing and what was loaded (owner decision Q-R4-13; R4-KEY, R4-LOADED).
 * - A missing key is said before anything is sent, with the one missing-key sentence (R2 E8: the same as -p, provider test
 *   and doctor) when the provider is known, and always with where to add it (/provider).
 * - The instruction files TALOS loaded are named once (`Loaded AGENTS.md`), as an information line, not a setup step.
 * - The existing steps keep their order and their commands.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {onboardingSteps} from '../../src/tui/onboarding.ts';
import {useProviderRegistry} from '../../src/provider/missing-key.ts';

/* The composition hands the kernel's registry to the missing-key sentence; here, the one row it needs. */
useProviderRegistry({openai:{id:'openai',etichetta:'OpenAI',auth:{nomeVariabile:['OPENAI_API_KEY']}}} as any);

const ready={projectTrusted:true,providerConfigured:true,modelConfigured:true};

test('Q-R4-13: a missing key is a setup line that says "key" and where to add it',()=>{
  const generic=onboardingSteps({...ready,keyMissing:true});
  assert.deepEqual(generic.map(step=>step.id),['key']);
  assert.match(generic[0]!.text,/\bkey\b/iu);assert.equal(generic[0]!.command,'/provider');assert.equal(generic[0]!.kind,'step');
  const named=onboardingSteps({...ready,keyMissing:'openai'});
  assert.match(named[0]!.text,/OPENAI_API_KEY/u,'the provider\'s own variable is named');
  assert.match(named[0]!.text,/\bkey\b/iu);assert.equal(named[0]!.command,'/provider');
  assert.deepEqual(onboardingSteps({...ready,keyMissing:false}),[]);
});

test('Q-R4-13: the key line comes after choosing a provider and before choosing a model',()=>{
  assert.deepEqual(onboardingSteps({projectTrusted:true,providerConfigured:true,modelConfigured:false,keyMissing:true}).map(step=>step.id),['key','model']);
  assert.deepEqual(onboardingSteps({projectTrusted:true,providerConfigured:false,modelConfigured:false,keyMissing:true}).map(step=>step.id),['provider','model'],'no provider yet: choosing one comes first, and it asks for the key');
});

test('Q-R4-13: the loaded instruction files are one information line, first, even when setup is complete',()=>{
  const steps=onboardingSteps({...ready,loadedFiles:['AGENTS.md']});
  assert.deepEqual(steps,[{id:'loaded',kind:'info',text:'Loaded AGENTS.md',command:''}]);
  const two=onboardingSteps({projectTrusted:true,providerConfigured:false,modelConfigured:false,loadedFiles:['AGENTS.md','docs/CLAUDE.md']});
  assert.deepEqual(two.map(step=>step.id),['loaded','provider','model']);
  assert.equal(two[0]!.text,'Loaded AGENTS.md, docs/CLAUDE.md');
  assert.deepEqual(onboardingSteps({...ready,loadedFiles:[]}),[]);
  assert.equal(onboardingSteps({...ready,loadedFiles:['bad\u001bname.md']})[0]!.text,'Loaded bad\\u001bname.md','a file name is shown inert');
});

test('Q-R4-13: the setup steps are marked as steps, with the same words and commands as before',()=>{
  const steps=onboardingSteps({projectTrusted:false,providerConfigured:false,modelConfigured:false});
  assert.deepEqual(steps.map(step=>[step.id,step.kind,step.command]),[['trust','step','talos project trust --include-nested'],['provider','step','/provider'],['model','step','/model']]);
  assert.equal(steps[1]!.text,'Choose a provider and add a usable key if needed.');
});
