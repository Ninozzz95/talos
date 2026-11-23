import {createRequire} from 'node:module';

/* UI phase stage 2 (heap probe 01/10, registro 12): without NODE_ENV=production, react, react-reconciler and scheduler pick
   their DEVELOPMENT builds, and React 19.3's Performance Tracks then leave one `performance.measure` (with a cloned
   `detail`) per component per render in Node's timeline, never cleared: ~87 of the ~93 MB live after 100 turns, plus the
   slower development code. The packages read NODE_ENV once, when first required, so the production builds are loaded
   here, synchronously, before Ink: set NODE_ENV, require every entry that switches on it, put the old value back in the
   same tick. Nothing else runs in between, so no process TALOS starts for the person (an `npm install`, a test run)
   inherits a NODE_ENV it did not have. The later ESM `import('react')` / `import('ink')` reuse these CommonJS modules.
   Sources: react.dev «React Performance tracks»; Node 24 perf_hooks; cc-outline PR #57 (30/09/2026, same cure);
   Hermes main_tui_launch.py and Gemini CLI esbuild.config.js (both run their TUI in production). */
const SWITCHING_ENTRIES=['react','react/jsx-runtime','react-reconciler','react-reconciler/constants.js','scheduler'] as const;

let loaded=false;
export function preloadProductionReact():void{
  if(loaded)return;
  /* The bundle fixes NODE_ENV to production at build time (scripts/bundle.mjs): it carries only the production builds, and
     requiring React from node_modules here would load a second copy that Ink never uses. */
  if(typeof TALOS_BUNDLED!=='undefined'){loaded=true;return;}
  /* Resolved from Ink's own location, so these are the copies Ink will import. */
  const fromInk=createRequire(import.meta.resolve('ink'));
  /* the variable through `env`, not `process.env.NODE_ENV`: the bundle's build-time substitution of that expression must not
     touch this run-time change (it is not reached in the bundle, see above) */
  const env=process.env;
  const had=Object.prototype.hasOwnProperty.call(env,'NODE_ENV');const previous=env.NODE_ENV;
  env.NODE_ENV='production';
  try{for(const entry of SWITCHING_ENTRIES)fromInk(entry);loaded=true;}
  finally{if(had)env.NODE_ENV=previous;else delete env.NODE_ENV;}
}
