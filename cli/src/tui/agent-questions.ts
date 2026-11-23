/*
 * Stage 6b (owner 02/10: «i figli possono chiederti»; decisions «pagina + scheda completa», registro 12). A child's question
 * to the person, answered from the agents page when it is simple — the approved mockup's `answerAgent`: a number picks a
 * choice, a typed reply is a free answer (the kernel admits one for a single choice, user-question-contract.mjs:256-266),
 * Enter on an empty reply takes the first choice (the recommended one goes first, owner decision 32). Several questions or
 * several choices open the stage 3 card instead (question-card.ts). Pure: the question in, the kernel's response out.
 */
import type {CardQuestion} from './question-card.ts';

export type SimpleQuestion={id:string;q:string;options:string[]};
export type AgentQuestionResponse={status:'answered';answers:Record<string,string>};

/** The one question the page can answer, or null when it needs the full card. */
export function simpleQuestion(questions:readonly CardQuestion[]):SimpleQuestion|null{
  if(questions.length!==1)return null;
  const only=questions[0]!;
  if(only.multiSelect)return null;
  return{id:only.id,q:only.question,options:(only.options??[]).map(option=>option.label)};
}

/** The response to send for a reply on the page; null when the reply answers nothing. */
export function agentReply(ask:{requestId:string;questions:readonly CardQuestion[]},reply:{number:number}|{text:string}):AgentQuestionResponse|null{
  const simple=simpleQuestion(ask.questions);if(!simple)return null;
  let answer:string|null;
  if('number' in reply)answer=simple.options[reply.number-1]??null;
  else{const text=reply.text.trim();answer=text||simple.options[0]||null;}
  return answer?{status:'answered',answers:{[simple.id]:answer}}:null;
}
