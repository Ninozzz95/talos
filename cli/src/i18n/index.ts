/*
 * R2 (Q-R2-1, gate E1/E9): the ONE place the screen's words come from. `en` is a flat, typed object keyed by dotted ids;
 * values are data strings with `{name}` placeholders; plurals are `<id>.one` / `<id>.other` chosen by Intl.PluralRules.
 * A later locale is `{...en,...overrides}` and needs no code change (Hermes desktop / OpenCode pattern). What the MODEL
 * receives (kernel tool names, argument keys, contract markers) never comes from here (gate E2).
 */
import {en} from './en.ts';

export type Messages=typeof en;
export type MessageId=keyof Messages;
type PluralBase<K> = K extends `${infer B}.one` ? (`${B}.other` extends keyof Messages ? B : never) : never;
export type PluralId=PluralBase<MessageId>;
export type MessageParams=Readonly<Record<string,string|number>>;

const pluralRules=new Intl.PluralRules('en');

function fill(template:string,params:MessageParams={}){
  return template.replace(/\{(\w+)\}/gu,(whole,name:string)=>Object.hasOwn(params,name)?String(params[name]):whole);
}

/** The English text for `id`, with `{name}` placeholders filled from `params` (a missing param stays visible as `{name}`). */
export function t(id:MessageId,params?:MessageParams):string{return fill(en[id],params);}

/** The plural form of `base` for `count` (`{count}` is available to the template). */
export function tn(base:PluralId,count:number,params:MessageParams={}):string{
  const form=pluralRules.select(count)==='one'?'one':'other';
  return fill(en[`${base}.${form}` as MessageId],{count,...params});
}

export {en};
