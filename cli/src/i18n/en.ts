/*
 * R2: the English dictionary, split by area so that parallel lanes each own one file (ledger R2 lane plan). Ids must be
 * unique across areas: `i18n.test.ts` fails on a duplicate. Add ids to the area that owns the words, never here.
 */
import {activity} from './en/activity.ts';
import {agents} from './en/agents.ts';
import {approval} from './en/approval.ts';
import {automations} from './en/automations.ts';
import {common} from './en/common.ts';
import {credentials} from './en/credentials.ts';
import {dialogue} from './en/dialogue.ts';
import {elicit} from './en/elicit.ts';
import {errors} from './en/errors.ts';
import {firstrun} from './en/firstrun.ts';
import {panels} from './en/panels.ts';
import {plan} from './en/plan.ts';
import {providers} from './en/providers.ts';
import {question} from './en/question.ts';
import {remote} from './en/remote.ts';
import {screen} from './en/screen.ts';
import {selection} from './en/selection.ts';
import {tools} from './en/tools.ts';

export const AREAS={activity,agents,approval,automations,common,credentials,dialogue,elicit,errors,firstrun,panels,plan,providers,question,remote,screen,selection,tools} as const;
export const en={...activity,...agents,...approval,...automations,...common,...credentials,...dialogue,...elicit,...errors,...firstrun,...panels,...plan,...providers,...question,...remote,...screen,...selection,...tools} as const;
