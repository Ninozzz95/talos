/* scripts/bundle.mjs defines TALOS_BUNDLED as true in the esbuild bundle; when the sources run it is not defined at all.
   Read it as `typeof TALOS_BUNDLED!=='undefined'`, written where it is used, so esbuild folds the test and drops the
   branch the bundle never takes. */
declare const TALOS_BUNDLED:boolean|undefined;
