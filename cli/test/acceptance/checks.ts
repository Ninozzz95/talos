/**
 * Screen checks shared by the scenarios and by the self-test that proves a declared red turns red when its
 * defect is absent. Each check states the CORRECT behaviour; its failure message starts with the defect id, and the
 * scenario's `expectFailure.match` is built from that id, so a failure for any other reason (a timeout, another
 * regression) does not satisfy the declaration and stays red.
 */
import assert from 'node:assert/strict';
import {describeOutput,type OutputCount,type Screen} from './terminal.ts';

/** `expectFailure` for a declared red: the label names the owning phase and the defect; `match` accepts only that defect's own assertion. */
export function declaredRed(phase:string,defect:string,summary:string){
  /* `TALOS_ACCEPTANCE_REVEAL_REDS=1` drops the declaration so every declared red prints its own failure: the way to
     check that each one fails for its defect and nothing else. */
  if(process.env.TALOS_ACCEPTANCE_REVEAL_REDS==='1')return{};
  return{expectFailure:{label:`${phase}: ${defect} ${summary}`,match:new RegExp(`\\b${defect}:`,'u')}};
}

/** The session is not running a turn: the composer is on screen and no status row shows an activity. */
/* UI Phase 0 (owner 27/09, "like Claude Code"): the footer lists agents only while a subagent works, so the main roster row
   (`• main · ready`) no longer marks the idle screen. The status row does: a spinner, `?` or `↻` and an activity word while a
   turn runs; `✓ done` / `■ interrupted` / `✗ failed` or nothing after it. The busy hints of the shortcut line still count.
   Stage 4 (the approved mockup's activity line): a turn at work ends its line with «· esc to stop» (a stall with «· esc to
   stop · the request stays open»), a wait says «Waiting for your answer ·», agents of an idle turn «· alt+a to watch»;
   after the turn the line says «✓ Done in …», «■ Stopped after …» or «✗ Failed after …», which is idle. */
export const BUSY_STATUS=/^ \S .*(?:· esc to stop|· alt\+a to watch)|^ \S Waiting for your answer · /mu;
/* The approved mockup's footer (07/10 footerRows): its first row is the permission mode and its key, `no sandbox` beside it. */
export const MODE_ROW=/^ (ask before edits|accept edits|plan mode|full access|auto|don't ask)(?: · no sandbox)?(?: · ctx [^·]+)? · shift\+tab/mu;
export const modeOf=(s:{text:string})=>s.text.match(MODE_ROW)?.[1]??null;
/* the names the older scenarios use for the modes, in the mockup's words */
export const MODE_NAME:Record<string,string>={manual:'ask before edits',default:'ask before edits','accept edits':'accept edits',plan:'plan mode','Full access':'full access'};
/* The approved mockup's composer (07/10 composerRows): `│ › ` and the text, or a faint placeholder while it is empty. */
export const COMPOSER_ROW=/^│ ›/u;
/* the placeholder whole, or cut to the width (`Ask TALOS, / for commands, @ for …` at 40 columns) */
export const EMPTY_COMPOSER_ROW=/^│ ›[↑ ](?:Ask TALOS,[^│]*|Type to [^│]*)?\s*│?$/u;
export const idleFooter=(s:Screen)=>(s.lines.some(line=>COMPOSER_ROW.test(line))||s.lines.some(line=>/^\s*>(\s|$)/u.test(line)))&&!BUSY_STATUS.test(s.lines.join('\n'))&&!s.text.includes('Esc/Ctrl+C interrupt')&&!s.text.includes('Esc to interrupt');
/** The composer is on screen and empty. */
export const composerReady=(s:Screen)=>s.lines.some(line=>EMPTY_COMPOSER_ROW.test(line.trimEnd()))||s.lines.some(line=>/^\s*>\s*$/u.test(line));
/** The screen shows the approval question for a tool call (today's marker: the numbered choices). */
export const approvalVisible=(s:Screen)=>/\[1\]\s*once|Allow once/u.test(s.text); // R3 Q-R3-6: the new dialog names "Allow once"

/**
 * Rows that mix a box border with other content: a corner followed by text instead of a rule, a border row that does
 * not close with a corner, or a closing corner at the end of a row that is not a border. On a screen whose height is
 * budgeted this never happens; on today's TALOS an overlay taller than the terminal writes its last lines over its own
 * bottom border (`╰/tasks [args...] — Tasks operations───╯`) and over the composer (`└>  ────┘`), and at 60×20 the
 * footer lands on the composer's border (`mode default · … transcript┘`).
 */
export function brokenBorders(s:Screen):string[]{
  return s.lines.map(line=>line.trim()/* a box drawn under an indent (the answer's tables, two cells in) is still a box */).filter(line=>
    (/^[┌└╭╰]/u.test(line)&&!/^[┌└╭╰][─━═][^]*[┐┘╮╯]$/u.test(line))|| /* a corner followed by text */
    (/[┐┘╮╯]$/u.test(line)&&!/^[┌└╭╰]/u.test(line)));                  /* a closing corner under other text */
}
export function assertHeightBudgeted(s:Screen,defect='D-02'){
  const broken=brokenBorders(s);
  assert.equal(broken.length,0,`${defect}: the screen overwrites itself; rows mixing a border with content:\n${broken.join('\n')}`);
}

/**
 * Words of the Italian kernel that reach the English screen (review D-05), derived from the R2 gate inventory (E10 d):
 * the words seen on review frames; the 8 Italian kernel tool names and the 11 Italian argument keys (§1.3); `giri`,
 * `detto`, `modello` (§9); and the Italian-only words of the §1.0 lexicon. Left out on purpose, because they are also
 * English or part of TALOS's own words: `il lo al ha per con come dove solo prima file owner serve del dal sei tra fra`.
 */
export const ITALIAN_WORDS=[
  'interrotto','richiesta','fornitore','traffico','giro','leggi','scrivi','percorso','contenuto','comando','tipo','catalogo','modelli','Agente esterno',"l'owner",'nessuna risposta',
  /* tool names (§1.3) */ 'elenca','cerca','prova','naviga','delega_sottotask','carica_skill',
  /* argument keys (§1.3) */ 'descrizione','testo','nome','titolo','cartella','parte','affermazioni','fonti',
  /* JSON and enum values (§1.6, §1.5) */ 'giri','detto','modello',
  /* R4 gate E11: the kernel probe's words (`talos provider test`, the provider list's detail) */ 'raggiunto','visibili','generazione','provata',
  /* §1.0 lexicon, Italian-only words */
  'non','gli','della','delle','dello','degli','dei','nel','nella','nelle','negli','alla','alle','agli','dalla','dalle','che','una','uno','sono',
  'questo','questa','questi','queste','quando','ancora','nessun','nessuna','nessuno','manca','mancano','servono','controlla','riprova','chiave',
  'fornitori','sessione','attrezzo','attrezzi','interrotta','fermato','fermata','errore','valido','valida','trovato','trovata','accesso','negato',
  'può','già','più','perché','senza','dopo','ogni','tutti','tutte','cosa','stato','stata','risposta','rifiutato','rifiutata','consentito','agente','esterno',
];
/* Whole words: a letter, digit, `_` or `-` next to the word makes it part of a longer token, so `non-interactive`, a
   temp folder `…-nome12` or an id `dei0-…` are not Italian, while `leggi ·`, `"percorso":` and `⛔ giri esauriti` are. */
const WORD_EDGE='[^\\p{L}\\p{N}_-]';
export function italianOn(text:string):string[]{
  return ITALIAN_WORDS.filter(word=>new RegExp(`(^|${WORD_EDGE})${word.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')}(${WORD_EDGE}|$)`,'iu').test(text));
}
export function assertEnglishOnly(text:string,defect='D-05'){
  const found=italianOn(text);
  assert.equal(found.length,0,`${defect}: Italian words on an English screen: ${found.join(', ')}`);
}

/**
 * Gate E5/E6: idle means no React commit, so over the idle window TALOS writes no DEC 2026 frame and no more bytes than
 * ConPTY writes on its own for a trivial idle child (`idleBaseline`). On Ink 7.1.1 + win32 every commit of a frame at
 * least as tall as the terminal is `ESC[2J ESC[3J ESC[H` + the whole frame (`ink/build/ink.js:83-112, 748-772`).
 */
/* Stage 5 (owner decision 02/10, registro 12): when a frame reaches ConPTY at once (frame-batcher.ts), ConPTY sends the
   colour reset that closes it a few milliseconds later, so a window opened right after the last frame can see `ESC[m`
   alone. Measured inside TALOS: it writes 0 bytes in that window. Only that tail is tolerated: one chunk, exactly ESC[m,
   in the first 100 ms; any other byte, frame or repaint (the one found at 35 ms on 24/09 had frames) stays red. */
export const CONPTY_TAIL='\u001B[m';
export const CONPTY_TAIL_MS=100;
export function withoutConptyTail(idle:OutputCount):OutputCount{
  const tail=idle.chunks===1&&idle.bytes===CONPTY_TAIL.length&&idle.sample===JSON.stringify(CONPTY_TAIL).slice(1,-1)&&(idle.chunkAt[0]??Infinity)<=CONPTY_TAIL_MS;
  return tail?{...idle,bytes:0,chunks:0}:idle;
}
export function assertIdleQuiet(rawIdle:OutputCount,baseline:OutputCount,defect='R1-IDLE'){
  const idle=withoutConptyTail(rawIdle);
  assert.ok(idle.bsu===0&&idle.esu===0&&idle.bytes<=baseline.bytes,
    `${defect}: TALOS kept writing while idle — ${describeOutput(idle)}; an idle trivial child under the same ConPTY wrote ${describeOutput(baseline)}`);
}
/** Stage 6c (owner 02/10, replacing REV-NATIVE-SELECTION): the mouse is on by default — button reports (1000), the motion
 *  while a button is held for the drag selection (1002), SGR form (1006); never every motion (1003) nor a legacy form. */
export function assertMouseAsDecided(output:OutputCount,defect='P3-MOUSE'){
  const modes=output.mouseEnables.flatMap(seq=>[...JSON.parse(seq).matchAll(/\d+/gu)].map(m=>Number(m[0])));
  assert.ok(modes.includes(1000)&&modes.includes(1002)&&modes.includes(1006),`${defect}: the mouse is not on (button reports 1000 + drag 1002 + SGR 1006): ${output.mouseEnables.join(' ')||'none'}`);
  /* 1003, every motion: the hover the owner asked for and tried in a real Windows Terminal on 01/11 */
  assert.deepEqual(modes.filter(mode=>mode!==1000&&mode!==1002&&mode!==1003&&mode!==1006),[],`${defect}: a legacy mouse mode was turned on: ${output.mouseEnables.join(' ')}`);
}
export function assertNoMouseCapture(output:OutputCount,defect='R1-MOUSE'){
  assert.deepEqual(output.mouseEnables,[],`${defect}: TALOS turned on mouse reporting (${output.mouseEnables.join(' ')}); default-off preserves native selection and right-click copy`);
}

/** Q-R1-8: below 40×12 the screen holds this one line and nothing else. */
export const TOO_SMALL_NOTICE='Terminal too small — need 40×12';
/* The notice is 31 columns: narrower than that it cannot be one row, so its rows joined by a space must equal it (the app wraps at a
   word, never cuts "40×12"). At 31 columns or more it must be exactly one row. */
export const tooSmallOnly=(s:Screen)=>{const rows=s.lines.map(line=>line.trim()).filter(Boolean);return s.cols>=TOO_SMALL_NOTICE.length?rows.length===1&&rows[0]===TOO_SMALL_NOTICE:rows.length>=1&&rows.join(' ')===TOO_SMALL_NOTICE;};

/** Q-R1-9 / E9: the latest prompt is above the window, so a sticky row shows its text and a counter says "N earlier messages above". */
export function assertStickyPrompt(s:Screen,prompt:string,defect='R1-STICKY'){
  assert.ok(s.lines.some(line=>line.includes(prompt)),`${defect}: the latest prompt "${prompt}" is above the window and no sticky row shows it:\n${s.text}`);
  assert.match(s.text,/\b\d+ earlier messages? above\b/u,`${defect}: no "N earlier messages above" counter while the window does not start at the first message:\n${s.text}`);
}

/** Q-R1-4 / E10: after exit the scrollback holds the transcript (the prompt, then the answer), THEN `talos --resume <id>`. Returns the id. */
export function assertExitTranscript(lines:readonly string[],{prompt,answer}:{prompt:string;answer:RegExp},defect='R1-EXIT'):string{
  const tail=`\n${lines.filter(line=>line.trim()).slice(-12).join('\n')}`;
  const p=lines.findIndex(line=>line.includes(prompt));
  assert.ok(p>=0,`${defect}: after exit the terminal does not hold the prompt "${prompt}" (no transcript was reprinted):${tail}`);
  const a=lines.findIndex((line,i)=>i>p&&answer.test(line));
  assert.ok(a>p,`${defect}: after exit the answer ${answer} does not follow the prompt in the scrollback:${tail}`);
  const r=lines.findIndex((line,i)=>i>a&&/\btalos --resume \S+/u.test(line));
  assert.ok(r>a,`${defect}: no "talos --resume <id>" line after the reprinted transcript:${tail}`);
  return lines[r]!.match(/\btalos --resume (\S+)/u)![1]!.replace(/[`'".,;]+$/u,'');
}
/** Q-R1-4: the resume line is printed only for a non-empty session. */
export const resumeLineIn=(lines:readonly string[])=>lines.find(line=>/\btalos --resume\b/u.test(line));
