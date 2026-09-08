import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeHost } from './native-host.mjs';

test('AQ-H01 incomplete native host configuration fails before spawn', async () => {
  await assert.rejects(createNativeHost({ arm: 'hermes' }), /NATIVE_HOST_CONFIGURATION/);
});

test('AQ-H02 native host never accepts a cloud transport', async () => {
  await assert.rejects(createNativeHost({ arm: 'lcm', home: 'isolated', sources: [{name:'hermes',path:'pin'},{name:'lcm',path:'pin'}], bridge: { baseUrl: 'https://api.example.com/v1', token:'fixture' }, model:'fixture', sessionId:'fixture', fixtureDir:'fixture' }), /NATIVE_HOST_LOOPBACK_REQUIRED/);
});
