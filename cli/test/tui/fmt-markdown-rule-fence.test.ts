/*
 * FMT (G06.2 brought forward, owner order 2026-09-30; screenshot 21:43: an answer shown as raw Markdown). Two causes, both
 * measured: a ```markdown fence made the whole answer one code block, and `---` was not a block at all. Owner decision
 * 2026-09-30, after reading Codex (only around a table), Claude Code (never) and Hermes (always): a `md`/`markdown` fence is
 * always drawn as Markdown, also while it streams, and Alt+R still shows the source; a thematic break is a dim rule
 * (Codex `Event::Rule`, Pi `case "hr"`).
 */
import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {markdownBlockLines,parseMarkdownBlocks} from '../../src/tui/components/markdown.ts';
import {hermeticProfile,sleep} from './r1-layout-fixture.ts';
import {mountR5a} from './r5a-s-fixture.ts';

const FENCE='```';
const REPORT=['## 7. RISCHI','| Rischio | Stato |','|---|---|','| Candidato | **Aperto** |','---','Fine.'].join('\n');
const kinds=(text:string)=>parseMarkdownBlocks(text).map(block=>block.kind);

test('FMT a thematic break is a rule block, spaced or not, and wins over a list item',()=>{
  for(const line of ['---','***','___','- - -','* * *','  ----  '])assert.deepEqual(kinds(`a\n\n${line}\n\nb`),['paragraph','rule','paragraph'],line);
  assert.deepEqual(kinds('Heading-like text\n---\nmore'),['paragraph','rule','paragraph'],'under a paragraph it is a rule, not a setext heading');
  assert.deepEqual(kinds('-- two\n\n- item'),['paragraph','list'],'two dashes and a real list item are unchanged');
  const rule=parseMarkdownBlocks('---')[0]!;
  assert.deepEqual(markdownBlockLines(rule,12,{unicode:true}).lines,['─'.repeat(12)]);
  assert.deepEqual(markdownBlockLines(rule,12).lines,['-'.repeat(12)]);
});

test('FMT a markdown fence is always drawn as Markdown, also unclosed; another language, or a markdown line inside it, stays code',()=>{
  for(const info of ['markdown','md','Markdown',' markdown '])assert.deepEqual(kinds(`${FENCE}${info}\n${REPORT}\n${FENCE}`),['heading','table','rule','paragraph'],info);
  assert.deepEqual(kinds(`Here:\n\n${FENCE}markdown\n${REPORT}\n${FENCE}\n\nDone.`),['paragraph','heading','table','rule','paragraph','paragraph']);
  assert.deepEqual(kinds(`${FENCE}markdown\n# README\n\nInstall it.\n${FENCE}`),['heading','paragraph'],'no table: drawn too (Hermes); Alt+R and Alt+C keep the source');
  assert.deepEqual(kinds(`${FENCE}markdown\n${REPORT}`),['heading','table','rule','paragraph'],'unclosed (still streaming): drawn as it arrives, no jump at the close');
  assert.deepEqual(kinds(`${FENCE}text\n${REPORT}\n${FENCE}`),['code'],'another language is never unwrapped');
  const example=parseMarkdownBlocks(`${FENCE}bash\ncat <<EOF\n${FENCE}markdown\n# not a heading\nEOF\n${FENCE}`);
  assert.deepEqual(example.map(block=>block.kind),['code'],'a markdown fence line inside a bash block stays code');
  assert.match((example[0] as any).text,/# not a heading/u);
  const long=parseMarkdownBlocks(`${FENCE}\`text\n${FENCE}\ninner\n${FENCE}\n${FENCE}\``);
  assert.deepEqual(long.map(block=>block.kind),['code'],'a four-backtick block holds a three-backtick one');
  assert.equal((long[0] as any).text,`${FENCE}\ninner\n${FENCE}`);
  const nested=parseMarkdownBlocks(`${FENCE}\`markdown\n${FENCE}bash\nls\n${FENCE}\n| A | B |\n|---|---|\n| 1 | 2 |\n${FENCE}\`\nafter`);
  assert.deepEqual(nested.map(block=>block.kind),['code','table','paragraph'],'a four-backtick fence keeps its inner fence and closes on its own length');
  assert.equal((nested[0] as any).text,'ls');
});

const env=hermeticProfile();after(()=>env.restore());
for(const cols of [60,120]){
  test(`FMT at ${cols} columns: the screenshot's answer is drawn as a table and a rule, not as raw Markdown`,async()=>{
    const app=await mountR5a({cols,rows:30,root:env.root,paths:env.paths} as any);
    try{
      app.emit('run.started',{runId:'r1'});app.emit('message.started',{messageId:'a1',role:'assistant'});
      app.emit('message.delta',{messageId:'a1',delta:`${FENCE}markdown\n${REPORT}\n${FENCE}`});
      app.emit('message.completed',{messageId:'a1'});app.emit('run.completed',{runId:'r1'});
      const s=await app.waitFor('the table drawn',x=>x.text.includes('Candidato'));
      assert.doesNotMatch(s.text,/```|\|---\||\*\*Aperto\*\*|^## /mu,s.lines.join('\n'));
      assert.match(s.text,/Rischio/u);assert.match(s.text,/^\s*─{10,}\s*$/mu,'the rule is a line');
      app.press('\x1br');
      const raw=await app.waitFor('the raw source (Alt+R)',x=>x.text.includes('```markdown'));
      assert.match(raw.text,/\*\*Aperto\*\*/u,'Alt+R still shows the source the model wrote');
    }finally{app.unmount();await sleep(50);}
  });
}
