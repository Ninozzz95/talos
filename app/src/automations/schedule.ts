export type DailyAutomationSchedule={kind:'daily';at:string;timezone:string};
export type LegacyAutomationSchedule={kind:'legacy'};
export type AutomationSchedule=DailyAutomationSchedule|LegacyAutomationSchedule;
export type MissedRunPolicy={mode:'skip'|'latest';graceMinutes:number;catchupWindowMinutes:number};
export type AutomationSlot={slotKey:string;scheduledAt:string;adjustedForDst:boolean};
export type AutomationDecision={action:'run'|'wait'|'skip-missed';reason:string;slot:AutomationSlot|null;nextAt:string|null};

function fail(code:string):never{throw Object.assign(new Error(code),{code});}
function two(n:number){return String(n).padStart(2,'0');}
function dateKey(y:number,m:number,d:number){return String(y).padStart(4,'0')+'-'+two(m)+'-'+two(d);}
function addDate(key:string,days:number){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10);}
function wallMinutes(at:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/u.test(at))fail('AUTOMATION_TIME_INVALID');const [h,m]=at.split(':').map(Number);return h*60+m;}

export function validateTimeZone(value:string){
  if(value!=='UTC'&&!/^[A-Za-z_]+(?:\/[A-Za-z0-9._+-]+)+$/u.test(value))fail('AUTOMATION_TIMEZONE_INVALID');
  try{new Intl.DateTimeFormat('en-US',{timeZone:value}).format(new Date(0));}catch{fail('AUTOMATION_TIMEZONE_INVALID');}
  return value;
}

function localParts(ms:number,timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
  const value=(type:string)=>Number(parts.find(p=>p.type===type)?.value);
  return{year:value('year'),month:value('month'),day:value('day'),hour:value('hour'),minute:value('minute')};
}
function localDate(ms:number,tz:string){const p=localParts(ms,tz);return dateKey(p.year,p.month,p.day);}
function resolveLocal(date:string,at:string,timeZone:string):AutomationSlot{
  validateTimeZone(timeZone);const target=wallMinutes(at);const [y,m,d]=date.split('-').map(Number),[hh,mm]=at.split(':').map(Number);
  const rough=Date.UTC(y,m-1,d,hh,mm),exact:number[]=[],later:Array<{ms:number;wall:number}>=[];
  for(let ms=rough-18*60*60_000;ms<=rough+18*60*60_000;ms+=60_000){
    const p=localParts(ms,timeZone);if(dateKey(p.year,p.month,p.day)!==date)continue;
    const wall=p.hour*60+p.minute;
    if(wall===target)exact.push(ms);else if(wall>target)later.push({ms,wall});
  }
  let chosen:number,adjusted=false;
  if(exact.length)chosen=Math.min(...exact);
  else{
    later.sort((a,b)=>a.wall-b.wall||a.ms-b.ms);if(!later.length)fail('AUTOMATION_SCHEDULE_UNRESOLVABLE');
    chosen=later[0].ms;adjusted=true;
  }
  return{slotKey:date+'@'+at+'['+timeZone+']',scheduledAt:new Date(chosen).toISOString(),adjustedForDst:adjusted};
}
export function nextDailySlot(schedule:DailyAutomationSchedule,afterMs:number):AutomationSlot{
  const timezone=validateTimeZone(schedule.timezone);wallMinutes(schedule.at);const start=localDate(afterMs,timezone);
  for(let i=0;i<4;i++){const slot=resolveLocal(addDate(start,i),schedule.at,timezone);if(Date.parse(slot.scheduledAt)>afterMs)return slot;}
  fail('AUTOMATION_SCHEDULE_UNRESOLVABLE');
}
function latestDailySlot(schedule:DailyAutomationSchedule,now:number):AutomationSlot{
  const timezone=validateTimeZone(schedule.timezone);wallMinutes(schedule.at);const today=localDate(now,timezone);
  const slot=resolveLocal(today,schedule.at,timezone);if(Date.parse(slot.scheduledAt)<=now)return slot;
  return resolveLocal(addDate(today,-1),schedule.at,timezone);
}
export function decideAutomationSchedule(input:{schedule:DailyAutomationSchedule;now:number;lastHandledSlot:string|null;policy:MissedRunPolicy}):AutomationDecision{
  const slot=latestDailySlot(input.schedule,input.now);
  if(input.lastHandledSlot===slot.slotKey){const next=nextDailySlot(input.schedule,input.now);return{action:'wait',reason:'slot-handled',slot:null,nextAt:next.scheduledAt};}
  const lateness=Math.max(0,(input.now-Date.parse(slot.scheduledAt))/60_000),grace=Math.max(0,input.policy.graceMinutes),catchup=Math.max(0,input.policy.catchupWindowMinutes);
  if(lateness<=grace)return{action:'run',reason:'due',slot,nextAt:null};
  const next=nextDailySlot(input.schedule,input.now);
  if(input.policy.mode==='latest'&&lateness<=catchup)return{action:'run',reason:'latest-missed',slot,nextAt:null};
  return{action:'skip-missed',reason:input.policy.mode==='skip'?'missed-policy-skip':'missed-window-expired',slot,nextAt:next.scheduledAt};
}
