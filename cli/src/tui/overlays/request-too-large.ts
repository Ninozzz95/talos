import {t} from '../../i18n/index.ts';
import type {RequestTooLarge} from '../../runtime/request-too-large.ts';
import type {OverlayContent,OverlayLine} from './scroll-window.ts';

/*
 * 0.6.13 (owner 22/10/2026, «a request too large for the model»: a small choice dialog, chosen over a line with buttons). It
 * works as the Full access confirmation does (full-access-confirmation.ts): a title, one detail line with the numbers, two
 * choices — «Send as attachment» first and selected, then «Edit the message» — and the keys. The selected choice carries `▸`,
 * so it is told without colour too (s39). Esc or «Edit the message» closes it and the text stays in the composer.
 * gemini-cli gives the prompt back to the input and says nothing more (packages/cli/src/ui/AppContainer.tsx:1348-1376); here
 * the one action that sends it anyway is offered beside it, and nothing was paid either way.
 */
export const REQUEST_TOO_LARGE_CHOICES=['attach','edit'] as const;
const number=(value:number)=>value.toLocaleString('en-US');
/** The detail line: «About» when TALOS estimated, the provider's own count when it said; without numbers only what was not done. */
export function requestTooLargeDetail(facts:RequestTooLarge|null):string{
  if(!facts)return t('screen.requestTooLarge.detailUnknown');
  const params={request:number(facts.request),frame:number(facts.frame),window:number(facts.window),...(facts.reserve?{reserve:number(facts.reserve)}:{})};
  /* review 13 of 0.6.13: with the room kept for the answer, said */
  if(facts.reserve)return t(facts.source==='provider'?'screen.requestTooLarge.detailProviderReserve':'screen.requestTooLarge.detailReserve',params);
  return t(facts.source==='provider'?'screen.requestTooLarge.detailProvider':'screen.requestTooLarge.detail',params);
}
/* review 9 F3 of 0.6.13: when the kernel says not even the attached form fits (`allegabile:false`, and always for images), the one
   action would only bring the same dialog back; then «Edit the message» is the only choice, and the line says why */
export function requestTooLargeAttachable(facts:RequestTooLarge|null):boolean{return facts?.attachable!==false;}
export function requestTooLargeOverlay(selected:0|1,facts:RequestTooLarge|null):OverlayContent{
  const attachable=requestTooLargeAttachable(facts);
  const choices=attachable?[t('screen.requestTooLarge.attach'),t('screen.requestTooLarge.edit')]:[t('screen.requestTooLarge.edit')];
  const chosen=attachable?selected:0;
  const lines:OverlayLine[]=choices.map((text,index)=>({text:`${index===chosen?'▸':' '} ${text}`,tone:index===chosen?'selected':'plain'}));
  return{head:[{text:t('screen.requestTooLarge.title'),tone:'title'},
    {text:requestTooLargeDetail(facts),tone:'plain'},...(attachable?[]:[{text:t('screen.requestTooLarge.notAttachable'),tone:'plain' as const}])],sections:[{lines,selected:chosen}],
    foot:[{text:t(attachable?'screen.requestTooLarge.keys':'screen.requestTooLarge.keysEdit'),tone:'dim'}]};
}
