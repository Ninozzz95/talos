export type PermissionEffect='allow'|'ask'|'deny';
export type PermissionMode='default'|'acceptEdits'|'plan'|'auto'|'dontAsk'|'bypassPermissions';
export type PermissionAction={tool:'Read'|'Write'|'Edit'|'Bash'|'WebFetch'|'Mcp'|'Hook'|'Plugin'|'TalosService';resource?:string;command?:string;serverId?:string;operation?:string};
export type PermissionDecision={effect:PermissionEffect;rule?:string;reason:string};
export type RuleSetInput={allow:string[];ask:string[];deny:string[]};
export type CompiledRule={raw:string;effect:PermissionEffect;tool:PermissionAction['tool'];pattern:string};
