import assert from 'node:assert/strict';
import test from 'node:test';
import {ONBOARDING_COPY,onboardingSteps} from '../../src/tui/onboarding.ts';

test('M2-F-RED-1 — onboarding shows only missing setup steps in stable order',()=>{
  assert.deepEqual(onboardingSteps({projectTrusted:false,providerConfigured:false,modelConfigured:false}).map(x=>x.id),['trust','provider','model']);
  assert.deepEqual(onboardingSteps({projectTrusted:true,providerConfigured:false,modelConfigured:false}).map(x=>x.id),['provider','model']);
  assert.deepEqual(onboardingSteps({projectTrusted:true,providerConfigured:true,modelConfigured:false}).map(x=>x.id),['model']);
  assert.deepEqual(onboardingSteps({projectTrusted:true,providerConfigured:true,modelConfigured:true}),[]);
});

test('onboarding copy is data-driven and localizable without runtime branching',async()=>{
  assert.ok(ONBOARDING_COPY.en.trust);
  assert.ok(ONBOARDING_COPY.en.provider);
  assert.ok(ONBOARDING_COPY.en.model);
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/onboarding.ts',import.meta.url),'utf8');
  assert.equal(source.includes("if(locale==='"),false);
});

test('M2-F-RED-4 — app consumes onboarding helper after selection state is known',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../../src/tui/app.ts',import.meta.url),'utf8');
  assert.ok(source.includes('onboardingSteps'));
  assert.ok(source.includes('selectionLoaded'));
  assert.equal(source.includes('Choose a provider and key with /provider'),false);
  assert.equal(source.includes('Choose a model with /model'),false);
});
