import type {TuiAppProps} from './app.ts';
import {createTuiMetricsProfiler,createTuiRenderMetrics,createTuiRenderMetricsTap} from './metrics.ts';
import {createRenderCoordinator} from './render-coordinator.ts';
import {preloadProductionReact} from './react-runtime.ts';
import {inkInstanceFor,installRowWriter,rowWriterFor} from './row-writer.ts';
import {createPointerSelection,type ClickHandler,type CopiedInfo} from './pointer-selection.ts';
import {copyText,readClipboardText} from './clipboard.ts';
import {HOVER_OFF,HOVER_ON,createPointerShape,pointerShapeSupported} from './pointer-shape.ts';
import {createHover,type Hover} from './hover.ts';
import {installInputPaint} from './input-paint.ts';
import {detectTerminalCapabilities,terminalTrueColor} from './terminal-capabilities.ts';
import {createTerminalSessionPlan} from './terminal-session.ts';
import {DEFAULT_THEME_ACCENT} from './theme-catalog.ts';
import {createThemeStore} from './theme-store.ts';
import {createTerminalSizeStore,paintedBorders,terminalFrameProps} from './components/terminal-shell.ts';
import {developmentLogError} from '../diagnostics/development-log.ts';
import {formatExitOutput,type ExitOutputMode,type TuiExitSnapshot} from './exit-output.ts';
import {MOUSE_OFF,MOUSE_ON,installMouseFilter,mouseWanted} from './mouse.ts';
import type {UiNotifications} from '../config/types.ts';
import {createTerminalNotifications} from './notifications.ts';
import {installFocusFilter} from './focus.ts';
import {installConsoleCapture} from './console-capture.ts';
import {createConsoleLogFile} from './console-log-file.ts';
import {batchSynchronizedFrames} from './frame-batcher.ts';
import {createTerminalBackground,terminalBackgroundWanted} from './terminal-background.ts';

/** The streams and modules run.ts touches; tests pass fakes (R1 E10 ordering test), production passes nothing. */
export type RunInkTuiIo={inkInstance?:(stdout:object)=>Promise<any>;load?:()=>Promise<{React:any;Ink:any;createTuiAppComponent:any}>;stdin?:{isTTY?:boolean};stdout?:NodeJS.WriteStream;env?:Record<string,string|undefined>;installRowWriter?:(stdout:NodeJS.WriteStream)=>Promise<boolean>;installConsoleCapture?:typeof installConsoleCapture};
/* React's own object (`.default` = module.exports): in the bundle, with code splitting, the React chunk exports only
   `default` (startup stage 01/10); from the sources `.default` is the same object. */
export async function loadTuiModules(){preloadProductionReact();return{React:(await import('react')).default,Ink:await import('ink'),createTuiAppComponent:(await import('./app.ts')).createTuiAppComponent};}

/* Stage 5 (registro 12): Ink throttles frames to `maxFps`, default 30, so a key right after another frame waited up to
   34 ms; measured p95 key→screen while an answer streams: 48 ms at 30, 20 ms at 120. Codex caps at 120 too (PR #39057);
   events are already coalesced at 16 ms by the render coordinator, so the higher cap mostly lets input through. */
export const TUI_MAX_FPS=120;
/** How long a failed start waits for Ink to leave the alternate screen before its error goes on (N2, 13/10/2026). */
const SCREEN_LEAVE_WAIT_MS=1_000;
/*
 * The right click's paste (owner 08/10/2026). The clipboard goes back into the input the way a terminal's own paste arrives —
 * `ESC[200~ … ESC[201~`, which Ink's paste channel reads — so it lands where a paste lands (the composer, a picker's query, a
 * key field) and folds into `[Pasted text #N +X lines]` the same way. The clipboard's ESC characters are dropped first: a
 * `ESC[201~` inside it would end the paste early and turn the rest into keys.
 */
export function bracketedClipboardPaste(text:string):string{return `\u001b[200~${text.replace(/\u001b/gu,'')}\u001b[201~`;}
async function pasteClipboard(stdin:any,read:()=>Promise<string|null>=readClipboardText){
  const text=await read();
  if(!text)return;
  try{stdin.unshift(Buffer.from(bracketedClipboardPaste(text),'utf8'));stdin.emit('readable');}catch{/* the input is gone */}
}
export async function runInkTui({exitOutput='transcript',mouse,notifications,reduceMotion,...props}:TuiAppProps&{exitOutput?:ExitOutputMode;mouse?:boolean;notifications?:UiNotifications;reduceMotion?:boolean},io:RunInkTuiIo={}):Promise<void>{
  let React:any,Ink:any,createTuiAppComponent:any;
  try{
    ({React,Ink,createTuiAppComponent}=await (io.load??loadTuiModules)());
  }catch{
    throw new Error('TUI_DEPENDENCY_UNAVAILABLE');
  }
  const stdout=io.stdout??process.stdout,env=io.env??process.env;
  const capabilities=detectTerminalCapabilities({stdinIsTTY:Boolean((io.stdin??process.stdin).isTTY),stdoutIsTTY:Boolean(stdout.isTTY),color:props.invocation.color!==false,env,reduceMotion:reduceMotion===true});
  /* R5b D4 (Q-R5-14): the theme is live — one store, read here for the painted background and by the app for its colours,
     so /theme can preview and change it without a restart. mono still means no colour and no motion (theme-store.ts).
     The session is planned on the terminal's own capabilities, so leaving mono for a colour theme paints the background. */
  const themeStore=createThemeStore(capabilities,props.uiTheme??DEFAULT_THEME_ACCENT);
  const effectiveCapabilities=themeStore.getSnapshot().capabilities;
  const session=createTerminalSessionPlan({capabilities,env});
  const terminalNotifications=createTerminalNotifications({write:text=>stdout.write(text),env,setting:notifications??'auto'});
  let mouseOff=()=>{},focusOff=()=>{};
  /* 0.6.11 (owner 17/10): the theme's background fills the whole window (terminal-background.ts). Given back with everything else
     the screen took, as soon as the app asks to leave, and on any exit of the process. */
  const terminalBackground=terminalBackgroundWanted({env,paintBackground:session.paintBackground,alternateScreen:session.alternateScreen,interactive:session.mode!=='plain'&&effectiveCapabilities.interactive})
    ?createTerminalBackground(text=>{stdout.write(text);}):null;
  let backgroundOff=()=>{};
  const inputOff=()=>{terminalNotifications.dispose();focusOff();mouseOff();backgroundOff();};
  /* UI phase stage 2: samples are kept only with TALOS_TUI_RENDER_METRICS=1 (metrics.ts createTuiRenderMetrics). */
  const renderMetrics=createTuiRenderMetrics(env);
  const coordinator=createRenderCoordinator({profiler:createTuiMetricsProfiler({sink:renderMetrics.sink})});
  /* UI Phase 0 D2: borders take the painted background too (terminal-shell.ts `paintedBorders`). */
  const paintedInk=paintedBorders(React,Ink,()=>session.paintBackground?themeStore.getSnapshot().theme.colors.background:undefined);
  /* UI Phase 3: the mouse goes off the moment the app asks to leave. Under ConPTY a switch-off reaches the terminal only
     while the input is still raw (measured 27/09: a raw child's `?1000l` is forwarded, one written after Ink's unmount is
     not), and Ink leaves raw mode while unmounting — so `exit()` switches the mouse off first. */
  const leavingInk={...paintedInk,useApp:()=>{const app=Ink.useApp();return{...app,exit:(...args:any[])=>{inputOff();return app.exit(...args);}};}};
  const TuiApp=createTuiAppComponent(React,leavingInk,capabilities,undefined,themeStore);
  const terminalSize=createTerminalSizeStore(stdout,{rows:30,columns:100},error=>developmentLogError('tui.resize.failure',error,{},'tui-run'));
  /* R1 lane contract: the app reports its last transcript once, as it exits (TuiAppProps.onExit, lane L). */
  let exitSnapshot:TuiExitSnapshot|null=null;
  /* UI Phase 3: the mouse goes off here, while the app unmounts and BEFORE Ink leaves the alternate screen: a switch-off
     written after `?1049l` never reached the terminal under ConPTY (measured 27/09, s16), so the terminal kept reporting. */
  const onExit=(snapshot:TuiExitSnapshot)=>{exitSnapshot=snapshot;inputOff();};
  const Root=()=>{
    const size=React.useSyncExternalStore(terminalSize.subscribe,terminalSize.getSnapshot,terminalSize.getSnapshot);
    const background=React.useSyncExternalStore(themeStore.subscribe,themeStore.getSnapshot,themeStore.getSnapshot).theme.colors.background;
    const frameProps=terminalFrameProps({session,...(background?{background}:{}),rows:size.rows,columns:size.columns});
    return React.createElement(Ink.Box,frameProps,React.createElement(TuiApp,{...props,paintedBackground:session.paintBackground,renderCoordinator:coordinator,terminalSize:size,onExit,mouseWheel,mouseSelection,terminalNotifications,consoleWarnings}));
  };
  /* E6 (lane I): with TALOS_TUI_RENDER_METRICS=1 count bytes, DEC 2026 frames, clears and Ink renders in-process. */
  const metricsTap=renderMetrics.enabled?createTuiRenderMetricsTap({stdout,sink:renderMetrics.sink}):null;
  /* UI Phase 3 (owner 27/09): the wheel scrolls the conversation (mouse.ts); the app subscribes to it. */
  const wheelListeners=new Set<(delta:-1|1)=>void>();
  const mouseWheel={subscribe(listener:(delta:-1|1)=>void){wheelListeners.add(listener);return()=>{wheelListeners.delete(listener);};}};
  /* Stage 6c (owner 02/10, «selezione della CLI»): the selection TALOS draws (pointer-selection.ts) once the row writer and the
     mouse are in place; the app hears what was copied (the mockup's toast), clears it on a key, copies it again on Ctrl+C. */
  const copiedListeners=new Set<(info:CopiedInfo)=>void>();
  let pointerSelection:ReturnType<typeof createPointerSelection>|null=null;
  /* stage 6c «tutto cliccabile»: the app's click targets (hit-map.ts) and how it runs one, set once the app is up */
  let clickHandler:ClickHandler|null=null;
  const mouseSelection={
    subscribe(listener:(info:CopiedInfo)=>void){copiedListeners.add(listener);return()=>{copiedListeners.delete(listener);};},
    key(){pointerSelection?.key();},active:()=>Boolean(pointerSelection?.text()),
    copyAgain:async()=>pointerSelection?await pointerSelection.copyAgain():false,
    onClick(handler:ClickHandler|null){clickHandler=handler;},
  };
  /* Owner decision 02/10 («Nel registro + avviso discreto», registro 12): on an interactive screen the console belongs to the
     TUI. The kernel runs in this process; its console output (a failed save, pdf.js's warnings) goes to logs/console.log,
     the file `talos logs` reads, never over the frame, and Ink's own console patch is off. Real warnings and errors are
     counted for the status row. Put back as soon as the TUI ends, before the exit output. */
  const consoleListeners=new Set<()=>void>();let consoleCount=0;
  const consoleCapture=session.mode!=='plain'&&effectiveCapabilities.interactive&&props.paths?.logsRoot
    ?(io.installConsoleCapture??installConsoleCapture)({record:createConsoleLogFile({dir:props.paths.logsRoot}),onCount:(count:number)=>{consoleCount=count;for(const listener of consoleListeners)listener();}})
    :null;
  const consoleWarnings={subscribe(listener:()=>void){consoleListeners.add(listener);return()=>{consoleListeners.delete(listener);};},getSnapshot:()=>consoleCount};
  /* Stage 5, cure 2 (frame-batcher.ts): each synchronized frame reaches ConPTY as one write (10.2 → 3.2 ms per key). */
  const unbatch=session.mode!=='plain'&&effectiveCapabilities.interactive?batchSynchronizedFrames(stdout):()=>{};
  /* R4-G (gate red 07/10: s31 and s33 lost their focus-out): the input modes come BEFORE the first frame, as Codex's set_modes()
     (tui/src/tui.rs:238) and Pi's start() (packages/tui/src/terminal.ts:174) do. The composer is the first frame since P-A, so the
     screen can be used the moment it is drawn, and a terminal drops a focus report the app has not asked for (ConPTY: measured, the
     composer was on screen ~5 ms before `?1004h`; 10 of 14 focus-outs sent right then never arrived). The reports are taken out of
     stdin.read first, then the terminal is asked for them. The filters keep the order the REV-ESC-PTY analysis assumed (mouse first,
     focus outside it). The mouse reports themselves are asked for later (MOUSE_ON, below), once the row writer is in. */
  const stdin:any=io.stdin??process.stdin;
  const mouseOn=typeof stdin.read==='function'&&mouseWanted({alternateScreen:session.alternateScreen,interactive:session.mode!=='plain'&&effectiveCapabilities.interactive,setting:mouse});
  let removeMouseFilter=()=>{};
  /* owner 09/10/2026 («Solo dove funziona»): the hand over what a click opens, in a terminal that implements OSC 22 */
  const pointerShape=mouseOn&&pointerShapeSupported(env)?createPointerShape(sequence=>{stdout.write(sequence);}):null;
  /* owner 31/10 and 01/11: the element under the pointer lights up wherever motion reports arrive (measured in Windows Terminal), never over
     SSH, where each cell is a packet: there the click stays. The hand stays where the terminal draws it. */
  const hoverWanted=mouseOn&&!(env.SSH_CONNECTION||env.SSH_CLIENT||env.SSH_TTY);
  let hover:Hover|null=null;
  if(mouseOn){
    removeMouseFilter=installMouseFilter(stdin,delta=>{for(const listener of wheelListeners)listener(delta);},event=>{
      /* the motion with no button held (DEC 1003): the element under it lights up, and the hand where the terminal has one */
      if(event.kind==='drag'&&event.button===3){hover?.move({row:event.row,col:event.col});return;}
      hover?.clear();
      /* owner 08/10/2026 («tasto destro non pasta»): the right button is TALOS's now, so it pastes the clipboard itself */
      if(event.kind==='press'&&event.button===2){void pasteClipboard(stdin);return;}
      void pointerSelection?.pointer(event);
    });
    mouseOff=()=>{mouseOff=()=>{};removeMouseFilter();};
  }
  /* Gate red 13/10/2026 (s48, the first Shift+Tab after launch read as Tab): raw mode comes BEFORE the first frame too. Ink turns it on in the
     effect of its input hook, after the frame, and on Windows a key that reaches the console before raw mode is handed over later as its character:
     Shift+Tab (`ESC [ Z`) came out as a plain Tab (measured under ConPTY with a bare Node child: raw mode 0 ms after the frame -> Tab 10 of 10, before
     it -> Shift+Tab 10 of 10; on the built CLI 1 in 6 at the first paint, more under load). Ink's own switch-on stays (it is the same call
     again) and so does its switch-off at unmount; the `finally` below gives raw mode back only if Ink did not. */
  /* Review of 0.6.2 (13/10/2026): the early raw mode was switched on OUTSIDE the `try/finally` that gives it back, so a throw from
     Ink's render, from the row writer or from the input-paint hook left the person's terminal in raw mode (no echo, no line
     editing, Ctrl+C not a signal) under the error message, with the screen still mounted and the filters still on stdin. From the
     switch-on to the end is one `try` now: every way out goes through the `finally` below, which also takes down a screen that was
     drawn and never reached its wait. */
  let rawModeEarly=false;
  let rendered:{waitUntilExit():Promise<unknown>;unmount():void}|null=null;let ended=false;
  let inputPaintOff=()=>{};
  try{
  if(typeof stdin.read==='function'&&stdin.isTTY&&typeof stdin.setRawMode==='function'&&session.mode!=='plain'&&effectiveCapabilities.interactive){
    try{stdin.setRawMode(true);rawModeEarly=true;}catch{/* a terminal that refuses: Ink asks again and reports it as before */}
  }
  if(terminalBackground){
    const paint=()=>{terminalBackground.apply(themeStore.getSnapshot().theme.colors.background);};
    paint();
    const unsubscribe=themeStore.subscribe(paint);
    const onProcessExit=()=>{try{terminalBackground.restore();}catch{/* the terminal is gone */}};
    process.once('exit',onProcessExit);
    backgroundOff=()=>{backgroundOff=()=>{};unsubscribe();process.removeListener('exit',onProcessExit);try{terminalBackground.restore();}catch{/* the terminal is gone */}};
  }
  if(typeof stdin.read==='function'&&session.mode!=='plain'&&effectiveCapabilities.interactive){
    const removeFocus=installFocusFilter(stdin,terminalNotifications.focus);
    process.once('exit',inputOff);
    focusOff=()=>{focusOff=()=>{};removeFocus();process.removeListener('exit',inputOff);};
    terminalNotifications.start();
  }
  const screen:{waitUntilExit():Promise<unknown>;unmount():void}=rendered=Ink.render(React.createElement(Root),{
    ...(metricsTap?metricsTap.inkOptions:{}),
    ...(consoleCapture?{patchConsole:false}:{}),
    stdout,
    exitOnCtrlC:false,
    interactive:session.mode==='plain'?false:effectiveCapabilities.interactive,
    alternateScreen:session.alternateScreen,
    maxFps:TUI_MAX_FPS,
  });
  /* UI phase stage 2, cure 2c: on the alternate screen the TALOS row writer draws Ink's frames (row-writer.ts): only the
     rows that changed, a full redraw on every size change. TALOS_TUI_FULL_REPAINT=1 keeps Ink's own full rewrite, for a
     terminal that shows leftovers (as Claude Code's CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT). */
  /* Startup stage 1 (owner 02/10): the kernel loads while the TUI is on screen. If it fails, the TUI ends and this call
     rejects with the kernel's own error, so main reports it as when it failed before the screen. */
  let startupFailure:{error:unknown}|null=null;
  props.startup?.then(()=>{},(error:unknown)=>{startupFailure={error};screen.unmount();});
  const interactiveSession=session.mode!=='plain'&&effectiveCapabilities.interactive;
  if(session.alternateScreen&&interactiveSession&&env.TALOS_TUI_FULL_REPAINT!=='1')await (io.installRowWriter??installRowWriter)(stdout);
  /* The mouse reports are asked for here, once the row writer is in (the filter that takes them out of stdin was installed before
     the first frame, see above). They are switched off as soon as the TUI ends, and on any exit of the process (a crash must not
     leave the terminal reporting). */
  if(mouseOn){
    const writer=rowWriterFor(stdout);
    if(writer)pointerSelection=createPointerSelection({writer,column:cell=>clickHandler?.column?.(cell)??null,copy:text=>copyText(text,{writeTerminal:sequence=>{stdout.write(sequence);}}),onCopied:info=>{for(const listener of copiedListeners)listener(info);},target:cell=>clickHandler?.target(cell)??null,run:action=>clickHandler?.run(action)});
    if(writer&&hoverWanted){
      hover=createHover({targetAt:cell=>clickHandler?.element?.(cell)??[],paint:targets=>writer.hover(targets),...(pointerShape?{shape:(over:boolean)=>pointerShape.hover(over)}:{})});
      writer.onFrame(()=>{clickHandler?.frame?.();hover?.refresh();});
      if(session.paintBackground&&terminalTrueColor(env))writer.hoverTint(()=>{
        const {background,foreground}=themeStore.getSnapshot().theme.colors;
        return/^#[0-9a-f]{6}$/iu.test(background??'')&&/^#[0-9a-f]{6}$/iu.test(foreground??'')?{background:background!,foreground:foreground!}:null;
      });
    }
    const off=()=>{pointerShape?.reset();stdout.write(hoverWanted?HOVER_OFF+MOUSE_OFF:MOUSE_OFF);};
    const onProcessExit=()=>{try{off();}catch{/* the terminal is gone */}};
    process.once('exit',onProcessExit);stdout.write(hoverWanted?MOUSE_ON+HOVER_ON:MOUSE_ON);
    mouseOff=()=>{mouseOff=()=>{};try{off();}finally{removeMouseFilter();process.removeListener('exit',onProcessExit);}};
  }
  /* Stage 5, cure 3 (input-paint.ts): a frame caused by input is painted at once, not at the throttle window's end. */
  if(interactiveSession&&typeof stdin.on==='function'){const ink=await (io.inkInstance??inkInstanceFor)(stdout);if(ink)inputPaintOff=installInputPaint({stdin,ink});}
    await screen.waitUntilExit();
    ended=true;
    inputOff();
    if(startupFailure)throw (startupFailure as {error:unknown}).error;
    metricsTap?.dispose(); /* the exit output below is not TUI rendering */
    /* E10 / Q-R1-4: Ink resolves waitUntilExit only after it has written exitAlternativeScreen (ink.js 7.1.1:548-552,
       572-583), so this lands on the primary screen and survives in scrollback. Plain mode never had an alternate
       screen and already left everything append-only (E14). */
    if(session.alternateScreen){const text=formatExitOutput(exitSnapshot,{mode:exitOutput,color:themeStore.getSnapshot().capabilities.color});if(text)stdout.write(text);}
  }
  finally{
    /* a screen that was drawn and whose start then failed: it is taken down here (Ink gives the terminal back as it unmounts), and
       the start's own error is the one that is thrown */
    /* Second review of 0.6.2 (13/10/2026, N2): Ink leaves the alternate screen as it unmounts and resolves its wait only once it
       has (ink.js 7.1.1:548-583). The error went on at once, so main wrote it INSIDE the alternate screen and it was gone with
       it. The leave is awaited, for a bounded time: a screen that never finishes leaving must not keep the error from being said. */
    if(rendered&&!ended){
      const drawn=rendered;let giveUp:ReturnType<typeof setTimeout>|undefined;
      try{
        drawn.unmount();
        await Promise.race([Promise.resolve().then(()=>drawn.waitUntilExit()).then(()=>{},()=>{}),new Promise<void>(resolve=>{giveUp=setTimeout(resolve,SCREEN_LEAVE_WAIT_MS);})]);
      }catch{/* the start's error stands */}
      finally{if(giveUp!==undefined)clearTimeout(giveUp);}
    }
    consoleCapture?.restore();
    inputOff();
    if(rawModeEarly&&stdin.isRaw){try{stdin.setRawMode(false);}catch{/* the terminal is gone */}}
    terminalSize.dispose();
    coordinator.dispose();
    inputPaintOff();
    unbatch();
    metricsTap?.dispose();
    const summary=renderMetrics.summary();
    if(summary)process.stderr.write(`${JSON.stringify({schema:'talos.cli.tui-render-metrics.v1',...summary})}\n`);
  }
}
