import {t} from '../../i18n/index.ts';
import {CONFIG_PANEL_KEYS,CONFIG_PANEL_LIVE_KEYS,type ConfigPanelSnapshot} from '../config-panel.ts';
import type {OverlayContent} from './scroll-window.ts';

export function configPanelOverlay(state:ConfigPanelSnapshot):OverlayContent{
  const values=state.values;
  const labels=values?[
    values.maxProseWidth===null?t('screen.config.fullWidth'):t('screen.config.columns',{count:values.maxProseWidth}),
    t(`screen.config.notifications.${values.notifications}`),
    t(values.mouse?'screen.config.on':'screen.config.off'),
    t(`screen.config.exit.${values.exitOutput}`),
    t(`screen.config.questionTimeout.${values.questionTimeout}`),
  ]:[];
  return{
    head:[{text:t('screen.config.title'),tone:'title'},{text:t('screen.config.scope'),tone:'dim'}],
    sections:[{selected:state.selected,lines:values?CONFIG_PANEL_KEYS.map((key,index)=>({
      text:t(`screen.config.label.${key}`)+': '+labels[index]+(CONFIG_PANEL_LIVE_KEYS.includes(key)?'':' · '+t('screen.config.nextLaunch')),
      tone:index===state.selected?'selected' as const:'plain' as const,
    })):[{text:t(state.busy?'screen.config.loading':'screen.config.unavailable'),tone:'dim'}]}],
    foot:[...(state.notice?[{text:state.notice,tone:'plain' as const}]:[]),
      /* stage 6c: the selected row's help, where it has one (the mockup's Mouse row) */
      ...(values&&CONFIG_PANEL_KEYS[state.selected]==='mouse'?[{text:t('screen.config.help.mouse'),tone:'dim' as const}]:[]),{text:t(state.busy?'screen.config.saving':values?'screen.config.keys':'screen.config.retryKeys'),tone:'dim'}],
  };
}
