import {t} from '../../i18n/index.ts';
import type {OverlayContent,OverlayLine} from './scroll-window.ts';

export function fullAccessConfirmationOverlay(selected:0|1):OverlayContent{
  const lines:OverlayLine[]=[t('screen.fullAccess.cancel'),t('screen.fullAccess.enable')]
    .map((text,index)=>({text,tone:index===selected?'selected':'plain'}));
  return{head:[{text:t('screen.fullAccess.title'),tone:'title'},
    {text:t('screen.fullAccess.detail'),tone:'plain'}],sections:[{lines,selected}],
    foot:[{text:t('screen.fullAccess.keys'),tone:'dim'}]};
}
