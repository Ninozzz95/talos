<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosToolRepairPolicy;
use Kadmos\Tool\ToolResult;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

final class TalosToolRepairPolicyTest extends TestCase
{
    #[Test]
    public function recoverable_failures_are_limited_to_two_repairs(): void
    {
        $policy = new TalosToolRepairPolicy;
        $failure = ToolResult::error('call-1', 'TALOS_BROWSER_STALE_STATE', 'Browser state is stale.');

        $this->assertTrue($policy->shouldRepair(0, $failure));
        $this->assertTrue($policy->shouldRepair(1, $failure));
        $this->assertFalse($policy->shouldRepair(2, $failure));
        $this->assertSame(1, $policy->nextAttempt(0, $failure));
        $this->assertSame(2, $policy->nextAttempt(1, $failure));
    }

    #[Test]
    public function policy_budget_cancellation_and_approval_failures_are_terminal(): void
    {
        $policy = new TalosToolRepairPolicy;

        foreach ([
            'TALOS_POLICY_BLOCKED',
            'TALOS_TOOL_BUDGET_EXHAUSTED',
            'TALOS_TOOL_CANCELLED',
            'TALOS_TOOL_APPROVAL_REQUIRED',
            'TALOS_BROWSER_PRIVATE_TARGET',
        ] as $code) {
            $this->assertFalse($policy->shouldRepair(0, ToolResult::error('call-1', $code, 'Terminal failure.')));
        }
    }

    #[Test]
    public function successful_or_untyped_results_are_not_repaired(): void
    {
        $policy = new TalosToolRepairPolicy;
        $success = new ToolResult(
            toolUseId: 'call-1',
            isError: false,
            content: [['type' => 'text', 'text' => 'Done.']],
            structuredContent: ['ok' => true],
            evidence: [],
        );
        $untyped = new ToolResult(
            toolUseId: 'call-1',
            isError: true,
            content: [['type' => 'text', 'text' => 'Unknown failure.']],
            structuredContent: ['message' => 'No controlled code.'],
            evidence: [],
        );

        $this->assertFalse($policy->shouldRepair(0, $success));
        $this->assertFalse($policy->shouldRepair(0, $untyped));
    }
}
