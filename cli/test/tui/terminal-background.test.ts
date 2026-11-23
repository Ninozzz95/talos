import assert from 'node:assert/strict';
import test from 'node:test';
import {RESET_TERMINAL_BACKGROUND,createTerminalBackground,terminalBackgroundSequence,terminalBackgroundWanted} from '../../src/tui/terminal-background.ts';

/* 0.6.11 (owner 17/10/2026): the theme's background fills the whole window — OSC 11 while the screen is up, OSC 111 on the way out. */
const ON={env:{},paintBackground:true,alternateScreen:true,interactive:true,platform:'linux' as NodeJS.Platform};

test('the theme colour becomes the OSC 11 that sets it; anything else sets nothing',()=>{
  assert.equal(terminalBackgroundSequence('#080B11'),'\u001b]11;rgb:08/0b/11\u001b\\');
  assert.equal(terminalBackgroundSequence('080b11'),'\u001b]11;rgb:08/0b/11\u001b\\');
  for(const color of [undefined,null,'','#fff','red','#08 0b11','#080b11; rm'])assert.equal(terminalBackgroundSequence(color as any),null,String(color));
  assert.equal(RESET_TERMINAL_BACKGROUND,'\u001b]111\u001b\\');
});

test('only on a painted, interactive alternate screen, never inside tmux or screen, and off with TALOS_TUI_TERMINAL_BACKGROUND=0',()=>{
  assert.equal(terminalBackgroundWanted(ON),true);
  assert.equal(terminalBackgroundWanted({...ON,paintBackground:false}),false,'mono theme / no colour');
  assert.equal(terminalBackgroundWanted({...ON,alternateScreen:false}),false,'plain mode');
  assert.equal(terminalBackgroundWanted({...ON,interactive:false}),false);
  assert.equal(terminalBackgroundWanted({...ON,env:{TMUX:'/tmp/tmux-1/default,1,0'}}),false);
  assert.equal(terminalBackgroundWanted({...ON,env:{STY:'1234.pts-0'}}),false);
  assert.equal(terminalBackgroundWanted({...ON,env:{TERM:'screen-256color'}}),false);
  assert.equal(terminalBackgroundWanted({...ON,env:{TALOS_TUI_TERMINAL_BACKGROUND:'0'}}),false);
});

test('sets once per colour, follows a theme change, resets what it set exactly once, and never resets what it did not set',()=>{
  const out:string[]=[];
  const background=createTerminalBackground(text=>{out.push(text);});
  background.restore();
  assert.deepEqual(out,[],'nothing set, nothing reset');
  background.apply('#080b11');background.apply('#080b11');
  background.apply('#101418');
  background.apply(undefined);
  background.apply('#080b11');
  background.restore();background.restore();
  assert.deepEqual(out,[
    '\u001b]11;rgb:08/0b/11\u001b\\',
    '\u001b]11;rgb:10/14/18\u001b\\',
    RESET_TERMINAL_BACKGROUND,
    '\u001b]11;rgb:08/0b/11\u001b\\',
    RESET_TERMINAL_BACKGROUND,
  ]);
});

test('on Windows only inside Windows Terminal (the system ConPTY absorbs OSC 111, review F1), unless TALOS_TUI_TERMINAL_BACKGROUND=1',()=>{
  const win={...ON,platform:'win32' as NodeJS.Platform};
  assert.equal(terminalBackgroundWanted(win),false,'the system console: the reset would be lost');
  assert.equal(terminalBackgroundWanted({...win,env:{WT_SESSION:'d584db63'}}),true,'Windows Terminal');
  assert.equal(terminalBackgroundWanted({...win,env:{WT_SESSION:''}}),false);
  assert.equal(terminalBackgroundWanted({...win,env:{TALOS_TUI_TERMINAL_BACKGROUND:'1'}}),true,'asked for');
  assert.equal(terminalBackgroundWanted({...win,env:{WT_SESSION:'d584db63',TALOS_TUI_TERMINAL_BACKGROUND:'0'}}),false,'off wins');
  assert.equal(terminalBackgroundWanted({...win,env:{WT_SESSION:'d584db63',TMUX:'/tmp/t,1,0'}}),false);
  assert.equal(terminalBackgroundWanted({...ON,platform:'darwin'}),true,'elsewhere as before');
  /* review 2 S3-2: a WT_SESSION inherited by another terminal (VS Code opened from a Windows Terminal tab), and WSL */
  assert.equal(terminalBackgroundWanted({...win,env:{WT_SESSION:'d584db63',TERM_PROGRAM:'vscode'}}),false,'VS Code started from Windows Terminal');
  assert.equal(terminalBackgroundWanted({...win,env:{WT_SESSION:'d584db63',TERM_PROGRAM:'vscode',TALOS_TUI_TERMINAL_BACKGROUND:'1'}}),true,'=1 still forces it');
  assert.equal(terminalBackgroundWanted({...ON,env:{WSL_DISTRO_NAME:'Ubuntu'}}),false,'WSL outside Windows Terminal');
  assert.equal(terminalBackgroundWanted({...ON,env:{WSL_INTEROP:'/run/WSL/1_interop'}}),false,'WSL, the other marker');
  assert.equal(terminalBackgroundWanted({...ON,env:{WSL_DISTRO_NAME:'Ubuntu',WT_SESSION:'d584db63'}}),true,'WSL inside Windows Terminal');
  assert.equal(terminalBackgroundWanted({...ON,env:{WSL_DISTRO_NAME:'Ubuntu',WT_SESSION:'d584db63',TERM_PROGRAM:'vscode'}}),false,'WSL in VS Code');
  assert.equal(terminalBackgroundWanted({...ON,env:{TERM_PROGRAM:'vscode'}}),true,'Linux and macOS are not touched by this rule');
});
