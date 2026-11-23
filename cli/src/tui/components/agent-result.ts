/*
 * ASYNC phase, step 2 (owner 01/10: «riga d'agente»). One delegated agent's result, as the main agent receives it when the
 * kernel wakes it: «◆ Agent finished · <task>» (or «Agent did not finish»), then the first three lines of the child's
 * summary and «… +N lines» for the rest; expanded (the transcript's own expand), every line. Like Codex's history cell
 * «Completed <agent>» with its preview lines (tui/src/multi_agents.rs, 3 preview lines) and the desktop's result card
 * (coda-messaggi.js `descriviRisultatoDelega`: title = task, text = result, error when not concluded). The summary is the
 * child's self-report: shown as data, indented, never as the person's words.
 */
import {t,tn} from '../../i18n/index.ts';
import {displayWidth,truncateDisplay} from '../text-width.ts';
import {englishDelegationLine} from '../../i18n/delegation-text.ts';

export type TranscriptAgentItem={kind:'agent';id:string;childId:string;status:'completed'|'failed';task:string|null;summary:string};

export const AGENT_PREVIEW_LINES=3;
const INDENT='  ';

export function agentResultHeader(item:Pick<TranscriptAgentItem,'status'|'task'>):string{
  return `${t(item.status==='completed'?'screen.agent.finished':'screen.agent.notFinished')} · ${item.task??t('screen.agent.unnamed')}`;
}

/** The row's lines at `width` columns; `expanded` shows the whole summary. */
export function agentResultLines(item:TranscriptAgentItem,width:number,{unicode,expanded}:{unicode:boolean;expanded:boolean}):string[]{
  const limit=Math.max(8,Math.floor(width));
  const fit=(text:string)=>displayWidth(text)<=limit?text:truncateDisplay(text,limit);
  const glyph=unicode?'◆':'*';
  const summary=item.summary.replace(/\r\n?/gu,'\n').split('\n').map(line=>englishDelegationLine(line.trimEnd())).filter((line,index,all)=>line!==''||index<all.length-1);
  const shown=expanded?summary:summary.slice(0,AGENT_PREVIEW_LINES);
  const lines=[fit(`${glyph} ${agentResultHeader(item)}`),...shown.map(line=>fit(INDENT+line))];
  const hidden=summary.length-shown.length;
  if(hidden>0)lines.push(fit(INDENT+tn('screen.agent.moreLines',hidden)));
  return lines;
}

/** Plain text for copy, search and the exit transcript: the header and the whole summary. */
export function agentResultText(item:TranscriptAgentItem):string{
  return `${agentResultHeader(item)}\n${item.summary.split(/\r?\n/u).map(englishDelegationLine).join('\n')}`;
}
