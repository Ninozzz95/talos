/* 0.6.11 (owner 17/10/2026): run.ts sets the terminal's background to the theme's BEFORE the first frame and gives it back BEFORE
   the alternate screen is left — on a normal exit and when Ink throws. Under the system ConPTY the reset never reaches the outer
   terminal (measured 20/10/2026: OSC 11 passes, OSC 110/111 and the `OSC 11 ; ?` query are absorbed), so the order is proven here,
   on the writes TALOS makes. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {runInkTui} from '../../src/tui/run.ts';
import {RESET_TERMINAL_BACKGROUND} from '../../src/tui/terminal-background.ts';

function harness({fail=false,env={}}:{fail?:boolean;env?:Record<string,string|undefined>}={}){
  const log:string[]=[];
  const React={createElement:(type:any,props:any,...children:any[])=>({type,props:props??{},children}),useSyncExternalStore:(_s:any,get:()=>any)=>get()};
  const Ink={Box:'Box',render(element:any,options:any){
    log.push('render');
    const frame=element.type();const app=frame.children[0];
    return{unmount(){},waitUntilExit:async()=>{
      await new Promise(resolve=>setImmediate(resolve));
      if(fail)throw new Error('INK_TEST_FAILURE');
      app.props.onExit({sessionId:null,items:[]});
      if(options.alternateScreen)log.push('leave-alt');
    }};
  }};
  const stdout={isTTY:true,columns:100,rows:30,on(){},off(){},write(chunk:string){
    if(chunk.startsWith('\u001b]11;'))log.push('set-background');else if(chunk===RESET_TERMINAL_BACKGROUND)log.push('reset-background');
    return true;}};
  const io={load:async()=>({React,Ink,createTuiAppComponent:()=>function TuiApp(){return null;}}),stdin:{isTTY:true},stdout,env:{COLORTERM:'truecolor',WT_SESSION:'talos-test',...env} as Record<string,string|undefined>};
  return{log,io};
}
const props={invocation:{color:true},uiTheme:'forge'} as any;
const only=(log:string[])=>log.filter(l=>l!=='write');

test('the background is set before the first frame and given back before the alternate screen is left, once',async()=>{
  const h=harness();
  await runInkTui(props,h.io as any);
  assert.deepEqual(only(h.log),['set-background','render','reset-background','leave-alt']);
});

test('when Ink throws, the background is still given back',async()=>{
  const h=harness({fail:true});
  await assert.rejects(runInkTui(props,h.io as any),/INK_TEST_FAILURE/u);
  assert.deepEqual(only(h.log),['set-background','render','reset-background']);
});

test('AL CONTRARIO — mono theme, tmux or the switch at 0: the terminal background is never touched',async()=>{
  for(const [p,env] of [[{...props,uiTheme:'mono'},{}],[props,{TMUX:'/tmp/tmux-1/default,1,0'}],[props,{TALOS_TUI_TERMINAL_BACKGROUND:'0'}],...(process.platform==='win32'?[[props,{WT_SESSION:undefined}]]:[])] as const){
    const h=harness({env});
    await runInkTui(p as any,h.io as any);
    assert.deepEqual(only(h.log).filter(l=>l.includes('background')),[],JSON.stringify(env));
  }
});
