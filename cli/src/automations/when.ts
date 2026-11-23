/*
 * 0.6.6 (owner 14/10/2026, «Una frase breve»): when an automation runs, written as one short phrase, the way Hermes takes it
 * (`hermes cron create "every 2h" "Check server status"`, hermes-agent.nousresearch.com/docs/user-guide/features/cron) and with
 * the presets Claude Code's /schedule walks through (hourly, daily, weekdays, weekly, a cron expression, once; code.claude.com/
 * docs/en/routines). The phrase becomes the kernel's own schedule (automation-pianificazione.mjs `normalizzaPianificazione`), which
 * keeps the rules: at most every 5 minutes, five-field cron, a local date and time for «once». Nothing is guessed: a phrase that
 * is not one of these is refused with the forms that are.
 */
import {t} from '../i18n/index.ts';

export type KernelSchedule=
  |{tipo:'manuale'}
  |{tipo:'ogni-ora';minuto:number}
  |{tipo:'giornaliera'|'feriali';ora:string}
  |{tipo:'settimanale';ora:string;giorno:number}
  |{tipo:'ogni-n-minuti';minuti:number}
  |{tipo:'cron';espressione:string}
  |{tipo:'una-volta';quando:string};

export const WHEN_FORMS=['every 30m','every 2h','hourly','hourly :15','daily 09:00','weekdays 09:00','weekly mon 09:00','once 2026-10-20 09:00','cron "0 9 * * 1-5"','manual'] as const;
const DAYS=['sun','mon','tue','wed','thu','fri','sat'] as const;
const DAY_NAMES:Record<string,number>={sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6};
const TIME=/^([01]?\d|2[0-3]):([0-5]\d)$/u;

function invalid(phrase:string):never{
  throw Object.assign(new Error(`${t('error.code.AUTOMATION_WHEN_INVALID.what')} «${phrase}». ${t('error.code.AUTOMATION_WHEN_INVALID.todo')}`),{code:'AUTOMATION_WHEN_INVALID'});
}
const hhmm=(text:string):string|null=>{const m=TIME.exec(text);return m?`${m[1]!.padStart(2,'0')}:${m[2]}`:null;};

/** The kernel's schedule for a phrase; throws AUTOMATION_WHEN_INVALID with the forms that are read. */
export function parseWhen(input:string):KernelSchedule{
  const phrase=String(input??'').trim().replace(/\s+/gu,' ');
  const lower=phrase.toLowerCase();
  if(lower==='manual'||lower==='manually')return{tipo:'manuale'};
  const cron=/^cron\s+["']?(.+?)["']?$/iu.exec(phrase);
  if(cron)return{tipo:'cron',espressione:cron[1]!.trim()};
  const every=/^every\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)$/u.exec(lower);
  if(every){const n=Number(every[1]);const minutes=every[2]!.startsWith('h')?n*60:n;if(!Number.isSafeInteger(minutes)||minutes<1)invalid(phrase);return{tipo:'ogni-n-minuti',minuti:minutes};}
  if(lower==='hourly')return{tipo:'ogni-ora',minuto:0};
  const hourly=/^hourly\s+(?:at\s+)?:?([0-5]?\d)$/u.exec(lower);
  if(hourly)return{tipo:'ogni-ora',minuto:Number(hourly[1])};
  const daily=/^(daily|every day|weekdays)\s+(?:at\s+)?(\S+)$/u.exec(lower);
  if(daily){const time=hhmm(daily[2]!);if(!time)invalid(phrase);return{tipo:daily[1]==='weekdays'?'feriali':'giornaliera',ora:time};}
  const weekly=/^(?:weekly|every)\s+([a-z]+)\s+(?:at\s+)?(\S+)$/u.exec(lower);
  if(weekly&&Object.hasOwn(DAY_NAMES,weekly[1]!)){const time=hhmm(weekly[2]!);if(!time)invalid(phrase);return{tipo:'settimanale',ora:time,giorno:DAY_NAMES[weekly[1]!]!};}
  const once=/^once\s+(\d{4}-\d{2}-\d{2})[ t](\S+)$/u.exec(lower);
  if(once){const time=hhmm(once[2]!);if(!time)invalid(phrase);return{tipo:'una-volta',quando:`${once[1]}T${time}`};}
  invalid(phrase);
}

/** The phrase for a kernel schedule (what `list` shows); an unknown shape is named as it is. */
export function describeWhen(schedule:unknown):string{
  const s=schedule as Partial<KernelSchedule&{minuto:number;ora:string;giorno:number;minuti:number;espressione:string;quando:string}>|null;
  switch(s?.tipo){
    case'manuale':return'manual';
    case'ogni-ora':return s.minuto?`hourly :${String(s.minuto).padStart(2,'0')}`:'hourly';
    case'giornaliera':return`daily ${s.ora}`;
    case'feriali':return`weekdays ${s.ora}`;
    case'settimanale':return`weekly ${DAYS[s.giorno??0]??'?'} ${s.ora}`;
    case'ogni-n-minuti':{const m=s.minuti??0;return m%60===0?`every ${m/60}h`:`every ${m}m`;}
    case'cron':return`cron "${s.espressione}"`;
    case'una-volta':return`once ${String(s.quando??'').replace('T',' ')}`;
    default:return'unknown';
  }
}
