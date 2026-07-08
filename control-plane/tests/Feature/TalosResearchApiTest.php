<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosResearchApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateTalosUser();
    }

    public function test_claim_cannot_be_verified_without_source(): void
    {
        $this->postJson('/api/talos/research-reports', [
            'title' => 'AVM evidence review',
            'query' => 'Verify the AVM benchmark claims.',
            'sources' => [
                [
                    'client_id' => 'src-1',
                    'url' => 'https://example.com/avm',
                    'title' => 'AVM source',
                    'status' => 'fetched',
                    'excerpt' => 'Relevant evidence.',
                ],
            ],
            'claims' => [
                [
                    'text' => 'AVM improves recovery quality.',
                    'status' => 'verified',
                    'source_refs' => [],
                ],
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['claims.0.source_refs']);
    }

    public function test_research_report_creates_pipeline_run_artifact_and_source_sequence(): void
    {
        $response = $this->postJson('/api/talos/research-reports', [
            'title' => 'AVM source-backed report',
            'query' => 'Find evidence for AVM claim verification.',
            'sources' => [
                [
                    'client_id' => 'src-1',
                    'url' => 'https://example.com/source-1',
                    'title' => 'Primary source',
                    'status' => 'fetched',
                    'excerpt' => 'The report claim is supported here.',
                ],
            ],
            'claims' => [
                [
                    'text' => 'The report has a source-backed claim.',
                    'status' => 'verified',
                    'source_refs' => ['src-1'],
                ],
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.status', 'succeeded')
            ->assertJsonPath('data.sources.0.status', 'fetched')
            ->assertJsonPath('data.claims.0.status', 'verified')
            ->assertJsonPath('data.artifact.artifact_type', 'research_report')
            ->assertJsonPath('data.artifact.metadata.claim_count', 1)
            ->assertJsonPath('data.artifact.metadata.source_count', 1);

        $runId = $response->json('data.run_id');
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_runs', [
            'id' => $runId,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
        ]);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'event_type' => 'research.pipeline.step',
        ]);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'event_type' => 'research.source.fetch',
            'node_id' => 'src-1',
        ]);

        $this->getJson("/api/talos/runs/{$runId}/replay")
            ->assertOk()
            ->assertJsonPath('steps.0.type', 'research.pipeline.step');
    }

    public function test_draft_research_input_does_not_claim_source_fetch_or_claim_verification(): void
    {
        $response = $this->postJson('/api/talos/research-reports', [
            'title' => 'Draft source review',
            'query' => 'Plan evidence collection without pretending fetch or verification.',
            'sources' => [
                [
                    'client_id' => 'src-1',
                    'url' => 'https://example.com/source-1',
                    'title' => 'Candidate source',
                    'status' => 'planned',
                ],
            ],
            'claims' => [
                [
                    'text' => 'Candidate claim awaiting verification.',
                    'status' => 'pending',
                    'source_refs' => ['src-1'],
                ],
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.sources.0.status', 'planned')
            ->assertJsonPath('data.claims.0.status', 'pending');

        $runId = $response->json('data.run_id');
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'node_id' => 'fetch_sources',
            'payload->status' => 'SKIPPED',
        ]);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'node_id' => 'verify_claims',
            'payload->status' => 'SKIPPED',
        ]);
    }

    public function test_failed_fetch_blocks_only_dependent_claim_branch(): void
    {
        $response = $this->postJson('/api/talos/research-reports', [
            'title' => 'Mixed source report',
            'query' => 'Verify independent claims.',
            'sources' => [
                [
                    'client_id' => 'good-source',
                    'url' => 'https://example.com/good',
                    'title' => 'Good source',
                    'status' => 'fetched',
                    'excerpt' => 'A verified source.',
                ],
                [
                    'client_id' => 'failed-source',
                    'url' => 'https://example.com/down',
                    'title' => 'Unavailable source',
                    'status' => 'failed',
                    'failure_reason' => 'HTTP 503',
                ],
            ],
            'claims' => [
                [
                    'text' => 'Independent claim remains verified.',
                    'status' => 'verified',
                    'source_refs' => ['good-source'],
                ],
                [
                    'text' => 'Dependent claim should block.',
                    'status' => 'verified',
                    'source_refs' => ['failed-source'],
                ],
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.status', 'blocked')
            ->assertJsonPath('data.claims.0.status', 'verified')
            ->assertJsonPath('data.claims.1.status', 'blocked_by_source')
            ->assertJsonPath('data.claims.1.metadata.blocked_by_sources.0', 'failed-source');
    }

    public function test_research_report_can_be_listed_and_shown_with_claim_source_mapping(): void
    {
        $created = $this->postJson('/api/talos/research-reports', [
            'title' => 'Inspectable report',
            'query' => 'Show claim mapping.',
            'sources' => [
                [
                    'client_id' => 'src-1',
                    'url' => 'https://example.com/source',
                    'title' => 'Source',
                    'status' => 'fetched',
                ],
            ],
            'claims' => [
                [
                    'text' => 'Claim mapped to source.',
                    'status' => 'verified',
                    'source_refs' => ['src-1'],
                ],
            ],
        ])->assertCreated();

        $reportId = $created->json('data.id');
        $this->assertIsString($reportId);

        $this->getJson('/api/talos/research-reports')
            ->assertOk()
            ->assertJsonPath('data.0.id', $reportId)
            ->assertJsonMissingPath('data.0.claims');

        $this->getJson("/api/talos/research-reports/{$reportId}")
            ->assertOk()
            ->assertJsonPath('data.id', $reportId)
            ->assertJsonPath('data.claims.0.sources.0.client_id', 'src-1');
    }
}
