<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\TalosBrowserTask;
use App\Services\Talos\Browser\TalosBrowserTaskReducer;
use Carbon\CarbonImmutable;
use InvalidArgumentException;
use Kadmos\Browser\Contract\BrowserTaskStatus;
use Tests\TestCase;

final class TalosBrowserTaskReducerTest extends TestCase
{
    public function test_it_uses_the_core_transition_table_and_rejects_stale_or_terminal_transitions(): void
    {
        $reducer = new TalosBrowserTaskReducer;
        $created = $this->task('created', 0);

        $planning = $reducer->transition($created, BrowserTaskStatus::Planning, 0);

        $this->assertSame(BrowserTaskStatus::Planning, $planning->status);
        $this->assertSame(1, $planning->stateVersion);
        $this->assertSame('created', $created->status);
        $this->assertSame(0, $created->state_version);

        $this->expectException(InvalidArgumentException::class);
        $reducer->transition($created, BrowserTaskStatus::Planning, 1);
    }

    public function test_it_rejects_a_terminal_task_reopen_through_the_same_core_contract(): void
    {
        $this->expectException(InvalidArgumentException::class);

        (new TalosBrowserTaskReducer)->transition(
            $this->task('completed', 7),
            BrowserTaskStatus::Running,
            7,
        );
    }

    private function task(string $status, int $stateVersion): TalosBrowserTask
    {
        $now = CarbonImmutable::parse('2026-07-15T12:00:00Z');
        $task = new TalosBrowserTask;
        $task->forceFill([
            'id' => '11111111-1111-4111-8111-111111111111',
            'schema_version' => 'talos.browser.task.v1',
            'user_id' => 1,
            'talos_session_id' => '22222222-2222-4222-8222-222222222222',
            'origin_message_id' => '33333333-3333-4333-8333-333333333333',
            'goal' => 'Inspect the current page.',
            'status' => $status,
            'autonomy_profile' => 'assist',
            'budget' => [
                'max_actions' => 8,
                'max_elapsed_ms' => 60_000,
                'max_bytes' => 1_000_000,
                'max_tabs' => 4,
            ],
            'runtime_id' => null,
            'active_tab_id' => null,
            'state_version' => $stateVersion,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $task;
    }
}
