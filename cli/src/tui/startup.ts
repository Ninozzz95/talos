import type {ReasoningEffort} from '../config/types.ts';

/*
 * Startup stage 1 (owner 02/10; registro 12): what main decides once the kernel is loaded, after the TUI is already on
 * screen — the configured reasoning effort as applied (null: the model default), and the notices that main used to write
 * on stderr before the screen started. Resolved by `createDeferredRuntimeContext`'s prepare step (main.ts); rejects with
 * the kernel's error when it fails to load.
 */
export type TuiStartupNotice={code:string;message:string};
export type TuiStartup={reasoningEffort:ReasoningEffort|null;notices:readonly TuiStartupNotice[]};
