/*
 * Stage 7.21 (mockup permissions «Rules»; owner 03/10): the permission rules as /permissions lists and changes them. Each rule
 * says where it takes effect from (the person's settings, the project's shared file, the person's file for this project); a new
 * rule goes where the person chose, a change or a deletion goes to every file that lists the rule. A rule is checked before
 * anything is written: one that cannot be read is refused by name, and no file changes (the engine fails closed on it).
 */
import {loadEffectiveConfig,readConfigScope,writeConfigScope} from '../config/load.ts';
import type {ConfigEntryOrigin,ConfigOrigin} from '../config/types.ts';
import type {CliPaths} from '../paths.ts';
import {parseRule} from './rule-parser.ts';
import type {PermissionEffect,RuleSetInput} from './types.ts';

export type RuleScope='user'|'project'|'project-user';
export type RuleRow={rule:string;effect:PermissionEffect;origin:ConfigOrigin;scopes:readonly ConfigOrigin[]};
const EFFECTS=['allow','ask','deny'] as const;
const WRITABLE=new Set<ConfigOrigin>(['user','project','project-user']);
type Where={paths:CliPaths;projectRoot:string};

function fail(code:string):never{throw Object.assign(new Error(code),{code});}
/** The rule, trimmed, or a refusal by name: the same parser the engine compiles with. */
export function checkedRule(raw:string,effect:PermissionEffect):string{
  const rule=raw.trim();if(!rule)fail('PERMISSION_RULE_EMPTY');
  try{parseRule(rule,effect);}catch{fail('PERMISSION_RULE_UNREADABLE');}
  return rule;
}
/** The rules in force, each with where it takes effect from, and the rule set the engine takes. */
export async function readRuleRows({paths,projectRoot}:Where):Promise<{rows:RuleRow[];rules:RuleSetInput}>{
  const effective=await loadEffectiveConfig({paths,projectRoot});
  const rules=effective.value.permissions??{allow:[],ask:[],deny:[]};const rows:RuleRow[]=[];
  for(const effect of EFFECTS){
    const origin=effective.origins.get(`permissions.${effect}`);const list=Array.isArray(rules[effect])?rules[effect]:[];
    list.forEach((value,i)=>{
      const entry=Array.isArray(origin)?(origin as ConfigEntryOrigin[]).find(row=>row.value===value)??(origin as ConfigEntryOrigin[])[i]:undefined;
      const from:ConfigOrigin=entry?.origin??(typeof origin==='string'?origin:'default');
      rows.push({rule:String(value),effect,origin:from,scopes:entry?.scopes??[from]});
    });
  }
  return{rows,rules:{allow:[...(rules.allow??[])],ask:[...(rules.ask??[])],deny:[...(rules.deny??[])]}};
}
async function lists(where:Where,scope:RuleScope){
  const current=await readConfigScope({...where,scope});const permissions=(current.permissions??{}) as Partial<Record<PermissionEffect,unknown>>;
  const out={} as Record<PermissionEffect,string[]>;
  for(const effect of EFFECTS){const list=permissions[effect]??[];if(!Array.isArray(list))fail('RULE_STORE_INVALID');out[effect]=list.map(String);}
  return out;
}
async function save(where:Where,scope:RuleScope,next:Record<PermissionEffect,string[]>,touched:readonly PermissionEffect[]){
  await writeConfigScope({...where,scope,patch:{permissions:Object.fromEntries(touched.map(effect=>[effect,next[effect]]))} as never});
}
/** A new rule, in the file the person chose. */
export async function addRule(where:Where,{scope,effect,rule}:{scope:RuleScope;effect:PermissionEffect;rule:string}){
  const checked=checkedRule(rule,effect);const current=await lists(where,scope);
  if(!current[effect].includes(checked))current[effect].push(checked);
  await save(where,scope,current,[effect]);
}
/** A rule changed (its words, or allow/ask/deny) or removed, in every file that lists it; a rule only the defaults or the
 *  command line give cannot be changed here. */
export async function changeRule(where:Where,row:RuleRow,to:{rule?:string;effect?:PermissionEffect}|null){
  const scopes=row.scopes.filter(scope=>WRITABLE.has(scope)) as RuleScope[];if(!scopes.length)fail('PERMISSION_RULE_READ_ONLY');
  const effect=to?.effect??row.effect;const rule=to?checkedRule(to.rule??row.rule,effect):null;
  for(const scope of scopes){
    const current=await lists(where,scope);
    current[row.effect]=current[row.effect].filter(value=>value!==row.rule);
    if(rule!==null&&!current[effect].includes(rule))current[effect].push(rule);
    await save(where,scope,current,[...new Set([row.effect,effect])]);
  }
}
