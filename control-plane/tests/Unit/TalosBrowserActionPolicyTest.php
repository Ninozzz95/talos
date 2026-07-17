<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserSession;
use App\Models\TalosBrowserTask;
use App\Models\TalosToolCall as PersistedToolCall;
use App\Services\Talos\Browser\TalosBrowserActionPolicy;
use Carbon\CarbonImmutable;
use Kadmos\Browser\Contract\BrowserActionRisk;
use Kadmos\Browser\Policy\BrowserActionDisposition;
use Kadmos\Tool\ProceduralLoopGuard;
use Kadmos\Tool\ProceduralNode;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolExecutionContext;
use Tests\TestCase;

final class TalosBrowserActionPolicyTest extends TestCase
{
    public function test_server_registry_ignores_provider_supplied_risk_capability_and_approval_hints(): void
    {
        $decision = (new TalosBrowserActionPolicy)->evaluate(
            $this->task('assist'),
            $this->node('browser_click', ['target' => 'r1'], capability: 'browser.read', risk: 'low', requiresApproval: false),
            $this->browserSession(),
        );

        $this->assertSame(BrowserActionRisk::Reversible, $decision->risk, $decision->reasonCode);
        $this->assertSame(BrowserActionDisposition::Confirm, $decision->disposition, $decision->reasonCode);
        $this->assertFalse($decision->allowsModelDispatch());
    }

    public function test_exact_persisted_approval_releases_only_the_same_call_and_arguments(): void
    {
        $policy = new TalosBrowserActionPolicy;
        $task = $this->task('assist');
        $session = $this->browserSession();
        $approvedNode = $this->node('browser_click', ['target' => 'r1']);
        $approval = $this->approvedCall($task, $approvedNode);

        $approved = $policy->evaluate($task, $approvedNode, $session, $approval);
        $changedTarget = $policy->evaluate(
            $task,
            $this->node('browser_click', ['target' => 'r2']),
            $session,
            $approval,
        );

        $this->assertTrue($approved->allowsModelDispatch(), $approved->reasonCode);
        $this->assertSame('browser_policy_exact_approval', $approved->reasonCode);
        $this->assertSame(BrowserActionDisposition::Confirm, $changedTarget->disposition);
    }

    public function test_file_upload_is_sensitive_requires_exact_approval_and_worker_capability(): void
    {
        $policy = new TalosBrowserActionPolicy;
        $task = $this->task('assist');
        $node = $this->node(
            'browser_file_upload',
            ['target' => 'r4', 'file_ids' => ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
            capability: 'browser.upload',
            risk: 'critical',
        );
        $capable = $this->browserSession(capabilities: ['uploads' => true]);

        $pending = $policy->evaluate($task, $node, $capable);
        $approved = $policy->evaluate($task, $node, $capable, $this->approvedCall($task, $node));
        $unsupported = $policy->evaluate(
            $task,
            $node,
            $this->browserSession(capabilities: ['uploads' => false]),
            $this->approvedCall($task, $node),
        );

        $this->assertSame(BrowserActionRisk::Sensitive, $pending->risk);
        $this->assertSame(BrowserActionDisposition::Confirm, $pending->disposition);
        $this->assertTrue($approved->allowsModelDispatch(), $approved->reasonCode);
        $this->assertSame('browser_policy_exact_approval', $approved->reasonCode);
        $this->assertSame(BrowserActionDisposition::Deny, $unsupported->disposition);
        $this->assertSame('browser_policy_capability_denied', $unsupported->reasonCode);
    }

    public function test_configured_upload_grant_cannot_exceed_the_negotiated_worker_capability(): void
    {
        $task = $this->task('assist');
        $node = $this->node(
            'browser_file_upload',
            ['target' => 'r4', 'file_ids' => ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']],
            capability: 'browser.upload',
            risk: 'critical',
        );
        $session = $this->browserSession(
            ['browser_action_policy' => ['capability_grants' => ['upload']]],
            ['uploads' => false],
        );

        $decision = (new TalosBrowserActionPolicy)->evaluate(
            $task,
            $node,
            $session,
            $this->approvedCall($task, $node),
        );

        $this->assertSame(BrowserActionDisposition::Deny, $decision->disposition);
        $this->assertSame('browser_policy_capability_denied', $decision->reasonCode);

        $clickNode = $this->node('browser_click', ['target' => 'r1']);
        $clickSession = $this->browserSession(
            ['browser_action_policy' => ['capability_grants' => ['click']]],
            ['hmiActions' => false],
        );
        $clickDecision = (new TalosBrowserActionPolicy)->evaluate(
            $task,
            $clickNode,
            $clickSession,
            $this->approvedCall($task, $clickNode),
        );

        $this->assertSame(BrowserActionDisposition::Deny, $clickDecision->disposition);
        $this->assertSame('browser_policy_capability_denied', $clickDecision->reasonCode);
    }

    public function test_worker_capability_allows_reads_but_domain_policy_can_only_tighten(): void
    {
        $policy = new TalosBrowserActionPolicy;
        $task = $this->task('observe');
        $session = $this->browserSession([
            'browser_action_policy' => ['allowed_domains' => ['allowed.example']],
        ]);

        $allowed = $policy->evaluate(
            $task,
            $this->node('browser_navigate', ['url' => 'https://docs.allowed.example/']),
            $session,
        );
        $blocked = $policy->evaluate(
            $task,
            $this->node('browser_navigate', ['url' => 'https://blocked.example/']),
            $session,
        );

        $this->assertTrue($allowed->allowsModelDispatch(), $allowed->reasonCode);
        $this->assertSame('browser_policy_domain_denied', $blocked->reasonCode);
    }

    public function test_trusted_sensitive_classification_cannot_be_bypassed_by_act_or_local_override(): void
    {
        $node = $this->node('browser_click', ['target' => 'r9']);
        $session = $this->browserSession([
            'browser_action_policy' => [
                'capability_grants' => ['click'],
                'developer_override' => true,
                'sensitive_categories' => [$node->call->providerCallId => 'payment_data'],
            ],
        ]);
        $decision = (new TalosBrowserActionPolicy)->evaluate(
            $this->task('act'),
            $node,
            $session,
            $this->approvedCall($this->task('act'), $node),
        );

        $this->assertSame(BrowserActionDisposition::HumanOnly, $decision->disposition, $decision->reasonCode);
        $this->assertSame('browser_policy_sensitive_human_only', $decision->reasonCode);
    }

    private function task(string $profile): TalosBrowserTask
    {
        $now = CarbonImmutable::parse('2026-07-15T14:00:00Z');
        $task = new TalosBrowserTask;
        $task->forceFill([
            'id' => '11111111-1111-4111-8111-111111111111',
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => 7,
            'talos_session_id' => '22222222-2222-4222-8222-222222222222',
            'origin_message_id' => '33333333-3333-4333-8333-333333333333',
            'browser_session_id' => '44444444-4444-4444-8444-444444444444',
            'goal' => 'Interact with the page safely.',
            'status' => 'running',
            'autonomy_profile' => $profile,
            'budget' => ['max_actions' => 8, 'max_elapsed_ms' => 60_000, 'max_bytes' => 1_000_000, 'max_tabs' => 4],
            'state_version' => 3,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $task;
    }

    /** @param array<string, mixed> $policy */
    private function browserSession(array $policy = [], array $capabilities = []): TalosBrowserSession
    {
        $session = new TalosBrowserSession;
        $session->forceFill([
            'id' => '44444444-4444-4444-8444-444444444444',
            'user_id' => 7,
            'talos_session_id' => '22222222-2222-4222-8222-222222222222',
            'status' => 'ready',
            'mode' => 'read_only',
            'current_url' => 'https://allowed.example/current',
            'capabilities' => array_replace([
                'navigation' => true,
                'screenshots' => true,
                'accessibilitySnapshot' => true,
                'hmiActions' => true,
                'uploads' => false,
            ], $capabilities),
            'policy' => $policy,
            'worker_state_version' => 3,
            'expires_at' => now()->addHour(),
        ]);

        return $session;
    }

    /** @param array<string, mixed> $arguments */
    private function node(
        string $tool,
        array $arguments,
        string $capability = 'browser.write',
        string $risk = 'high',
        bool $requiresApproval = true,
    ): ProceduralNode {
        $providerCallId = 'call-'.$tool;
        $nodeId = 'node-'.$tool;

        return new ProceduralNode(
            id: $nodeId,
            type: 'TOOL_'.strtoupper($tool),
            call: new ToolCall($providerCallId, $tool, $arguments, null, []),
            context: new ToolExecutionContext(
                userId: '7',
                chatSessionId: '22222222-2222-4222-8222-222222222222',
                runId: '55555555-5555-4555-8555-555555555555',
                turnId: '66666666-6666-4666-8666-666666666666',
                browserSessionId: '44444444-4444-4444-8444-444444444444',
                nodeId: $nodeId,
                capability: $capability,
                risk: $risk,
                stateVersion: 3,
                deadlineAt: '2026-07-15T14:01:00Z',
                idempotencyKey: 'sha256:'.hash('sha256', $providerCallId),
            ),
            dependencies: [],
            fingerprint: 'sha256:'.hash('sha256', $nodeId),
            requiresApproval: $requiresApproval,
            producesEvidence: true,
        );
    }

    private function approvedCall(TalosBrowserTask $task, ProceduralNode $node): PersistedToolCall
    {
        $call = new PersistedToolCall;
        $call->forceFill([
            'user_id' => $task->user_id,
            'provider_call_id' => $node->call->providerCallId,
            'node_id' => $node->id,
            'tool_name' => $node->call->name,
            'arguments_sha256' => 'sha256:'.hash('sha256', ProceduralLoopGuard::canonicalJson($node->call->arguments)),
            'approval_state' => 'approved',
            'approval_id' => '77777777-7777-4777-8777-777777777777',
            'approval_payload_sha256' => 'sha256:'.str_repeat('a', 64),
            'approved_by_user_id' => $task->user_id,
            'approved_at' => now(),
        ]);

        return $call;
    }
}
