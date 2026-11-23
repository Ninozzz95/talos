/*
 * R2 (D-05, gate E1/E4): the one place a provider's label and description reach the screen or `talos provider list`. Mapped
 * by provider ID, never by the kernel's words; the kernel registry (and what the model or the kernel receives) is untouched.
 */
import {en,t,type MessageId} from '../i18n/index.ts';

function entry(id:string,field:'label'|'description'):string|null{
  const key=`provider.${id}.${field}`;
  return Object.hasOwn(en,key)?t(key as MessageId):null;
}

/** The English label for provider `id`, or `fallback` (the registry text) when the registry label is already English. */
export function providerLabelText(id:string,fallback:string):string{return entry(id,'label')??fallback;}

/** The English description for provider `id`, or `fallback` (the registry text). */
export function providerDescriptionText(id:string,fallback:string):string{return entry(id,'description')??fallback;}
