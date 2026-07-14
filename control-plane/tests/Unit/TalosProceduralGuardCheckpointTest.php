<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Services\Talos\Agent\TalosProceduralGuardCheckpoint;
use App\Services\Talos\Agent\TalosRepairLineageException;
use InvalidArgumentException;
use Kadmos\Tool\ToolCall;
use Kadmos\Tool\ToolResult;
use Tests\TestCase;

final class TalosProceduralGuardCheckpointTest extends TestCase
{
    public function test_round_trip_preserves_guard_observations_lineage_and_independent_repairs(): void
    {
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $first = new ToolCall('provider-a', 'web_search', ['query' => 'AVM'], null, []);
        $second = new ToolCall('provider-b', 'web_search', ['query' => 'TALOS'], null, []);
        $checkpoint->correlateCalls([$first, $second]);
        $this->assertTrue($checkpoint->guard()->inspect($first, 0)->allowed);
        $this->assertTrue($checkpoint->guard()->inspect($second, 0)->allowed);
        $checkpoint->incrementRepair('provider-a');

        $encoded = $checkpoint->encode();
        $restored = TalosProceduralGuardCheckpoint::fromEncoded($encoded);

        $this->assertSame($encoded, $restored->encode());
        $this->assertSame('provider-a', $restored->logicalCallId('provider-a'));
        $this->assertSame(1, $restored->repairAttempt('provider-a'));
        $this->assertSame(0, $restored->repairAttempt('provider-b'));
        $this->assertFalse($restored->guard()->inspect($first, 0)->allowed);
    }

    public function test_repaired_provider_id_inherits_the_original_logical_call_and_attempt(): void
    {
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $original = new ToolCall('provider-original', 'web_search', ['query' => ''], null, []);
        $checkpoint->correlateCalls([$original]);
        $checkpoint->incrementRepair('provider-original');

        $repaired = new ToolCall('provider-repaired', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint->correlateCalls([$repaired], ['provider-original']);

        $this->assertSame('provider-original', $checkpoint->logicalCallId('provider-repaired'));
        $this->assertSame(1, $checkpoint->repairAttempt('provider-repaired'));
        $this->assertSame(
            ['provider-repaired' => 'provider-original'],
            $checkpoint->logicalCallIdsFor([$repaired]),
        );
        $this->assertSame(
            ['provider-repaired' => 1],
            $checkpoint->repairAttemptsFor([$repaired]),
        );
    }

    public function test_ambiguous_repair_lineage_and_malformed_checkpoints_fail_closed(): void
    {
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $checkpoint->correlateCalls([
            new ToolCall('provider-a', 'web_search', ['query' => 'A'], null, []),
            new ToolCall('provider-b', 'web_search', ['query' => 'B'], null, []),
        ]);

        try {
            $checkpoint->correlateCalls(
                [new ToolCall('provider-repaired', 'web_search', ['query' => 'fixed'], null, [])],
                ['provider-a', 'provider-b'],
            );
            $this->fail('Ambiguous repair lineage was accepted.');
        } catch (InvalidArgumentException $exception) {
            $this->assertSame('Repaired provider calls do not have an unambiguous logical lineage.', $exception->getMessage());
        }

        $equalCardinality = TalosProceduralGuardCheckpoint::fresh();
        $equalCardinality->correlateCalls([
            new ToolCall('provider-a', 'web_search', ['query' => 'A'], null, []),
            new ToolCall('provider-b', 'web_search', ['query' => 'B'], null, []),
        ]);
        try {
            $equalCardinality->correlateCalls([
                new ToolCall('provider-new-a', 'web_search', ['query' => 'fixed A'], null, []),
                new ToolCall('provider-new-b', 'web_search', ['query' => 'fixed B'], null, []),
            ], ['provider-a', 'provider-b']);
            $this->fail('Equal-cardinality unrelated repair calls were correlated by position.');
        } catch (TalosRepairLineageException $exception) {
            $this->assertSame('TALOS_TOOL_REPAIR_LINEAGE_AMBIGUOUS', $exception->faultCode);
        }

        $identity = TalosProceduralGuardCheckpoint::fresh();
        $identity->correlateCalls([
            new ToolCall('provider-a', 'web_search', ['query' => 'A'], null, []),
            new ToolCall('provider-b', 'web_search', ['query' => 'B'], null, []),
        ]);
        $identity->correlateCalls([
            new ToolCall('provider-b', 'web_search', ['query' => 'fixed B'], null, []),
            new ToolCall('provider-a', 'web_search', ['query' => 'fixed A'], null, []),
        ], ['provider-a', 'provider-b']);
        $this->assertSame('provider-b', $identity->logicalCallId('provider-b'));
        $this->assertSame('provider-a', $identity->logicalCallId('provider-a'));

        $this->expectException(InvalidArgumentException::class);
        TalosProceduralGuardCheckpoint::fromEncoded('{"schema_version":"unknown"}');
    }

    public function test_the_same_repair_result_is_applied_only_once_across_checkpoint_restore(): void
    {
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $call = new ToolCall('provider-a', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint->correlateCalls([$call]);
        $result = ToolResult::error('provider-a', 'TALOS_TOOL_ARGUMENTS_INVALID', 'Repair arguments.');

        $this->assertFalse($checkpoint->repairWasApplied($result));
        $this->assertSame(1, $checkpoint->applyRepair($result));
        $this->assertTrue($checkpoint->repairWasApplied($result));
        $this->assertSame(1, $checkpoint->applyRepair($result));
        $this->assertSame(1, $checkpoint->repairAttempt('provider-a'));

        $restored = TalosProceduralGuardCheckpoint::fromEncoded($checkpoint->encode());
        $this->assertTrue($restored->repairWasApplied($result));
        $this->assertSame(1, $restored->applyRepair($result));
        $this->assertSame(1, $restored->repairAttempt('provider-a'));
    }

    public function test_it_proves_that_each_compiled_call_is_present_in_the_durable_guard_state(): void
    {
        $checkpoint = TalosProceduralGuardCheckpoint::fresh();
        $original = new ToolCall('provider-original', 'web_search', ['query' => 'AVM'], null, []);
        $checkpoint->correlateCalls([$original]);
        $originalDecision = $checkpoint->guard()->inspect($original, 0);

        $this->assertTrue($checkpoint->containsCompiledCall($original, $originalDecision->fingerprint));
        $this->assertFalse($checkpoint->containsCompiledCall(
            $original,
            'sha256:'.str_repeat('0', 64),
        ));

        $checkpoint->incrementRepair('provider-original');
        $repaired = new ToolCall('provider-repaired', 'web_search', ['query' => 'TALOS'], null, []);
        $checkpoint->correlateCalls([$repaired], ['provider-original']);
        $repairDecision = $checkpoint->guard()->inspect(
            $repaired,
            0,
            isRetry: true,
            logicalCallId: $checkpoint->logicalCallId('provider-repaired'),
        );

        $this->assertTrue($checkpoint->containsCompiledCall($repaired, $repairDecision->fingerprint));
    }
}
