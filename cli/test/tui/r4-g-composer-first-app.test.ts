/*
 * P-A on the real TuiApp (the fixture of r1-layout): the screen a person sees from the first frame. The pure state is proven in
 * r4-g-composer-first.test.ts; this proves app.ts wires it — only a plain start skips the boot, a start with a session to load
 * keeps it while the runtime restores. The profile has launched before, so the boot plan is `short`.
 */
import assert from 'node:assert/strict';
import {rmSync} from 'node:fs';
import test,{after} from 'node:test';
import {bootPlan,currentBuildId,launchStatePath} from '../../src/tui/launch-state.ts';
import {CLI_VERSION,TALOS_BASE_COMMIT} from '../../src/version.ts';
import {hermeticProfile,mountApp,sleep,type MountedApp} from './r1-layout-fixture.ts';

const env=hermeticProfile();after(()=>env.restore());
/* The fixture's profile has launched with another version, which keeps the full boot (an update plays it). Record a launch with the
   app's own version and build, so the app's plan is `short`, the case P-A is about. */
bootPlan({dataRoot:env.paths.dataRoot,version:CLI_VERSION,build:currentBuildId()??TALOS_BASE_COMMIT,now:Date.now()});
const BOOT=/Press any key to skip|runtime synchronization|BOOT\s+\d+%|SIGNAL ACQUISITION/u;
const LOGO='████';
const composerLine=/^│ ›|^\s*>\s*$/mu;
const PLAIN={model:'openai:gpt-5-mini',permissionMode:'default'};

/** Every distinct non-blank frame from the mount until the composer shows, polled every 5 ms. */
async function framesUntilComposer(app:MountedApp,limitMs=8_000,stopAtComposer=true){
  const frames:string[]=[];const start=Date.now();
  while(Date.now()-start<limitMs){
    const screen=await app.screen();
    if(screen.text.trim()!==''&&frames.at(-1)!==screen.text)frames.push(screen.text);
    if(stopAtComposer&&composerLine.test(screen.text)&&!BOOT.test(screen.text)&&!screen.text.includes(LOGO))return frames;
    await sleep(5);
  }
  return frames;
}

test('P-A app: a plain start on a short boot paints the composer first — no frame shows the logo or the boot lines',async()=>{
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:PLAIN,immediate:true});
  try{
    const frames=await framesUntilComposer(app);
    assert.ok(frames.length>0,'nothing was painted');
    assert.match(frames[0]!,composerLine,`the first painted frame is not the composer:\n${frames[0]}`);
    for(const frame of frames){
      assert.doesNotMatch(frame,BOOT,`a boot line was painted:\n${frame}`);
      assert.ok(!frame.includes(LOGO),`the logo was painted:\n${frame}`);
    }
  }finally{app.unmount();}
});

for(const [name,invocation] of [['a resume',{...PLAIN,resume:'s1'}],['a fork',{...PLAIN,fork:'s1'}]] as const){
  test(`P-A app: ${name} has a session to load, so the boot stays on screen while the runtime restores, then the composer opens`,async()=>{
    const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation,restoreDelayMs:700,immediate:true});
    try{
      const frames=await framesUntilComposer(app);
      assert.ok(frames.some(frame=>BOOT.test(frame)||frame.includes(LOGO)),`no boot frame while the runtime restored (${frames.length} frames)`);
      assert.match(frames.at(-1)!,composerLine,'the composer never opened after the restore');
      assert.doesNotMatch(frames.at(-1)!,BOOT);
    }finally{app.unmount();}
  });
}

test('P-A app: a prompt on the command line keeps the boot while the provider readiness is checked',async()=>{
  const catalog={listModels:async()=>[],listProviders:async()=>[],chosenProvider:()=>null,readiness:async()=>{await sleep(600);return{ready:false,code:'NO_PROVIDER',message:'Choose a provider.'};}};
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:PLAIN,initialPrompt:'fix the build',catalog,immediate:true});
  try{
    const frames=await framesUntilComposer(app);
    assert.ok(frames.some(frame=>BOOT.test(frame)||frame.includes(LOGO)),`no boot frame while the readiness was checked (${frames.length} frames)`);
    assert.match(frames.at(-1)!,composerLine,'the composer never opened');
  }finally{app.unmount();}
});

/* Last in the file: it erases the launch record, so the profile is on its first launch again. */
test('P-A app: the first launch of a profile still plays the boot — only a short boot opens on the composer',async()=>{
  rmSync(launchStatePath(env.paths.dataRoot),{force:true});
  const app=await mountApp({cols:100,rows:30,root:env.root,paths:env.paths,history:[],invocation:PLAIN,immediate:true});
  try{
    const frames=await framesUntilComposer(app,600,false);
    assert.ok(frames.length>0,'nothing was painted');
    assert.match(frames[0]!,BOOT,`the first frame of a first launch is not the boot:
${frames[0]}`);
  }finally{app.unmount();}
});
