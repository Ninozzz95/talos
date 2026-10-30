/*
 * Owner 28/10/2026 sera: sfondo Calm variante B «Respiro e luce» (bozzetto approvato) e sfondo animato acceso di serie. La scena di prima
 * cambiava in modo visibile lo 0,08% dello schermo in 4 s. Poi «più leggera» (owner, stessa sera): la B piena portava il testo secondario a
 * 3,3:1. Misurata sull'app costruita: 0,9% (scuro) e 5,1% (chiaro) in 4 s, testo secondario ≥ 4,64:1, principale ≥ 10,8:1 (W3C F83).
 * Stesse costanti della scena mobile (`motion-v6/scenes/complex/calm.ts`, CALM-B-01..03 del Mobile).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

globalThis.window ??= {};
await import('../../src/motion/desktop-scenes.js');
const calm = window.TalosMobileScenes.find((s) => s.id === 'calm');

const COLORI = { accent: '#c08b3c', secondary: '#8daaa2', border_strong: '#7a7a79', surface_elevated: '#1a1b1d', background: '#1e1f22',
  focus: '#d8a650', info: '#7f9fc4', success: '#77a884', warning: '#d8a650', danger: '#d87d72' };
const input = { viewport: { width: 1600, height: 900 }, palette: { dark: COLORI, light: COLORI }, colorMode: 'dark',
  parameters: { speed: 100, intensity: 20, glow: 10, density: 100, depth: 92, trails: 50, contrast: 80, parallax: 0 },
  effectiveQuality: { tier: 'balanced', densityScale: 1 } };
/* l'alfa della scena con i parametri di serie (intensità 20, contrasto 80): b · (0,32 + 0,16) · (0,7 + 0,368) */
const alfa = (b) => Math.min(0.94, Math.max(0.006, b * 0.48 * 1.068));

function disegna(state, geometry) {
  const gradienti = []; const alfe = []; const archi = [];
  const ctx = new Proxy({}, {
    get: (_t, nome) => {
      if (nome === 'createRadialGradient') return (...a) => { const g = { a, stop: [], addColorStop(o, c) { this.stop.push([o, c]); } }; gradienti.push(g); return g; };
      if (nome === 'arc') return (...a) => archi.push(a);
      return () => {};
    },
    set: (_t, nome, valore) => { if (nome === 'globalAlpha') alfe.push(valore); return true; },
  });
  calm.draw({ context: ctx, state, geometry });
  return { gradienti, alfe, archi };
}

test('CALM-B-DESKTOP-01 — B «più leggera»: alone e luce d\'accento a alpha(0,07), linee a 0,2/0,14/0,14; il secondo gradiente è dall\'accento', () => {
  const state = calm.createState(7);
  const { geometry } = calm.prepare({ state, input });
  const { gradienti, alfe } = disegna(state, geometry);
  assert.equal(gradienti.length, 2, 'alone + luce');
  /* nell'ordine di disegno: alone, luce, orizzonte (bordo), tratto d'accento, filamento */
  for (const [i, b, nome] of [[0, 0.07, 'alone'], [1, 0.07, 'luce'], [2, 0.2, 'orizzonte'], [3, 0.14, 'tratto'], [4, 0.14, 'filamento']]) {
    assert.ok(Math.abs(alfe[i] - alfa(b)) < 1e-9, `${nome} ${alfe[i]}`);
  }
  assert.deepEqual(gradienti[1].stop, [[0, COLORI.accent], [1, 'transparent']]);
  assert.ok(Math.abs(gradienti[1].a[5] - 1600 * 0.32) < 1e-9, 'raggio della luce max(W,H)·0,32');
});

test('CALM-B-DESKTOP-02 — la luce attraversa lo schermo in 30 s, da −20% a +120%, a fase continua; il respiro va a 0,31 rad/s', () => {
  const state = calm.createState(7);
  const { geometry } = calm.prepare({ state, input });
  const x0 = disegna(state, geometry).gradienti[1].a[0];
  assert.ok(Math.abs(x0 - 1600 * -0.2) < 1e-6, `parte da sinistra: ${x0}`);
  for (let i = 0; i < 300; i += 1) calm.update({ state, input, stepMs: 50 }); // 15 s
  const xMeta = disegna(state, geometry).gradienti[1].a[0];
  assert.ok(Math.abs(xMeta - 1600 * 0.5) < 1, `a metà traversata: ${xMeta}`);
  assert.ok(Math.abs(state.breath - 0.31 * 15) < 1e-6, `respiro ${state.breath}`);
  for (let i = 0; i < 300; i += 1) calm.update({ state, input, stepMs: 50 }); // altri 15 s: ricomincia da sinistra, senza tornare indietro
  const xGiro = disegna(state, geometry).gradienti[1].a[0];
  assert.ok(Math.abs(xGiro - 1600 * -0.2) < 1, `ricomincia: ${xGiro}`);
});

/* Owner 28/10 notte: «Acceso su tutti», tenuto spento finché Forge non era leggibile; col corridoio velato lo è (SFONDO-LEGGIBILE-01). */
test('CALM-B-DESKTOP-03 — lo sfondo animato è ACCESO di serie, ora che Forge è leggibile col corridoio velato', () => {
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.match(app, /\n\s+backgroundMotion: true, interfaceMotion: true, motionMode: 'adaptive',/u);
  assert.match(app, /themePresetVersione: 0, sceneOverrideVersione: 0, backgroundMotionVersione: 0,/u, 'una scelta timbrata resta la sua');
});
