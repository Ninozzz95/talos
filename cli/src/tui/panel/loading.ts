/*
 * Owner 01/11: «qualunque cosa di potenzialmente pesante deve avere un indicatore di caricamento»; 27/10 and 29/10: nothing must look stuck.
 * One rule, agreed with Desktop, Mobile, Frontend and Performance (FORMA-AVVIO-HOME-E-CARICAMENTI): under 100 ms nothing; then the page with
 * its title and still words; from 2 s the sign turns and the seconds count. A row that came stays 300 ms so it does not flash. Esc closes,
 * and what arrives after is dropped. Loading is never empty.
 */
import {activityClock} from '../activity-line.ts';
import {one,S,SPIN,type Panel,type SegRow} from './sheet.ts';

export const LOADING_PAGE_MS=100,LOADING_SIGN_MS=2000,LOADING_HOLD_MS=300;

/** The words, and from 2 s the sign and the seconds. Without motion the sign stands still and the seconds still count. */
export function loadingRow(what:string,elapsedMs:number,{now,motion=true}:{now:number;motion?:boolean}):SegRow{
  if(elapsedMs<LOADING_SIGN_MS)return[S('  '),S(what,'dim')];
  const sign=motion?SPIN[Math.floor(now/80)%SPIN.length]!:SPIN[0]!;
  return[S('  '),S(`${sign} `,'acc'),S(what,'dim'),S(` · ${activityClock(elapsedMs)}`,'faint')];
}

/** The page shown while a command reads. */
export function loadingPanel(title:string,what:string,startedAt:number,{motion=true}:{motion?:boolean}={}):Panel{
  return{...one(title,'',{kind:'info',fixed:true,lines:(_width,_height,now=startedAt)=>[[S('')],loadingRow(what,Math.max(0,now-startedAt),{now,motion})]}),page:true};
}

export type PageLoader<T>={
  /** Runs `task`; past 100 ms and if nothing else is open, `show` opens the page, and what the task opens waits behind it for the 300 ms. */
  run(hooks:{show:()=>void;apply:(result:T|null)=>void;free:()=>boolean},task:()=>Promise<void>):Promise<void>;
  /** Whether a sheet may be set now: while the page stands, a result is held and Esc is remembered. */
  letThrough(given:T|null,onLoadingPage:boolean):boolean;
};
export function createPageLoader<T>({now=Date.now as ()=>number,later=setTimeout as unknown as (run:()=>void,ms:number)=>unknown,cancel=clearTimeout as unknown as (timer:unknown)=>void}={}):PageLoader<T>{
  let wait:{shownAt:number|null;closed:boolean;result:T|null}|null=null;
  return{
    letThrough(given,onLoadingPage){
      if(!wait)return true;
      if(wait.closed&&given)return false;
      if(wait.shownAt===null||!onLoadingPage)return true;
      if(given===null){wait.closed=true;return true;}
      wait.result=given;return false;
    },
    async run({show,apply,free},task){
      if(wait)return task();
      const mine={shownAt:null as number|null,closed:false,result:null as T|null};wait=mine;
      const timer=later(()=>{if(free()){mine.shownAt=now();show();}},LOADING_PAGE_MS);
      try{await task();}
      finally{
        cancel(timer);
        const hold=mine.shownAt===null||mine.closed?0:LOADING_HOLD_MS-(now()-mine.shownAt);
        if(hold>0)await new Promise<void>(done=>{later(done,hold);});
        wait=null;
        if(mine.shownAt!==null&&!mine.closed)apply(mine.result);
      }
    },
  };
}
