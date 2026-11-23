/*
 * R3 CONTRACT (coordinator; types only). The facts a tool row states besides its label and target (owner decisions
 * Q-R3-1/2/3, gate E3/E4/E6): who ran it, why it was allowed to run, how it ended, how long it took, how it was isolated.
 * Lane S+P produces them (event adapter, session controller, approval coordinator) as the TuiEvents `tool.origin`,
 * `tool.decision`, `tool.facts` and `file.changed`; lane R+D reduces them into the transcript and renders them.
 * Neither lane changes these shapes; an addition goes through the coordinator.
 */
export type ToolOrigin='person'|'model';
/** Why a tool was allowed to run: the words are Q-R3-3 (`typed by you`, `you allowed once`, …, `allow: <rule>`). */
export type ToolDecisionKind='typed'|'once'|'session'|'always'|'rule'|'auto'|'accept-edits'|'full-access'|'all';
export type ToolDecision={kind:ToolDecisionKind;rule?:string;/** row 126 round 2: how many calls «Allow all the same calls of this answer» (`all`) covered */count?:number};
export type ToolIsolation='sandbox'|'host';
/**
 * R5 CONTRACT (S10, Q-R5-17; R5 gate finding 15): why a tool did NOT run. `person` only when the person was asked and said
 * no; a rule or the policy deciding alone is never worded as the person's refusal. `rule` is the rule text and `scope`
 * where it lives; `reason` is English (an Italian kernel reason is mapped at the source). Lane R produces it inside
 * `tool.facts`, lane S renders it.
 */
export type ToolDenial={by:'person'|'rule'|'policy'|'mode';rule?:string;scope?:string;reason?:string};
/** Structured facts only (gate E3): the kernel receipt's exit code and `durataMs`, the CLI's own isolation annotation. */
/** `duplicate` (owner 13/10/2026): the call was an identical copy the kernel discarded; it did not run and nobody stopped it. */
export type ToolFacts={exitCode?:number|null;durationMs?:number|null;isolation?:ToolIsolation|null;denial?:ToolDenial|null;duplicate?:boolean};
/** A file change the kernel reported (v2 StateDelta /file, gate E10): before is null for a new file. */
export type FileChange={path:string;before:string|null;after:string;toolCallId?:string};
