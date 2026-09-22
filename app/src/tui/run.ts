import type {TuiAppProps} from './app.ts';
import {createTuiMetricsCollector,createTuiMetricsProfiler,summarizeTuiMetrics} from './metrics.ts';
import {createRenderCoordinator} from './render-coordinator.ts';
import {detectTerminalCapabilities} from './terminal-capabilities.ts';
import {createTerminalSessionPlan} from './terminal-session.ts';
import {createTuiTheme} from './theme.ts';
import {DEFAULT_THEME_ACCENT,type ThemeAccentId} from './theme-catalog.ts';
import {createTerminalSizeStore,terminalFrameProps} from './components/terminal-shell.ts';
import {developmentLogError} from '../diagnostics/development-log.ts';

export async function runInkTui(props:TuiAppProps):Promise<void>{
  let React:any,Ink:any,createTuiAppComponent:any;
  try{
    React=await import('react');
    Ink=await import('ink');
    ({createTuiAppComponent}=await import('./app.ts'));
  }catch{
    throw new Error('TUI_DEPENDENCY_UNAVAILABLE');
  }
  const capabilities=detectTerminalCapabilities({stdinIsTTY:Boolean(process.stdin.isTTY),stdoutIsTTY:Boolean(process.stdout.isTTY),color:props.invocation.color!==false,env:process.env});
  const configuredTheme=props.uiTheme;
  const effectiveCapabilities=configuredTheme==='mono'?{...capabilities,color:false,motion:false}:capabilities;
  const accentId:ThemeAccentId=configuredTheme&&configuredTheme!=='mono'?configuredTheme:DEFAULT_THEME_ACCENT;
  const session=createTerminalSessionPlan({capabilities:effectiveCapabilities,env:process.env});
  const theme=createTuiTheme(effectiveCapabilities,accentId);
  const collector=createTuiMetricsCollector();
  const coordinator=createRenderCoordinator({profiler:createTuiMetricsProfiler({sink:collector.sink})});
  const TuiApp=createTuiAppComponent(React,Ink,effectiveCapabilities,accentId);
  const terminalSize=createTerminalSizeStore(process.stdout,{rows:30,columns:100},error=>developmentLogError('tui.resize.failure',error,{},'tui-run'));
  const Root=()=>{
    const size=React.useSyncExternalStore(terminalSize.subscribe,terminalSize.getSnapshot,terminalSize.getSnapshot);
    const frameProps=terminalFrameProps({session,...(theme.colors.background?{background:theme.colors.background}:{}),rows:size.rows,columns:size.columns});
    return React.createElement(Ink.Box,frameProps,React.createElement(TuiApp,{...props,renderCoordinator:coordinator,terminalSize:size}));
  };
  const rendered=Ink.render(React.createElement(Root),{
    exitOnCtrlC:false,
    interactive:session.mode==='plain'?false:effectiveCapabilities.interactive,
    alternateScreen:session.alternateScreen,
  });
  try{await rendered.waitUntilExit();}
  finally{
    terminalSize.dispose();
    coordinator.dispose();
    if(process.env.TALOS_TUI_RENDER_METRICS==='1'){
      process.stderr.write(`${JSON.stringify({schema:'talos.cli.tui-render-metrics.v1',...summarizeTuiMetrics(collector.snapshot())})}\n`);
    }
  }
}
