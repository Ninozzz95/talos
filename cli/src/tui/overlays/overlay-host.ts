export type OverlayState=
 | {kind:'provider'}
 | {kind:'model';provider?:string}
 | {kind:'session';action:'resume'|'fork'}
 | {kind:'approval';requestId:string}
 /* Stage 3: the model's questions (question-card.ts) */
 | {kind:'question';requestId:string}
 /* Stage 3: the model's proposed plan (plan-card.ts) */
 | {kind:'plan';requestId:string}
 /* Stage 3: an MCP server's request (elicit-card.ts) */
 | {kind:'elicit';requestId:string}
 /* 0.6.15: a phone asks for a folder (consent-card.ts) */
 | {kind:'consent';requestId:string}
 /* 0.6.15 T4: `/remote`, pairing a device (remote-card.ts) */
 | {kind:'remote'}
 | {kind:'help'}
 | null;

export type OverlayComponents={provider:any;model:any;session:any;approval:any;question:any;plan:any;elicit:any;consent:any;remote:any;help:any};

export function createOverlayHost(React:{createElement:(component:any,props:any)=>any},components:OverlayComponents){
  return function OverlayHost({overlay,...shared}:{overlay:OverlayState;[key:string]:any}){
    if(!overlay)return null;
    const component=components[overlay.kind];
    return React.createElement(component,{...shared,...overlay});
  };
}
