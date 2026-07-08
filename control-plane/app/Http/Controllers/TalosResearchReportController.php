<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\TalosResearchClaim;
use App\Models\TalosResearchReport;
use App\Models\TalosResearchSource;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class TalosResearchReportController extends Controller
{
    public function index(): JsonResponse
    {
        $reports = TalosResearchReport::query()
            ->withCount(['sources', 'claims'])
            ->latest('created_at')
            ->get()
            ->map(fn (TalosResearchReport $report): array => $report->toApiArray())
            ->values();

        return response()->json(['data' => $reports]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'min:1', 'max:255'],
            'query' => ['required', 'string', 'min:1', 'max:20000'],
            'summary' => ['sometimes', 'nullable', 'string', 'max:50000'],
            'report_markdown' => ['sometimes', 'nullable', 'string', 'max:200000'],
            'context_set_id' => ['sometimes', 'nullable', 'string', 'exists:talos_context_sets,id'],
            'benchmark_group_id' => ['sometimes', 'nullable', 'string', 'exists:talos_benchmark_groups,id'],
            'metadata' => ['sometimes', 'nullable', 'array'],
            'sources' => ['required', 'array', 'min:1'],
            'sources.*.client_id' => ['required', 'string', 'min:1', 'max:128'],
            'sources.*.source_type' => ['sometimes', 'nullable', 'string', 'max:64'],
            'sources.*.url' => ['required', 'url', 'max:2048'],
            'sources.*.title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sources.*.status' => ['required', 'string', Rule::in(['planned', 'fetched', 'failed', 'skipped'])],
            'sources.*.excerpt' => ['sometimes', 'nullable', 'string', 'max:50000'],
            'sources.*.failure_reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'sources.*.metadata' => ['sometimes', 'nullable', 'array'],
            'claims' => ['required', 'array', 'min:1'],
            'claims.*.text' => ['required', 'string', 'min:1', 'max:50000'],
            'claims.*.status' => ['required', 'string', Rule::in(['pending', 'verified', 'conflicting', 'blocked_by_source', 'rejected'])],
            'claims.*.confidence' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:1'],
            'claims.*.source_refs' => ['required', 'array'],
            'claims.*.source_refs.*' => ['string', 'min:1', 'max:128'],
            'claims.*.metadata' => ['sometimes', 'nullable', 'array'],
        ]);

        /** @var list<array<string, mixed>> $sources */
        $sources = $validated['sources'];
        /** @var list<array<string, mixed>> $claims */
        $claims = $validated['claims'];

        $this->validateResearchGraph($sources, $claims);

        $report = DB::transaction(function () use ($validated, $sources, $claims): TalosResearchReport {
            $run = TalosRun::query()->create([
                'context_set_id' => $validated['context_set_id'] ?? null,
                'mode' => 'verified_execution',
                'status' => $this->containsFailedSource($sources) ? 'failed' : 'succeeded',
                'prompt_hash' => hash('sha256', (string) $validated['query']),
                'prompt' => $validated['query'],
                'metadata' => [
                    'source' => 'talos_research_report',
                    'pipeline' => [
                        'plan_queries',
                        'search_sources',
                        'fetch_sources',
                        'extract_claims',
                        'deduplicate_claims',
                        'verify_claims',
                        'synthesize_report',
                        'export_report',
                    ],
                ],
                'started_at' => now(),
                'completed_at' => now(),
            ]);
            assert($run instanceof TalosRun);

            $report = TalosResearchReport::query()->create([
                'run_id' => $run->id,
                'context_set_id' => $validated['context_set_id'] ?? null,
                'benchmark_group_id' => $validated['benchmark_group_id'] ?? null,
                'title' => $validated['title'],
                'query' => $validated['query'],
                'status' => $this->reportStatus($sources, $claims),
                'summary' => $validated['summary'] ?? null,
                'report_markdown' => $validated['report_markdown'] ?? $this->markdownFromPayload($validated['title'], $validated['query'], $claims),
                'metadata' => [
                    ...($validated['metadata'] ?? []),
                    'source_count' => count($sources),
                    'claim_count' => count($claims),
                ],
            ]);
            assert($report instanceof TalosResearchReport);

            $sourceByClientId = [];
            foreach ($sources as $index => $sourcePayload) {
                $source = $report->sources()->create([
                    'client_id' => $sourcePayload['client_id'],
                    'sequence' => $index + 1,
                    'source_type' => $sourcePayload['source_type'] ?? 'web',
                    'url' => $sourcePayload['url'],
                    'title' => $sourcePayload['title'] ?? null,
                    'status' => $sourcePayload['status'],
                    'excerpt' => $sourcePayload['excerpt'] ?? null,
                    'content_hash' => isset($sourcePayload['excerpt']) ? hash('sha256', (string) $sourcePayload['excerpt']) : null,
                    'failure_reason' => $sourcePayload['failure_reason'] ?? null,
                    'metadata' => $sourcePayload['metadata'] ?? null,
                ]);
                assert($source instanceof TalosResearchSource);
                $sourceByClientId[$source->client_id] = $source;
            }

            foreach ($claims as $index => $claimPayload) {
                $sourceRefs = $claimPayload['source_refs'];
                assert(is_array($sourceRefs));
                $blockedSources = $this->failedSourceRefs($sourceRefs, $sourceByClientId);
                $status = count($blockedSources) > 0 ? 'blocked_by_source' : $claimPayload['status'];

                $claim = $report->claims()->create([
                    'sequence' => $index + 1,
                    'text' => $claimPayload['text'],
                    'status' => $status,
                    'confidence' => $claimPayload['confidence'] ?? null,
                    'metadata' => [
                        ...($claimPayload['metadata'] ?? []),
                        ...($blockedSources ? ['blocked_by_sources' => array_values($blockedSources)] : []),
                    ],
                ]);
                assert($claim instanceof TalosResearchClaim);

                $sourceIds = array_map(
                    fn (string $clientId): string => $sourceByClientId[$clientId]->id,
                    $sourceRefs,
                );
                $claim->sources()->sync($sourceIds);
            }

            $this->appendResearchRunEvents($run, $report, $sources);

            $artifact = $run->artifacts()->create([
                'artifact_type' => 'research_report',
                'uri' => "talos://research-reports/{$report->id}",
                'mime_type' => 'application/json',
                'metadata' => [
                    'research_report_id' => $report->id,
                    'source_count' => count($sources),
                    'claim_count' => count($claims),
                    'sha256' => hash('sha256', (string) $report->report_markdown),
                ],
            ]);
            assert($artifact instanceof TalosRunArtifact);

            return $report->load(['sources', 'claims.sources', 'run.artifacts']);
        });

        $artifact = $report->run?->artifacts()
            ->where('artifact_type', 'research_report')
            ->latest('created_at')
            ->first();

        return response()->json([
            'data' => [
                ...$report->toApiArray(includeDetails: true),
                'artifact' => $artifact instanceof TalosRunArtifact ? $artifact->toApiArray() : null,
            ],
        ], 201);
    }

    public function show(TalosResearchReport $researchReport): JsonResponse
    {
        $researchReport->load(['sources', 'claims.sources']);

        return response()->json(['data' => $researchReport->toApiArray(includeDetails: true)]);
    }

    /**
     * @param list<array<string, mixed>> $sources
     * @param list<array<string, mixed>> $claims
     */
    private function validateResearchGraph(array $sources, array $claims): void
    {
        $sourceStatuses = [];
        foreach ($sources as $source) {
            $clientId = (string) $source['client_id'];
            if (isset($sourceStatuses[$clientId])) {
                throw ValidationException::withMessages([
                    'sources' => ['Source client_id values must be unique within a research report.'],
                ]);
            }
            $sourceStatuses[$clientId] = (string) $source['status'];
        }

        foreach ($claims as $index => $claim) {
            $sourceRefs = $claim['source_refs'];
            assert(is_array($sourceRefs));
            $status = (string) $claim['status'];

            if ($status === 'verified' && count($sourceRefs) === 0) {
                throw ValidationException::withMessages([
                    "claims.{$index}.source_refs" => ['Verified claims require at least one fetched source.'],
                ]);
            }

            foreach ($sourceRefs as $sourceRef) {
                if (! array_key_exists((string) $sourceRef, $sourceStatuses)) {
                    throw ValidationException::withMessages([
                        "claims.{$index}.source_refs" => ["Unknown source reference [{$sourceRef}]."],
                    ]);
                }
            }
        }
    }

    /**
     * @param list<array<string, mixed>> $sources
     */
    private function containsFailedSource(array $sources): bool
    {
        foreach ($sources as $source) {
            if (($source['status'] ?? null) === 'failed') {
                return true;
            }
        }

        return false;
    }

    /**
     * @param list<array<string, mixed>> $sources
     * @param list<array<string, mixed>> $claims
     */
    private function reportStatus(array $sources, array $claims): string
    {
        if ($this->containsFailedSource($sources)) {
            return 'blocked';
        }

        foreach ($claims as $claim) {
            if (($claim['status'] ?? null) === 'verified') {
                return 'succeeded';
            }
        }

        return 'draft';
    }

    /**
     * @param list<string> $sourceRefs
     * @param array<string, TalosResearchSource> $sourceByClientId
     * @return list<string>
     */
    private function failedSourceRefs(array $sourceRefs, array $sourceByClientId): array
    {
        $failed = [];

        foreach ($sourceRefs as $sourceRef) {
            $source = $sourceByClientId[$sourceRef] ?? null;
            if ($source?->status === 'failed') {
                $failed[] = $sourceRef;
            }
        }

        return $failed;
    }

    /**
     * @param list<array<string, mixed>> $claims
     */
    private function markdownFromPayload(string $title, string $query, array $claims): string
    {
        $lines = [
            "# {$title}",
            '',
            "Query: {$query}",
            '',
            '## Claims',
        ];

        foreach ($claims as $claim) {
            $lines[] = '- '.((string) $claim['text']);
        }

        return implode("\n", $lines);
    }

    /**
     * @param list<array<string, mixed>> $sources
     */
    private function appendResearchRunEvents(TalosRun $run, TalosResearchReport $report, array $sources): void
    {
        $sequence = 1;
        $pipeline = [
            'plan_queries',
            'search_sources',
            'fetch_sources',
            'extract_claims',
            'deduplicate_claims',
            'verify_claims',
            'synthesize_report',
            'export_report',
        ];

        foreach ($pipeline as $step) {
            $status = $this->pipelineStepStatus($step, $sources, $report);
            $run->events()->create([
                'sequence' => $sequence++,
                'event_type' => 'research.pipeline.step',
                'node_id' => $step,
                'severity' => $status === 'FAILED' ? 'warning' : 'info',
                'payload' => [
                    'status' => $status,
                    'step' => $step,
                    'research_report_id' => $report->id,
                ],
                'occurred_at' => now(),
            ]);
        }

        foreach ($sources as $source) {
            $status = ($source['status'] ?? null) === 'failed' ? 'FAILED' : 'SUCCESS';
            $run->events()->create([
                'sequence' => $sequence++,
                'event_type' => 'research.source.fetch',
                'node_id' => $source['client_id'],
                'severity' => $status === 'FAILED' ? 'warning' : 'info',
                'payload' => [
                    'status' => $status,
                    'url' => $source['url'],
                    'failure_reason' => $source['failure_reason'] ?? null,
                ],
                'occurred_at' => now(),
            ]);
        }
    }

    /**
     * @param list<array<string, mixed>> $sources
     */
    private function pipelineStepStatus(string $step, array $sources, TalosResearchReport $report): string
    {
        if ($step === 'fetch_sources') {
            if ($this->containsFailedSource($sources)) {
                return 'FAILED';
            }

            foreach ($sources as $source) {
                if (($source['status'] ?? null) === 'fetched') {
                    return 'SUCCESS';
                }
            }

            return 'SKIPPED';
        }

        if ($step === 'verify_claims') {
            foreach ($report->claims as $claim) {
                if ($claim->status === 'verified') {
                    return 'SUCCESS';
                }
            }

            return 'SKIPPED';
        }

        if ($step === 'export_report' && $report->status === 'draft') {
            return 'SKIPPED';
        }

        return 'SUCCESS';
    }
}
