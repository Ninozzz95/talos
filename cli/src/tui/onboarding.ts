import {t} from '../i18n/index.ts';
import {missingKeyText} from '../provider/missing-key.ts';
import {inertProjectTrustText} from './project-trust-prompt.ts';

export type OnboardingLocale='en';
export type OnboardingStepId='trust'|'provider'|'key'|'model'|'loaded';
/** `step`: something to do, with its command. `info` (R4): something TALOS did, shown as a line of its own, no command. */
export type OnboardingStep={id:OnboardingStepId;kind:'step'|'info';text:string;command:string};

type CopiedStepId='trust'|'provider'|'model';
type OnboardingCopy=Record<CopiedStepId,{text:string;command:string}>;
/* The words live in the dictionary (R4: moved from here to i18n/en/firstrun.ts, same words). */
export const ONBOARDING_COPY:Readonly<Record<OnboardingLocale,Readonly<OnboardingCopy>>>=Object.freeze({
  en:Object.freeze({
    trust:Object.freeze({text:t('firstrun.setup.trust'),command:'talos project trust --include-nested'}),
    provider:Object.freeze({text:t('firstrun.setup.provider'),command:'/provider'}),
    model:Object.freeze({text:t('firstrun.setup.model'),command:'/model'}),
  }),
});

/*
 * R4 CONTRACT (owner: lane F; lane N calls it from app.ts), owner decision Q-R4-13:
 * - `keyMissing`: the chosen provider has no key usable now. `true` says so in general; a provider id says it with the one
 *   missing-key sentence (R2 E8, the same as -p, `provider test` and doctor), which names the provider's own variable. Either
 *   way the command is /provider. It follows the provider step (with no provider chosen, choosing one asks for the key).
 * - `loadedFiles`: the instruction files TALOS loaded for this folder (main.ts, after trust), named relative to the project
 *   root; one `info` line first — `Loaded AGENTS.md` — even when nothing else is missing.
 */
export function onboardingSteps(input:{projectTrusted:boolean;providerConfigured:boolean;modelConfigured:boolean;keyMissing?:boolean|string;loadedFiles?:readonly string[]},locale:OnboardingLocale='en'):OnboardingStep[]{
  const copy=ONBOARDING_COPY[locale]??ONBOARDING_COPY.en;
  const out:OnboardingStep[]=[];
  const files=(input.loadedFiles??[]).filter(file=>typeof file==='string'&&file.length>0);
  if(files.length)out.push({id:'loaded',kind:'info',text:t('firstrun.setup.loaded',{files:files.map(inertProjectTrustText).join(', ')}),command:''});
  const step=(id:CopiedStepId)=>out.push({id,kind:'step',text:copy[id].text,command:copy[id].command});
  if(!input.projectTrusted)step('trust');
  if(!input.providerConfigured)step('provider');
  else if(input.keyMissing)out.push({id:'key',kind:'step',text:typeof input.keyMissing==='string'?missingKeyText(input.keyMissing):t('firstrun.setup.key'),command:'/provider'});
  if(!input.modelConfigured)step('model');
  return out;
}
