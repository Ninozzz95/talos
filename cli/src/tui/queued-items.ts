import {t} from '../i18n/index.ts';
import type {TranscriptMessageItem} from './transcript-model.ts';
import type {TuiKernelQueue,TuiQueueEntry} from './session-controller.ts';

/*
 * F-Q1 (owner 03/10, «la coda … metterla inline»; «Come Claude Code»: queued messages are listed in the conversation, gray,
 * until they are sent). What waits is drawn at the END of the conversation, in the order it will go in: the kernel's queue
 * first (it enters after the current step), then what waits in the CLI's own queue (a message the kernel could not take,
 * a command), which goes when the turn ends. The status bar no longer carries a queue line.
 * FE-048, owner 01/11 («Fascia sopra il prompt», in place of the 03/10 choice): what the person queued is in the band above the
 * composer (regions/queue-band.ts). Here stays what TALOS itself waits to bring in: results of sub-agents, of commands and of workflows.
 */
export function queuedTranscriptItems(kernel:TuiKernelQueue,_local:readonly TuiQueueEntry[]=[]):TranscriptMessageItem[]{
  const items:TranscriptMessageItem[]=[];
  for(const item of kernel.items){
    if(item.origin==='delegation')items.push({kind:'message',id:`queued:kernel:${item.id}`,role:'assistant',text:'',streaming:false,queued:t('screen.transcript.queuedResult',{task:item.result?.task??t('screen.question.agentUnnamed')})});
    else if(item.origin==='dialogue')items.push({kind:'message',id:`queued:kernel:${item.id}`,role:'assistant',text:'',streaming:false,queued:t('screen.transcript.queuedDialogue')});
    else if(item.origin==='background')items.push({kind:'message',id:`queued:kernel:${item.id}`,role:'assistant',text:'',streaming:false,queued:t('screen.transcript.queuedBackground')});
    else if(item.origin==='workflow')items.push({kind:'message',id:`queued:kernel:${item.id}`,role:'assistant',text:'',streaming:false,queued:t('screen.transcript.queuedWorkflow')});
  }
  return items;
}
