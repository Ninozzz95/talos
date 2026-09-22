export type OnboardingLocale='en';
export type OnboardingStepId='trust'|'provider'|'model';
export type OnboardingStep={id:OnboardingStepId;text:string;command:string};

type OnboardingCopy=Record<OnboardingStepId,{text:string;command:string}>;
export const ONBOARDING_COPY:Readonly<Record<OnboardingLocale,Readonly<OnboardingCopy>>>=Object.freeze({
  en:Object.freeze({
    trust:Object.freeze({text:'Review and trust this project before starting.',command:'talos project trust --include-nested'}),
    provider:Object.freeze({text:'Choose a provider and add a usable key if needed.',command:'/provider'}),
    model:Object.freeze({text:'Choose the model TALOS should use for this project.',command:'/model'}),
  }),
});

const ORDER:readonly OnboardingStepId[]=['trust','provider','model'];

export function onboardingSteps(input:{projectTrusted:boolean;providerConfigured:boolean;modelConfigured:boolean},locale:OnboardingLocale='en'):OnboardingStep[]{
  const copy=ONBOARDING_COPY[locale]??ONBOARDING_COPY.en;
  const ready:Record<OnboardingStepId,boolean>={trust:input.projectTrusted,provider:input.providerConfigured,model:input.modelConfigured};
  return ORDER.filter(id=>!ready[id]).map(id=>({id,text:copy[id].text,command:copy[id].command}));
}
