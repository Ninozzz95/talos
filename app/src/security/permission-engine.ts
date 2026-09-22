import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {compileRuleSet,evaluateRules} from './evaluate.ts';
import {ruleToPersist,unreadableRulesError} from './persist.ts';
import {isReadOnlyShellCommand,parseRule,tokenizeCommand} from './rule-parser.ts';
import type {CompiledRule,PermissionAction,PermissionMode,RuleSetInput} from './types.ts';
export type AutoClassifier=(input:{action:PermissionAction;projectRoot:string})=>Promise<'allow'|'deny'|'ask'>;
export type ApprovalDecision={kind:'allow';source:string}|{kind:'deny';code:string;message:string}|{kind:'ask';requestId:string;action:PermissionAction;reason:string;rule?:string};
export interface PermissionEngine{decide(action:PermissionAction,context:{interactive:boolean;mode:PermissionMode}):Promise<ApprovalDecision>;resolve(requestId:string,decision:'allow-once'|'allow-session'|'allow-always'|'deny-once'|'deny-always'):Promise<void>;}

const FS_EDIT_OPTIONS:Record<string,Set<string>>={
  mkdir:new Set(['-p','-v']),touch:new Set(['-a','-m','-c']),rm:new Set(['-r','-R','-f','-rf','-fr','-d']),rmdir:new Set(['-p']),cp:new Set(['-r','-R','-f','-n','-p']),mv:new Set(['-f','-n']),
};
function insideProject(root:string,candidate:string){const rel=path.relative(path.resolve(root),path.resolve(candidate));return rel===''||(!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel));}
export function acceptEditsFilesystemCommand(command:string,projectRoot:string):boolean{
  const tokens=tokenizeCommand(command);if(tokens.length<2)return false;const head=tokens[0]!;const allowed=FS_EDIT_OPTIONS[head];if(!allowed)return false;
  const operands:string[]=[];let options=true;
  for(const token of tokens.slice(1)){if(options&&token==='--'){options=false;continue;}if(options&&token.startsWith('-')){if(!allowed.has(token))return false;continue;}options=false;operands.push(token);}
  if((head==='cp'||head==='mv')?operands.length<2:operands.length<1)return false;
  for(const operand of operands){const abs=path.isAbsolute(operand)?path.resolve(operand):path.resolve(projectRoot,operand);if(!insideProject(projectRoot,abs)||abs===path.resolve(projectRoot))return false;const rel=path.relative(projectRoot,abs).split(path.sep);if(rel[0]==='.git'||rel[0]==='.talos-cli')return false;}
  return true;
}

const PROTECTED_PROJECT_ROOTS=new Set(['.git','.talos-cli','.github','.vscode','.idea','.husky']);
function protectedProjectMutation(action:PermissionAction,root:string):boolean{
  if(!['Write','Edit'].includes(action.tool)||!action.resource)return false;
  const abs=path.isAbsolute(action.resource)?path.resolve(action.resource):path.resolve(root,action.resource);if(!insideProject(root,abs))return false;
  const first=path.relative(path.resolve(root),abs).split(path.sep)[0]??'';return PROTECTED_PROJECT_ROOTS.has(first);
}
function outsideWrite(action:PermissionAction,root:string){if(!['Write','Edit'].includes(action.tool)||!action.resource)return false;const rel=path.relative(path.resolve(root),path.resolve(root,action.resource));return rel==='..'||rel.startsWith(`..${path.sep}`)||path.isAbsolute(rel);}
export function createPermissionEngine({projectRoot,rules,mode,classifier,persistRule}:{projectRoot:string;rules:RuleSetInput;mode?:PermissionMode;classifier?:AutoClassifier;persistRule?:(effect:'allow'|'deny',action:PermissionAction)=>Promise<void>}):PermissionEngine{
  if(mode==='auto'&&!classifier)throw new Error('PERMISSION_AUTO_UNAVAILABLE');
  // B1 slice 21. ⛔ Fail closed and by name: one unreadable entry, in any list, and there is no engine.
  const {rules:compiled,invalid}=compileRuleSet(rules);if(invalid.length)throw unreadableRulesError(projectRoot,invalid);
  const pending=new Map<string,PermissionAction>();const grants:PermissionAction[]=[];
  return{async decide(action,context){if(outsideWrite(action,projectRoot))return{kind:'deny',code:'PATH_NOT_ALLOWED',message:'Operation targets a path outside the project'};let base=evaluateRules(compiled,action,{projectRoot});if(base.effect==='deny')return{kind:'deny',code:'PERMISSION_DENIED',message:base.reason};const m=context.mode;
    if(m==='plan'&&(['Write','Edit','Hook','Plugin'].includes(action.tool)||(action.tool==='Bash'&&!isReadOnlyShellCommand(action.command??''))))return{kind:'deny',code:'PLAN_MODE_READ_ONLY',message:'Plan mode permits only read-only operations'};
    if(grants.some(g=>JSON.stringify(g)===JSON.stringify(action)))return{kind:'allow',source:'session'};
    if(base.effect==='allow')return{kind:'allow',source:base.rule??'rule'};
    if(m==='acceptEdits'&&base.effect==='ask'&&!base.rule&&!protectedProjectMutation(action,projectRoot)&&(['Write','Edit'].includes(action.tool)||(action.tool==='Bash'&&acceptEditsFilesystemCommand(action.command??'',projectRoot))))return{kind:'allow',source:'acceptEdits'};
    if(m==='bypassPermissions'&&base.effect==='ask'&&!base.rule)return{kind:'allow',source:'bypassPermissions'};
    if(m==='auto'&&base.effect==='ask'&&!base.rule&&!protectedProjectMutation(action,projectRoot)){if(!classifier)throw new Error('PERMISSION_AUTO_UNAVAILABLE');const c=await classifier({action,projectRoot});if(c==='allow')return{kind:'allow',source:'auto'};if(c==='deny')return{kind:'deny',code:'PERMISSION_AUTO_DENIED',message:'Automatic classifier denied operation'};base={effect:'ask',reason:'automatic classifier requested confirmation'};}
    if(m==='dontAsk'||!context.interactive)return{kind:'deny',code:'PERMISSION_REQUIRED',message:'Operation requires approval in non-interactive mode'};
    const requestId=randomUUID();pending.set(requestId,action);return{kind:'ask',requestId,action,reason:base.reason,...(base.rule?{rule:base.rule}:{})};
  },async resolve(requestId,decision){const action=pending.get(requestId);if(!action)throw new Error('APPROVAL_NOT_PENDING');pending.delete(requestId);if(decision==='allow-session')grants.push(action);
    if((decision==='allow-always'||decision==='deny-always')&&persistRule){
      const effect=decision==='allow-always'?'allow':'deny';
      // B1 slice 21. A rule the writing path refuses — a compound command, a line break, a rule that would
      // not match its own request, an allow that narrows nothing — is known before the key is pressed (the
      // full review previews the same refusal). Nothing is written, and the approval is still answered:
      // measured at 805c89a0, the refusal threw out of resolve and the runtime's request was never answered.
      // "Allow always" then answers for this session only, for the identical request, which is what Hermes
      // does when "always" cannot be honoured; "deny always" denies this request and asks again next time.
      let rule:CompiledRule;
      try{rule=parseRule(ruleToPersist(effect,action,projectRoot),effect);}catch{if(effect==='allow')grants.push(action);return;}
      await persistRule(effect,action);
      // ⛔ The rule is obeyed from now on, not from the next start: before this, the engine compiled its rules
      // once and "allow always" asked again for the identical command in the same session.
      compiled[effect].push(rule);
      // ⛔ And the session's rule set shows it. The approval dialog explains each request from the rule set
      // this engine was built from (`rules`, the same object); without the rule there, measured: after
      // "allow always" on `npm test`, `npm test && npm publish` asked for segment 2 while the account
      // said segment 1, and the dialog withheld every row as a "possible race". A frozen set is left alone.
      try{const list=rules[effect];if(Array.isArray(list)&&!list.includes(rule.raw))list.push(rule.raw);}catch{}
    }
  }};
}
