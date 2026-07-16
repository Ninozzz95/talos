<?php

declare(strict_types=1);

namespace App\Services\Talos\Browser;

use App\Models\TalosBrowserCheckpoint;
use App\Models\TalosBrowserTask;
use App\Models\TalosToolTurn;
use App\Services\Security\CanonicalHttpUrl;
use Kadmos\Browser\Budget\BrowserBudget;
use Kadmos\Browser\Budget\BrowserBudgetDecision;

final readonly class TalosBrowserBudgetService
{
    private const LEGACY_MAX_DOMAINS = 16;

    private const LEGACY_MAX_TOKENS = 196608;

    private const MAX_SAFE_INTEGER = 9007199254740991;

    public function __construct(private BrowserSessionClient $worker) {}

    /** @return array<string, int> */
    public function effectiveLimits(TalosBrowserTask $task): array
    {
        $stored = is_array($task->budget) ? $task->budget : [];
        $effective = [
            ...$stored,
            'max_domains' => $stored['max_domains'] ?? self::LEGACY_MAX_DOMAINS,
            'max_tokens' => $stored['max_tokens'] ?? self::LEGACY_MAX_TOKENS,
        ];

        return BrowserBudget::fromArray($effective)->limits();
    }

    /** @return array{actions: int, elapsed_ms: int, bytes: int, tabs: int, domains: int, tokens: int} */
    public function usage(TalosBrowserTask $task): array
    {
        $task = TalosBrowserTask::query()->ownedBy((int) $task->user_id)->whereKey($task->id)->first();
        if (! $task instanceof TalosBrowserTask) {
            throw $this->journalFault('Browser task ownership could not be established.');
        }

        $actions = $task->actions()
            ->where(function ($query): void {
                $query->whereNotNull('started_at')
                    ->orWhereIn('status', ['dispatched', 'observed', 'committed', 'evidence_committed', 'verified', 'ambiguous']);
            })
            ->get(['kind', 'arguments']);
        $domains = [];
        foreach ($actions as $action) {
            if ($action->kind !== 'navigate') {
                continue;
            }
            $arguments = is_array($action->arguments) ? $action->arguments : [];
            $url = $arguments['url'] ?? null;
            if (! is_string($url)) {
                throw $this->journalFault('A persisted Browser navigation has no canonical URL.');
            }
            try {
                $domains[CanonicalHttpUrl::fromString($url)->asciiHost] = true;
            } catch (\InvalidArgumentException) {
                throw $this->journalFault('A persisted Browser navigation URL is invalid.');
            }
        }

        $bytes = 0;
        foreach ($task->evidenceBundles()->get(['snapshot_byte_size', 'screenshot_byte_size']) as $evidence) {
            foreach ([$evidence->snapshot_byte_size, $evidence->screenshot_byte_size] as $size) {
                if ($size === null) {
                    continue;
                }
                if (! is_int($size) || $size < 0 || $bytes > self::MAX_SAFE_INTEGER - $size) {
                    throw $this->journalFault('Persisted Browser evidence byte accounting is invalid.');
                }
                $bytes += $size;
            }
        }

        $startedAt = $task->started_at ?? $task->requested_at;
        if ($startedAt === null) {
            throw $this->journalFault('Browser task timing data is incomplete.');
        }
        $elapsed = max(0, (int) $startedAt->diffInMilliseconds(now()));

        return [
            'actions' => $actions->count(),
            'elapsed_ms' => min($elapsed, self::MAX_SAFE_INTEGER),
            'bytes' => $bytes,
            'tabs' => $this->tabCount($task),
            'domains' => count($domains),
            'tokens' => $this->tokenCount($task),
        ];
    }

    /** @param array<string, mixed> $candidateDelta */
    public function assertCanDispatch(TalosBrowserTask $task, array $candidateDelta): BrowserBudgetDecision
    {
        $usage = $this->usage($task);
        $decision = BrowserBudget::fromArray($this->effectiveLimits($task))->evaluate($usage, $candidateDelta);
        if (! $decision->allowed) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_BUDGET_EXHAUSTED',
                'The Browser task budget does not permit this operation.',
                'Reduce the requested Browser operation or start a new task with an approved budget.',
                [
                    'exhausted_limits' => $decision->exhaustedLimits,
                    'usage' => $usage,
                    'candidate_delta' => $candidateDelta,
                ],
            );
        }

        return $decision;
    }

    private function tabCount(TalosBrowserTask $task): int
    {
        $checkpoint = $task->checkpoints()->orderByDesc('task_state_version')->first();
        if ($checkpoint instanceof TalosBrowserCheckpoint) {
            if (! is_array($checkpoint->tab_inventory) || ! array_is_list($checkpoint->tab_inventory)) {
                throw $this->journalFault('Persisted Browser checkpoint tab inventory is invalid.');
            }

            return count($checkpoint->tab_inventory);
        }

        $browser = $task->browserSession;
        if ($browser === null || ! is_string($browser->worker_session_id) || $browser->worker_session_id === '') {
            return 0;
        }
        try {
            $inspection = $this->worker->inspect(
                'user:'.(int) $task->user_id,
                $browser->worker_session_id,
            );
        } catch (BrowserWorkerException $exception) {
            throw new TalosBrowserTaskException(
                'TALOS_BROWSER_BUDGET_STATE_UNAVAILABLE',
                'TALOS could not verify the Browser tab budget.',
                'Restore the Browser worker or recover the task from a durable checkpoint.',
                ['worker_code' => $exception->errorCode],
            );
        }
        if (array_key_exists('tabs', $inspection)) {
            if (! is_array($inspection['tabs']) || ! array_is_list($inspection['tabs'])) {
                throw $this->journalFault('Browser worker tab inspection is malformed.');
            }

            return count($inspection['tabs']);
        }

        return in_array($inspection['status'] ?? null, ['ready', 'active'], true) ? 1 : 0;
    }

    private function tokenCount(TalosBrowserTask $task): int
    {
        $message = $task->originMessage;
        if ($message === null || ! is_string($message->run_id) || $message->run_id === '') {
            return 0;
        }
        $turn = TalosToolTurn::query()
            ->ownedBy((int) $task->user_id)
            ->where('run_id', $message->run_id)
            ->first();
        if (! $turn instanceof TalosToolTurn) {
            return 0;
        }
        $usage = is_array($turn->budget_usage) ? $turn->budget_usage : [];
        $input = $usage['input_tokens'] ?? 0;
        $output = $usage['output_tokens'] ?? 0;
        if (! is_int($input) || ! is_int($output) || $input < 0 || $output < 0
            || $input > self::MAX_SAFE_INTEGER - $output) {
            throw $this->journalFault('Persisted Browser token accounting is invalid.');
        }

        return $input + $output;
    }

    private function journalFault(string $message): TalosBrowserTaskException
    {
        return new TalosBrowserTaskException(
            'TALOS_BROWSER_TASK_JOURNAL_INVALID',
            $message,
            'Open Doctor and inspect the Browser task journal before retrying.',
        );
    }
}
