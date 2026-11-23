/* FA-LIVE-01: handoff 2026-09-27 §4.3.4. Changing the TUI mode must reach the next
 * turn of an existing session. Real controller, registry, kernel and context engine;
 * only the provider is fake, inside the existing isolated-profile fixture. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {dummyKey,hermetic} from '../provider/first-run-fixture.ts';
import {composeWithFake,MODEL,startScriptedProvider,textOf} from './r5a-r-fixture.ts';
import {createTuiSessionController} from '../../src/tui/session-controller.ts';
import {resetModelProfiles} from '../../src/runtime/model-profile.ts';
import {sessionModeOf} from '../../src/runtime/session-modes.ts';
import type {PermissionMode} from '../../src/security/types.ts';
import type {TuiEvent} from '../../src/tui/event-adapter.ts';

test.after(()=>resetModelProfiles());

test('FA-LIVE-01: Full access and manual reach the next turn of an existing plan session',
  {timeout:120_000},async()=>hermetic(async h=>{
    const key=dummyKey('deepseek');
    const fake=await startScriptedProvider({goodKey:key,respond:()=>({kind:'text',text:'Acknowledged.'})});
    let context:any;
    let controller:ReturnType<typeof createTuiSessionController>|undefined;
    const events:TuiEvent[]=[];
    const observed:Array<{mode:PermissionMode;registryPermission:string|null;providerSawReadOnly:boolean}>=[];
    try{
      context=await composeWithFake(h,fake.url,key);
      controller=createTuiSessionController({runtime:context.runtime,projectRoot:h.project,model:MODEL,
        mode:'plan',rules:{allow:[],ask:[],deny:[]},onEvent:event=>events.push(event),
        onError:error=>{throw error;}});
      /* F-P-001: Full access and manual are both the kernel's "On request" (the CLI's engine applies the mode), so the walk
         goes back to plan to show that each change reaches the registry; the CLI's own mode is checked below. */
      for(const [index,mode] of (['plan','bypassPermissions','plan','default'] as const).entries()){
        await controller.setMode(mode);
        assert.equal(controller.mode(),mode,'the controller itself accepted the new mode');
        const before=events.filter(event=>event.type==='run.completed').length;
        const requestBefore=fake.requests.length;
        const result=await controller.send(`Turn ${index+1}: acknowledge this message.`,{model:MODEL,running:false});
        const deadline=Date.now()+30_000;
        while(events.filter(event=>event.type==='run.completed').length<=before){
          const failed=events.find(event=>event.type==='run.failed');
          assert.equal(failed,undefined,`the real run failed before measuring permissions: ${JSON.stringify(failed)}`);
          assert.ok(Date.now()<deadline,'the real turn did not complete');
          await new Promise(resolve=>setTimeout(resolve,20));
        }
        assert.ok(fake.requests.length>requestBefore,'the next turn actually reached the provider');
        assert.equal(result.sessionId,controller.current(),'all turns use the same attached session');
        const row=context.registry.elenca().find((entry:any)=>entry.sessionId===result.sessionId);
        const messages=fake.requests.at(-1)!.body.messages as Array<{content:unknown}>;
        assert.equal(sessionModeOf(result.sessionId),mode,'the CLI remembers the mode its engine applies');
        observed.push({mode,registryPermission:row?.permessi??null,
          providerSawReadOnly:messages.some(message=>textOf(message.content).includes('Read only'))});
      }
      assert.deepEqual(h.network.blocked,[],'no external network attempt');
      console.log('FA-LIVE-01 evidence (synthetic profile only):',JSON.stringify(observed));
      assert.deepEqual(observed.map(row=>row.registryPermission),['Read only','On request','Read only','On request'],
        'the current CLI mode must reach the real registry before the next model turn');
    }finally{
      controller?.close();
      await context?.runtime.close?.();
      await fake.close();
    }
  }));
