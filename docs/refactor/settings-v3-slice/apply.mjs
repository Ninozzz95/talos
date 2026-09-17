// One-time transport of SET-01 source already built and tested locally. Never run at app startup.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
const files = [
['harness-ui/frontend/src/components/impostazioni-campi.js','fa29a6cf3f6010dcdb88bd5e614dad926f149b290bed13ac6c11bf689e6bfb6e','9c88529c9703fd5658de418411dfbceafa616370771cd3ee0bc4f7530a742154'],
['harness-ui/frontend/src/components/impostazioni.js','72c27c40f0ce5f3531dac6839d06b870a96b25f83d69c527af504f4b0742567e','4aae3db7715b79cbec275512d6f611b627a475f871da103a1c5116c6a5851242'],
['harness-ui/frontend/src/design-system/settings.css',null,'d07003dea1189b6f7b052deca899c15309d05daa48bf1bbbed30c1f8e37c643d'],
['harness-ui/frontend/src/features/settings/schema.ts',null,'ec23cbb3b391644eafe53304458bc67e50923a7ec74d06283af43f4f2fba6466'],
['harness-ui/frontend/src/features/settings/settings-view.ts',null,'9dc82cb9340149342c862c51ec9997094edeb127bbc3db4cbf3e92e34ca2e2a5'],
['harness-ui/frontend/src/legacy/app.js','8684ceeba5cc03b9193b889f65768cda9d90896a1d20a711fa77f3a55ac3e346','226b66b96ce69cb39b8345ba86c6cd5b77e2ad501aa40d47f67cb7cfcecdb312'],
['harness-ui/frontend/src/styles/main.css','89defeffa7c5a2019c9414f332e36b8bd915e2e6bc6aa77d903a4cbbdb516f35','608d974028ecab618af5f5b98ab6864512e618ce02433a3b9e58adc208262585'],
['harness-ui/frontend/tests/refactor/settings-schema.test.mjs',null,'6efec4c34a1416fe6da2bc12c52b75e7e0e843e38d5dc14654e59de940fd28b9'],
];
const digest = data => createHash('sha256').update(data).digest('hex');
const actual = path => existsSync(path) ? digest(readFileSync(path)) : null;
assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),'','Dirty tracked checkout: do not overwrite.');
if (files.every(([path,,after]) => actual(path) === after)) {
  console.log('SET-01 exact changes already applied. No files rewritten.');
} else {
  for (const [path,before] of files) assert.equal(actual(path),before,'Changed preimage: '+path);
  const encoded = [1,2,3,4].map(i=>readFileSync(new URL(`part-${i}.b64`,import.meta.url),'utf8').trim()).join('');
  const packed = Buffer.from(encoded,'base64');
  assert.equal(digest(packed),'96668ad99f0ddfc4b4a374c5e5f5d4085702dbe0e2dbbfc4bb6a7d75a3f4a2a8','Transport integrity mismatch.');
  const patch = gunzipSync(packed);
  execFileSync('git',['apply','--check','-'],{input:patch});
  execFileSync('git',['apply','-'],{input:patch});
  for (const [path,,after] of files) assert.equal(actual(path),after,'Unexpected result: '+path);
  console.log('SET-01: 8 exact source files applied; screenshots and runtime acceptance remain mandatory.');
}
