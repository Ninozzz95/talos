/*
 * Stage 7.10c (owner 03/10 «consenso e accesso col browser restano, come passi del foglio»): a step the provider's flow still
 * drives with its own keys (an environment key's consent, the way to sign in, the browser sign-in under way, the masked key) is
 * drawn as the one sheet the mockup draws everything with — title row, its lines, its keys — instead of a boxed window over
 * the conversation. The words are the step's own (provider-picker.ts); only where they stand changes.
 */
import {one,S,wrap,type Panel,type SegRow} from './sheet.ts';
import type {OverlayContent,OverlayLine} from '../overlays/scroll-window.ts';

const rolesOf=(line:OverlayLine):string|readonly string[]=>line.tone==='selected'||line.tone==='title'?['acc','b']:line.tone==='accent'?'acc':line.tone==='dim'?'dim':'';

export function overlayAsPanel(title:string,sub:string,content:OverlayContent):Panel{
  const lines=(width:number):SegRow[]=>{
    const body=content.sections.flatMap(section=>section.lines.flatMap(line=>wrap(line.text,Math.max(10,width-4)).map(text=>[S(`  ${text}`,rolesOf(line))])));
    const foot=(content.foot??[]).flatMap(line=>wrap(line.text,Math.max(10,width-4)).map(text=>[S(`  ${text}`,'faint')]));
    return[[S('')],...body,...(foot.length?[[S('')],...foot]:[])];
  };
  return one(title,sub,{kind:'info',lines});
}
