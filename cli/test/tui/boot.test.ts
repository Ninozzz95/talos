import assert from 'node:assert/strict';
import test from 'node:test';
import {BOOT_FRAMES,bootLabel} from '../../src/tui/boot.ts';

test('compatibility boot surface is deterministic while new boot sequence owns animation',()=>{
 assert.equal(BOOT_FRAMES.length,6);
 assert.match(bootLabel(0,'loading'),/TALOS/u);
 assert.match(bootLabel(99,'ready'),/ready/i);
});
