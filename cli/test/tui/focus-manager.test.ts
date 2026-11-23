import assert from 'node:assert/strict';
import test from 'node:test';
import {closeFocus,createFocusState,openFocus} from '../../src/tui/focus-manager.ts';

test('closing an overlay restores the previous focus owner',()=>{
  let s=createFocusState('composer');
  s=openFocus(s,'model-picker');
  s=openFocus(s,'help');
  s=closeFocus(s);
  assert.equal(s.current,'model-picker');
  s=closeFocus(s);
  assert.equal(s.current,'composer');
});

test('overlay host renders exactly the active descriptor without registering input',async()=>{
  const {createOverlayHost}=await import('../../src/tui/overlays/overlay-host.ts');
  const calls:any[]=[];const React={createElement:(component:any,props:any)=>{calls.push([component,props]);return{component,props};}};
  const components={provider:'Provider',model:'Model',session:'Session',approval:'Approval',help:'Help'} as const;
  const Host=createOverlayHost(React,components as any);
  assert.equal(Host({overlay:null}),null);
  const rendered=Host({overlay:{kind:'model',provider:'ollama'}} as any) as any;
  assert.equal(rendered.component,'Model');assert.equal(rendered.props.provider,'ollama');assert.equal(calls.length,1);
});
