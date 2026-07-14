<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Kadmos\NodeStatus;
use Kadmos\Tool\ProceduralBudget;
use Kadmos\Tool\ProceduralCompileContext;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralPlan;
use Kadmos\Tool\ProceduralToolCompiler;
use Kadmos\Tool\ProceduralToolSpec;
use Kadmos\Tool\ProceduralUsage;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolApprovalGrant;
use Kadmos\Tool\ToolApprovalAuthority;
use Kadmos\Tool\ToolResult;
use Kadmos\Workers\WorkerRegistry;

function assertProcedural(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function assertProceduralSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException($message.PHP_EOL.'Expected: '.var_export($expected, true).PHP_EOL.'Actual: '.var_export($actual, true));
    }
}

/** @param array<string, mixed> $arguments */
function proceduralCall(string $id, string $name, array $arguments = []): ToolCall
{
    return new ToolCall($id, $name, $arguments, null, []);
}

/** @param list<string> $retryCallIds */
function proceduralContext(
    int $stateVersion = 7,
    ?string $evidenceHash = null,
    array $retryCallIds = [],
    array $logicalCallIds = [],
    array $replayCallIds = [],
    ?ProceduralUsage $usage = null,
    string $observedAt = '2026-07-13T14:00:00+00:00',
    string $deadlineAt = '2026-07-13T15:00:00+00:00',
    bool $cancellationRequested = false,
): ProceduralCompileContext
{
    return new ProceduralCompileContext(
        userId: 'user-1',
        chatSessionId: 'chat-1',
        runId: 'run-1',
        turnId: 'turn-1',
        browserSessionId: 'browser-1',
        stateVersion: $stateVersion,
        deadlineAt: $deadlineAt,
        observedAt: $observedAt,
        cancellationRequested: $cancellationRequested,
        usage: $usage ?? new ProceduralUsage,
        evidenceHash: $evidenceHash,
        retryProviderCallIds: $retryCallIds,
        logicalCallIdsByProviderCallId: $logicalCallIds,
        replayProviderCallIds: $replayCallIds,
    );
}

/** @return array<string, ProceduralToolSpec> */
function proceduralRegistry(): array
{
    return [
        'browser_navigate' => new ProceduralToolSpec('browser_navigate', 'TOOL_BROWSER_NAVIGATE', 'browser.read', 'low', true, false, false, false),
        'browser_snapshot' => new ProceduralToolSpec('browser_snapshot', 'TOOL_BROWSER_SNAPSHOT', 'browser.read', 'low', false, true, false, true),
        'browser_read' => new ProceduralToolSpec('browser_read', 'TOOL_BROWSER_READ', 'browser.read', 'low', false, true, false, true),
        'browser_take_screenshot' => new ProceduralToolSpec('browser_take_screenshot', 'TOOL_BROWSER_SCREENSHOT', 'browser.read', 'low', false, true, false, true),
        'browser_click' => new ProceduralToolSpec('browser_click', 'TOOL_BROWSER_CLICK', 'browser.write', 'high', true, false, true, true),
        'browser_delete' => new ProceduralToolSpec('browser_delete', 'TOOL_BROWSER_DELETE', 'browser.write', 'critical', true, false, true, true),
        'web_search' => new ProceduralToolSpec('web_search', 'TOOL_WEB_SEARCH', 'web.search', 'low', false, true, false, true),
        'web_fetch' => new ProceduralToolSpec('web_fetch', 'TOOL_WEB_FETCH', 'web.fetch', 'low', false, true, false, true),
    ];
}

function proceduralCompiler(): ProceduralToolCompiler
{
    return new ProceduralToolCompiler;
}

function proceduralApprovalAuthority(): ToolApprovalAuthority
{
    return new class implements ToolApprovalAuthority {
        /** @var array<string, true> */
        private array $claimed = [];

        public function authorizes(ToolApprovalGrant $grant): bool
        {
            return $grant->actorId === 'operator-1'
                && $grant->capability === 'browser.write';
        }

        public function claimForExecution(ToolApprovalGrant $grant): bool
        {
            if (! $this->authorizes($grant) || isset($this->claimed[$grant->approvalId])) {
                return false;
            }

            $this->claimed[$grant->approvalId] = true;

            return true;
        }
    };
}

function testCompilesSequentialBrowserCalls(): void
{
    $plan = proceduralCompiler()->compile(
        [
            proceduralCall('call-nav', 'browser_navigate', ['url' => 'https://example.com']),
            proceduralCall('call-snapshot', 'browser_snapshot'),
        ],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );

    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $plan->state, 'Browser plan should compile.');
    assertProceduralSame([], $plan->nodes[0]->dependencies, 'Navigation should be the first browser state node.');
    assertProceduralSame([$plan->nodes[0]->id], $plan->nodes[1]->dependencies, 'Snapshot must depend on the navigation state it observes.');
    assertProceduralSame(7, $plan->nodes[0]->context->stateVersion, 'Navigation should be bound to the current browser state.');
    assertProceduralSame(8, $plan->nodes[1]->context->stateVersion, 'Snapshot should be bound to the state produced by navigation.');
    assertProcedural(
        $plan->nodes[0]->fingerprint !== $plan->nodes[1]->fingerprint,
        'Dependent browser calls must fingerprint the state they will actually observe.',
    );

    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    assertProceduralSame([$plan->nodes[0]->id], $dag->getExecutionQueue(), 'Only navigation should initially be schedulable.');
    $dag->markRunning($plan->nodes[0]->id);
    $dag->markSuccess($plan->nodes[0]->id);
    assertProceduralSame([$plan->nodes[1]->id], $dag->getExecutionQueue(), 'Snapshot should release only after navigation success.');
}

function testParallelizesIndependentSearches(): void
{
    $plan = proceduralCompiler()->compile(
        [
            proceduralCall('call-search-a', 'web_search', ['query' => 'alpha']),
            proceduralCall('call-search-b', 'web_search', ['query' => 'beta']),
            proceduralCall('call-fetch', 'web_fetch', ['url' => 'https://example.com/source']),
        ],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );

    assertProceduralSame([[], [], []], array_map(static fn ($node): array => $node->dependencies, $plan->nodes), 'Independent read/search/fetch calls should remain sibling nodes.');
    assertProceduralSame(array_map(static fn ($node): string => $node->id, $plan->nodes), $plan->materialize(new WorkerRegistry)->getExecutionQueue(), 'Every independent node should be ready.');
}

function testFinalizationDependsOnEvidenceNodes(): void
{
    $plan = proceduralCompiler()->compile(
        [
            proceduralCall('call-nav', 'browser_navigate', ['url' => 'https://example.com']),
            proceduralCall('call-snapshot', 'browser_snapshot'),
            proceduralCall('call-search', 'web_search', ['query' => 'evidence']),
        ],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );

    assertProceduralSame([$plan->nodes[1]->id, $plan->nodes[2]->id], $plan->finalizationDependencies, 'Finalization should depend only on selected evidence-producing nodes.');
    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    assertProceduralSame(false, $plan->finalizationReady($dag), 'Finalization must remain blocked before selected evidence succeeds.');
    foreach ($plan->nodes as $node) {
        $dag->markRunning($node->id);
        $dag->markSuccess($node->id);
    }
    assertProceduralSame(true, $plan->finalizationReady($dag), 'Finalization may release only after every selected evidence node succeeds.');
}

function testApprovalRequiredNodeRemainsBlocked(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );

    assertProceduralSame(ProceduralPlan::AWAITING_APPROVAL, $plan->state, 'A high-risk call should await HMI approval.');
    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $nodeId = $plan->nodes[0]->id;
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $dag->getNodeStatus($nodeId), 'Approval-gated node should carry an explicit blocked state.');
    assertProceduralSame([], $dag->getExecutionQueue(), 'Unapproved node must not be schedulable.');

    $requirement = $dag->getApprovalRequirement($nodeId);
    $dag->approveNode($nodeId, new ToolApprovalGrant(
        approvalId: 'approval-1',
        nodeId: $nodeId,
        actorId: 'operator-1',
        capability: $requirement['capability'],
        planHash: $requirement['plan_hash'],
        approvedAt: '2026-07-13T14:00:00+00:00',
    ));
    assertProceduralSame([$nodeId], $dag->getExecutionQueue(), 'The authority layer may release the node only after persisted approval.');
}

function testPayloadMutationInvalidatesApproval(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $node = $plan->nodes[0];
    $oldRequirement = $dag->getApprovalRequirement($node->id);

    $mutatedPayload = $node->payload();
    $mutatedPayload['call']['arguments']['ref'] = 'r8';
    $dag->setPayload($node->id, $mutatedPayload);
    $newRequirement = $dag->getApprovalRequirement($node->id);

    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $dag->getNodeStatus($node->id), 'Payload mutation must not release an approval-gated node.');
    assertProcedural($oldRequirement['plan_hash'] !== $newRequirement['plan_hash'], 'Payload mutation must invalidate the approved plan hash.');

    $rejected = false;
    try {
        $dag->approveNode($node->id, new ToolApprovalGrant(
            approvalId: 'approval-stale',
            nodeId: $node->id,
            actorId: 'operator-1',
            capability: $oldRequirement['capability'],
            planHash: $oldRequirement['plan_hash'],
            approvedAt: '2026-07-13T14:00:00+00:00',
        ));
    } catch (InvalidArgumentException) {
        $rejected = true;
    }
    assertProceduralSame(true, $rejected, 'A stale persisted approval must fail closed after payload mutation.');
}

function testApprovalRequiresAuthorizedActor(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $nodeId = $plan->nodes[0]->id;
    $requirement = $dag->getApprovalRequirement($nodeId);

    $rejected = false;
    try {
        $dag->approveNode($nodeId, new ToolApprovalGrant(
            approvalId: 'approval-attacker',
            nodeId: $nodeId,
            actorId: 'attacker',
            capability: $requirement['capability'],
            planHash: $requirement['plan_hash'],
            approvedAt: '2026-07-13T14:00:00+00:00',
        ));
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'A structurally valid grant from an unauthorized actor must fail closed.');
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $dag->getNodeStatus($nodeId), 'Rejected authority must not mutate node state.');
}

function testApprovalStateCannotBeBypassedByPublicTransitions(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $nodeId = $plan->nodes[0]->id;

    foreach (['markRunning', 'markSuccess', 'markFailed'] as $transition) {
        $rejected = false;
        try {
            $dag->{$transition}($nodeId);
        } catch (InvalidArgumentException|RuntimeException) {
            $rejected = true;
        }
        assertProceduralSame(true, $rejected, sprintf('%s must reject an approval-waiting node.', $transition));
        assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $dag->getNodeStatus($nodeId), 'Rejected transitions must preserve the approval barrier.');
    }
}

function testApprovalGrantIsSingleUseAcrossRetry(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $dag = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $nodeId = $plan->nodes[0]->id;
    $requirement = $dag->getApprovalRequirement($nodeId);
    $grant = new ToolApprovalGrant(
        approvalId: 'approval-single-use',
        nodeId: $nodeId,
        actorId: 'operator-1',
        capability: $requirement['capability'],
        planHash: $requirement['plan_hash'],
        approvedAt: '2026-07-13T14:00:00+00:00',
    );
    $dag->approveNode($nodeId, $grant);
    $dag->markRunning($nodeId);
    $dag->markFailed($nodeId);
    $dag->forceRetry($nodeId);

    $rejected = false;
    try {
        $dag->approveNode($nodeId, $grant);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'A persisted approval record must authorize only one execution attempt.');
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $dag->getNodeStatus($nodeId), 'A retry must wait for a fresh approval record.');
}

function testImportedApprovalStateIsRevalidated(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $nodeId = $plan->nodes[0]->id;
    $source = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $requirement = $source->getApprovalRequirement($nodeId);
    $state = $source->exportState();
    $state['nodes'][$nodeId]['status'] = NodeStatus::VALIDATED;
    $state['nodes'][$nodeId]['approval_grant'] = (new ToolApprovalGrant(
        approvalId: 'approval-forged-import',
        nodeId: $nodeId,
        actorId: 'attacker',
        capability: $requirement['capability'],
        planHash: $requirement['plan_hash'],
        approvedAt: '2026-07-13T14:00:00+00:00',
    ))->toArray();
    $state['consumed_approval_ids'][] = 'approval-forged-import';

    $restored = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $rejected = false;
    try {
        $restored->importState($state);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'Imported approval grants must be revalidated by the authority before restoring executable state.');
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $restored->getNodeStatus($nodeId), 'Rejected imports must not partially replace the existing approval barrier.');

    $source->approveNode($nodeId, new ToolApprovalGrant(
        approvalId: 'approval-valid-import',
        nodeId: $nodeId,
        actorId: 'operator-1',
        capability: $requirement['capability'],
        planHash: $requirement['plan_hash'],
        approvedAt: '2026-07-13T14:00:00+00:00',
    ));
    $restored->importState($source->exportState());

    assertProceduralSame([$nodeId], $restored->getExecutionQueue(), 'A valid persisted grant should survive a verified restore without another approval prompt.');
}

function testImportedApprovalCannotRestoreRetryingWithAnOldGrant(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $authority = proceduralApprovalAuthority();
    $source = $plan->materialize(new WorkerRegistry, $authority);
    $nodeId = $plan->nodes[0]->id;
    $requirement = $source->getApprovalRequirement($nodeId);
    $source->approveNode($nodeId, new ToolApprovalGrant(
        approvalId: 'approval-retrying-import',
        nodeId: $nodeId,
        actorId: 'operator-1',
        capability: $requirement['capability'],
        planHash: $requirement['plan_hash'],
        approvedAt: '2026-07-13T14:00:00+00:00',
    ));
    $state = $source->exportState();
    $state['nodes'][$nodeId]['status'] = NodeStatus::RETRYING;

    $restored = $plan->materialize(new WorkerRegistry, $authority);
    $rejected = false;
    try {
        $restored->importState($state);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'A retry restore must never retain the grant from a previous execution attempt.');
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $restored->getNodeStatus($nodeId), 'Rejected retry restore must preserve the fresh approval barrier.');
}

function testConcurrentRestoreCanClaimAnApprovalOnlyOnce(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $authority = proceduralApprovalAuthority();
    $source = $plan->materialize(new WorkerRegistry, $authority);
    $nodeId = $plan->nodes[0]->id;
    $requirement = $source->getApprovalRequirement($nodeId);
    $source->approveNode($nodeId, new ToolApprovalGrant(
        approvalId: 'approval-concurrent-import',
        nodeId: $nodeId,
        actorId: 'operator-1',
        capability: $requirement['capability'],
        planHash: $requirement['plan_hash'],
        approvedAt: '2026-07-13T14:00:00+00:00',
    ));
    $state = $source->exportState();
    $first = $plan->materialize(new WorkerRegistry, $authority);
    $second = $plan->materialize(new WorkerRegistry, $authority);
    $first->importState($state);
    $second->importState($state);

    $first->markRunning($nodeId);
    $rejected = false;
    try {
        $second->markRunning($nodeId);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'The approval authority must atomically reject a second execution claim after concurrent restore.');
    assertProceduralSame(NodeStatus::VALIDATED, $second->getNodeStatus($nodeId), 'A rejected execution claim must not mutate the second DAG.');
}

function testImportedStateCannotRemoveApprovalPolicyMetadata(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $authority = proceduralApprovalAuthority();
    $source = $plan->materialize(new WorkerRegistry, $authority);
    $nodeId = $plan->nodes[0]->id;
    $state = $source->exportState();
    $state['nodes'][$nodeId]['status'] = NodeStatus::VALIDATED;
    unset($state['nodes'][$nodeId]['approval_requirement'], $state['nodes'][$nodeId]['approval_grant']);

    $restored = $plan->materialize(new WorkerRegistry, $authority);
    $rejected = false;
    try {
        $restored->importState($state);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'Imported procedural state must not remove a server-owned high-risk approval policy.');
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $restored->getNodeStatus($nodeId), 'Rejected policy removal must leave the materialized approval barrier intact.');
}

function testImportedCriticalStateCannotRemoveApprovalPolicyMetadata(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-delete', 'browser_delete', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $authority = proceduralApprovalAuthority();
    $source = $plan->materialize(new WorkerRegistry, $authority);
    $nodeId = $plan->nodes[0]->id;
    $state = $source->exportState();
    $state['nodes'][$nodeId]['status'] = NodeStatus::VALIDATED;
    unset($state['nodes'][$nodeId]['approval_requirement'], $state['nodes'][$nodeId]['approval_grant']);

    $restored = new \Kadmos\ASTOrchestrator(new WorkerRegistry, $authority);
    $restored->addNode($nodeId, $plan->nodes[0]->dependencies, $plan->nodes[0]->type);
    $restored->setPayload($nodeId, $plan->nodes[0]->payload());
    $rejected = false;
    try {
        $restored->importState($state);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'Imported critical-risk state must not remove its approval capability.');
    assertProceduralSame(NodeStatus::VALIDATED, $restored->getNodeStatus($nodeId), 'Rejected critical policy removal must not replace the pre-materialized state.');
}

function testExecutableStateCannotBootstrapAnEmptyOrchestrator(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-click', 'browser_click', ['ref' => 'r7'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $source = $plan->materialize(new WorkerRegistry, proceduralApprovalAuthority());
    $nodeId = $plan->nodes[0]->id;
    $state = $source->exportState();
    $state['nodes'][$nodeId]['status'] = NodeStatus::VALIDATED;
    $state['nodes'][$nodeId]['type'] = 'UNGUARDED_WORKER';
    $state['nodes'][$nodeId]['payload']['context']['risk'] = 'low';
    unset($state['nodes'][$nodeId]['approval_requirement'], $state['nodes'][$nodeId]['approval_grant']);

    $empty = new \Kadmos\ASTOrchestrator(new WorkerRegistry, proceduralApprovalAuthority());
    $rejected = false;
    try {
        $empty->importState($state);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'An executable snapshot must be applied only to a server-materialized DAG, never define its own policy.');
}

function testApprovalIsNodeScopedWithinMixedBatch(): void
{
    $plan = proceduralCompiler()->compile(
        [
            proceduralCall('call-search', 'web_search', ['query' => 'safe sibling']),
            proceduralCall('call-click', 'browser_click', ['ref' => 'r7']),
        ],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $dag = $plan->materialize(new WorkerRegistry);

    assertProceduralSame(ProceduralPlan::AWAITING_APPROVAL, $plan->state, 'A mixed plan should disclose its blocked approval node.');
    assertProceduralSame([$plan->nodes[0]->id], $dag->getExecutionQueue(), 'Independent safe siblings may run while only the risky node remains blocked.');
    assertProceduralSame(NodeStatus::AWAITING_APPROVAL, $dag->getNodeStatus($plan->nodes[1]->id), 'The risky sibling must remain approval-gated.');
}

function testNodeIdsAreDeterministic(): void
{
    $calls = [
        proceduralCall('call-nav', 'browser_navigate', ['url' => 'https://example.com']),
        proceduralCall('call-snapshot', 'browser_snapshot'),
    ];
    $first = proceduralCompiler()->compile($calls, proceduralRegistry(), proceduralContext(), new ProceduralBudget, new ProceduralLoopGuard);
    $second = proceduralCompiler()->compile($calls, proceduralRegistry(), proceduralContext(), new ProceduralBudget, new ProceduralLoopGuard);

    assertProceduralSame(
        array_map(static fn ($node): string => $node->id, $first->nodes),
        array_map(static fn ($node): string => $node->id, $second->nodes),
        'The same owned run, turn, calls, and arguments must compile to stable node IDs.',
    );
}

function testPlanRejectsDuplicateNodeIdentity(): void
{
    $compiled = proceduralCompiler()->compile(
        [proceduralCall('call-search', 'web_search', ['query' => 'identity'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );

    $rejected = false;
    try {
        new ProceduralPlan(ProceduralPlan::DAG_COMPILED, [$compiled->nodes[0], $compiled->nodes[0]], [], []);
    } catch (InvalidArgumentException) {
        $rejected = true;
    }

    assertProceduralSame(true, $rejected, 'A public procedural plan boundary must reject duplicate node identities.');
}

function testProceduralNodesDoNotFallThroughToLegacyWorkers(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-search', 'web_search', ['query' => 'no legacy fallback'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $dag = $plan->materialize(new WorkerRegistry);
    $nodeId = $plan->nodes[0]->id;

    $dag->executeNode($nodeId);

    assertProceduralSame(NodeStatus::FAILED, $dag->getNodeStatus($nodeId), 'An unregistered procedural dispatcher must fail closed instead of reaching a legacy worker.');
}

function testRejectsSemanticRepeatOnUnchangedState(): void
{
    $guard = new ProceduralLoopGuard;
    $first = proceduralCompiler()->compile(
        [proceduralCall('call-first', 'web_search', ['query' => 'news', 'language' => 'it'])],
        proceduralRegistry(),
        proceduralContext(evidenceHash: 'sha256:'.str_repeat('a', 64)),
        new ProceduralBudget,
        $guard,
    );
    $second = proceduralCompiler()->compile(
        [proceduralCall('call-second', 'web_search', ['language' => 'it', 'query' => 'news'])],
        proceduralRegistry(),
        proceduralContext(evidenceHash: 'sha256:'.str_repeat('a', 64)),
        new ProceduralBudget,
        $guard,
    );

    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $first->state, 'First semantic call should compile.');
    assertProceduralSame(ProceduralPlan::LOOP_BLOCKED, $second->state, 'Equivalent arguments on unchanged state should be blocked.');
    assertProceduralSame([], $second->nodes, 'A loop candidate must not create another node.');
    assertProceduralSame('TALOS_TOOL_LOOP_DETECTED', $second->faults[0]['code'], 'Loop fault should be machine-readable.');
}

function testAllowsSemanticRepeatAfterStateChange(): void
{
    $guard = new ProceduralLoopGuard;
    $first = proceduralCompiler()->compile(
        [proceduralCall('call-first', 'browser_snapshot')],
        proceduralRegistry(),
        proceduralContext(stateVersion: 7),
        new ProceduralBudget,
        $guard,
    );
    $second = proceduralCompiler()->compile(
        [proceduralCall('call-second', 'browser_snapshot')],
        proceduralRegistry(),
        proceduralContext(stateVersion: 8),
        new ProceduralBudget,
        $guard,
    );

    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $first->state, 'First state observation should compile.');
    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $second->state, 'A new state version should produce a distinct semantic fingerprint.');
    assertProcedural($first->nodes[0]->fingerprint !== $second->nodes[0]->fingerprint, 'State change must alter the fingerprint.');
}

function testRoundTripsProceduralLoopGuardState(): void
{
    $source = new ProceduralLoopGuard(maxRetriesPerFingerprint: 2);
    $observedCall = proceduralCall('call-observed', 'web_search', ['query' => 'durable']);
    $retryA = proceduralCall('provider-a-initial', 'web_fetch', ['url' => 'https://example.com/a']);
    $retryB = proceduralCall('provider-b-initial', 'web_fetch', ['url' => 'https://example.com/b']);

    $source->inspect($observedCall, 7, 'sha256:'.str_repeat('a', 64));
    $source->inspect($retryA, 7, null, true, 'logical-a');
    $source->inspect($retryA, 7, null, true, 'logical-a');
    $source->inspect($retryB, 7, null, true, 'logical-b');

    $restored = ProceduralLoopGuard::fromState($source->exportState());
    $sameObservation = $restored->inspect($observedCall, 7, 'sha256:'.str_repeat('a', 64));
    $changedObservation = $restored->inspect($observedCall, 8, 'sha256:'.str_repeat('b', 64));
    $exhaustedRetry = $restored->inspect(proceduralCall('provider-a-replay', 'web_fetch', ['url' => 'https://example.com/a']), 7, null, true, 'logical-a');
    $independentRetry = $restored->inspect(proceduralCall('provider-b-replay', 'web_fetch', ['url' => 'https://example.com/b']), 7, null, true, 'logical-b');

    assertProceduralSame(false, $sameObservation->allowed, 'A reconstructed guard must block an equivalent observed fingerprint.');
    assertProceduralSame('TALOS_TOOL_LOOP_DETECTED', $sameObservation->code, 'A reconstructed observation must retain loop detection.');
    assertProceduralSame(true, $changedObservation->allowed, 'A changed state or evidence fingerprint must remain allowed.');
    assertProceduralSame(false, $exhaustedRetry->allowed, 'A reconstructed guard must retain the retry counter for call A.');
    assertProceduralSame('TALOS_TOOL_RETRY_BUDGET_EXHAUSTED', $exhaustedRetry->code, 'Call A retry exhaustion must remain bounded.');
    assertProceduralSame(true, $independentRetry->allowed, 'Call B retry accounting must remain independent from call A.');
}

function testExportsProceduralLoopGuardStateDeterministically(): void
{
    $first = new ProceduralLoopGuard;
    $second = new ProceduralLoopGuard;
    $calls = [
        'call-b' => proceduralCall('call-b', 'web_fetch', ['url' => 'https://example.com/b']),
        'call-a' => proceduralCall('call-a', 'web_fetch', ['url' => 'https://example.com/a']),
    ];

    foreach ($calls as $call) {
        $first->inspect($call, 7, null, true);
    }
    foreach (array_reverse($calls) as $call) {
        $second->inspect($call, 7, null, true);
    }

    assertProceduralSame(
        ProceduralLoopGuard::canonicalJson($first->exportState()),
        ProceduralLoopGuard::canonicalJson($second->exportState()),
        'Loop guard exports must have deterministic JSON representation independent of insertion order.',
    );
}

function testRejectsMalformedProceduralLoopGuardState(): void
{
    $valid = (new ProceduralLoopGuard)->exportState();
    $malformed = [
        array_diff_key($valid, ['retries' => true]),
        [...$valid, 'unexpected' => true],
        [...$valid, 'schema_version' => 'unsupported'],
        [...$valid, 'max_retries_per_fingerprint' => '2'],
        [...$valid, 'observations' => ['not-a-fingerprint' => 1]],
        [...$valid, 'observations' => ['sha256:'.str_repeat('a', 64) => 0]],
        [...$valid, 'retries' => ['call-retry' => -1]],
        [...$valid, 'retries' => [['call-retry', 1]]],
    ];

    foreach ($malformed as $state) {
        $rejected = false;
        try {
            ProceduralLoopGuard::fromState($state);
        } catch (InvalidArgumentException) {
            $rejected = true;
        }

        assertProceduralSame(true, $rejected, 'Malformed loop guard state must fail closed.');
    }
}

function testRetryKeepsNodeRetryableAndBounded(): void
{
    $guard = new ProceduralLoopGuard(maxRetriesPerFingerprint: 2);
    $call = proceduralCall('call-retry', 'web_fetch', ['url' => 'https://example.com']);
    $first = proceduralCompiler()->compile([$call], proceduralRegistry(), proceduralContext(), new ProceduralBudget, $guard);
    $dag = $first->materialize(new WorkerRegistry);
    $nodeId = $first->nodes[0]->id;
    $dag->markRunning($nodeId);
    $dag->markFailed($nodeId);
    $dag->forceRetry($nodeId);

    assertProceduralSame(NodeStatus::RETRYING, $dag->getNodeStatus($nodeId), 'HMI retry state should remain intact.');
    assertProceduralSame([$nodeId], $dag->getExecutionQueue(), 'A forced retry should return to the queue.');
    assertProceduralSame('call-retry', $dag->exportState()['nodes'][$nodeId]['payload']['call']['provider_call_id'], 'Retry payload should preserve provider correlation.');

    $retryContext = proceduralContext(retryCallIds: ['call-retry']);
    assertProceduralSame(ProceduralPlan::DAG_COMPILED, proceduralCompiler()->compile([$call], proceduralRegistry(), $retryContext, new ProceduralBudget, $guard)->state, 'First repair retry should be allowed.');
    assertProceduralSame(ProceduralPlan::DAG_COMPILED, proceduralCompiler()->compile([$call], proceduralRegistry(), $retryContext, new ProceduralBudget, $guard)->state, 'Second repair retry should be allowed.');
    assertProceduralSame(ProceduralPlan::LOOP_BLOCKED, proceduralCompiler()->compile([$call], proceduralRegistry(), $retryContext, new ProceduralBudget, $guard)->state, 'Retry budget should fail closed after two repairs.');

    $changedStateRetry = proceduralContext(
        stateVersion: 8,
        evidenceHash: 'sha256:'.str_repeat('b', 64),
        retryCallIds: ['call-retry'],
    );
    assertProceduralSame(
        ProceduralPlan::LOOP_BLOCKED,
        proceduralCompiler()->compile([$call], proceduralRegistry(), $changedStateRetry, new ProceduralBudget, $guard)->state,
        'Changing browser state or evidence must not reset the retry budget for the same provider call.',
    );
}

function testDurableReplayDoesNotConsumeRetryOrRepeatObservation(): void
{
    $guard = new ProceduralLoopGuard;
    $call = proceduralCall('provider-current', 'web_search', ['query' => 'durable replay']);
    $first = proceduralCompiler()->compile(
        [$call],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        $guard,
    );
    $replay = proceduralCompiler()->compile(
        [$call],
        proceduralRegistry(),
        proceduralContext(replayCallIds: ['provider-current']),
        new ProceduralBudget,
        $guard,
    );
    $semanticRepeat = proceduralCompiler()->compile(
        [proceduralCall('provider-new', 'web_search', ['query' => 'durable replay'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        $guard,
    );

    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $first->state, 'The first semantic observation should compile.');
    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $replay->state, 'The same pending provider call should replay after a crash.');
    assertProceduralSame(ProceduralPlan::LOOP_BLOCKED, $semanticRepeat->state, 'Replay must not erase durable semantic loop detection.');
}

function testRetryBudgetUsesStableLogicalCallAcrossProviderIds(): void
{
    $guard = new ProceduralLoopGuard(maxRetriesPerFingerprint: 2);
    $compileRetry = static function (string $providerCallId) use ($guard): ProceduralPlan {
        return proceduralCompiler()->compile(
            [proceduralCall($providerCallId, 'web_fetch', ['url' => 'https://example.com'])],
            proceduralRegistry(),
            proceduralContext(
                retryCallIds: [$providerCallId],
                logicalCallIds: [$providerCallId => 'logical-fetch'],
            ),
            new ProceduralBudget,
            $guard,
        );
    };

    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $compileRetry('provider-repair-1')->state, 'First logical repair should compile.');
    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $compileRetry('provider-repair-2')->state, 'Second logical repair should compile.');
    $exhausted = $compileRetry('provider-repair-3');
    assertProceduralSame(ProceduralPlan::LOOP_BLOCKED, $exhausted->state, 'A third provider ID must not bypass the logical repair limit.');
    assertProceduralSame('TALOS_TOOL_RETRY_BUDGET_EXHAUSTED', $exhausted->faults[0]['code'] ?? null, 'Logical repair exhaustion must stay typed.');
}

function testStopsAtCallBudget(): void
{
    $plan = proceduralCompiler()->compile(
        [
            proceduralCall('call-one', 'web_search', ['query' => 'one']),
            proceduralCall('call-two', 'web_search', ['query' => 'two']),
        ],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget(maxCalls: 1),
        new ProceduralLoopGuard,
    );

    assertProceduralSame(ProceduralPlan::BUDGET_EXHAUSTED, $plan->state, 'Call budget should terminate compilation.');
    assertProceduralSame([], $plan->nodes, 'Budget failure should not return a partially executable plan.');
    assertProceduralSame('TALOS_TOOL_CALL_BUDGET_EXHAUSTED', $plan->faults[0]['code'], 'Budget failure should be typed.');
}

function testBudgetsAreCumulativeAcrossIterations(): void
{
    $usage = new ProceduralUsage(calls: 15, inputTokens: 999, costMicros: 49_999);
    $plan = proceduralCompiler()->compile(
        [
            proceduralCall('call-one', 'web_search', ['query' => 'one']),
            proceduralCall('call-two', 'web_search', ['query' => 'two']),
        ],
        proceduralRegistry(),
        proceduralContext(usage: $usage),
        new ProceduralBudget(maxCalls: 16, maxInputTokens: 1_000, maxCostMicros: 50_000),
        new ProceduralLoopGuard,
    );

    assertProceduralSame(ProceduralPlan::BUDGET_EXHAUSTED, $plan->state, 'Persisted usage plus the new batch must respect the same turn budget.');
    assertProceduralSame('TALOS_TOOL_CALL_BUDGET_EXHAUSTED', $plan->faults[0]['code'], 'Cumulative call exhaustion should be typed.');
}

function testTimeTokenAndCostBudgetsFailClosed(): void
{
    $call = [proceduralCall('call-one', 'web_search', ['query' => 'budget'])];
    $cases = [
        [new ProceduralUsage(elapsedMilliseconds: 1_000), new ProceduralBudget(maxElapsedMilliseconds: 1_000), 'TALOS_TOOL_TIME_BUDGET_EXHAUSTED'],
        [new ProceduralUsage(inputTokens: 1_000), new ProceduralBudget(maxInputTokens: 1_000), 'TALOS_TOOL_INPUT_TOKEN_BUDGET_EXHAUSTED'],
        [new ProceduralUsage(outputTokens: 1_000), new ProceduralBudget(maxOutputTokens: 1_000), 'TALOS_TOOL_OUTPUT_TOKEN_BUDGET_EXHAUSTED'],
        [new ProceduralUsage(costMicros: 50_000), new ProceduralBudget(maxCostMicros: 50_000), 'TALOS_TOOL_COST_BUDGET_EXHAUSTED'],
    ];

    foreach ($cases as [$usage, $budget, $expectedCode]) {
        $plan = proceduralCompiler()->compile($call, proceduralRegistry(), proceduralContext(usage: $usage), $budget, new ProceduralLoopGuard);
        assertProceduralSame(ProceduralPlan::BUDGET_EXHAUSTED, $plan->state, 'Exhausted resource budgets must fail closed.');
        assertProceduralSame($expectedCode, $plan->faults[0]['code'], 'Resource budget failure should retain its typed code.');
    }
}

function testCancellationAndDeadlineFailBeforeCompilation(): void
{
    $call = [proceduralCall('call-one', 'web_search', ['query' => 'cancel'])];
    $cancelled = proceduralCompiler()->compile(
        $call,
        proceduralRegistry(),
        proceduralContext(cancellationRequested: true),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $timedOut = proceduralCompiler()->compile(
        $call,
        proceduralRegistry(),
        proceduralContext(observedAt: '2026-07-13T15:00:00+00:00'),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );

    assertProceduralSame(ProceduralPlan::CANCELLED, $cancelled->state, 'Cancellation must terminate before nodes are compiled.');
    assertProceduralSame('TALOS_TOOL_TURN_CANCELLED', $cancelled->faults[0]['code'], 'Cancellation should be typed.');
    assertProceduralSame(ProceduralPlan::TIMED_OUT, $timedOut->state, 'Deadline exhaustion must terminate before nodes are compiled.');
    assertProceduralSame('TALOS_TOOL_DEADLINE_EXCEEDED', $timedOut->faults[0]['code'], 'Deadline exhaustion should be typed.');
}

function testUnknownToolFailsAsPolicyWithoutConsumingLoopState(): void
{
    $guard = new ProceduralLoopGuard;
    $valid = proceduralCall('call-valid', 'web_search', ['query' => 'valid']);
    $unknown = proceduralCall('call-unknown', 'shell_execute', ['command' => 'whoami']);
    $rejected = proceduralCompiler()->compile(
        [$valid, $unknown],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        $guard,
    );

    assertProceduralSame(ProceduralPlan::FAILED_POLICY, $rejected->state, 'An unregistered tool should fail at the server-owned policy boundary.');
    assertProceduralSame([], $rejected->nodes, 'A rejected mixed batch must not expose partially executable nodes.');
    assertProceduralSame('TALOS_TOOL_NOT_ALLOWED', $rejected->faults[0]['code'], 'Policy rejection should be typed.');

    $accepted = proceduralCompiler()->compile(
        [$valid],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        $guard,
    );
    assertProceduralSame(ProceduralPlan::DAG_COMPILED, $accepted->state, 'Preflight policy failure must not consume loop state for a valid call.');
}

function testConvertsNodeOutcomesToCanonicalToolResults(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-result', 'web_search', ['query' => 'result'])],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $canonical = new ToolResult(
        toolUseId: 'call-result',
        isError: false,
        content: [['type' => 'text', 'text' => 'Observed result']],
        structuredContent: ['available' => true],
        evidence: [],
    );

    $success = $plan->nodes[0]->resultFromOutcome([
        'status' => NodeStatus::SUCCESS,
        'output_summary' => 'complete',
        'raw_output' => $canonical->toArray(),
    ]);
    $failure = $plan->nodes[0]->resultFromOutcome([
        'status' => NodeStatus::FAILED,
        'output_summary' => 'secret worker detail',
        'raw_output' => null,
    ]);

    assertProceduralSame($canonical->toArray(), $success->toArray(), 'Successful outcome should preserve the validated canonical result.');
    assertProceduralSame(true, $failure->isError, 'Failed outcome should become an error tool result.');
    assertProceduralSame('TALOS_TOOL_EXECUTION_FAILED', $failure->structuredContent['code'], 'Failure should expose a controlled code.');
    assertProcedural(! str_contains(json_encode($failure->toArray(), JSON_THROW_ON_ERROR), 'secret worker detail'), 'Worker diagnostics must not leak into model-visible results.');
}

function testPreservesCanonicalWorkerFailureCode(): void
{
    $plan = proceduralCompiler()->compile(
        [proceduralCall('call-result', 'browser_snapshot')],
        proceduralRegistry(),
        proceduralContext(),
        new ProceduralBudget,
        new ProceduralLoopGuard,
    );
    $canonicalFailure = ToolResult::error(
        'call-result',
        'TALOS_BROWSER_STALE_STATE',
        'Browser state is stale.',
    );

    $failure = $plan->nodes[0]->resultFromOutcome([
        'status' => NodeStatus::FAILED,
        'output_summary' => 'internal worker diagnostics',
        'raw_output' => json_encode($canonicalFailure->toWireArray(), JSON_THROW_ON_ERROR),
    ]);

    assertProceduralSame($canonicalFailure->toArray(), $failure->toArray(), 'A validated canonical worker failure must preserve its repair code.');
    assertProcedural(! str_contains(json_encode($failure->toArray(), JSON_THROW_ON_ERROR), 'internal worker diagnostics'), 'Canonical failures must not leak worker diagnostics.');
}

$tests = [
    'testCompilesSequentialBrowserCalls',
    'testParallelizesIndependentSearches',
    'testFinalizationDependsOnEvidenceNodes',
    'testApprovalRequiredNodeRemainsBlocked',
    'testPayloadMutationInvalidatesApproval',
    'testApprovalRequiresAuthorizedActor',
    'testApprovalStateCannotBeBypassedByPublicTransitions',
    'testApprovalGrantIsSingleUseAcrossRetry',
    'testImportedApprovalStateIsRevalidated',
    'testImportedApprovalCannotRestoreRetryingWithAnOldGrant',
    'testConcurrentRestoreCanClaimAnApprovalOnlyOnce',
    'testImportedStateCannotRemoveApprovalPolicyMetadata',
    'testImportedCriticalStateCannotRemoveApprovalPolicyMetadata',
    'testExecutableStateCannotBootstrapAnEmptyOrchestrator',
    'testApprovalIsNodeScopedWithinMixedBatch',
    'testNodeIdsAreDeterministic',
    'testPlanRejectsDuplicateNodeIdentity',
    'testProceduralNodesDoNotFallThroughToLegacyWorkers',
    'testRejectsSemanticRepeatOnUnchangedState',
    'testAllowsSemanticRepeatAfterStateChange',
    'testRoundTripsProceduralLoopGuardState',
    'testExportsProceduralLoopGuardStateDeterministically',
    'testRejectsMalformedProceduralLoopGuardState',
    'testRetryKeepsNodeRetryableAndBounded',
    'testDurableReplayDoesNotConsumeRetryOrRepeatObservation',
    'testRetryBudgetUsesStableLogicalCallAcrossProviderIds',
    'testStopsAtCallBudget',
    'testBudgetsAreCumulativeAcrossIterations',
    'testTimeTokenAndCostBudgetsFailClosed',
    'testCancellationAndDeadlineFailBeforeCompilation',
    'testUnknownToolFailsAsPolicyWithoutConsumingLoopState',
    'testConvertsNodeOutcomesToCanonicalToolResults',
    'testPreservesCanonicalWorkerFailureCode',
];

foreach ($tests as $test) {
    $test();
    echo $test.' passed'.PHP_EOL;
}

echo 'All procedural compiler tests passed'.PHP_EOL;
