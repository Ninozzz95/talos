<?php

declare(strict_types=1);

namespace Kadmos\Tool;

final class ProceduralToolCompiler
{
    /**
     * @param list<ToolCall> $calls
     * @param array<string, ProceduralToolSpec> $registry
     */
    public function compile(
        array $calls,
        array $registry,
        ProceduralCompileContext $context,
        ProceduralBudget $budget,
        ProceduralLoopGuard $loopGuard,
    ): ProceduralPlan {
        if ($context->cancellationRequested) {
            return new ProceduralPlan(ProceduralPlan::CANCELLED, [], [], [[
                'code' => 'TALOS_TOOL_TURN_CANCELLED',
                'message' => 'The procedural turn was cancelled before compilation.',
            ]]);
        }
        if ($context->deadlineExceeded()) {
            return new ProceduralPlan(ProceduralPlan::TIMED_OUT, [], [], [[
                'code' => 'TALOS_TOOL_DEADLINE_EXCEEDED',
                'message' => 'The procedural turn deadline was exceeded before compilation.',
            ]]);
        }

        $validationFault = $this->validateInputs($calls, $registry, $context);
        if ($validationFault !== null) {
            $state = in_array($validationFault['code'], ['TALOS_TOOL_NOT_ALLOWED', 'TALOS_BROWSER_SESSION_REQUIRED'], true)
                ? ProceduralPlan::FAILED_POLICY
                : ProceduralPlan::FAILED_VALIDATION;

            return new ProceduralPlan($state, [], [], [$validationFault]);
        }

        $budgetFault = $budget->violation($calls, $registry, $context->usage);
        if ($budgetFault !== null) {
            return new ProceduralPlan(ProceduralPlan::BUDGET_EXHAUSTED, [], [], [$budgetFault]);
        }

        $workingGuard = clone $loopGuard;
        $nodes = [];
        $nodeIds = [];
        $finalizationDependencies = [];
        $lastBrowserMutation = null;
        $browserReaders = [];
        $browserStateVersion = $context->stateVersion;
        $lastSerializedNode = null;
        $awaitingApproval = false;

        foreach ($calls as $index => $call) {
            $spec = $registry[$call->name];
            $isBrowserTool = str_starts_with($call->name, 'browser_');
            $nodeStateVersion = $isBrowserTool ? $browserStateVersion : $context->stateVersion;
            $decision = $workingGuard->inspect(
                $call,
                $nodeStateVersion,
                $context->evidenceHash,
                $context->isRetry($call->providerCallId),
            );
            if (! $decision->allowed) {
                return new ProceduralPlan(ProceduralPlan::LOOP_BLOCKED, [], [], [[
                    'code' => $decision->code ?? 'TALOS_TOOL_LOOP_DETECTED',
                    'message' => 'A repeated procedural tool call was blocked.',
                    'call_id' => $call->providerCallId,
                ]]);
            }

            $nodeId = $this->nodeId($call, $context, $index);
            if (isset($nodeIds[$nodeId])) {
                return new ProceduralPlan(ProceduralPlan::FAILED_VALIDATION, [], [], [[
                    'code' => 'TALOS_TOOL_NODE_ID_COLLISION',
                    'message' => 'Procedural node identity collided.',
                    'call_id' => $call->providerCallId,
                ]]);
            }
            $nodeIds[$nodeId] = true;
            $dependencies = [];
            if ($isBrowserTool && $spec->mutatesState) {
                $dependencies = array_values(array_unique(array_filter([$lastBrowserMutation, ...$browserReaders], 'is_string')));
                $lastBrowserMutation = $nodeId;
                $browserReaders = [];
            } elseif ($isBrowserTool) {
                $dependencies = $lastBrowserMutation === null ? [] : [$lastBrowserMutation];
                $browserReaders[] = $nodeId;
            } elseif (! $spec->parallelSafe && $lastSerializedNode !== null) {
                $dependencies = [$lastSerializedNode];
            }
            if (! $spec->parallelSafe) {
                $lastSerializedNode = $nodeId;
            }

            $node = new ProceduralNode(
                id: $nodeId,
                type: $spec->nodeType,
                call: $call,
                context: $context->forNode($nodeId, $spec, $call, $nodeStateVersion),
                dependencies: $dependencies,
                fingerprint: $decision->fingerprint,
                requiresApproval: $spec->requiresApproval,
                producesEvidence: $spec->producesEvidence,
            );
            $nodes[] = $node;
            if ($spec->producesEvidence) {
                $finalizationDependencies[] = $nodeId;
            }
            if ($isBrowserTool && $spec->mutatesState) {
                $browserStateVersion++;
            }
            $awaitingApproval = $awaitingApproval || $spec->requiresApproval;
        }

        $loopGuard->adopt($workingGuard);

        return new ProceduralPlan(
            $awaitingApproval ? ProceduralPlan::AWAITING_APPROVAL : ProceduralPlan::DAG_COMPILED,
            $nodes,
            $finalizationDependencies,
            [],
        );
    }

    /**
     * @param list<ToolCall> $calls
     * @param array<string, ProceduralToolSpec> $registry
     * @return array{code: string, message: string, call_id?: string}|null
     */
    private function validateInputs(array $calls, array $registry, ProceduralCompileContext $context): ?array
    {
        if (! array_is_list($calls)) {
            return ['code' => 'TALOS_TOOL_CALL_LIST_INVALID', 'message' => 'Procedural tool calls must be a list.'];
        }
        $callIds = [];
        foreach ($calls as $call) {
            if (! $call instanceof ToolCall) {
                return ['code' => 'TALOS_TOOL_CALL_INVALID', 'message' => 'Procedural tool calls must be typed.'];
            }
            if (isset($callIds[$call->providerCallId])) {
                return ['code' => 'TALOS_TOOL_CALL_ID_DUPLICATE', 'message' => 'Provider tool call IDs must be unique.', 'call_id' => $call->providerCallId];
            }
            $callIds[$call->providerCallId] = true;
            $spec = $registry[$call->name] ?? null;
            if (! $spec instanceof ProceduralToolSpec || $spec->toolName !== $call->name) {
                return ['code' => 'TALOS_TOOL_NOT_ALLOWED', 'message' => 'The procedural tool is not present in the server-owned registry.', 'call_id' => $call->providerCallId];
            }
            if (str_starts_with($call->name, 'browser_') && $context->browserSessionId === null) {
                return ['code' => 'TALOS_BROWSER_SESSION_REQUIRED', 'message' => 'A browser session is required for this procedural tool.', 'call_id' => $call->providerCallId];
            }
        }

        return null;
    }

    private function nodeId(ToolCall $call, ProceduralCompileContext $context, int $index): string
    {
        $material = ProceduralLoopGuard::canonicalJson([
            'run_id' => $context->runId,
            'turn_id' => $context->turnId,
            'provider_call_id' => $call->providerCallId,
            'index' => $index,
            'tool' => $call->name,
            'arguments' => $call->arguments,
        ]);

        return 'tool-'.substr(hash('sha256', $material), 0, 40);
    }
}
