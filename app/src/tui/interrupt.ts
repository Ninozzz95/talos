export type InterruptAction='cancel'|'exit'|'force-exit';
export function createInterruptController({now=Date.now,windowMs=1000}:{now?:()=>number;windowMs?:number}={}){
  let lastCancelAt:number|null=null;
  return{ctrlC(running:boolean):InterruptAction{const t=now();if(!running){lastCancelAt=null;return'exit';}if(lastCancelAt!==null&&t-lastCancelAt<=windowMs){lastCancelAt=null;return'force-exit';}lastCancelAt=t;return'cancel';},reset(){lastCancelAt=null;}};
}
