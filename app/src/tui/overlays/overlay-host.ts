export type OverlayState=
 | {kind:'provider'}
 | {kind:'model';provider?:string}
 | {kind:'session';action:'resume'|'fork'}
 | {kind:'approval';requestId:string}
 | {kind:'help'}
 | null;

export type OverlayComponents={provider:any;model:any;session:any;approval:any;help:any};

export function createOverlayHost(React:{createElement:(component:any,props:any)=>any},components:OverlayComponents){
  return function OverlayHost({overlay,...shared}:{overlay:OverlayState;[key:string]:any}){
    if(!overlay)return null;
    const component=components[overlay.kind];
    return React.createElement(component,{...shared,...overlay});
  };
}
