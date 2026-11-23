import type {PendingTuiApproval} from '../session-controller.ts';
import {fitRow} from '../components/chrome-rows.ts';
import type {StyledSegment} from '../components/styled-rows.ts';
import type {UserApprovalChoice} from '../approval.ts';
import {compileRules,PATH_BOUNDARY_RULE,patternNamesOnlyAVerb} from '../../security/evaluate.ts';
import {explainPermission,simulatePermission,type PermissionExplanation,type PermissionSegmentExplanation,type PermissionSimulation} from '../../security/permission-explanation.ts';
import {mcpWithoutItsTool,permissionActionToRule} from '../../security/persist.ts';
import {displayWidth,splitGraphemes} from '../text-width.ts';
import {sliceByHeights} from './scroll-window.ts';
import type {PermissionAction,PermissionEffect,RuleSetInput} from '../../security/types.ts';
import {t,tn,type MessageId} from '../../i18n/index.ts';
import {lineDiff} from '../line-diff.ts';
import type {HitRegister} from '../components/styled-rows.ts';
import {isKnownTool,permissionToolFor,toolDisplay} from '../tool-display.ts';

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
/* Twin repair of desktop 0.2.2, for 0.6.15: the arguments of the call, already masked and cut by the kernel, as `name: value` rows (a
   nested object indented under its name) and how many values the kernel cut. */
export type ApprovalArguments={rows:string[];cut:number;/** row 126: a group's heading and the line on calls not listed */title?:string;note?:string};
/* R3 Q-R3-4 / gate E10: the change a write or an edit would make, shown in the approval before it happens. */
export type ApprovalChange={counts:string;rows:Array<{kind:'add'|'remove'|'context'|'meta';text:string}>};
export type ApprovalDialogModel={
  title:string;summary:string;fullPayload:string;expanded:boolean;reason:string;rule?:string;runtimeHint?:string;
  ruleLine?:string;segments:ApprovalSegmentRow[];segmentsWithheld?:string;explanationError?:string;alwaysPreview?:ApprovalAlwaysPreview;
  /* R3 gate E11: the question, the highlighted choice (Q-R3-6) and the change a write or an edit would make. */
  question:string;selected:number;change?:ApprovalChange;
  /* twin repair of desktop 0.2.2 (0.6.15): what a connector, plugin or Tool Forge call sends, one readable row per field */
  arguments?:ApprovalArguments;
  /* the choices this dialog offers when they are not the four (a network path) */
  choices?:ReadonlyArray<ApprovalChoiceRow>;
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
export type ApprovalLineTarget={start:number;width:number;action:string};
export type ApprovalDialogLine=
 | {kind:'text';text:string;tone:'title'|'plain'|'dim'|'selected'|'add'|'remove';indent:number;modelText:boolean;
    /* stage 6c: the cells of this row a click answers with (`aopt:i`, the mockup's approval choices), from the text's start */
    targets?:ReadonlyArray<ApprovalLineTarget>}
 | {kind:'row';text:string;tone:'plain'|'dim';gutter:string;gutterWidth:number;commandLines:string[];commandColumn:number;deciderLines:string[];deciderColumn:number};

/*
 * R3 gate E11, owner decisions Q-R3-5/6/14. Four choices, Deny highlighted by default, so a reflexive Enter never runs
 * anything; ↑/↓ move the highlight, Enter confirms it, a digit picks at once. "Deny always" is offered in the full review
 * only (or /permissions). The highlighted Deny denies and lets the turn continue; Esc denies and stops the turn from the
 * summary, and goes back from the full review. Every choice row starts at the left edge with the highlight marker or a
 * space and then `[digit]`, where model text (always indented by TEXT_INDENT) can never start, so a command cannot forge
 * a choice.
 */
export const APPROVAL_CHOICES:ReadonlyArray<{action:string;digit:string;label:MessageId}>=Object.freeze([
  {action:'approval-once',digit:'1',label:'approval.choice.once'},
  {action:'approval-session',digit:'2',label:'approval.choice.session'},
  {action:'approval-always',digit:'3',label:'approval.choice.always'},
  {action:'approval-deny-once',digit:'4',label:'approval.choice.deny'},
]);
export const APPROVAL_DEFAULT_SELECTED=3;
export type ApprovalChoiceRow={action:string;digit:string;label:MessageId};
/* Network-path series (owner 02/10: «Solo tu, sempre», and the dialog preview approved the same day): a network path is answered
   once, every time — the project folder on a share once per session, remembered by the kernel — so only the choices that hold
   are offered, numbered as shown; no «always». Every other approval keeps the four. */
const NETWORK_ONCE:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([{action:'approval-once',digit:'1',label:'approval.choice.once'},{action:'approval-deny-once',digit:'2',label:'approval.choice.deny'}]);
/* The owner, 02/11: the research card has the question to change, Start and Cancel; Cancel stays the highlighted one */
const RESEARCH_CARD:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([{action:'approval-once',digit:'1',label:'approval.choice.startResearch'},{action:'approval-deny-once',digit:'2',label:'approval.choice.cancelResearch'},{action:'approval-edit',digit:'e',label:'approval.choice.editQuestion'}]);
/* Decision 41: once (not remembered), for this chat (the kernel remembers it), Deny; no «always» */
const WSL_ROOT_CARD:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([{action:'approval-once',digit:'1',label:'approval.choice.once'},{action:'approval-session',digit:'2',label:'approval.choice.thisChat'},{action:'approval-deny-once',digit:'3',label:'approval.choice.deny'}]);
/* A5h cure round 1: the same three rows as the root card of WSL, with «for this session» */
const CHILD_SESSION_CARD:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([{action:'approval-once',digit:'1',label:'approval.choice.once'},{action:'approval-session',digit:'2',label:'approval.choice.session'},{action:'approval-deny-once',digit:'3',label:'approval.choice.deny'}]);
/* A5j (owner 13/11/2026 04:35, road B): an outside tool's card keeps the four and adds the PC's «No to this tool until your next message»
   (desktop 0.2.3 app.js:18938-18951); [5] «deny always» stays in the full review */
const OUTSIDE_TOOL_CHOICES:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([...APPROVAL_CHOICES,{action:'approval-deny-tool',digit:'6',label:'approval.choice.noToTool'}]);
/* Row 126, road A: the first card of a group adds «Allow all the same calls of this answer» (desktop 0.2.3 chat.js:1479, «Allow all
   {count}»); the key is 7, read by app.ts beside the research card's «e» (a new keybinding would change the generated reference) */
const ALL_CALLS_CHOICES:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([...OUTSIDE_TOOL_CHOICES,{action:'approval-all-calls',digit:'7',label:'approval.choice.allCalls'}]);
const NETWORK_SESSION:ReadonlyArray<ApprovalChoiceRow>=Object.freeze([{action:'approval-session',digit:'1',label:'approval.choice.session'},{action:'approval-deny-once',digit:'2',label:'approval.choice.deny'}]);
/* Owner 09/10/2026 («Sì, con la carta»): a change of OpenRouter's excluded providers is asked every time, so no «session» or «always». */
const PROVIDER_CHANGES=new Set(['provider_exclude','provider_allow']);
export function approvalChoicesFor(action:PermissionAction|null|undefined):ReadonlyArray<ApprovalChoiceRow>{
  if(action?.operation==='research_start')return RESEARCH_CARD;
  /* decision 155: a critical deletion is answered once, every time */
  if(action?.criticalDelete)return NETWORK_ONCE;
  /* decision 373: a control file's card too (the kernel's `sempreNonBasta`: «always» is not enough there) */
  if(action?.controlFile)return NETWORK_ONCE;
  if(action?.wslRoot)return WSL_ROOT_CARD;
  /* A5f: where the kernel says «always» is not enough (a child's or delegate's card, a control file's ordinary write), once or deny */
  if(action?.alwaysNotEnough===true)return NETWORK_ONCE;
  /* R-34 part 2: a call the model wrote as text is answered once, every time; riga 91: so is the kernel's «only once» card (before
     the child's «for this session» below: a card that is «only once» never offers more) */
  if(action?.personOnly===true||action?.onlyOnce===true)return NETWORK_ONCE;
  /* riga 72: an MCP card without its tool, once or no (persist.ts mcpWithoutItsTool) */
  if(action&&mcpWithoutItsTool(action))return NETWORK_ONCE;
  /* A5h cure round 1 (giudice, G3): a child's card in acceptEdits or Full access, once, for this session, Deny; never «always» */
  if(action?.sessionOnly===true)return CHILD_SESSION_CARD;
  if(action?.networkRequested===true||(action?.operation&&(PROVIDER_CHANGES.has(action.operation)||action.operation==='giri-in-tondo'||action.operation==='chatgpt_account')))return NETWORK_ONCE;
  if(action?.sensitive!=='network')return action?.noToThisTool===true?((action.sameCalls??0)>1?ALL_CALLS_CHOICES:OUTSIDE_TOOL_CHOICES):APPROVAL_CHOICES;
  return action.network?.scope==='session'?NETWORK_SESSION:NETWORK_ONCE;
}
/** The highlighted choice when a dialog opens: Deny. */
export function approvalDefaultSelected(choices:ReadonlyArray<ApprovalChoiceRow>=APPROVAL_CHOICES):number{const deny=choices.findIndex(row=>row.action==='approval-deny-once');return deny>=0?deny:choices.length-1;}
/* the digit each approval key stands for (keybindings: 1-4) */
const DIGIT_OF:Readonly<Record<string,string>>=Object.freeze({'approval-once':'1','approval-session':'2','approval-always':'3','approval-deny-once':'4','approval-deny-tool':'6'});
/* a list with «always» also has «deny always» in its full review */
const offersAlways=(choices:ReadonlyArray<ApprovalChoiceRow>)=>choices.some(row=>row.action==='approval-always');
const SELECTED_MARKER='›';
function choiceText(choices:ReadonlyArray<ApprovalChoiceRow>,index:number,selected:number):string{const row=choices[index]!;return`${index===selected?SELECTED_MARKER:' '}[${row.digit}] ${t(row.label)}`;}
/*
 * R3 approval key race, owner decision (binding): for APPROVAL_GRACE_MS after the dialog is first shown for a request,
 * keys keep going to the composer (type-ahead is preserved, and a key typed in advance never answers the approval);
 * after that the dialog takes every key, whatever the render has caught up with (app.ts reads a ref set synchronously).
 */
export const APPROVAL_GRACE_MS=300;
/** One key in the field of the research card. Text only: a control sequence is dropped here, the kernel checks the question again. */
export type ResearchEditStep={kind:'text';text:string}|{kind:'start';text:string}|{kind:'back'};
export function researchEditStep(text:string,ch:string,key:{return?:boolean;escape?:boolean;backspace?:boolean;delete?:boolean}):ResearchEditStep{
  if(key.escape)return{kind:'back'};
  if(key.return)return text.trim()?{kind:'start',text:text.trim()}:{kind:'text',text};
  if(key.backspace||key.delete)return{kind:'text',text:splitGraphemes(text).slice(0,-1).join('')};
  return{kind:'text',text:/^[^\p{Cc}\p{Cf}]+$/u.test(ch)?text+ch:text};
}
/** The field under the card: the question as it stands, wrapped to the card, and its keys. */
export function researchEditRows(text:string,columns:number):StyledSegment[][]{
  const room=Math.max(8,columns-4);const out:StyledSegment[][]=[];let line='';
  for(const character of `${text}▏`){if(displayWidth(line+character)>room){out.push([{text:`│  ${line}`,roles:['plain']}]);line='';}line+=character;}
  out.push([{text:`│  ${line}`,roles:['plain']}],[{text:`│  ${t('approval.editQuestion.keys')}`,roles:['dim']}]);
  return out;
}
export type ApprovalInputGate='none'|'grace'|'dialog';
export function approvalInputGate(shown:{shownAt:number}|null,now:number):ApprovalInputGate{
  if(!shown)return'none';
  return now-shown.shownAt<APPROVAL_GRACE_MS?'grace':'dialog';
}
export type ApprovalKeyOutcome={kind:'answer';choice:UserApprovalChoice;stop:boolean}|{kind:'select';selected:number}|{kind:'toggle-review'}|{kind:'back'}|{kind:'ignore'}|{kind:'edit'};
/* One key in the dialog → what it does. `approvalChoiceForAction` stays the one mapping from a key action to a choice. */
export function approvalKeyOutcome(action:string|null,{expanded,selected:rawSelected,escape,choices=APPROVAL_CHOICES}:{expanded:boolean;selected:number;escape:boolean;choices?:ReadonlyArray<ApprovalChoiceRow>}):ApprovalKeyOutcome{
  if(!action)return{kind:'ignore'};
  const selected=Math.max(0,Math.min(choices.length-1,rawSelected));
  if(action==='approval-view')return{kind:'toggle-review'};
  if(action==='approval-up')return{kind:'select',selected:Math.max(0,selected-1)};
  if(action==='approval-down')return{kind:'select',selected:Math.min(choices.length-1,selected+1)};
  if(action==='approval-confirm'){const row=choices[selected]??choices[approvalDefaultSelected(choices)]!;if(row.action==='approval-edit')return{kind:'edit'};return{kind:'answer',choice:approvalChoiceForAction(row.action)!,stop:false};}
  /* a digit answers the choice shown with that digit; a dialog with fewer choices has no «always» and no «deny always» */
  if((choices!==APPROVAL_CHOICES||action==='approval-deny-tool')&&action in DIGIT_OF){const row=choices.find(candidate=>candidate.digit===DIGIT_OF[action]);return row?{kind:'answer',choice:approvalChoiceForAction(row.action)!,stop:false}:{kind:'ignore'};}
  if(!offersAlways(choices)&&action==='approval-deny-always')return{kind:'ignore'};
  if(action==='approval-cancel'&&escape&&expanded)return{kind:'back'};
  if(action==='approval-cancel'||action==='interrupt')return{kind:'answer',choice:approvalChoiceForAction(action)!,stop:true};
  if(action==='approval-deny-always'&&!expanded)return{kind:'ignore'};
  const choice=approvalChoiceForAction(action);
  return choice?{kind:'answer',choice,stop:false}:{kind:'ignore'};
}
// The verdict a pending approval answers. The coordinator only surfaces an engine `ask`.
const VERDICT_BEING_ANSWERED:PermissionEffect='ask';

// Mirrors `bashRuleNarrowsNothing` in security/persist.ts, which is not exported. The test
// "the refusal shown in the preview is the persistence layer's own refusal" runs both against the
// same commands, so a drift between the two turns that test red instead of lying on screen.
function bashRuleNarrowsNothing(rule:string):boolean{const match=/^Bash\((.*)\)$/u.exec(rule);if(!match)return false;const pattern=match[1]!;return pattern===''||patternNamesOnlyAVerb(pattern);}
function errorText(error:unknown):string{return error instanceof Error?error.message:String(error);}
/*
 * R2 (Q-R2-4, coordinator note to lane T): a refusal names its code ONCE. Lane E moves the code of the 8 `CODE: prose`
 * sites from the message to `error.code`, so both shapes are read: the code from `error.code` or from the message's
 * `CODE:` prefix, the sentence without that prefix. The code comes first, beside "refused", so it stays on the first row.
 */
const CODE_SHAPE=/^[A-Z][A-Z0-9_]*$/u;
function errorCode(error:unknown):string|null{
  const own=(error as {code?:unknown}|null)?.code;
  if(typeof own==='string'&&CODE_SHAPE.test(own))return own;
  return /^([A-Z][A-Z0-9_]*)(?::|$)/u.exec(errorText(error))?.[1]??null;
}
export function refusalText(error:unknown):string{
  const code=errorCode(error);let sentence=errorText(error).trim();
  if(code&&(sentence===code||sentence.startsWith(`${code}:`)))sentence=sentence.slice(code.length+1).trim();
  return `would be refused${code?` (${code})`:''}${sentence?`: ${sentence}`:''}`;
}

function simulateAllowAlways({rules,action,projectRoot,persists}:{rules:RuleSetInput;action:PermissionAction;projectRoot:string;persists:boolean}):AllowAlwaysSimulation{
  if(!persists)return{writes:null,refused:'writes no rule: no configuration path is attached to this session'};
  let rule:string;
  try{rule=permissionActionToRule(action,projectRoot);}catch(error){return{writes:null,refused:refusalText(error)};}
  if(action.tool==='Bash'&&bashRuleNarrowsNothing(rule))return{writes:null,refused:`would be refused: ${rule} would narrow nothing`};
  try{return{writes:rule,simulation:simulatePermission({rules:{...rules,allow:[...rules.allow,rule]},action,projectRoot})};}
  // The rule is already printed on the line above: report the code, not the rule a second time.
  catch(error){return{writes:rule,failure:errorCode(error)??errorText(error)};}
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

/* UI Phase 0 D17: the engine's `no rule matched` (security/evaluate.ts) is shown in words; every other reason as it is. */
export function shownReason(reason:string):string{const cut=/(^|: )no rule matched$/u.exec(reason);return cut?reason.slice(0,cut.index)+cut[1]+t('approval.reason.noRule'):reason;}
function segmentRows(explanation:PermissionExplanation):ApprovalSegmentRow[]{
  // A single command is exactly what the summary line already says: no row adds anything to it.
  if(explanation.segments.length<2)return[];
  return explanation.segments.map((segment,index)=>{
    const boundary=segment.rule===PATH_BOUNDARY_RULE;
    const decidedBy:ApprovalSegmentRow['decidedBy']=boundary?'path-boundary':segment.rule?'rule':segment.effect==='ask'?'no-rule':'built-in';
    return{position:index+1,operatorBefore:segment.operatorBefore,command:segment.command,effect:segment.effect,decidedBy,...(segment.rule&&!boundary?{rule:segment.rule}:{}),reason:shownReason(segment.reason),decisive:index===explanation.decisiveSegment};
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

/*
 * R2 lane T (Q-R2-3, gate E3): the title and summary name the tool by its on-screen label ("Permission: Shell"); rule text
 * keeps its grammar (`Bash(…)`). The TITLE is drawn from a closed set only — a kernel tool's label from the table, and
 * only when the table judges that tool as the action being answered, otherwise the permission tool's own label: a name
 * chosen by a model, an MCP server or a plugin author never reaches the one fixed line that starts at the left edge.
 * The summary is model text (indented, bounded) and may carry the humanised name of a tool the kernel did not declare.
 */
function approvalLabel(action:PermissionAction,name:unknown):string{
  if(isKnownTool(name)&&permissionToolFor(name)===action.tool)return toolDisplay(name).label;
  return t(`tool.permission.${action.tool}`);
}
/*
 * R3 gate E11 (§0.10): the full review is written for a person. It was `JSON.stringify` of the kernel payload, which put
 * kernel keys and tool names on screen (`"tool": "scrivi"`, `"contenutoPrima": null`). Every field the kernel sends is
 * named in English; the before/after texts become the diff below; a field this table does not know yet is still shown,
 * under "Other details", so nothing the approval covers is hidden from the person who answers it.
 */
const REVIEW_SKIPPED=new Set(['tool','tipo','toolCallId','displayName','contenutoPrima','contenutoProposto','contentBefore','proposedContent','trifecta','path','percorso','command','comando','format','formato','url','serverId','operation','sensitive','segreto',
  /* twin repair of desktop 0.2.2: the arguments have their own rows (approvalArguments), never raw JSON here */
  'arguments','argomenti','argumentsCut','argomentiTagliati',
  /* decision 373: the control file's mark is said by the card's reason, never as a raw kernel key */
  'fileDiControllo','controlFile',
  /* A5f: nor «always is not enough»: the choices on the card say it */
  'sempreNonBasta','alwaysNotEnough',
  /* row 126: the group has its own rows (approvalGroup) */
  'gruppo']);
const OUTSIDE_TOOL_CARDS=new Set(['mcp_tool','plugin_tool','forge_tool']);
const OUTSIDE_CARD_FIELDS=new Set(['nome','name','server','plugin','attrezzo','frase','sentence','fraseChiave','sentenceKey','fraseParams','sentenceParams']);
function field(payload:Record<string,unknown>,...keys:string[]):string|undefined{for(const key of keys){const value=payload[key];if(typeof value==='string'&&value.length>0)return value;}return undefined;}
function reviewText(pending:PendingTuiApproval,label:string):string{
  const payload=pending.rawPayload??{};const lines=[`${t('approval.review.tool')}: ${label}`];
  const add=(id:MessageId,value:string|undefined)=>{if(value!==undefined)lines.push(`${t(id)}: ${value}`);};
  add('approval.review.path',field(payload,'path','percorso'));
  add('approval.review.command',field(payload,'command','comando'));
  add('approval.review.format',field(payload,'format','formato'));
  add('approval.review.address',field(payload,'url'));
  add('approval.review.server',field(payload,'serverId'));
  add('approval.review.operation',field(payload,'operation'));
  const REVIEW_REASON:Readonly<Record<string,MessageId>>={'sign-in-link':'approval.review.signInLink',biglietti:'approval.review.signInLink','too-complex':'approval.review.tooComplex','troppo-complesso':'approval.review.tooComplex'};
  const sensitive=payload.sensitive??payload.segreto;
  if(sensitive&&typeof sensitive==='object'){const record=sensitive as Record<string,unknown>;const where=field(record,'path','percorso');
    /* D-A1: a plain file outside the project is not a secret; saying «keys or passwords» about it would be false */
    /* 0.6.15: the card reads the v2 action, where the class is `class: 'outside'`; the kernel's spelling stays readable */
    const outside=record.class==='outside'||record.classe==='fuori-workspace';
    /* candidate 04/11/2026: a reason the kernel gives wins over the class, as in its own card (path-policy.mjs frasePerLaPersona). The path of a
       sign-in link is a placeholder («biglietto-talos») and a guard past its limit names no file: saying «a file that may hold keys» would be false
       (Hermes shows the reason beside the command, tools/approval.py:1258 and :2766; NN/g «Confirmation Dialogs»: say the specific consequence) */
    const reason=REVIEW_REASON[String(record.reason??record.perche)];
    lines.push(reason?t(reason):outside&&where?t('approval.review.outside',{path:where}):where?t('approval.review.sensitive',{path:where}):t('approval.review.sensitiveHidden'));}
  if(payload.trifecta===true||pending.runtimeHint==='trifecta')lines.push(t('approval.review.trifecta'));
  /* twin repair of desktop 0.2.2: the card of a connector, plugin or Tool Forge tool (P018, `{tipo, nome, server|plugin, attrezzo, frase…}`)
     names who and which tool in words and says its sentence; the exposed name and the sentence's key and parameters are bookkeeping,
     never raw under «Other details» */
  const outsideCard=OUTSIDE_TOOL_CARDS.has(String(payload.tipo??payload.tool));
  if(outsideCard){
    add('approval.review.server',field(payload,'server'));add('approval.review.plugin',field(payload,'plugin'));add('approval.review.itsTool',field(payload,'attrezzo'));
    const sentence=field(payload,'frase','sentence');if(sentence!==undefined)lines.push(sentence);
  }
  const other=Object.entries(payload).filter(([key])=>!REVIEW_SKIPPED.has(key)&&!(outsideCard&&OUTSIDE_CARD_FIELDS.has(key)));
  if(other.length){lines.push(`${t('approval.review.other')}:`);for(const [key,value] of other)lines.push(`${key}: ${typeof value==='string'?value:JSON.stringify(value)}`);}
  return lines.join('\n');
}
/*
 * Twin repair of desktop 0.2.2, for 0.6.15 (owner 14/11 «Nella 0.2.2», judge v1852-v1853): the kernel puts the arguments of a connector,
 * plugin or Tool Forge call on its card, masked by field name at any depth and by the shape of a key, then cut at its cap with «…»
 * (talosHarness.mjs `argomentiPerLaCarta`, `TETTO_ARGOMENTI_DELLA_CARTA`): the CLI reads that copy, it never masks or cuts on its own rule.
 * Round 5: the v2 bridge no longer masks these arguments again by its own name rule (protocol/v2/events.ts `cleanKernelArguments`: one
 * name rule, the kernel's), it keeps «__proto__» as a field, and only passes the texts through its key shapes. Here only the reading: one row per field,
 * `name: value`; an object or a list opens under its name, indented by two spaces per level; a list item is `- value`. As Hermes, whose card
 * ends with «Arguments:» (tools/mcp_tool_handlers.py:172), and Codex, which names every parameter with its value
 * (codex-rs/core/src/mcp_tool_call.rs:2242-2254). Every row is model text: made inert and indented where it is drawn.
 */
const ARGUMENT_DEPTH=8;
const ARGUMENT_LONG_NAME=40; // characters of a name (with its colon) past which its value goes on the row under it
/* Twin repair of desktop 0.2.2, round 4 (judge v1865): the kernel cuts a name at 1,200 characters and numbers one that would repeat a
   name already on the card, right after the cut sign: «pppp…(2)» (talosHarness.mjs `argomentiPerLaCarta`, `unica`). Collapsed, a long
   name is folded at COLLAPSED_TEXT_LINES and its end is the part folded away, so the two rows looked the same: on the terminal the number
   of a long name comes first, «(2) pppp…:», and is always seen. A short name is shown whole, its number where the kernel put it. */
const NUMBERED_CUT_NAME=/^([\s\S]*…)\((\d+)\)$/u;
/* Round 5 (reviewer 3, yellow REV3-09): a long name the MODEL wrote ending in «…(7)» was shown «(7) …» though the kernel never numbered
   it. The CLI knows the kernel numbered a name the same way the kernel decides it (`unica`): the same name WITHOUT the number is already
   on the card, at the same level, because a name is numbered only when it would repeat one already there. No twin on its level: shown
   as written. */
function kernelNumbered(key:string,siblings:ReadonlySet<string>):boolean{
  const match=NUMBERED_CUT_NAME.exec(key);
  return match!==null&&siblings.has(match[1]!);
}
/* Round 5 (reviewer 3, yellow): the 40 of ARGUMENT_LONG_NAME counted raw characters, but a name is drawn inert (`inertText`: an invisible
   character becomes six, `\u200b`) and a wide character takes two columns: a short name of 39 line breaks passed and its value was folded
   away. The width that counts is the width the name is SHOWN at. */
const shownWidth=(label:string)=>displayWidth(inertText(label));
function numberedFirst(key:string,numbered:boolean):string{
  const label=`${key}:`;
  if(!numbered||shownWidth(label)<=ARGUMENT_LONG_NAME)return label;
  const match=NUMBERED_CUT_NAME.exec(key)!;
  return `(${match[2]}) ${match[1]}:`;
}
function argumentRows(value:unknown,depth:number,rows:string[],label:string):void{
  const pad='  '.repeat(depth);
  if(value!==null&&typeof value==='object'&&depth<ARGUMENT_DEPTH){
    const list=Array.isArray(value);
    const keys=list?[]:Object.keys(value as Record<string,unknown>);const siblings=new Set(keys);
    const entries:Array<[string,unknown]>=list?(value as unknown[]).map(item=>['-',item]):keys.map(key=>[numberedFirst(key,kernelNumbered(key,siblings)),(value as Record<string,unknown>)[key]]);
    if(!entries.length){rows.push(`${pad}${label} ${list?'[]':'{}'}`);return;}
    rows.push(`${pad}${label}`);
    for(const [inner,item] of entries)argumentRows(item,depth+1,rows,inner);
    return;
  }
  const text=typeof value==='string'?value:value===undefined?'':typeof value==='object'&&value!==null?'…':String(value);
  /* a very long name (a model can write one of hundreds of characters) gets its own row and its value goes on the row under it, one step
     in: collapsed, a row is folded at COLLAPSED_TEXT_LINES, and the value must never be the part folded away (as the PC card, judge v1856) */
  if(shownWidth(label)>ARGUMENT_LONG_NAME){rows.push(`${pad}${label}`,`${pad}  ${text}`);return;}
  rows.push(`${pad}${label} ${text}`);
}
function approvalArguments(pending:PendingTuiApproval):ApprovalArguments|undefined{
  const payload=pending.rawPayload??{};const args=payload.arguments??payload.argomenti;
  const cutValue=Number(payload.argumentsCut??payload.argomentiTagliati);const cut=Number.isSafeInteger(cutValue)&&cutValue>0?cutValue:0;
  if(args===undefined||args===null)return undefined;
  /* Round 5 (reviewer 1, RED 3): a top that is a list, a text or a number reaches the card (`argomentiPerLaCarta` keeps it) and the tool;
     the terminal showed no row. It is ONE row, its JSON, the same row the PC card shows (carta-dal-testo.js `righeDegliArgomenti`). */
  if(typeof args!=='object'||Array.isArray(args))return{rows:[JSON.stringify(args)??String(args)],cut};
  const keys=Object.keys(args as Record<string,unknown>);
  if(!keys.length)return undefined;
  const rows:string[]=[];const siblings=new Set(keys);
  for(const key of keys)argumentRows((args as Record<string,unknown>)[key],0,rows,numberedFirst(key,kernelNumbered(key,siblings)));
  return{rows,cut};
}
/* Row 126, road A (judge v1759 a: the person sees what they approve): the calls the kernel listed on a group card, each with its
   arguments (masked and cut by the kernel, `gruppoPerLaCarta`), numbered over every call; the calls not listed are said */
function approvalGroup(pending:PendingTuiApproval):ApprovalArguments|undefined{
  const group=(pending.rawPayload??{}).gruppo as {chiamate?:unknown;nonMostrate?:unknown}|undefined;const count=pending.action.sameCalls??0;
  if(count<2||!Array.isArray(group?.chiamate))return undefined;
  const rows:string[]=[];
  group.chiamate.forEach((call,index)=>{rows.push(t('approval.group.call',{n:index+1,count}));const args=(call as {argomenti?:unknown}|null)?.argomenti;
    if(args!==null&&typeof args==='object'&&!Array.isArray(args)){const siblings=new Set(Object.keys(args));for(const [key,value] of Object.entries(args))argumentRows(value,1,rows,numberedFirst(key,kernelNumbered(key,siblings)));}
    else if(args!==undefined)rows.push(`  ${JSON.stringify(args)}`);});
  const more=Number(group.nonMostrate);
  return{rows,cut:0,title:t('approval.group.title',{count}),...(Number.isSafeInteger(more)&&more>0?{note:tn('approval.group.more',more)}:{})};
}
/* Q-R3-4: a write or an edit carries the text before and the text proposed (talosHarness.mjs:8252-8256, 8449-8451). */
function approvalChange(pending:PendingTuiApproval):ApprovalChange|undefined{
  /* 0.6.15: the v2 action names them `proposedContent`/`contentBefore`; the kernel's names stay readable */
  const payload=pending.rawPayload??{};const proposed=payload.proposedContent??payload.contenutoProposto;
  if(typeof proposed!=='string'||(pending.action.tool!=='Write'&&pending.action.tool!=='Edit'))return undefined;
  const beforeText=payload.contentBefore??payload.contenutoPrima;const before=typeof beforeText==='string'?beforeText:null;
  const diff=lineDiff(before,proposed,{path:field(payload,'path','percorso')??'file'});
  const counts=before===null?t('approval.change.newFile',{lines:diff.added}):diff.added===0&&diff.removed===0?t('approval.change.none'):t('approval.change.counts',{added:diff.added,removed:diff.removed});
  const rows=[...diff.model.plain,...diff.model.files.flatMap(file=>file.rows)].map(row=>({kind:row.kind==='add'||row.kind==='remove'||row.kind==='context'?row.kind:'meta' as const,text:row.text}));
  return{counts,rows};
}
/*
 * Owner 09/10/2026 («Sì, con la carta»): the card of a change of OpenRouter's excluded providers, in words. The kernel's host
 * (fornitori-per-il-modello.mjs) sends `{fornitore, cambi:[{campo:'persona'|'di-serie', modello, prima, dopo}]}`: the person's
 * list for every model, and a model's default exclusion.
 */
/*
 * 0.6.15 T6 (owner «come nel desktop»): the card of a device tool says WHICH device, folder or file the person allows — the
 * kernel's card (session-registry.mjs `ospiteTelefoni`, the `azione` of each tool), read in its v2 English or the kernel's
 * Italian. A device's name comes from the phone: control and format characters never reach the screen, nor the « · » that
 * splits the full review into lines.
 */
const DEVICE_CARDS=new Set(['remote_phone_revoke','remote_phone_folder_allow','remote_phone_folder_revoke','remote_phone_folder_unblock','remote_control','remote_device_send_file']);
const cardText=(value:unknown,max=300)=>typeof value==='string'?value.replace(/[\p{Cc}\p{Cf}·]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,max):'';
const cardField=(row:Record<string,unknown>|null|undefined,english:string,italian:string)=>row?(row[english]??row[italian]):undefined;
function bytes(value:unknown):string{
  const n=Number(value);if(!Number.isFinite(n)||n<0)return '?';
  return n<1024?`${n} B`:n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024/1024).toFixed(1)} MB`;
}
export function deviceToolSummary(name:string,payload:Record<string,unknown>):string|null{
  if(!DEVICE_CARDS.has(name))return null;
  const device=(cardField(payload,'device','telefono')??null) as Record<string,unknown>|null;
  const deviceName=cardText(cardField(device,'name','nome'),64)||t('approval.device.unnamed');
  const id=cardText(cardField(device,'shortId','idCorto'),16)||'?';
  const folder=(cardField(payload,'folder','cartella')??null) as Record<string,unknown>|null;
  const path=cardText(cardField(folder,'path','percorso'),2000)||'?';
  const count=(english:string,italian:string)=>{const n=Number(cardField(payload,english,italian));return Number.isFinite(n)&&n>=0?Math.floor(n):0;};
  if(name==='remote_phone_revoke')return t('approval.device.revoke',{device:deviceName,id});
  if(name==='remote_phone_folder_allow')return t('approval.device.folderAllow',{device:deviceName,id,path});
  if(name==='remote_phone_folder_revoke')return t('approval.device.folderRevoke',{device:deviceName,id,path});
  if(name==='remote_phone_folder_unblock')return t('approval.device.folderUnblock',{device:deviceName,id,path});
  if(name==='remote_device_send_file'){
    const file=(cardField(payload,'file','file')??null) as Record<string,unknown>|null;
    return t('approval.device.sendFile',{file:cardText(cardField(file,'name','nome'),200)||'?',size:bytes(cardField(file,'size','dimensione')),device:deviceName,id,path:cardText(cardField(file,'path','percorso'),2000)||'?'});
  }
  const on=cardField(payload,'on','acceso')===true;
  const devices=count('devices','telefoni');
  if(!on)return t('approval.device.off',{online:count('online','inLinea'),devices});
  const relay=cardField(payload,'proposedRelay','ponteProposto')??cardField(payload,'relay','ponte');
  const relayWords=relay==='n0'?t('approval.device.relayN0'):relay==='own'||relay==='proprio'?t('approval.device.relayOwn'):t('approval.device.relayNone');
  return t('approval.device.on',{relay:relayWords,devices});
}
function providerChangeSummary(name:string,payload:Record<string,unknown>):string|null{
  if(!PROVIDER_CHANGES.has(name)||!Array.isArray(payload.cambi))return null;
  const slug=typeof payload.fornitore==='string'?payload.fornitore:'?';
  const changes=payload.cambi as Array<Record<string,unknown>>;
  const list=(value:unknown)=>Array.isArray(value)&&value.length?value.join(', '):t('approval.provider.none');
  const parts=changes.map(change=>change.campo==='persona'
    ?t('approval.provider.list',{before:list(change.prima),after:list(change.dopo)})
    :t('approval.provider.default',{model:String(change.modello??'?'),before:t(change.prima===true?'approval.provider.yes':'approval.provider.no'),after:t(change.dopo===true?'approval.provider.yes':'approval.provider.no')}));
  const everyModel=changes.length===1&&changes[0]!.campo==='persona';
  const head=t(name==='provider_exclude'?(everyModel?'approval.provider.excludeEvery':'approval.provider.exclude'):(everyModel?'approval.provider.allowEvery':'approval.provider.allow'),{slug});
  return[head,...parts].join(' · ');
}
export function approvalDialogModel(pending:PendingTuiApproval,input:{expanded:boolean;selected?:number;unsandboxed?:boolean}):ApprovalDialogModel{
  const action=pending.action;const name=pending.rawPayload?.tipo??pending.rawPayload?.tool;const label=approvalLabel(action,name);
  // A kernel tool's operation IS its raw name, which stays in the full review (Q-R2-3); another tool's is humanised.
  const operation=typeof name==='string'&&action.operation===name?(isKnownTool(name)?undefined:toolDisplay(name).label):action.operation;
  /* riga 91, cure 4 (judge v2328): a plugin or Tool Forge card names its plugin and tool, as the MCP card names server:tool */
  const outside=action.outsideTool?t(action.plugin?'approval.outside.pluginTool':'approval.outside.tool',{plugin:action.plugin??'',tool:action.outsideTool}):null;
  const target=action.command??action.resource??[action.serverId,operation].filter(Boolean).join(':')+(outside?` · ${outside}`:'');
  /* Owner 09/10/2026 («Avvisa, poi chiede o ferma»): the kernel asks whether to go on after the 5th identical call with the same result. */
  const loop=name==='giri-in-tondo'?t('approval.loop',{tool:toolDisplay(String(pending.rawPayload?.strumento??'tool')).label,count:Number(pending.rawPayload?.volte)||5}):null;
  /* 0.6.1 (F1): the model's `chatgpt_account disconnect` (kernel payload `{fornitore:'chatgpt', email}`): the card says what it does, and to whom. */
  /* the address goes into a sentence that is split into lines at « · »: no control character and no separator of its own */
  const email=typeof pending.rawPayload?.email==='string'?pending.rawPayload.email.replace(/[\p{Cc}\p{Cf}·]/gu,'').trim().slice(0,120):'';
  const signOut=name==='chatgpt_account'?t(email?'approval.chatgpt.signOutOf':'approval.chatgpt.signOut',{email}):null;
  const providerChange=loop??signOut??(typeof name==='string'?providerChangeSummary(name,pending.rawPayload??{})??deviceToolSummary(name,pending.rawPayload??{}):null);
  const summary=providerChange??[label,target].filter(Boolean).join(' · ');
  /* one line per part only in the full review: the collapsed card shows its text in one inert piece, where a line break reads «\u000a» (review of 0.6.1) */
  const fullPayload=providerChange?(input.expanded?providerChange.split(' · ').join('\n'):providerChange):input.expanded?reviewText(pending,label):summary;
  const choices=approvalChoicesFor(action);const network=action.sensitive==='network'?action.network:undefined;
  const selected=Math.max(0,Math.min(choices.length-1,Math.floor(input.selected??approvalDefaultSelected(choices))));
  const questionId=`approval.question.${action.tool}` as MessageId;
  const question=t(questionId in QUESTION_IDS?questionId:'approval.question');
  /* Q-R3-13 (R0 decision 4): a command approval on a host with no verified sandbox says so in its title. */
  const title=(network?t('approval.network.title',{label}):action.networkRequested===true?t('approval.internet.title',{label}):t('tool.approval.title',{label}))+(input.unsandboxed===true&&action.tool==='Bash'?` ${t('approval.unsandboxed')}`:'');
  /* P13 (owner decision 8): an approval a sub-agent asks for says so, as Claude Code's does ("from a subagent"). */
  const origin=pending.origin?.kind==='agent'?` ${pending.origin.task?t('approval.origin.agent',{task:pending.origin.task}):t('approval.origin.agentUnnamed')}`:'';
  const change=approvalChange(pending);const args=approvalGroup(pending)??approvalArguments(pending);
  const ruleLine=pending.rule===PATH_BOUNDARY_RULE?'decided by the path boundary':pending.rule?`rule ${pending.rule}`:undefined;
  const explanation=pending.explanation;
  let segments:ApprovalSegmentRow[]=[];let segmentsWithheld:string|undefined;
  if(explanation){
    const rows=segmentRows(explanation);
    if(rows.length&&!accountAgrees(pending,explanation))segmentsWithheld='explanation unavailable: the account disagreed with the decision (possible race)';
    else segments=rows;
  }
  return{
    title:title+origin,summary,fullPayload,expanded:input.expanded,reason:network?t(network.scope==='session'?'approval.network.folder':'approval.network.reason',{host:network.host||t('approval.network.unknownHost')}):shownReason(pending.reason),...(pending.rule?{rule:pending.rule}:{}),...(pending.runtimeHint?{runtimeHint:pending.runtimeHint}:{}),
    ...(ruleLine?{ruleLine}:{}),segments,...(segmentsWithheld?{segmentsWithheld}:{}),...(pending.explanationError?{explanationError:pending.explanationError}:{}),
    /* decision 373 and A5f: a card without [3] has no line that says what [3] would write */
    ...(input.expanded&&pending.alwaysSimulation&&choices.some(row=>row.action==='approval-always')?{alwaysPreview:alwaysPreview(pending,pending.alwaysSimulation)}:{}),
    question,selected,...(change?{change}:{}),...(args?{arguments:args}:{}),...(choices!==APPROVAL_CHOICES?{choices}:{}),
  };
}
const QUESTION_IDS:Record<string,true>={'approval.question.Bash':true,'approval.question.Write':true,'approval.question.Edit':true,'approval.question.Read':true,'approval.question.WebFetch':true,'approval.question.Mcp':true,'approval.question.Hook':true,'approval.question.Plugin':true,'approval.question.TalosService':true};

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
function fixedLine(text:string,tone:'title'|'plain'|'dim'|'selected',indent:number):ApprovalDialogLine{return{kind:'text',text:inertText(text),tone,indent,modelText:false};}
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
  // R3 E11: the full review is one field per line (reviewText), and a field's own line breaks stay data: each field is made
  // inert on its own, so a value can never open a line of its own. Collapsed, the payload IS the command.
  if(model.expanded)for(const reviewLine of model.fullPayload.split('\n'))lines.push(...modelLines(reviewLine,'plain',inner,limit));
  else lines.push(...modelLines(model.fullPayload,'plain',inner,limit));
  if(model.arguments)lines.push(...argumentLines(model.arguments,inner,model.expanded,limit));
  if(model.change)lines.push(...changeLines(model.change,inner,model.expanded));
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
  lines.push(...controlLines(model));
  return lines;
}
/* Q-R3-4: the diff of a write or an edit, model text (indented, inert). Collapsed it is bounded; `v` shows all of it. */
const CHANGE_SUMMARY_ROWS=12;
function changeLines(change:ApprovalChange,inner:number,expanded:boolean):ApprovalDialogLine[]{
  const out:ApprovalDialogLine[]=[{kind:'text',text:inertText(change.counts),tone:'dim',indent:TEXT_INDENT,modelText:true}];
  const rows=expanded?change.rows:change.rows.slice(0,CHANGE_SUMMARY_ROWS);
  for(const row of rows){
    const prefix=row.kind==='add'?'+ ':row.kind==='remove'?'- ':row.kind==='context'?'  ':'';
    const tone=row.kind==='add'?'add':row.kind==='remove'?'remove':'dim';
    for(const piece of wrapToWidth(inertText(prefix+row.text),Math.max(1,inner-TEXT_INDENT)))out.push({kind:'text',text:piece,tone,indent:TEXT_INDENT,modelText:true});
  }
  if(!expanded&&change.rows.length>CHANGE_SUMMARY_ROWS)out.push({kind:'text',text:t('approval.change.more',{count:change.rows.length-CHANGE_SUMMARY_ROWS}),tone:'dim',indent:TEXT_INDENT,modelText:true});
  return out;
}
/* Twin repair of desktop 0.2.2: the arguments under a fixed heading, each row model text (inert, indented, collapsed at most
   COLLAPSED_TEXT_LINES lines); collapsed, the first ARGUMENT_SUMMARY_ROWS rows and how many more `v` shows; then the line that says the
   kernel cut values on this card. */
const ARGUMENT_SUMMARY_ROWS=12;
function argumentLines(args:ApprovalArguments,inner:number,expanded:boolean,limit:number|null):ApprovalDialogLine[]{
  const out:ApprovalDialogLine[]=[fixedLine(args.title??t('approval.arguments.title'),'dim',TEXT_INDENT)];
  const rows=expanded?args.rows:args.rows.slice(0,ARGUMENT_SUMMARY_ROWS);
  for(const row of rows)out.push(...modelLines(row,'plain',inner,limit));
  if(!expanded&&args.rows.length>ARGUMENT_SUMMARY_ROWS)out.push(fixedLine(t('approval.arguments.more',{count:args.rows.length-ARGUMENT_SUMMARY_ROWS}),'dim',TEXT_INDENT));
  if(args.cut>0)out.push(fixedLine(t('approval.arguments.cut',{count:args.cut}),'dim',TEXT_INDENT));
  if(args.note)out.push(fixedLine(args.note,'dim',TEXT_INDENT));
  return out;
}
/* The question, the four choices (the highlighted one marked) and the keys. Fixed text: every row starts at the left edge. */
function controlLines(model:ApprovalDialogModel):ApprovalDialogLine[]{
  return[
    fixedLine(model.question,'plain',0),
    ...(model.choices??APPROVAL_CHOICES).map((_,index)=>{const line=fixedLine(choiceText(model.choices??APPROVAL_CHOICES,index,model.selected),index===model.selected?'selected':'plain',0);
      return line.kind==='text'?{...line,targets:[{start:0,width:displayWidth(line.text),action:`aopt:${index}`}]}:line;}),
    fixedLine(t(model.expanded?(model.choices&&!offersAlways(model.choices)?'approval.hint.reviewNoAlways':'approval.hint.review'):'approval.hint.summary'),'dim',0),
  ];
}
/* When the height is short, the same choices on as few rows as the width allows; all of them, and the deny path, stay.
   Items are packed whole (a choice is never split across two rows unless it is wider than a row); the question goes
   first when there is room for it. */
function compactControlLines(model:ApprovalDialogModel,inner:number,{question}:{question:boolean}):ApprovalDialogLine[]{
  const choices=model.choices??APPROVAL_CHOICES;
  const items:Array<{text:string;action?:string}>=[...(question?[{text:model.question}]:[]),...choices.map((_,index)=>({text:choiceText(choices,index,model.selected).trimStart(),action:`aopt:${index}`})),{text:model.expanded&&offersAlways(choices)?`[5] ${t('approval.choice.denyAlways')}`:t('approval.hint.compact')}].map(item=>({...item,text:inertText(item.text)}));
  /* stage 6c: a choice packed whole on a row keeps its cells as a target; one split across rows is not a target */
  const width=Math.max(1,inner),rows:Array<{text:string;targets:ApprovalLineTarget[]}>=[];let row='';let targets:ApprovalLineTarget[]=[];
  for(const item of items){
    const joined=row?`${row}  ${item.text}`:item.text;
    const at=row?displayWidth(row)+2:0;
    if(conservativeCells(joined)<=width){row=joined;if(item.action)targets.push({start:at,width:displayWidth(item.text),action:item.action});continue;}
    if(row)rows.push({text:row,targets});
    targets=[];
    if(conservativeCells(item.text)<=width){row=item.text;if(item.action)targets.push({start:0,width:displayWidth(item.text),action:item.action});continue;}
    const pieces=wrapToWidth(item.text,width);rows.push(...pieces.slice(0,-1).map(text=>({text,targets:[]})));row=pieces.at(-1)??'';
  }
  if(row)rows.push({text:row,targets});
  return rows.map(({text,targets:on})=>({kind:'text',text,tone:'plain',indent:0,modelText:false,...(on.length?{targets:on}:{})}));
}
/* the question, the choices and the keys; A5j: an outside tool's card has five choices, so its control rows are counted from its list
   (a shorter list keeps the four's count, as before) */
const controlRows=(model:ApprovalDialogModel)=>Math.max(APPROVAL_CHOICES.length,(model.choices??APPROVAL_CHOICES).length)+2;

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
  const controls=compactControlLines(model,inner,{question:false});
  const body=all.slice(1,all.length-controlRows(model));
  const reserved=header.length+controls.length+(model.expanded?1:0);
  /* R3 E11: the header already carries the reason and the operation, so a short view may show no body line at all. */
  const bodyBudget=Math.max(0,budget-reserved);
  let used=0,maxOffset=body.length;
  for(let index=body.length-1;index>=0;index-=1){
    const height=approvalLineHeight(body[index]!);if(used+height>bodyBudget)break;used+=height;maxOffset=index;
  }
  const offset=Math.max(0,Math.min(maxOffset,Math.floor(Number.isFinite(scrollOffset)?scrollOffset:0)));
  const visible:ApprovalDialogLine[]=[];used=0;
  for(let index=offset;index<body.length;index+=1){
    const line=body[index]!,height=approvalLineHeight(line);
    if(used+height>bodyBudget){
      if(visible.length===0&&bodyBudget>0)visible.push(clippedApprovalLine(line,bodyBudget));
      break;
    }
    visible.push(line);used+=height;
  }
  const scroll=model.expanded?fixedLine(`Review ${offset+1}/${maxOffset+1} · PgUp/PgDn scroll`,'dim',0):null;
  return{lines:[...header,...(scroll?[scroll]:[]),...visible,...controls],offset,maxOffset};
}

/*
 * R1 lane O — THE DIALOG INSIDE lane L's `maxRows` (owner decision Q-R1-3, gate E3, review D-02).
 *
 * `maxRows` counts every row the dialog prints, its border included (the legacy `rows` above counts content only
 * and never goes below 6, so at 60 columns and `rows` 8 the dialog measured 11 rows). Every row is wrapped here,
 * the dialog's own fixed text too, so the height is exact. What must stay, in this order: the choices (all of
 * them — a person cannot answer a question whose keys scrolled away), the title, the operation, then one row that
 * says how much of the preview is not shown ("… N more lines"), then the reason, then the preview itself.
 */
/* `compact`: the choices were packed on fewer rows (R3 E11) to leave room; nothing of them is dropped. */
export type ApprovalDialogFit={lines:ApprovalDialogLine[];rows:number;offset:number;maxOffset:number;below:number;border:boolean;compact:boolean};
function wrappedFixed(text:string,tone:Extract<ApprovalDialogLine,{kind:'text'}>['tone'],width:number,indent=0):ApprovalDialogLine[]{
  return wrapToWidth(inertText(text),Math.max(1,width-indent)).map(piece=>({kind:'text',text:piece,tone,indent,modelText:false}));
}
// One row, cut with `…` when longer: a header row only names the operation; the preview below is where it is read.
function oneRow(text:string,tone:'plain'|'dim',width:number):ApprovalDialogLine{
  const limit=Math.max(1,width-TEXT_INDENT),pieces=wrapToWidth(inertText(text),limit);
  let row=pieces[0]??'';
  if(pieces.length>1){const graphemes=splitGraphemes(row);while(graphemes.length&&conservativeCells(graphemes.join('')+'…')>limit)graphemes.pop();row=graphemes.join('')+'…';}
  return{kind:'text',text:row,tone,indent:TEXT_INDENT,modelText:true};
}
export function approvalDialogFit(model:ApprovalDialogModel,{columns=80,maxRows,scrollOffset=0}:{columns?:number|undefined;maxRows?:number|undefined;scrollOffset?:number|undefined}={}):ApprovalDialogFit{
  const border=maxRows===undefined||maxRows>=4;
  const inner=Math.max(1,columns-(border?BORDER_WIDTH:0));
  const budget=maxRows===undefined?Number.POSITIVE_INFINITY:Math.max(0,Math.floor(maxRows)-(border?2:0));
  const all=approvalDialogLines(model,{columns:inner+BORDER_WIDTH});
  /* stage 6c (g-q22): a choice row keeps its target through the wrap, on every row it wraps to */
  const exact=(line:ApprovalDialogLine)=>{
    if(line.kind!=='text'||line.modelText)return[line];
    const pieces=wrappedFixed(line.text,line.tone,inner,line.indent),action=line.targets?.[0]?.action;
    return action?pieces.map(piece=>piece.kind==='text'?{...piece,targets:[{start:0,width:displayWidth(piece.text),action}]}:piece):pieces;
  };
  const title=exact(all[0]!).slice(0,1);
  const body=all.slice(1,all.length-controlRows(model)).flatMap(exact);
  /* R3 E11: the question and the four choices on their own rows while at least the title and the operation fit above
     them; below that, the same choices on as few rows as the width allows. Every choice and the deny path stay. */
  const fullControls=all.slice(all.length-controlRows(model)).flatMap(exact);
  const withQuestion=compactControlLines(model,inner,{question:true});
  const controls=budget-fullControls.length>=2?fullControls:budget-withQuestion.length>=1?withQuestion:compactControlLines(model,inner,{question:false});
  const heights=body.map(approvalLineHeight),bodyRows=heights.reduce((sum,value)=>sum+value,0);
  const total=title.length+bodyRows+controls.length;
  const compact=controls!==fullControls;
  if(total<=budget)return{lines:[...title,...body,...controls],rows:total,offset:0,maxOffset:0,below:0,border,compact};
  let left=budget;
  const keep=(lines:ApprovalDialogLine[])=>{const taken=lines.slice(0,Math.max(0,left));left-=taken.length;return taken;};
  const shownControls=keep(controls),shownTitle=keep(title);
  const decisive=model.segments.find(row=>row.decisive);
  const operation=keep([oneRow(decisive?`${decisive.effect}: ${decisive.command}`:model.summary,'plain',inner)]);
  let marker=left>=1?1:0;left-=marker;
  const reason=left>=3?keep([oneRow(model.reason,'plain',inner)]):[];
  const scroll=model.expanded&&left>=3?1:0;left-=scroll;
  const view=sliceByHeights(heights,{budget:left+marker,offset:scrollOffset});
  // The whole preview fits once the marker row is given back to it: nothing is cut, nothing is announced.
  if(view.above===0&&view.below===0&&view.clip===null){left+=marker;marker=0;}
  const visible:ApprovalDialogLine[]=[];
  for(let index=view.start;index<view.end&&left>0;index++){
    const line=body[index]!,height=approvalLineHeight(line);
    visible.push(height<=left?line:clippedApprovalLine(line,left));left-=Math.min(height,left);
  }
  const below=heights.slice(view.start+visible.length).reduce((sum,value)=>sum+value,0)+(visible.length?approvalLineHeight(body[view.start+visible.length-1]!)-approvalLineHeight(visible.at(-1)!):0);
  const hint=model.expanded?'PgDn scrolls':'press v to review in full';
  const more=marker&&below>0?[fixedLine(`… ${below} more line${below===1?'':'s'} · ${hint}`,'dim',0)]:[];
  const review=scroll?[fixedLine(`Review ${view.start+1}/${view.maxOffset+1} · PgUp/PgDn scroll`,'dim',0)]:[];
  const lines=[...shownTitle,...reason,...operation,...review,...visible,...more,...shownControls].map(line=>line.kind==='text'&&!line.modelText?{...line,text:wrapToWidth(line.text,Math.max(1,inner-line.indent))[0]??''}:line);
  return{lines,rows:lines.reduce((sum,line)=>sum+approvalLineHeight(line),0),offset:view.start,maxOffset:view.maxOffset,below:marker?below:0,border,compact};
}

/* D1 of MAPPA-RIDISEGNO (the mockup's `carte.js`, `│ ╭─ …`): the card in the composer's place, as rows. The fit stays the one above: every
   choice, the deny path and the review keep their rules. The left rule stays too (D3): model text can never draw a row that starts with it. */
const CARD_ROLES:Record<Extract<ApprovalDialogLine,{kind:'text'}>['tone'],string[]>={title:['warn','b'],plain:[],dim:['dim'],selected:['warn','b'],add:['add'],remove:['del']};
export function approvalCardRows(model:ApprovalDialogModel,{columns,maxRows,scrollOffset=0}:{columns:number;maxRows:number;scrollOffset?:number}):{rows:StyledSegment[][];fit:ApprovalDialogFit}{
  const fit=approvalDialogFit(model,{columns:Math.max(4,columns-2),maxRows:Math.max(4,maxRows+1),scrollOffset});
  const edge=(lead:string):StyledSegment=>({text:`│${lead}`,roles:['warn']});
  const pad=(text:string,width:number)=>text+' '.repeat(Math.max(0,width-displayWidth(text)));
  const rows:StyledSegment[][]=[];
  fit.lines.forEach((line,index)=>{
    if(line.kind==='text'){
      const body=targetRow(line).filter(segment=>segment.text).map(segment=>({...segment,roles:CARD_ROLES[line.tone]}));
      rows.push(fitRow([edge(index===0?' ╭─ ':'   '),...body],columns));
      return;
    }
    const height=approvalLineHeight(line),tone=line.tone==='dim'?['dim']:[];
    for(let at=0;at<height;at+=1)rows.push(fitRow([edge('   '),{text:pad(at===0?line.gutter:'',line.gutterWidth),roles:tone},{text:pad(line.commandLines[at]??'',line.commandColumn),roles:tone},{text:line.deciderLines[at]??'',roles:tone}],columns));
  });
  rows.push([{text:`╰${'─'.repeat(Math.max(0,columns-2))}╯`,roles:['warn']}]);
  return{rows,fit};
}

// The dialog as Ink elements. Model text arrives already wrapped: one Text per terminal line, cut
// rather than wrapped by Ink, so its height is exactly what the viewport decided. With `maxRows` every
// row is pre-wrapped (approvalDialogFit), so every text row is cut, never wrapped.
/* Stage 6c: a row with targets as the hit map reads it — its indent, then its text cut where the targets start and end. */
function targetRow(line:Extract<ApprovalDialogLine,{kind:'text'}>):Array<{text:string;roles:string[];action?:string}>{
  const out:Array<{text:string;roles:string[];action?:string}>=[{text:' '.repeat(line.indent),roles:[]}];let at=0,run='',runAction:string|undefined;
  const flush=()=>{if(run)out.push(runAction?{text:run,roles:[],action:runAction}:{text:run,roles:[]});run='';};
  for(const grapheme of splitGraphemes(line.text)){
    const action=line.targets?.find(target=>at>=target.start&&at<target.start+target.width)?.action;
    if(action!==runAction){flush();runAction=action;}
    run+=grapheme;at+=displayWidth(grapheme);
  }
  flush();return out;
}
export function renderApprovalDialog(h:(...args:any[])=>unknown,Ink:{Box:unknown;Text:unknown},model:ApprovalDialogModel,{accentColor,columns=80,rows,maxRows,scrollOffset=0,hit}:{hit?:HitRegister|undefined;accentColor?:string|undefined;columns?:number|undefined;rows?:number|undefined;maxRows?:number|undefined;scrollOffset?:number|undefined}={}):unknown{
  const fitted=maxRows===undefined?null:approvalDialogFit(model,{columns,maxRows,scrollOffset});
  const lines=fitted?fitted.lines:rows===undefined?approvalDialogLines(model,{columns}):approvalDialogViewport(model,{columns,rows,scrollOffset}).lines;
  return h(Ink.Box,fitted&&!fitted.border?{flexDirection:'column',flexShrink:0}:{borderStyle:'round',flexDirection:'column',...(fitted?{flexShrink:0}:{})},...lines.map((line,index)=>{
    const style=line.tone==='title'?{bold:true,color:accentColor}:line.tone==='dim'?{dimColor:true}:line.tone==='selected'?{bold:true,color:accentColor}:line.tone==='add'?{color:'green'}:line.tone==='remove'?{color:'red'}:{};
    const piece=(text:string,key:number)=>h(Ink.Text,{...style,key,wrap:'truncate-end'},text);
    /* stage 6c: a row with choices says where it was laid out, so a click answers the choice under it */
    const target=line.kind==='text'&&hit&&line.targets?.length?{ref:(node:unknown)=>hit(`approval-row:${index}`,node,[targetRow(line)])}:{};
    if(line.kind==='text')return h(Ink.Box,{key:index,paddingLeft:line.indent,...target},line.modelText||fitted?piece(line.text,0):h(Ink.Text,style,line.text));
    return h(Ink.Box,{key:index,flexDirection:'row'},
      h(Ink.Box,{width:line.gutterWidth,flexShrink:0},h(Ink.Text,style,line.gutter)),
      // The gap is padding, not width: a hard-wrapped command must never touch the rule beside it.
      h(Ink.Box,{width:line.commandColumn,paddingRight:COLUMN_GAP,flexShrink:0,flexDirection:'column'},...line.commandLines.map(piece)),
      h(Ink.Box,{width:line.deciderColumn,flexShrink:0,flexDirection:'column'},...line.deciderLines.map(piece)));
  }));
}

const APPROVAL_ACTIONS:Record<string,UserApprovalChoice>={
  'approval-once':'allow-once','approval-session':'allow-session','approval-always':'allow-always',
  'approval-deny-once':'deny-once','approval-deny-always':'deny-always','approval-cancel':'deny-once','interrupt':'deny-once','approval-deny-tool':'deny-tool',
  'approval-all-calls':'allow-calls',
};
export function approvalChoiceForAction(action:string):UserApprovalChoice|undefined{return APPROVAL_ACTIONS[action];}
/** Stage 6c: a click on a choice (`aopt:i`, the i-th choice shown) answers it, as its digit does; null for anything else. */
export function approvalClickChoice(action:string,choices:ReadonlyArray<ApprovalChoiceRow>):UserApprovalChoice|null{
  const match=/^aopt:(\d+)$/u.exec(action);const row=match?choices[Number(match[1])]:undefined;
  return row?approvalChoiceForAction(row.action)??null:null;
}
