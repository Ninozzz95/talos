import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

/* CLI 0.7.0, step 4 (owner 23/11/2026, row 225): the CLI gates are part of the common check that ci.yml runs on every pull
   request; packaging and the Windows smoke moved to cli-release.yml, with the real version instead of a stale 1.0.0. */
test('CLI workflow gates Linux and Windows unit and the shared kernel, called by the common check',async()=>{
  const text=await readFile(new URL('../../../.github/workflows/cli.yml',import.meta.url),'utf8');
  assert.match(text,/cli-unit:/u);
  assert.match(text,/cli-windows:/u);
  assert.match(text,/cli-desktop-regression:/u);
  assert.match(text,/workflow_call:/u);
  assert.match(text,/node-version: '24\.18\.0'/u);
  assert.match(text,/npm --prefix cli test/u);
  assert.match(text,/kernel:controlla/u);
  assert.match(text,/verify:all gate is intentionally NOT executed/u);
  assert.doesNotMatch(text,/1\.0\.0/u);
  const ci=await readFile(new URL('../../../.github/workflows/ci.yml',import.meta.url),'utf8');
  assert.match(ci,/uses: \.\/\.github\/workflows\/cli\.yml/u);
  assert.match(ci,/-f cli\/package\.json/u);
});

test('the release workflow keeps packaging and the Windows smoke of the CLI',async()=>{
  const text=await readFile(new URL('../../../.github/workflows/cli-release.yml',import.meta.url),'utf8');
  assert.match(text,/stage-windows\.mjs/u);
  assert.match(text,/windows-smoke\.ps1/u);
  assert.match(text,/npm --prefix cli prune --omit=dev/u);
});

test('Windows smoke includes real coding read-write-test-final gate',async()=>{const text=await readFile(new URL('../../e2e/windows-smoke.ps1',import.meta.url),'utf8');assert.match(text,/CODING_E2E/u);assert.match(text,/output\.txt/u);assert.match(text,/bypassPermissions/u);assert.match(text,/Get-Content -Raw \$outputFile/u);});

test('Windows smoke verifies session resume in a second CLI process',async()=>{const text=await readFile(new URL('../../e2e/windows-smoke.ps1',import.meta.url),'utf8');assert.match(text,/--resume last/u);assert.match(text,/resume after process exit/u);assert.match(text,/resumedObj\.sessionId -ne \$obj\.sessionId/u);});

/* Owner 2026-09-26: no paid call unless asked. The live gate stays, opt-in through the repository variable TALOS_CLI_LIVE_GATE. */
test('release workflow keeps the OpenAI Anthropic and Gemini live gate, opt-in only: no paid call by default',async()=>{const text=await readFile(new URL('../../../.github/workflows/cli-release.yml',import.meta.url),'utf8');for(const secret of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','GOOGLE_GENERATIVE_AI_API_KEY'])assert.ok(text.includes(secret));for(const model of ['openai:gpt-5-nano','anthropic:claude-haiku-4-5-20251001','google:gemini-2.5-flash-lite'])assert.ok(text.includes(model));assert.match(text,/missing release secret/u);assert.match(text,/LIVE_PROVIDER_OK/u);assert.match(text,/- name: Live provider release gate\r?\n\s+if: vars\.TALOS_CLI_LIVE_GATE == 'true'/u,'the paid gate runs only when the variable says so');});
