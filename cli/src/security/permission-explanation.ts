import {compileRules,evaluateRules,type CompiledRules} from './evaluate.ts';
import {segmentShellCommand,type ShellCommandSegment} from './shell-segmentation.ts';
import type {PermissionAction,PermissionDecision,PermissionEffect,RuleSetInput} from './types.ts';

export type PermissionSegmentExplanation={command:string;operatorBefore:ShellCommandSegment['operatorBefore'];effect:PermissionEffect;reason:string;rule?:string};
export type PermissionExplanation={
  effect:PermissionEffect;
  reason:string;
  rule?:string;
  precedence:'deny > ask > allow';
  decisiveSegment:number|null;
  segments:PermissionSegmentExplanation[];
};
export type PermissionSimulation={effect:PermissionEffect;requiresApproval:boolean;explanation:PermissionExplanation};

function explanationForDecision(decision:PermissionDecision,segments:PermissionSegmentExplanation[],decisiveSegment:number|null):PermissionExplanation{
  return{effect:decision.effect,reason:decision.reason,...(decision.rule?{rule:decision.rule}:{}),precedence:'deny > ask > allow',decisiveSegment,segments};
}

export function explainPermission(rules:CompiledRules,action:PermissionAction,{projectRoot}:{projectRoot:string}):PermissionExplanation{
  if(action.tool!=='Bash')return explanationForDecision(evaluateRules(rules,action,{projectRoot}),[],null);
  let commandSegments:ShellCommandSegment[];
  try{commandSegments=segmentShellCommand(action.command??'');}catch{return explanationForDecision({effect:'deny',reason:'unsupported shell composition'},[],null);}
  const segments=commandSegments.map(segment=>{
    const decision=evaluateRules(rules,{...action,command:segment.command},{projectRoot});
    return{command:segment.command,operatorBefore:segment.operatorBefore,effect:decision.effect,reason:decision.reason,...(decision.rule?{rule:decision.rule}:{})};
  });
  for(const effect of ['deny','ask','allow'] as const){
    const decisiveSegment=segments.findIndex(segment=>segment.effect===effect);
    if(decisiveSegment>=0){const decisive=segments[decisiveSegment]!;return explanationForDecision({effect:decisive.effect,reason:decisive.reason,...(decisive.rule?{rule:decisive.rule}:{})},segments,decisiveSegment);}
  }
  return explanationForDecision({effect:'deny',reason:'unsupported shell composition'},segments,null);
}

export function simulatePermission({rules,action,projectRoot}:{rules:RuleSetInput;action:PermissionAction;projectRoot:string}):PermissionSimulation{
  const explanation=explainPermission(compileRules(rules),action,{projectRoot});
  return{effect:explanation.effect,requiresApproval:explanation.effect==='ask',explanation};
}

export function formatPermissionSimulation(simulation:PermissionSimulation):string{
  const explanation=simulation.explanation;
  const lines=[
    `Permission dry-run: ${simulation.effect}`,
    `Precedence: ${explanation.precedence}`,
  ];
  if(explanation.decisiveSegment!==null){
    const segment=explanation.segments[explanation.decisiveSegment];
    lines.push(`Decisive: segment ${explanation.decisiveSegment+1}${segment?` · ${segment.command}`:''} · ${explanation.reason}`);
  }else lines.push(`Decisive: ${explanation.reason}`);
  if(explanation.rule)lines.push(`Rule: ${explanation.rule}`);
  if(explanation.segments.length){
    lines.push('Segments:');
    explanation.segments.forEach((segment,index)=>{
      lines.push(`  ${index+1}. ${segment.effect} · ${segment.command}${segment.rule?` · ${segment.rule}`:''} · ${segment.reason}`);
    });
  }
  return lines.join('\n')+'\n';
}
