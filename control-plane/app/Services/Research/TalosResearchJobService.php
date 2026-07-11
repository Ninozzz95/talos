<?php

declare(strict_types=1);

namespace App\Services\Research;

use App\Models\TalosResearchClaim;
use App\Models\TalosResearchJob;
use App\Models\TalosResearchReport;
use App\Models\TalosResearchSource;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\User;
use Illuminate\Support\Facades\DB;

final class TalosResearchJobService
{
    /**
     * The production executor is intentionally unavailable until a real worker
     * can own live research execution and terminal state transitions.
     *
     * @return array<string, mixed>
     */
    public function executionCapability(): array
    {
        return [
            'available' => false,
            'mode' => 'live',
            'code' => 'TALOS_RESEARCH_EXECUTOR_UNAVAILABLE',
            'message' => 'Live research is unavailable because no production executor is configured.',
            'fixture_mode' => [
                'available' => true,
                'mode' => 'deterministic_fixture',
                'test_only' => true,
            ],
        ];
    }

    /**
     * @param array<string, mixed> $payload
     */
    public function start(array $payload, User $user): TalosResearchJob
    {
        return DB::transaction(function () use ($payload, $user): TalosResearchJob {
            $query = (string) $payload['query'];
            /** @var array<string, mixed> $settings */
            $settings = $payload['settings'] ?? [];
            $mode = $settings['mode'] ?? 'live';

            if ($mode !== 'deterministic_fixture') {
                throw new \LogicException($this->executionCapability()['message'], 503);
            }

            $run = TalosRun::query()->create([
                'user_id' => $user->id,
                'mode' => 'research_job',
                'status' => 'running',
                'prompt_hash' => hash('sha256', $query),
                'prompt' => $query,
                'metadata' => [
                    'source' => 'talos_research_job',
                    'fixture_mode' => $settings['mode'] ?? 'deterministic_fixture',
                ],
                'started_at' => now(),
            ]);
            assert($run instanceof TalosRun);

            $job = TalosResearchJob::query()->create([
                'user_id' => $user->id,
                'run_id' => $run->id,
                'query' => $query,
                'status' => 'running',
                'settings' => $settings,
                'progress' => [
                    'stage' => 'started',
                    'percent' => 5,
                    'source_count' => 0,
                    'claim_count' => 0,
                ],
                'started_at' => now(),
            ]);
            assert($job instanceof TalosResearchJob);

            $this->appendEvent($run, 1, 'research.started', 'research_job', 'info', [
                'status' => 'RUNNING',
                'research_job_id' => $job->id,
                'query_hash' => hash('sha256', $query),
            ]);

            return $job->load('run');
        });
    }

    /**
     * @param list<array<string, mixed>> $sources
     */
    public function advanceWithFixtures(TalosResearchJob $job, array $sources): TalosResearchReport
    {
        return DB::transaction(function () use ($job, $sources): TalosResearchReport {
            $run = $job->run;
            if (! $run instanceof TalosRun) {
                $run = TalosRun::query()->findOrFail($job->run_id);
            }

            $sourceCount = count($sources);
            $claimCount = array_sum(array_map(
                fn (array $source): int => is_array($source['claims'] ?? null) ? count($source['claims']) : 0,
                $sources,
            ));

            $report = TalosResearchReport::query()->create([
                'user_id' => $job->user_id,
                'run_id' => $run->id,
                'title' => $this->titleFromQuery($job->query),
                'query' => $job->query,
                'status' => $sourceCount > 0 && $claimCount > 0 ? 'succeeded' : 'draft',
                'summary' => $this->summaryFromFixtures($sources),
                'report_markdown' => $this->markdownFromFixtures($job->query, $sources),
                'metadata' => [
                    'source' => 'research_job_fixture',
                    'research_job_id' => $job->id,
                    'source_count' => $sourceCount,
                    'claim_count' => $claimCount,
                ],
            ]);
            assert($report instanceof TalosResearchReport);

            $sourceModelsByClientId = [];
            $sequence = 1;
            foreach ($sources as $sourcePayload) {
                $clientId = (string) $sourcePayload['client_id'];
                $source = $report->sources()->create([
                    'client_id' => $clientId,
                    'sequence' => $sequence++,
                    'source_type' => $sourcePayload['source_type'] ?? 'web',
                    'url' => $sourcePayload['url'],
                    'title' => $sourcePayload['title'] ?? null,
                    'status' => $sourcePayload['status'] ?? 'fetched',
                    'excerpt' => $sourcePayload['excerpt'] ?? null,
                    'content_hash' => isset($sourcePayload['excerpt']) ? hash('sha256', (string) $sourcePayload['excerpt']) : null,
                    'failure_reason' => $sourcePayload['failure_reason'] ?? null,
                    'metadata' => [
                        'fixture' => true,
                        ...($sourcePayload['metadata'] ?? []),
                    ],
                ]);
                assert($source instanceof TalosResearchSource);
                $sourceModelsByClientId[$clientId] = $source;
            }

            $claimSequence = 1;
            foreach ($sources as $sourcePayload) {
                $clientId = (string) $sourcePayload['client_id'];
                $claims = $sourcePayload['claims'] ?? [];
                if (! is_array($claims)) {
                    continue;
                }

                foreach ($claims as $claimPayload) {
                    if (! is_array($claimPayload)) {
                        continue;
                    }

                    $claim = $report->claims()->create([
                        'sequence' => $claimSequence++,
                        'text' => (string) $claimPayload['text'],
                        'status' => ($sourcePayload['status'] ?? 'fetched') === 'failed' ? 'blocked_by_source' : 'verified',
                        'confidence' => $claimPayload['confidence'] ?? null,
                        'metadata' => [
                            'source_client_id' => $clientId,
                            ...($claimPayload['metadata'] ?? []),
                        ],
                    ]);
                    assert($claim instanceof TalosResearchClaim);
                    $claim->sources()->sync([$sourceModelsByClientId[$clientId]->id]);
                }
            }

            $job->update([
                'status' => 'completed',
                'progress' => [
                    'stage' => 'completed',
                    'percent' => 100,
                    'source_count' => $sourceCount,
                    'claim_count' => $claimCount,
                    'research_report_id' => $report->id,
                ],
                'completed_at' => now(),
            ]);

            $run->update([
                'status' => 'succeeded',
                'completed_at' => now(),
                'metadata' => [
                    ...($run->metadata ?? []),
                    'research_job_id' => $job->id,
                    'research_report_id' => $report->id,
                ],
            ]);

            $nextSequence = ((int) $run->events()->max('sequence')) + 1;
            foreach ($sources as $sourcePayload) {
                $this->appendEvent($run, $nextSequence++, 'research.source.planned', (string) $sourcePayload['client_id'], 'info', [
                    'status' => 'SUCCESS',
                    'research_job_id' => $job->id,
                    'research_report_id' => $report->id,
                    'title' => $sourcePayload['title'] ?? null,
                ]);
            }

            $this->appendEvent($run, $nextSequence++, 'research.claim.pending', 'claim_extraction', 'info', [
                'status' => 'SUCCESS',
                'research_job_id' => $job->id,
                'research_report_id' => $report->id,
                'claim_count' => $claimCount,
            ]);

            $this->appendEvent($run, $nextSequence, 'research.completed', 'research_job', 'info', [
                'status' => 'SUCCESS',
                'research_job_id' => $job->id,
                'research_report_id' => $report->id,
            ]);

            $artifact = $run->artifacts()->create([
                'artifact_type' => 'research_report',
                'uri' => "talos://research-reports/{$report->id}",
                'mime_type' => 'application/json',
                'metadata' => [
                    'research_report_id' => $report->id,
                    'source_count' => $sourceCount,
                    'claim_count' => $claimCount,
                    'sha256' => hash('sha256', (string) $report->report_markdown),
                ],
            ]);
            assert($artifact instanceof TalosRunArtifact);

            return $report->load(['sources', 'claims.sources', 'run.artifacts']);
        });
    }

    public function cancel(TalosResearchJob $job): TalosResearchJob
    {
        $job->update([
            'status' => 'cancelled',
            'progress' => [
                ...($job->progress ?? []),
                'stage' => 'cancelled',
                'percent' => $job->progress['percent'] ?? 0,
            ],
            'completed_at' => now(),
        ]);

        if ($job->run instanceof TalosRun) {
            $job->run->update([
                'status' => 'cancelled',
                'completed_at' => now(),
            ]);
        }

        return $job->refresh();
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function appendEvent(TalosRun $run, int $sequence, string $type, string $nodeId, string $severity, array $payload): void
    {
        $run->events()->create([
            'sequence' => $sequence,
            'event_type' => $type,
            'node_id' => $nodeId,
            'severity' => $severity,
            'payload' => $payload,
            'occurred_at' => now(),
        ]);
    }

    private function titleFromQuery(string $query): string
    {
        $title = trim(preg_replace('/\s+/', ' ', $query) ?? $query);

        return mb_substr($title, 0, 120);
    }

    /**
     * @param list<array<string, mixed>> $sources
     */
    private function summaryFromFixtures(array $sources): string
    {
        if ($sources === []) {
            return 'No fixture sources were provided.';
        }

        return 'Fixture research completed with '.count($sources).' source-backed evidence item(s).';
    }

    /**
     * @param list<array<string, mixed>> $sources
     */
    private function markdownFromFixtures(string $query, array $sources): string
    {
        $lines = [
            '# '.$this->titleFromQuery($query),
            '',
            '## Executive Summary',
            $this->summaryFromFixtures($sources),
            '',
            '## Sources',
        ];

        foreach ($sources as $source) {
            $lines[] = '- '.((string) ($source['title'] ?? $source['url'])).' — '.((string) $source['url']);
        }

        $lines[] = '';
        $lines[] = '## Claims';

        foreach ($sources as $source) {
            $claims = $source['claims'] ?? [];
            if (! is_array($claims)) {
                continue;
            }

            foreach ($claims as $claim) {
                if (is_array($claim) && isset($claim['text'])) {
                    $lines[] = '- '.((string) $claim['text']);
                }
            }
        }

        return implode("\n", $lines);
    }
}
