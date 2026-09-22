import type {PendingTuiApproval} from '../session-controller.ts';
import type {UserApprovalChoice} from '../approval.ts';
import {compileRules,PATH_BOUNDARY_RULE,patternNamesOnlyAVerb} from '../../security/evaluate.ts';
import {explainPermission,simulatePermission,type PermissionExplanation,type PermissionSegmentExplanation,type PermissionSimulation} from '../../security/permission-explanation.ts';
import {permissionActionToRule} from '../../security/persist.ts';
import {splitGraphemes} from '../text-width.ts';
import type {PermissionAction,PermissionEffect,RuleSetInput} from '../../security/types.ts';

/*
 * B1 slice 13 — THE APPROVAL PREVIEW EXPLAINS PER SEGMENT.
 *
 * Before this slice the dialog carried only the engine's single reason and rule, and
 * `explainPermission` had no caller outside its own test: a compound command whose third segment
 * was the one that asked was approved on a sentence about the whole thing.
 *
 * Measured on 2026-09-17 in the two competitors the owner names for this surface:
 * - Claude Code 2.1.274 (the shipped claude.exe) decides a compound Bash command per subcommand
 *   (`decisionReason: {type:"subcommandResults", reasons: Map<subcommand, result>}`, deny > ask >
 *   allow), and its consent line names only the parts still needing approval: "This Bash command
 *   contains multiple operations. The following parts require approval: …". It surfaces one rule,
 *   and it hides the "don't ask again" row when that would write a rule broader than the ask
 *   (`suppressAlwaysAllowRule`) instead of showing what the rule would do.
 * - Hermes Agent 0.20.0 (87086bc5d7, tools/approval.py) builds a "single combined prompt": the whole
 *   command plus the matched danger descriptions joined with "; ". No per-segment verdict exists.
 * Neither shows one row per segment with its rule, and neither simulates the persisted rule: this
 * dialog goes past both, on the brief's five scenarios, and only when there is more than one segment.
 */

export type ApprovalSegmentRow={
  position:number;operatorBefore:PermissionSegmentExplanation['operatorBefore'];command:string;effect:PermissionEffect;
  // `path-boundary` is never reported as a rule: PATH_BOUNDARY_RULE is an internal marker, not
  // something a person wrote or can find in a configuration file.
  decidedBy:'rule'|'path-boundary'|'built-in'|'no-rule';rule?:string;reason:string;decisive:boolean;
};
// `failure`: the rule would be written, but it cannot be evaluated (a command carrying a line break
// makes `compileRules` throw). The preview says so instead of disappearing.
export type AllowAlwaysSimulation={writes:string;simulation:PermissionSimulation}|{writes:null;refused:string}|{writes:string;failure:string};
export type ApprovalExplanationData={explanation?:PermissionExplanation;alwaysSimulation?:AllowAlwaysSimulation;explanationError?:string};
// `changedSegments` holds only the segments whose outcome the persisted rule would change: repeating
// rows that stay identical would print the same account twice and bury the one line that matters.
export type ApprovalAlwaysPreview={writes:string|null;refused?:string;failure?:string;effect?:PermissionEffect;decidedByNewRule:boolean;wildcard:boolean;compound:boolean;changedSegments:ApprovalSegmentRow[]};
export type ApprovalDialogModel={
  title:string;summary:string;fullPayload:string;expanded:boolean;reason:string;rule?:string;runtimeHint?:string;
  ruleLine?:string;segments:ApprovalSegmentRow[];segmentsWithheld?:string;explanationError?:string;alwaysPreview?:ApprovalAlwaysPreview;
};
/*
 * B1 slice 13, round 2 — WHAT REACHES THE TERMINAL.
 *
 * Every line below is what a person reads to decide, so two properties are enforced here and not
 * left to the caller:
 * 1. No model-derived text reaches the terminal raw (`inertText`). Measured through the real TuiApp
 *    on Ink 7.1.1 before this round: SGR conceal hid a `curl … | sh` segment, CR and BS redrew a row
 *    over `rm -rf /`, a quoted newline printed a native-looking `> 2 allow … rule Bash(git log)`, and
 *    OSC 8, BEL, bidi overrides, zero-width and C1 characters all arrived as bytes.
 * 2. Only a real row can begin at the left edge. Rows are laid out as columns (gutter, command,
 *    decider) so a wrapped command or rule hangs under its own column; every block of model-derived
 *    free text is indented, so no wrap of it can start where a row starts. A row starts with the
 *    decisive marker or a space, immediately followed by the position digit.
 */
// `modelText` lines are already wrapped here and rendered one terminal line each; the others are the
// dialog's own fixed text, which Ink may wrap.
export type ApprovalDialogLine=
 | {kind:'text';text:string;tone:'title'|'plain'|'dim';indent:number;modelText:boolean}
 | {kind:'row';text:string;tone:'plain'|'dim';gutter:string;gutterWidth:number;commandLines:string[];commandColumn:number;deciderLines:string[];deciderColumn:number};

const KEYS_LINE='[1] once  [2] session  [3] always  [4] deny once  [5] deny always  [v] full review  Esc deny';
// The verdict a pending approval answers. The coordinator only surfaces an engine `ask`.
const VERDICT_BEING_ANSWERED:PermissionEffect='ask';

// Mirrors `bashRuleNarrowsNothing` in security/persist.ts, which is not exported. The test
// "the refusal shown in the preview is the persistence layer's own refusal" runs both against the
// same commands, so a drift between the two turns that test red instead of lying on screen.
function bashRuleNarrowsNothing(rule:string):boolean{const match=/^Bash\((.*)\)$/u.exec(rule);if(!match)return false;const pattern=match[1]!;return pattern===''||patternNamesOnlyAVerb(pattern);}
function errorText(error:unknown):string{return error instanceof Error?error.message:String(error);}

function simulateAllowAlways({rules,action,projectRoot,persists}:{rules:RuleSetInput;action:PermissionAction;projectRoot:string;persists:boolean}):AllowAlwaysSimulation{
  if(!persists)return{writes:null,refused:'writes no rule: no configuration path is attached to this session'};
  let rule:string;
  try{rule=permissionActionToRule(action,projectRoot);}catch(error){return{writes:null,refused:`would be refused: ${errorText(error)}`};}
  if(action.tool==='Bash'&&bashRuleNarrowsNothing(rule))return{writes:null,refused:`would be refused: ${rule} would narrow nothing`};
  try{return{writes:rule,simulation:simulatePermission({rules:{...rules,allow:[...rules.allow,rule]},action,projectRoot})};}
  // The rule is already printed on the line above: report the code, not the rule a second time.
  catch(error){const message=errorText(error);return{writes:rule,failure:/^([A-Z][A-Z0-9_]*)(?::|$)/u.exec(message)?.[1]??message};}
}

// Computed ONCE, when the approval arrives, from the same rules the engine was built with. Never in
// render: the path boundary resolves real paths, and a render runs on every keystroke. And it never
// throws: a failure here must not stop the approval from reaching the person, it is reported instead.
// ⛔ The account and the simulation fail SEPARATELY. Round 1 wrapped both in one try, so a command
// with a quoted line break (whose persisted rule cannot be compiled) lost every segment row too.
export function explainApproval({rules,action,projectRoot,persists}:{rules:RuleSetInput;action:PermissionAction;projectRoot:string;persists:boolean}):ApprovalExplanationData{
  let explanation:PermissionExplanation;
  try{explanation=explainPermission(compileRules(rules),action,{projectRoot});}catch(error){return{explanationError:errorText(error)};}
  try{return{explanation,alwaysSimulation:simulateAllowAlways({rules,action,projectRoot,persists})};}
  catch(error){return{explanation,alwaysSimulation:{writes:null,refused:`cannot be previewed: ${errorText(error)}`}};}
}

function segmentRows(explanation:PermissionExplanation):ApprovalSegmentRow[]{
  // A single command is exactly what the summary line already says: no row adds anything to it.
  if(explanation.segments.length<2)return[];
  return explanation.segments.map((segment,index)=>{
    const boundary=segment.rule===PATH_BOUNDARY_RULE;
    const decidedBy:ApprovalSegmentRow['decidedBy']=boundary?'path-boundary':segment.rule?'rule':segment.effect==='ask'?'no-rule':'built-in';
    return{position:index+1,operatorBefore:segment.operatorBefore,command:segment.command,effect:segment.effect,decidedBy,...(segment.rule&&!boundary?{rule:segment.rule}:{}),reason:segment.reason,decisive:index===explanation.decisiveSegment};
  });
}

// The detail is shown only while it tells the same story as the verdict being answered: same
// effect, same rule, same decisive segment. Anything else is withheld, never shown beside it.
function accountAgrees(pending:PendingTuiApproval,explanation:PermissionExplanation):boolean{
  if(explanation.effect!==VERDICT_BEING_ANSWERED)return false;
  if((explanation.rule??null)!==(pending.rule??null))return false;
  const segment=/^segment (\d+): /u.exec(pending.reason);
  if(segment&&Number(segment[1])-1!==explanation.decisiveSegment)return false;
  return true;
}

function alwaysPreview(pending:PendingTuiApproval,simulation:AllowAlwaysSimulation):ApprovalAlwaysPreview{
  if(simulation.writes===null)return{writes:null,refused:simulation.refused,decidedByNewRule:false,wildcard:false,compound:false,changedSegments:[]};
  if('failure' in simulation)return{writes:simulation.writes,failure:simulation.failure,decidedByNewRule:false,wildcard:false,compound:false,changedSegments:[]};
  const after=simulation.simulation.explanation;
  // The persisted rule is an ALLOW rule. An ask or deny rule can carry the very same text, and
  // matching on text alone would credit the new rule with a decision the old one made.
  const byNewRule=(decision:{rule?:string;effect:PermissionEffect})=>decision.rule===simulation.writes&&decision.effect==='allow';
  const decidedByNewRule=byNewRule(after)||after.segments.some(byNewRule);
  // In a Bash rule `*` is literal text unless it is the whole pattern or a trailing `:*`, and the
  // persistence layer refuses both. Every other tool matches its rule as a glob.
  const pattern=simulation.writes.slice(simulation.writes.indexOf('(')+1,-1);
  const wildcard=pending.action.tool!=='Bash'&&pattern.includes('*');
  const before=pending.explanation?.segments??[];
  const changedSegments=segmentRows(after).filter((row,index)=>before[index]?.effect!==row.effect||before[index]?.rule!==after.segments[index]?.rule);
  return{writes:simulation.writes,effect:simulation.simulation.effect,decidedByNewRule,wildcard,compound:after.segments.length>1,changedSegments};
}

export function approvalDialogModel(pending:PendingTuiApproval,input:{expanded:boolean}):ApprovalDialogModel{
  const action=pending.action;const target=action.command??action.resource??[action.serverId,action.operation].filter(Boolean).join(':');
  const summary=[action.tool,target].filter(Boolean).join(' · ');
  const fullPayload=input.expanded?JSON.stringify(pending.rawPayload,null,2):summary;
  const ruleLine=pending.rule===PATH_BOUNDARY_RULE?'decided by the path boundary':pending.rule?`rule ${pending.rule}`:undefined;
  const explanation=pending.explanation;
  let segments:ApprovalSegmentRow[]=[];let segmentsWithheld:string|undefined;
  if(explanation){
    const rows=segmentRows(explanation);
    if(rows.length&&!accountAgrees(pending,explanation))segmentsWithheld='explanation unavailable: the account disagreed with the decision (possible race)';
    else segments=rows;
  }
  return{
    title:`Permission: ${action.tool}`,summary,fullPayload,expanded:input.expanded,reason:pending.reason,...(pending.rule?{rule:pending.rule}:{}),...(pending.runtimeHint?{runtimeHint:pending.runtimeHint}:{}),
    ...(ruleLine?{ruleLine}:{}),segments,...(segmentsWithheld?{segmentsWithheld}:{}),...(pending.explanationError?{explanationError:pending.explanationError}:{}),
    ...(input.expanded&&pending.alwaysSimulation?{alwaysPreview:alwaysPreview(pending,pending.alwaysSimulation)}:{}),
  };
}

/*
 * Every character that moves the cursor, ends a line, drives the terminal or renders as nothing is
 * shown as its code point instead of being written. Same convention as slice 14's human error line
 * (`\uXXXX` over C0, DEL, C1 — U+0085 NEL and U+009B CSI included — U+2028 and U+2029), extended
 * with the whole Unicode Bidi_Control set and every Default_Ignorable_Code_Point (zero-width
 * characters, word joiner, tag characters, variation selectors): a dialog that asks for consent
 * must not contain text the person cannot see. ESC is C0, so no SGR, OSC or CSI sequence survives.
 * Nothing is dropped: a hidden character becomes a visible one.
 */
const TERMINAL_UNSAFE=/[\x5c\x00-\x1f\x7f-\x9f\u2028\u2029\p{Bidi_Control}\p{Default_Ignorable_Code_Point}]/gu;
// Round 3: the backslash is escaped too. Without it, a real ESC made inert and a command that
// literally contains the six characters of that escape rendered byte-identically, which teaches a
// person to read escapes as noise. The full review is JSON, whose own escaping already doubles every
// backslash, so there the backslash is left exactly as JSON wrote it.
const BACKSLASH=String.fromCharCode(92);
export function inertText(value:string,{json=false}:{json?:boolean}={}):string{
  return value.replace(TERMINAL_UNSAFE,character=>{
    if(character===BACKSLASH)return json?BACKSLASH:BACKSLASH+BACKSLASH;
    const code=character.codePointAt(0)!;
    return code>0xffff?`${BACKSLASH}u{${code.toString(16)}}`:`${BACKSLASH}u${code.toString(16).padStart(4,'0')}`;
  });
}

const EFFECT_WIDTH=5;const COMMAND_WIDTH_CAP=32;const COLUMN_GAP=2;
// Free text derived from the model is indented by this much, so none of its lines, wrapped or not,
// can start at the left edge where a row starts.
const TEXT_INDENT=2;
const PRECEDENCE_HEADER='Segments in execution order; the strictest decides (deny > ask > allow):';
// `summaryReason` is the engine's reason printed right above the rows. The decisive row already IS
// that sentence ("segment N: …"), so it names its decider without printing the sentence twice.
function deciderText(row:ApprovalSegmentRow,summaryReason:string):string{
  const said=row.decisive&&summaryReason===`segment ${row.position}: ${row.reason}`;
  const detail=(label:string)=>said?label:`${label}: ${row.reason}`;
  if(row.decidedBy==='path-boundary')return detail('path boundary');
  if(row.decidedBy==='rule')return row.reason===`matched ${row.effect} rule`?`rule ${row.rule}`:detail(`rule ${row.rule}`);
  if(row.decidedBy==='built-in')return detail('built-in');
  return row.reason;
}
/*
 * Round 3 — MODEL TEXT HAS A HEIGHT LIMIT.
 *
 * Measured by the adversarial review and reproduced through the real TuiApp at 80x24: a single-segment
 * `curl … | sh` whose second argument was NBSP filler sized to the terminal height, followed by a
 * forged dialog, pushed the real title off the visible screen and drew a whole forged
 * `Permission: Bash / Segments… / >2 ask && npm test / [1] once…` block, at the very indent of the
 * real reason and summary. Indentation cannot tell the two apart, and styling disappears with colour
 * off, so the defence is HEIGHT: collapsed, every piece of model-derived text takes at most
 * COLLAPSED_TEXT_LINES rendered lines, the last of which says how much was cut. The title, the
 * precedence header, every row and the key line always render; `v` shows everything.
 *
 * The wrapping is done here and not by Ink, so the number of lines is known before rendering: each
 * wrapped piece is its own Text with `truncate-end`, which can shorten a line but never add one.
 */
// Width is measured CONSERVATIVELY: printable ASCII is one column, every other grapheme two. Ink
// measures with string-width, which this CLI does not depend on, and the TUI's own displayWidth reads
// 8,451 single code points narrower than Ink does (measured: U+2630 and up, keycap sequences, flags).
// Measuring too wide only makes a line shorter; measuring too narrow would let Ink cut the end of a
// line without the cut marker saying so.
const PRINTABLE_ASCII=/^[\x20-\x7e]$/u;
export function conservativeCells(text:string):number{let total=0;for(const grapheme of splitGraphemes(text))total+=PRINTABLE_ASCII.test(grapheme)?1:2;return total;}
const COLLAPSED_TEXT_LINES=3;
const BORDER_WIDTH=2;const MIN_COMMAND_COLUMN=8;
// Word wrap that loses nothing: the lines concatenate back to the text exactly. A word that does not
// fit the rest of the line moves to the next one; a word longer than a whole line fills the current
// line and is broken inside, as Ink's own wrap does, so no line is wasted before a hard break.
export function wrapToWidth(text:string,width:number):string[]{
  const limit=Math.max(1,width);const lines:string[]=[];
  let line='';let used=0;
  const breakInside=(token:string)=>{for(const grapheme of splitGraphemes(token)){const cells=conservativeCells(grapheme);if(line!==''&&used+cells>limit){lines.push(line);line='';used=0;}line+=grapheme;used+=cells;}};
  for(const token of text.split(/( +)/u)){
    if(token==='')continue;
    const cells=conservativeCells(token);
    if(used+cells<=limit){line+=token;used+=cells;continue;}
    if(token.startsWith(' ')||cells>limit){breakInside(token);continue;}
    if(line!==''){lines.push(line);line='';used=0;}
    line=token;used=cells;
  }
  if(line!==''||!lines.length)lines.push(line);
  return lines;
}
function cutMarker(hiddenCharacters:number,width:number):string{
  const count=hiddenCharacters.toLocaleString('en-US');
  for(const marker of [`… ${count} more characters — press v to review in full`,`… ${count} more — press v`,`… ${count} more`])if(conservativeCells(marker)<=width)return marker;
  return '…';
}
// `limit` null means the full review: nothing is cut.
function boundedLines(text:string,width:number,limit:number|null):string[]{
  const lines=wrapToWidth(text,width);
  if(limit===null||lines.length<=limit)return lines;
  const kept=lines.slice(0,limit-1);
  return[...kept,cutMarker([...lines.slice(limit-1).join('')].length,width)];
}
function segmentLines(rows:ApprovalSegmentRow[],summaryReason:string,tone:'plain'|'dim',inner:number,limit:number|null):ApprovalDialogLine[]{
  const commands=rows.map(row=>inertText(row.operatorBefore&&row.operatorBefore!=='newline'?`${row.operatorBefore} ${row.command}`:row.command));
  const commandWidth=Math.min(COMMAND_WIDTH_CAP,Math.max(...commands.map(command=>conservativeCells(command))));
  // The position is padded on the right, never the left: the digit always sits right after the marker.
  const digits=String(Math.max(...rows.map(row=>row.position))).length;
  const gutterWidth=1+digits+1+EFFECT_WIDTH+COLUMN_GAP;
  // Explicit column widths, computed once for every row: left to flex layout, each row shrank its own
  // columns by its own content and the rule column started somewhere else on every row.
  const available=Math.max(0,inner-gutterWidth);
  const commandColumn=Math.max(MIN_COMMAND_COLUMN,Math.min(commandWidth+COLUMN_GAP,Math.floor(available/2)));
  const deciderColumn=Math.max(1,available-commandColumn);
  return rows.map((row,index)=>{
    const gutter=`${row.decisive?'>':' '}${String(row.position).padEnd(digits)} ${row.effect.padEnd(EFFECT_WIDTH)}`;
    const commandLines=boundedLines(commands[index]!,commandColumn-COLUMN_GAP,limit);
    const deciderLines=boundedLines(inertText(deciderText(row,summaryReason)),deciderColumn,limit);
    return{kind:'row',tone,gutter,gutterWidth,commandLines,commandColumn,deciderLines,deciderColumn,text:`${gutter.padEnd(gutterWidth)}${commandLines.join('').padEnd(commandWidth+COLUMN_GAP)}${deciderLines.join('')}`};
  });
}
function fixedLine(text:string,tone:'title'|'plain'|'dim',indent:number):ApprovalDialogLine{return{kind:'text',text:inertText(text),tone,indent,modelText:false};}
function modelLines(text:string,tone:'plain'|'dim',inner:number,limit:number|null,{json=false}:{json?:boolean}={}):ApprovalDialogLine[]{
  return boundedLines(inertText(text,{json}),inner-TEXT_INDENT,limit).map(piece=>({kind:'text',text:piece,tone,indent:TEXT_INDENT,modelText:true}));
}

// The exact lines the TUI renders, in order, already made inert. The terminal only maps a tone to a
// style and a row to its columns.
export function approvalDialogLines(model:ApprovalDialogModel,{columns=80}:{columns?:number|undefined}={}):ApprovalDialogLine[]{
  const inner=Math.max(1,columns-BORDER_WIDTH);
  const limit=model.expanded?null:COLLAPSED_TEXT_LINES;
  const lines:ApprovalDialogLine[]=[fixedLine(model.title,'title',0),...modelLines(model.reason,'plain',inner,limit)];
  if(model.ruleLine)lines.push(...modelLines(model.ruleLine,'dim',inner,limit));
  if(model.segments.length){
    lines.push(fixedLine(PRECEDENCE_HEADER,'dim',0));
    lines.push(...segmentLines(model.segments,model.reason,'plain',inner,limit));
  }
  if(model.segmentsWithheld)lines.push(fixedLine(model.segmentsWithheld,'dim',TEXT_INDENT));
  if(model.explanationError)lines.push(...modelLines(`per-segment account unavailable: ${model.explanationError}`,'dim',inner,limit));
  // Only the expanded JSON may be split: JSON.stringify escapes C0 inside strings, so its raw line
  // breaks are its own layout. Collapsed, the payload IS the command, and its line breaks are data.
  if(model.expanded)for(const payloadLine of model.fullPayload.split('\n'))lines.push(...modelLines(payloadLine,'plain',inner,limit,{json:true}));
  else lines.push(...modelLines(model.fullPayload,'plain',inner,limit));
  const preview=model.alwaysPreview;
  if(preview){
    if(preview.writes===null)lines.push(...modelLines(`[3] always ${preview.refused}`,'dim',inner,limit));
    else{
      lines.push(...modelLines(`[3] always writes ${preview.writes}`,'dim',inner,limit));
      if(preview.failure!==undefined)lines.push(...modelLines(`    that rule cannot be evaluated: ${preview.failure}`,'dim',inner,limit));
      else{
        if(preview.wildcard)lines.push(fixedLine('    wildcard: this rule covers more than this request','dim',TEXT_INDENT));
        const outcome=preview.decidedByNewRule?`${preview.effect} by this rule`:`still ${preview.effect}: the rule ${preview.compound?'matches no segment':'does not decide this request'}`;
        lines.push(fixedLine(`    with that rule this command is: ${outcome}`,'dim',TEXT_INDENT));
        if(preview.changedSegments.length)lines.push(...segmentLines(preview.changedSegments,'','dim',inner,limit));
      }
    }
  }
  lines.push(fixedLine(KEYS_LINE,'dim',0));
  return lines;
}

export type ApprovalDialogViewport={lines:ApprovalDialogLine[];offset:number;maxOffset:number};
function approvalLineHeight(line:ApprovalDialogLine):number{return line.kind==='row'?Math.max(1,line.commandLines.length,line.deciderLines.length):1;}
function clippedApprovalLine(line:ApprovalDialogLine,height:number):ApprovalDialogLine{
  if(line.kind==='text'||approvalLineHeight(line)<=height)return line;
  return{...line,commandLines:line.commandLines.slice(0,height),deciderLines:line.deciderLines.slice(0,height)};
}
function oneModelLine(text:string,tone:'plain'|'dim',inner:number):ApprovalDialogLine{
  return modelLines(text,tone,inner,1)[0]??fixedLine('',tone,TEXT_INDENT);
}
export function approvalDialogViewport(model:ApprovalDialogModel,{columns=80,rows=12,scrollOffset=0}:{columns?:number|undefined;rows?:number|undefined;scrollOffset?:number|undefined}={}):ApprovalDialogViewport{
  const all=approvalDialogLines(model,{columns});const budget=Math.max(6,Math.floor(rows));
  const total=all.reduce((sum,line)=>sum+approvalLineHeight(line),0);
  if(total<=budget)return{lines:all,offset:0,maxOffset:0};
  const inner=Math.max(1,columns-BORDER_WIDTH);
  const decisive=model.segments.find(row=>row.decisive);
  const operation=decisive?`${decisive.effect}: ${decisive.command}`:model.summary;
  const firstPayloadField=model.expanded?model.fullPayload.split('\n').find(line=>{const value=line.trim();return value!==''&&value!=='{'&&value!=='}';}):undefined;
  const header=[fixedLine(model.title,'title',0),oneModelLine(model.reason,'plain',inner),oneModelLine(operation,'plain',inner),...(firstPayloadField?[oneModelLine(firstPayloadField,'dim',inner)]:[])];
  const controls=[fixedLine('[1] once  [2] session  [3] always','dim',0),fixedLine('[4] deny once  [5] deny always  Esc deny','dim',0)];
  const body=all.slice(1,-1);
  const reserved=header.length+controls.length+(model.expanded?1:0);
  const bodyBudget=Math.max(1,budget-reserved);
  let used=0,maxOffset=body.length;
  for(let index=body.length-1;index>=0;index-=1){
    const height=approvalLineHeight(body[index]!);if(used+height>bodyBudget)break;used+=height;maxOffset=index;
  }
  const offset=Math.max(0,Math.min(maxOffset,Math.floor(Number.isFinite(scrollOffset)?scrollOffset:0)));
  const visible:ApprovalDialogLine[]=[];used=0;
  for(let index=offset;index<body.length;index+=1){
    const line=body[index]!,height=approvalLineHeight(line);
    if(used+height>bodyBudget){
      if(visible.length===0)visible.push(clippedApprovalLine(line,bodyBudget));
      break;
    }
    visible.push(line);used+=height;
  }
  const scroll=model.expanded?fixedLine(`Review ${offset+1}/${maxOffset+1} · PgUp/PgDn scroll`,'dim',0):null;
  return{lines:[...header,...(scroll?[scroll]:[]),...visible,...controls],offset,maxOffset};
}

// The dialog as Ink elements. Model text arrives already wrapped: one Text per terminal line, cut
// rather than wrapped by Ink, so its height is exactly what the viewport decided.
export function renderApprovalDialog(h:(...args:any[])=>unknown,Ink:{Box:unknown;Text:unknown},model:ApprovalDialogModel,{accentColor,columns=80,rows,scrollOffset=0}:{accentColor?:string|undefined;columns?:number|undefined;rows?:number|undefined;scrollOffset?:number|undefined}={}):unknown{
  const lines=rows===undefined?approvalDialogLines(model,{columns}):approvalDialogViewport(model,{columns,rows,scrollOffset}).lines;
  return h(Ink.Box,{borderStyle:'round',flexDirection:'column'},...lines.map((line,index)=>{
    const style=line.tone==='title'?{bold:true,color:accentColor}:line.tone==='dim'?{dimColor:true}:{};
    const piece=(text:string,key:number)=>h(Ink.Text,{...style,key,wrap:'truncate-end'},text);
    if(line.kind==='text')return h(Ink.Box,{key:index,paddingLeft:line.indent},line.modelText?piece(line.text,0):h(Ink.Text,style,line.text));
    return h(Ink.Box,{key:index,flexDirection:'row'},
      h(Ink.Box,{width:line.gutterWidth,flexShrink:0},h(Ink.Text,style,line.gutter)),
      // The gap is padding, not width: a hard-wrapped command must never touch the rule beside it.
      h(Ink.Box,{width:line.commandColumn,paddingRight:COLUMN_GAP,flexShrink:0,flexDirection:'column'},...line.commandLines.map(piece)),
      h(Ink.Box,{width:line.deciderColumn,flexShrink:0,flexDirection:'column'},...line.deciderLines.map(piece)));
  }));
}

const APPROVAL_ACTIONS:Record<string,UserApprovalChoice>={
  'approval-once':'allow-once','approval-session':'allow-session','approval-always':'allow-always',
  'approval-deny-once':'deny-once','approval-deny-always':'deny-always','approval-cancel':'deny-once','interrupt':'deny-once',
};
export function approvalChoiceForAction(action:string):UserApprovalChoice|undefined{return APPROVAL_ACTIONS[action];}
