/*
 * R3 lane RD — the ONE tool row (owner decisions of 2026-09-24, ledger "R3 — tools and approvals"):
 *   Q-R3-1  `<Label> <target> · <isolation> · <why it ran> · <result> · <duration>`, detail lines under it; a state other than
 *           done replaces result + duration with a word; at 60 columns a fixed drop order in which the isolation glyph and
 *           the why field are never dropped.
 *   Q-R3-2  commands always `exit N · T s`; other tools a duration only when ≥ 1 s; failures show the exit code or the reason.
 *   Q-R3-3  why words from the ToolDecision kinds; nothing without a decision.
 *   Q-R3-4  write/edit summary on the row, the full diff on Ctrl+O (expanded).
 *   Q-R3-10 a running command shows the last 5 lines + `+N lines · T s`; a sandboxed one (no live stream) `running T s`.
 * Gate E1 (one formatter for the screen row, the height estimate, search/copy text and the exit transcript), E2 (dictionary
 * words, never the enum), E3 (the kernel's `exit N [sandbox: …]` first content line hidden by an exact template pinned
 * against the kernel source), E6 (isolation words from the CLI's own annotation), E9 (denied is not failed, reason shown).
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {t} from '../../src/i18n/index.ts';
import {toolRowView} from '../../src/tui/components/tool-row.ts';
import {TURN_INDENT} from '../../src/tui/components/conversation-rows.ts';
import {estimateTranscriptItemRows,textRows} from '../../src/tui/components/transcript-virtualizer.ts';
import {formatExitOutput} from '../../src/tui/exit-output.ts';
import {displayWidth} from '../../src/tui/text-width.ts';
import {transcriptItemText,type TranscriptItem} from '../../src/tui/transcript-model.ts';
import type {ToolRowModel} from '../../src/tui/tools/registry.ts';

const NOW=1_000_000;
const row=(name:string,args:unknown,over:Partial<ToolRowModel>={}):ToolRowModel=>({id:'t1',name,status:'completed',argsText:typeof args==='string'?args:JSON.stringify(args),liveOutput:'',finalOutput:'',startedAt:NOW-10_000,endedAt:NOW-9_900,outcome:null,...over});
const view=(r:ToolRowModel,width=120,expanded=false)=>toolRowView(r,width,expanded,NOW);
const line=(r:ToolRowModel,width=120)=>view(r,width).line;
const SANDBOX='exit 0 [sandbox: ⛉ sandbox (microsoft-mxc-0.8.0) — isolation verified: AppContainer on]';

test('R3 RD Q-R3-1: the owner\'s examples, one row each',()=>{
  assert.equal(line(row('leggi',{percorso:'README.md'},{finalOutput:'# demo\n'})),'Read file README.md · 1 line');
  assert.equal(line(row('shell',{comando:'dir /b'},{finalOutput:`${SANDBOX}\nREADME.md\nsrc`,facts:{exitCode:0,durationMs:100,isolation:'sandbox'},decision:{kind:'rule',rule:'dir *'}})),
    'Shell dir /b · ⛉ sandbox · allow: dir * · exit 0 · 0.1 s');
  assert.equal(line(row('scrivi',{percorso:'notes.txt',contenuto:'one\ntwo\nthree'},{change:{path:'notes.txt',before:null,after:'one\ntwo\nthree'}})),
    'Write file notes.txt · new file · 3 lines');
  assert.equal(line(row('file_edit',{percorso:'src/index.js',old_string:'console.log(1)',new_string:'console.log(2)'})),'Edit file src/index.js · +1 −1');
});

test('R3 RD Q-R3-1: the row app.ts draws today (`title · statusLabel`) IS the one line, at every width and state',()=>{
  const rows=[
    row('leggi',{percorso:'README.md'},{finalOutput:'a\nb'}),row('shell',{comando:'npm test'},{status:'approval'}),
    row('shell',{comando:'npm test'},{status:'running',startedAt:NOW-5_000,facts:{isolation:'host'},decision:{kind:'session'}}),
    row('scrivi',{percorso:'x.txt',contenuto:'a'},{status:'denied',finalOutput:'Not run: you did not approve it.'}),
    row('web_search',{query:'node 24'}),row('mystery',{}),
  ];
  for(const width of [40,60,120])for(const r of rows){const v=view(r,width);assert.equal(v.line,`${v.title} · ${v.statusLabel}`,v.line);assert.ok(v.statusLabel.length>0);}
});

test('R3 RD Q-R3-3: why words from the decision kinds; typed by you for a person\'s command; nothing without a decision',()=>{
  const why=(decision:any)=>line(row('shell',{comando:'ls'},{facts:{exitCode:0,durationMs:50},decision}));
  assert.equal(why({kind:'typed'}),'Shell ls · typed by you · exit 0 · 0.1 s');
  assert.equal(why({kind:'once'}),'Shell ls · you allowed once · exit 0 · 0.1 s');
  assert.equal(why({kind:'session'}),'Shell ls · you allowed for this session · exit 0 · 0.1 s');
  assert.equal(why({kind:'always'}),'Shell ls · always allowed · exit 0 · 0.1 s');
  assert.equal(why({kind:'rule',rule:'ls *'}),'Shell ls · allow: ls * · exit 0 · 0.1 s');
  assert.equal(why({kind:'auto'}),'Shell ls · auto · exit 0 · 0.1 s');
  assert.equal(why({kind:'accept-edits'}),'Shell ls · accept edits · exit 0 · 0.1 s');
  assert.equal(why({kind:'full-access'}),'Shell ls · Full access · exit 0 · 0.1 s');
  assert.equal(why(null),'Shell ls · exit 0 · 0.1 s');
  assert.equal(line(row('shell',{comando:'git status'},{origin:'person',facts:{exitCode:0,durationMs:300,isolation:'sandbox'}})),
    '! git status · ⛉ sandbox · typed by you · exit 0 · 0.3 s','a person\'s command is labelled by what they typed (gate §2.3)');
  assert.equal(line(row('scrivi',{percorso:'n.txt',contenuto:'x'},{decision:{kind:'accept-edits'}})),'Write file n.txt · accept edits · 1 line');
});

test('R3 RD E6: isolation words come from the CLI annotation glyphs; host is never called safe; only commands carry it',()=>{
  const sandbox=t('screen.exec.isolation.sandbox',{backend:'x'}),host=t('screen.exec.isolation.hostNotIsolated');
  assert.ok(sandbox.startsWith(t('tool.isolation.sandbox.glyph'))&&t('tool.isolation.sandbox').startsWith(t('tool.isolation.sandbox.glyph')));
  assert.equal(t('tool.isolation.host'),host,'the declared host fallback keeps its words (R0 decision 1)');
  assert.ok(host.startsWith(t('tool.isolation.host.glyph')));
  assert.equal(line(row('shell',{comando:'npm test'},{facts:{exitCode:0,durationMs:2_000,isolation:'host'}})),'Shell npm test · ⛶ host · not isolated · exit 0 · 2.0 s');
  assert.equal(line(row('scrivi',{percorso:'n.txt',contenuto:'x'},{facts:{isolation:'sandbox'}})),'Write file n.txt · 1 line','file tools are governed by permissions, not the sandbox (R0 decision 3)');
});

test('R3 RD Q-R3-2: commands always exit and duration; other tools a duration only ≥ 1 s; unknown exit says done',()=>{
  assert.equal(line(row('shell',{comando:'cmd /c exit 3'},{facts:{exitCode:3,durationMs:300,isolation:'sandbox'}})),'Shell cmd /c exit 3 · ⛉ sandbox · exit 3 · 0.3 s');
  assert.equal(view(row('shell',{comando:'cmd /c exit 3'},{facts:{exitCode:3,durationMs:300}})).tone,'failed','a non-zero exit is drawn as a failure');
  assert.equal(line(row('shell',{comando:'ls'},{outcome:{toolCallId:'t1',status:'completed',content:'',receiptStatus:'succeeded',exitCode:0,enforcement:null,allowed:true,permissionVia:null,permissionReason:null,risk:null}})),
    'Shell ls · exit 0','the receipt exit code (structured) is used when no facts arrived; no duration is invented');
  assert.equal(line(row('prova',{})),'Run tests · done');
  assert.equal(line(row('leggi',{percorso:'big.md'},{finalOutput:'a\nb\nc',facts:{durationMs:1_500}})),'Read file big.md · 3 lines · 1.5 s');
  assert.equal(line(row('leggi',{percorso:'big.md'},{finalOutput:'a\nb\nc',facts:{durationMs:400}})),'Read file big.md · 3 lines');
  assert.equal(line(row('shell',{comando:'sleep'},{facts:{exitCode:0,durationMs:75_000}})),'Shell sleep · exit 0 · 1 min 15 s');
  assert.equal(line(row('shell',{comando:'sleep'},{facts:{exitCode:0,durationMs:12_400}})),'Shell sleep · exit 0 · 12 s');
});

test('R3 RD E2: states other than done are dictionary words, never the enum',()=>{
  const states:Array<[Partial<ToolRowModel>,string]>=[
    [{status:'queued',startedAt:NOW-200},'Shell npm test · running'],
    [{status:'approval'},'Shell npm test · waiting for you'],
    [{status:'running',startedAt:NOW-12_000,facts:{isolation:'sandbox'},decision:{kind:'once'}},'Shell npm test · ⛉ sandbox · you allowed once · running 12 s'],
    [{status:'failed',finalOutput:'The sandbox could not start.',facts:{exitCode:null}},'Shell npm test · failed'],
    [{status:'cancelled',startedAt:NOW-500,endedAt:NOW-100},'Shell npm test · interrupted'],
    [{status:'interrupted',startedAt:NOW-5_200,endedAt:NOW-1_000},'Shell npm test · interrupted after 4.2 s'],
    [{status:'unknown'},'Shell npm test · result unknown'],
    [{status:'denied',finalOutput:'Not run: you did not approve it.'},'Shell npm test · denied'],
  ];
  for(const [over,expected] of states){
    const v=view(row('shell',{comando:'npm test'},over));
    assert.equal(v.line,expected);
    assert.doesNotMatch(v.line,/\b(queued|approval|streaming|completed|cancelled)\b/u);
  }
});

test('R3 RD E9: denied is not failed — the English reason is shown on every renderer, the write row included',()=>{
  const reason='Not run: you did not approve it.';
  for(const [name,args] of [['scrivi',{percorso:'notes.txt',contenuto:'a\nb\nc'}],['file_edit',{percorso:'a.js',old_string:'a',new_string:'b'}],['leggi',{percorso:'.env'}],['shell',{comando:'rm x'}],['cerca',{testo:'x'}],['elenca',{percorso:'src'}],['web_search',{query:'q'}]] as const){
    /* R5a Q-R5-17 (R5 gate finding 15): "you did not approve it" is true only when the person was asked, so this row says
       the dialog was opened for it (`askedPerson`); a refusal nobody asked for names the rule or policy instead. */
    const v=view(row(name,args,{status:'denied',finalOutput:reason,askedPerson:true} as Partial<ToolRowModel>));
    assert.match(v.line,/ · denied$/u,v.line);assert.equal(v.tone,'denied');
    assert.equal(v.detailLines.filter(detail=>detail===reason).length,1,`${name}: the reason once\n${v.detailLines.join('\n')}`);
  }
  const failed=view(row('leggi',{percorso:'x.md'},{status:'failed',finalOutput:'"x.md" does not exist in this workspace.'}));
  assert.equal(failed.line,'Read file x.md · failed');assert.deepEqual(failed.detailLines,['"x.md" does not exist in this workspace.'],'a failure shows its reason');
});

test('R3 RD Q-R3-4: write and edit summaries; the full diff only on Ctrl+O (expanded)',()=>{
  const replaced=row('scrivi',{percorso:'a.txt',contenuto:'a\nc\nd\n'},{change:{path:'a.txt',before:'a\nb\n',after:'a\nc\nd\n'}});
  assert.equal(line(replaced),'Write file a.txt · +2 −1');
  assert.deepEqual(view(replaced).detailLines,[],'collapsed: the summary only');
  const diff=view(replaced,100,true).detailLines;
  assert.ok(diff.some(text=>/│ -b$/u.test(text))&&diff.some(text=>/│ \+c$/u.test(text))&&diff.some(text=>/│ \+d$/u.test(text)),diff.join('\n'));
  assert.equal(line(row('scrivi',{percorso:'a.txt',contenuto:'x\ny\nz'})),'Write file a.txt · 3 lines','before the change is known, the content size');
  assert.equal(line(row('scrivi',{percorso:'log.txt',contenuto:'x\ny',mode:'append'})),'Write file log.txt · 2 lines · appended');
  const edit=row('file_edit',{percorso:'src/index.js',old_string:'console.log(1)',new_string:'console.log(2)'},{change:{path:'src/index.js',before:'a\nconsole.log(1)\nb\n',after:'a\nconsole.log(2)\nb\n'}});
  assert.equal(line(edit),'Edit file src/index.js · +1 −1');
  const expanded=view(edit,100,true).detailLines;
  assert.ok(expanded.some(text=>/^\s+2\s+│ -console\.log\(1\)$/u.test(text)),expanded.join('\n'));
  assert.ok(expanded.some(text=>/^\s+2 │ \+console\.log\(2\)$/u.test(text)),expanded.join('\n'));
  assert.equal(line(row('file_edit',{percorso:'a.js',old_string:'old\nline',new_string:'new\nline\nplus'})),'Edit file a.js · +2 −1',
    'a fragment is a piece of a line-ended file: its last line is not "changed" for lacking a line break');
  const fragment=view(row('file_edit',{percorso:'a.js',old_string:'x\ny',new_string:'x\nz'}),100,true).detailLines;
  assert.ok(fragment.includes('-y')||fragment.some(text=>/│ -y$/u.test(text)),fragment.join('\n'));
  assert.ok(!fragment.some(text=>/@@/u.test(text)),'a fragment has no file line numbers to claim');
  const wide=view(row('scrivi',{percorso:'n.txt',contenuto:'1\n2'},{change:{path:'n.txt',before:null,after:'1\n2'}}),100,true).detailLines;
  assert.ok(wide.some(text=>/1 │ \+1$/u.test(text))&&wide.some(text=>/2 │ \+2$/u.test(text)),wide.join('\n'));
});

test('R3 RD Q-R3-10: a running command shows the last 5 lines, the lines above counted, and `T s`; a sandboxed one `running T s`',()=>{
  const live=Array.from({length:8},(_,i)=>`line ${i+1}`).join('\n')+'\n';
  const running=view(row('shell',{comando:'npm test'},{status:'streaming',liveOutput:live,startedAt:NOW-3_200,facts:{isolation:'host'}}));
  assert.equal(running.line,'Shell npm test · ⛶ host · not isolated · running');
  /* UI Phase 0 D14: the count stands above the tail it precedes; the elapsed stays under it */
  assert.deepEqual(running.detailLines,['… +3 earlier lines','line 4','line 5','line 6','line 7','line 8','3.2 s']);
  const sandboxed=view(row('shell',{comando:'npm test'},{status:'running',startedAt:NOW-12_000,facts:{isolation:'sandbox'}}));
  assert.equal(sandboxed.line,'Shell npm test · ⛉ sandbox · running 12 s');
  assert.deepEqual(sandboxed.detailLines,[],'no live stream: no tail, the elapsed is on the row');
  const done=view(row('shell',{comando:'npm test'},{finalOutput:`${SANDBOX}\n${live}`,facts:{exitCode:0,durationMs:3_300,isolation:'sandbox'}}));
  assert.deepEqual(done.detailLines,['… +3 earlier lines','line 4','line 5','line 6','line 7','line 8'],'after the end the collapsed row keeps the last 5 lines');
  const withDescription=view(row('shell',{comando:'git diff main',descrizione:'List files changed since main'},{finalOutput:'a.ts'}));
  assert.deepEqual(withDescription.detailLines,['List files changed since main','a.ts']);
});

test('R3 RD E3: the kernel\'s `exit N [sandbox: …]` first content line is hidden by an exact template pinned to the kernel',async()=>{
  const kernel=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');
  const service=readFileSync(new URL('../../../harness-ui/src/agent-service.mjs',import.meta.url),'utf8');
  /* G02: the unified kernel explains the enforcement inside the brackets (`etichettaSandbox`, kernel/etichetta-sandbox.mjs:55:
     `none (cmd.exe nativo: …)`); the line still ends at the bracket, so the hidden-line template is unchanged. */
  /* F009 (desktop 56ec35c0b): the label takes the WSL facts of the command (user, disk) and `prova` run in WSL declares
     them too; the kernel guarantees no `]` inside the label (its F009-06), so the line still ends at the bracket. */
  /* BUG-14 (desktop, realigned 08/10/2026): a command put in the background has no `exit N` (it did not exit), so the template is now the
     second arm of `p.messoInSfondo ? p.testo : …`; the first line of a finished command is the same. */
  assert.ok(kernel.includes(': `exit ${p.codice} [sandbox: ${etichettaSandbox(p.enforcement, p.wsl)}]\\n${p.testo}`'),'the model\'s shell template moved: update the hidden-line template');
  /* kernel merge (integrazione a9ce6c9fd): `prova` builds the same line from one template, the label only in WSL */
  assert.ok(kernel.includes("const sandboxProva = p.enforcement === 'wsl2' ? ` [sandbox: ${etichettaSandbox(p.enforcement, p.wsl)}]` : ''"),'the prova label moved: update the hidden-line template');
  assert.ok(kernel.includes(': `exit ${p.codice}${sandboxProva}\\n${p.testo}`'),'the prova template moved: update the hidden-line template');
  /* BUG-14 (realigned 08/10/2026): the `!` command's content has the same two arms (a backgrounded command keeps its text and ends with the label). */
  assert.ok(service.includes(': `exit ${risultato.codice} [sandbox: ${etichettaSandbox(risultato.enforcement, risultato.wsl)}]\\n${risultato.testo}`;'),'the ! command template moved');
  const {etichettaSandbox}=await import('../../../harness-ui/src/kernel/etichetta-sandbox.mjs');
  for(const wsl of [{utente:'nino',disco:{montaggio:'/mnt/c',metadata:false}},{utente:'ro]ot',disco:{montaggio:'/mnt/c] x',metadata:null}},null]){
    const label=etichettaSandbox('wsl2',wsl);
    assert.doesNotMatch(label,/\]/u,'never a bracket inside the label, even from a dirty user or mount');
    assert.deepEqual(view(row('shell',{comando:'ls'},{finalOutput:`exit 0 [sandbox: ${label}]\nREADME.md`})).detailLines,['README.md'],'the WSL label is hidden');
    assert.deepEqual(view(row('prova',{},{finalOutput:`exit 1 [sandbox: ${label}]\n1 failing`})).detailLines,['1 failing'],'and on a prova run in WSL');
  }
  assert.deepEqual(view(row('shell',{comando:'dir'},{finalOutput:'exit 0 [sandbox: none (cmd.exe nativo: stesso utente e stessi privilegi del processo, nessun isolamento)]\nREADME.md'})).detailLines,['README.md'],'the explained label is hidden too');
  assert.deepEqual(view(row('shell',{comando:'dir'},{finalOutput:`${SANDBOX}\nREADME.md`})).detailLines,['README.md']);
  assert.deepEqual(view(row('prova',{},{finalOutput:'exit 1\n1 failing'})).detailLines,['1 failing']);
  assert.deepEqual(view(row('shell',{comando:'echo'},{finalOutput:'exit 0 is the answer\nok'})).detailLines,['exit 0 is the answer','ok'],'only the exact template is hidden');
  assert.doesNotMatch(transcriptItemText({kind:'tool',...row('shell',{comando:'dir'},{finalOutput:`${SANDBOX}\nREADME.md`})} as TranscriptItem),/\[sandbox:/u);
});

test('R3 RD: search and list counts read the kernel\'s own result templates (pinned), never a guess',async()=>{
  const kernel=readFileSync(new URL('../../../harness-ui/src/kernel/talosHarness.mjs',import.meta.url),'utf8');
  /* G02: the unified kernel's `cerca` answers from ripgrep (cercaConRipgrep, cercaNomiConRipgrep) or its own walk
     (cercaNelProgetto), pages with `nextOffset`, and says «inconclusive» instead of «no match» when the scan was not
     exhaustive (RICERCA_NON_CONCLUSIVA). Every shape the count reads is pinned here. */
  for(const template of [
    "return `${esitoSenzaRisultati(avvisi, 'no file matches.')} Scanned ${daScansionare.length} files${dettaglio}.`",
    "`\\n… and ${tagliati}${avvisi.length > 0 ? '+' : ''} more matches not shown — narrow the search.`",
    "`\\n… and ${fileTagliati}${avvisi.length > 0 || inCorso ? '+' : ''} more files with matches not shown — narrow the search.`",
    "`\\n… and ${tagliati}${avvisi.length > 0 || inCorso ? '+' : ''} more matches not shown — narrow the search.`",
    /* F001b (desktop 7d0d34b43, owner «ricerca che continua»): a search that outlives the reply, and its header */
    'return `[TALOS: this search is still running as search "${voce.id}" (started ${secondi(Date.now() - voce.avviataAlle)} s ago; ${file} file(s) with matches so far, not the final count). `',
    "if (voce.stato === 'finita') return `[TALOS: search \"${voce.id}\" finished after ",
    "if (voce.stato === 'fermata') return `[TALOS: search \"${voce.id}\" was stopped with Stop; the results below are partial.]\\n`",
    "if (voce.stato === 'scaduta') return `[TALOS: search \"${voce.id}\" reached its time limit (${limite}) and was stopped; the results below are partial.",
    "if (voce.stato === 'troppa') return `[TALOS: search \"${voce.id}\" produced too much output and was stopped; the results below are partial. Narrow the search.]\\n`",
    'if (inCorso) return `${testa}no file matches paths containing "${chiaveNome}" yet.${coda}${nota}`',
    /* r4 `cerca` with `oppure`: the words searched are quoted one by one, so the first character stays a quote */
    'if (inCorso) return `${testa}no file matches ${cercati}${dove} yet.${coda}${nota}`',
    "const cercati = Array.isArray(termini) && termini.length > 1 ? termini.map((t) => `\"${t}\"`).join(' or ') : `\"${testo}\"`",
    /* F-S-001 (desktop 2098989ff, ported 1e55d56e0): secret files are left out of the results, and the answer ends with this note */
    '[TALOS: ${omessi} file(s) omitted because they hold secrets (credentials, private keys, .env). Their names and lines are not shown;',
    "if (!ricerche) return 'NOT FOUND. Searches do not continue in the background here:",
    "return `${testa}${esitoSenzaRisultati(avvisi, `no file matches paths containing \"${chiaveNome}\"`)} (filename inventory with ripgrep;",
    "return `${testa}${esitoSenzaRisultati(avvisi, `no file matches ${cercati}${dove}`)} (searched with ripgrep;",
    "const RICERCA_NON_CONCLUSIVA = 'inconclusive search: no match was found in the files actually inspected, but the search was not exhaustive.'",
    "`\\nnextOffset: ${prossimo}. Continue with the same testo/nome/dentro;",
    "`\\nnextOffset: ${prossimo}. Continue with cerca {\"continua\":\"${continua}\",\"offset\":${prossimo}}.`",
    ": `no further matches at offset ${offset}. The current search found ${totale} matching files.`",
    "`\\n(at most ${MAX_RIGHE_PER_FILE} matching lines per file are shown)`",
    "return 'stopped: the search was interrupted.'",
    "return 'INVALID. \"offset\" must be a non-negative safe integer",
    'return `no files and no folders. ${quale} — this is the complete listing, not a failure.`',
    "return 'give at least one of \"testo\" or \"nome\".'",
  ])assert.ok(kernel.includes(template),`kernel template moved: ${template}`);
  assert.equal(line(row('cerca',{testo:'needle'},{finalOutput:'a.ts:1: needle\nb.ts:2: needle'})),'Search files needle · 2 results');
  const OMITTED='[TALOS: 2 file(s) omitted because they hold secrets (credentials, private keys, .env). Their names and lines are not shown; `leggi` opens one only after asking the person.]';
  assert.equal(line(row('cerca',{testo:'needle'},{finalOutput:`a.ts:1: needle\n${OMITTED}`})),'Search files needle · 1 result','the note about omitted secret files is not a match');
  assert.equal(line(row('cerca',{testo:'needle'},{finalOutput:`no file matches "needle" (searched with ripgrep; .gitignore respected, binaries skipped). Try a shorter or different "testo".\n${OMITTED}`})),'Search files needle · 0 results');
  assert.equal(line(row('cerca',{testo:'needle'},{finalOutput:'no file matches. Scanned 12 files (12 read for content). Try a shorter or different "testo".'})),'Search files needle · 0 results');
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:'a\nb\n… and 30+ more matches not shown — narrow the search.\n⚠ incomplete scan: I stopped after reading 500 files. Narrow the search.'})),'Search files x · 32+ results');
  const PAGE='nextOffset: 2. Continue with the same testo/nome/dentro; this is a live search and files may change between pages.';
  assert.equal(line(row('cerca',{testo:'needle'},{finalOutput:`src/a.ts:1:needle\nsrc/a.ts:9:needle\nsrc/b.ts:2:needle\n… and 3 more files with matches not shown — narrow the search.\n${PAGE}\n(at most 5 matching lines per file are shown)`})),'Search files needle · 6+ results','each file not shown has at least one match');
  assert.equal(line(row('cerca',{nome:'.ts'},{finalOutput:`a.ts\nb.ts\n… and 5 more matches not shown — narrow the search.\n${PAGE}`})),'Search files .ts · 7 results','the page line is not a match');
  assert.equal(line(row('cerca',{testo:'needle'},{finalOutput:'no file matches "needle" (searched with ripgrep; .gitignore respected, binaries skipped). Try a shorter or different "testo".'})),'Search files needle · 0 results');
  assert.equal(line(row('cerca',{nome:'c.ts'},{finalOutput:'no file matches paths containing "c.ts" (filename inventory with ripgrep; .gitignore respected).'})),'Search files c.ts · 0 results');
  /* 5a (desktop 15ba4bf9d): Linux symbolic links on a Windows drive are named in a ⚠ notice. Every ⚠ notice of `cerca`
     says the scan was not exhaustive (avvisiDiRipgrep, cercaNelProgetto), so matches beside one count «at least». */
  const {avvisoCollegamentiDiRipgrep}=await import('../../../harness-ui/src/kernel/collegamento-linux.mjs');
  const links=avvisoCollegamentiDiRipgrep({collegamenti:[{percorso:'docs/link.txt',destinazione:'vero.txt'}],collegamentiTotali:1});
  assert.match(links,/^⚠ incomplete scan: 1 symbolic link\(s\) created by Linux \(WSL\)/u,'the kernel\'s notice keeps its ⚠ head');
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:`a.ts:1:x\nb.ts:4:x\n${links}`})),'Search files x · 2+ results','links not searched: at least');
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:'a.ts:1:x\n⚠ I stopped looking after 300 matches: there may be more than the count below.'})),'Search files x · 1+ results');
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:'a.ts:1:x\nb.ts:4:x'})),'Search files x · 2 results','without a notice the count is final');
  /* F001b: the header is not a match; a running or cut-short search counts «at least»; «… yet» and a partial zero are no count */
  const RUNNING='[TALOS: this search is still running as search "r1" (started 3 s ago; 2 file(s) with matches so far, not the final count). Continue it with cerca {"continua":"r1"} to see more as it proceeds; pages and nextOffset arrive when it finishes. It stops by itself after 2 min, or with Stop.]\n';
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:`${RUNNING}a.ts:1:x\nb.ts:4:x`})),'Search files x · 2+ results','still running: at least');
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:'[TALOS: search "r1" finished after 41 s.]\na.ts:1:x\nb.ts:4:x\nc.ts:2:x'})),'Search files x · 3 results','finished: the count is final');
  assert.equal(line(row('cerca',{testo:'x'},{finalOutput:'[TALOS: search "r1" finished after 41 s.]\nno file matches "x" (searched with ripgrep; .gitignore respected, binaries skipped). Try a shorter or different "testo".'})),'Search files x · 0 results','finished with none: zero');
  for(const partial of ['was stopped with Stop; the results below are partial.','reached its time limit (2 min) and was stopped; the results below are partial. Search inside a subfolder with `dentro` (e.g. "src").','produced too much output and was stopped; the results below are partial. Narrow the search.'])
    assert.equal(line(row('cerca',{testo:'x'},{finalOutput:`[TALOS: search "r1" ${partial}]\na.ts:1:x`})),'Search files x · 1+ results',partial);
  for(const unknown of [
    `${RUNNING}no file matches "x" yet.`,
    `${RUNNING}no file matches paths containing "x" yet.`,
    '[TALOS: search "r1" was stopped with Stop; the results below are partial.]\nno file matches "x" (searched with ripgrep; .gitignore respected, binaries skipped). Try a shorter or different "testo".',
    /* Kernel merge (04/10): a wrong `cerca` request answers with the kernel's own status word (`ESITI_DI_CERCA`, talosHarness.mjs): NOT FOUND. (no such search,
       no such folder), INVALID. (offset, a folder outside the workspace), REFUSED. (the rest). None of them is a result: no count. */
    'NOT FOUND. Searches do not continue in the background here: run the search again with testo, nome or dentro.',
    'NOT FOUND. There is no search "r9" in this session: it may have finished more than 10 minutes ago, or the server restarted. Nothing was searched.',
    'inconclusive search: no match was found in the files actually inspected, but the search was not exhaustive. Scanned 10 files.\n⚠ incomplete scan: I stopped after reading 500 files. Narrow the search.',
    'stopped: the search was interrupted.',
    'INVALID. "offset" must be a non-negative safe integer counting matching files; nothing was searched.',
    'INVALID. "../x" is not a subfolder of this workspace: `dentro` takes a folder INSIDE the workspace, e.g. "src" or "src/kernel". Nothing was searched.',
    'NOT FOUND. "nope" is not a folder of this workspace. `dentro` takes a subfolder INSIDE the workspace, e.g. "src".',
    'REFUSED. This tool is turned off for this session.',
    'no further matches at offset 40. The current search found 12 matching files.',
  ])assert.doesNotMatch(line(row('cerca',{testo:'x'},{finalOutput:unknown})),/results?\b/u,`not a count: ${unknown}`);
  assert.equal(line(row('elenca',{percorso:'src'},{finalOutput:'src/a.ts\nsrc/b.ts\nsrc/lib/'})),'List folder src · 3 entries');
  /* 03/11 (decisione 44, Tester R2-R4): the person's own no is DECLINED; like REFUSED it is not a listing, never "1 entry" */
  for(const no of ['DECLINED. The person said no to this. Do not ask again for it, by a card or a question, unless the person brings it up. Go on without it, or say in one line what you can do instead. The folder was not listed.','REFUSED. the person declined to run this call. The folder was not listed.'])
    assert.doesNotMatch(line(row('elenca',{percorso:'src'},{finalOutput:no})),/entr(?:y|ies)\b/u,no.slice(0,9));
  assert.equal(line(row('elenca',{percorso:'src'},{finalOutput:'no files and no folders. "src" is empty — this is the complete listing, not a failure.'})),'List folder src · 0 entries');
  assert.equal(line(row('web_search',{query:'node 24'})),'Web search node 24 · done');
});

test('R3 RD Q-R3-1: at 60 columns the target is cut in the middle, then the duration goes, then the isolation word — glyph and why stay',()=>{
  const long=row('shell',{comando:'npm run build -- --watch --verbose --workspace packages/cli-renderer'},{facts:{exitCode:0,durationMs:12_000,isolation:'host'},decision:{kind:'rule',rule:'npm run build *'}});
  assert.equal(line(long,200),'Shell npm run build -- --watch --verbose --workspace packages/cli-renderer · ⛶ host · not isolated · allow: npm run build * · exit 0 · 12 s');
  const narrow=line(long,60);
  assert.ok(displayWidth(narrow)<=60,`${displayWidth(narrow)}: ${narrow}`);
  for(const kept of ['Shell ','⛶','allow: npm run build *','exit 0'])assert.ok(narrow.includes(kept),`${kept} dropped: ${narrow}`);
  assert.ok(narrow.includes('…'),'the target is cut in the middle');
  const mid=line(long,100);
  assert.ok(mid.endsWith('exit 0 · 12 s')&&mid.includes('⛶ host · not isolated')&&displayWidth(mid)<=100,`at 100 only the target is cut: ${mid}`);
  const tight=line(long,40);
  for(const kept of ['⛶','allow:','exit 0'])assert.ok(tight.includes(kept),`never dropped at 40: ${tight}`);
});

test('R3 RD E1: one formatter — screen row, height estimate, search/copy text and exit transcript use the same line',()=>{
  const items:TranscriptItem[]=[
    {kind:'tool',...row('leggi',{percorso:'README.md'},{id:'a',finalOutput:'# demo'})},
    {kind:'tool',...row('shell',{comando:'dir /b'},{id:'b',finalOutput:`${SANDBOX}\nREADME.md\nsrc`,facts:{exitCode:0,durationMs:100,isolation:'sandbox'},decision:{kind:'once'}})},
    {kind:'tool',...row('scrivi',{percorso:'notes.txt',contenuto:'1'},{id:'c',status:'denied',finalOutput:'Not run: you did not approve it.'})},
    {kind:'tool',...row('shell',{comando:'npm run build'},{id:'d',finalOutput:'ok',facts:{exitCode:0,durationMs:2_000,isolation:'host'},decision:{kind:'session'}})},
  ] as TranscriptItem[];
  for(const item of items){
    const v=toolRowView(item as any,200,false);
    assert.equal(transcriptItemText(item).split('\n')[0],v.line,'search/copy text');
    /* 20 columns: a row whose never-dropped fields do not fit wraps, and the estimate must count those rows too. The
       reference is the concatenation app.ts draws (`title · statusLabel`) plus the dim detail lines. */
    /* the approved mockup draws a call's own row two cells in (TURN_INDENT): it is laid out at the width less the indent */
    for(const width of [20,40,60,120])for(const expanded of [false,true]){
      const inner=width-TURN_INDENT,w=toolRowView(item as any,inner,expanded);
      assert.equal(estimateTranscriptItemRows(item,width,{expandedTools:expanded}),textRows(`${w.title} · ${w.statusLabel}`,inner)+w.detailLines.reduce((sum,detail)=>sum+textRows(detail,inner),0),`${item.id} at ${width}${expanded?' expanded':''}`);
    }
  }
  assert.ok(textRows(toolRowView(items[3] as any,20,false).line,20)>1,'the fixture does wrap at 20 columns');
  const out=formatExitOutput({sessionId:'s-1',items:[{kind:'message',id:'u',role:'user',text:'go',streaming:false},...items]});
  for(const item of items)assert.ok(out.split('\n').includes(toolRowView(item as any,120,false).line),out);
});
