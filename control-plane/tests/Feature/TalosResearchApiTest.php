<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosResearchJob;
use App\Models\TalosRun;
use App\Models\User;
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

    public function test_research_reports_are_owner_scoped_across_read_export_follow_up_and_page(): void
    {
        $created = $this->postJson('/api/talos/research-reports', [
            'title' => 'Private report',
            'query' => 'Keep this report private to the owner.',
            'sources' => [
                [
                    'client_id' => 'src-1',
                    'url' => 'https://example.com/private-source',
                    'title' => 'Private source',
                    'status' => 'fetched',
                ],
            ],
            'claims' => [
                [
                    'text' => 'Private claim.',
                    'status' => 'verified',
                    'source_refs' => ['src-1'],
                ],
            ],
        ])->assertCreated();

        $reportId = $created->json('data.id');
        $this->assertIsString($reportId);

        $ownerId = $created->json('data.user_id');
        $this->assertIsInt($ownerId);

        $this->actingAs(User::factory()->create());

        $this->getJson('/api/talos/research-reports')
            ->assertOk()
            ->assertJsonMissing(['id' => $reportId]);

        $this->getJson("/api/talos/research-reports/{$reportId}")
            ->assertNotFound();

        $this->getJson("/api/talos/research-reports/{$reportId}/export?format=markdown")
            ->assertNotFound();

        $this->postJson("/api/talos/research-reports/{$reportId}/follow-up-session", [
            'prompt' => 'Try to continue from another user report.',
        ])->assertNotFound();

        $this->get("/research/reports/{$reportId}")
            ->assertNotFound();
    }

    public function test_research_job_starts_with_persisted_run_and_planned_events(): void
    {
        $response = $this->postJson('/api/talos/research-jobs', [
            'query' => 'Map the evidence gaps in AVM recovery.',
            'settings' => [
                'mode' => 'deterministic_fixture',
                'rounds' => 2,
                'source_budget' => 4,
            ],
        ]);

        $response
            ->assertCreated()
            ->assertJsonPath('data.query', 'Map the evidence gaps in AVM recovery.')
            ->assertJsonPath('data.status', 'running')
            ->assertJsonPath('data.progress.stage', 'started')
            ->assertJsonPath('data.settings.mode', 'deterministic_fixture');

        $jobId = $response->json('data.id');
        $runId = $response->json('data.run_id');
        $this->assertIsString($jobId);
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_research_jobs', [
            'id' => $jobId,
            'run_id' => $runId,
            'query' => 'Map the evidence gaps in AVM recovery.',
            'status' => 'running',
        ]);

        $this->assertDatabaseHas('talos_runs', [
            'id' => $runId,
            'mode' => 'research_job',
            'status' => 'running',
        ]);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'event_type' => 'research.started',
            'payload->status' => 'RUNNING',
        ]);
    }

    public function test_research_job_advances_with_fixture_sources_to_report_and_events(): void
    {
        $started = $this->postJson('/api/talos/research-jobs', [
            'query' => 'Explain TALOS evidence replay.',
            'settings' => ['mode' => 'deterministic_fixture'],
        ])->assertCreated();

        $jobId = $started->json('data.id');
        $this->assertIsString($jobId);

        $response = $this->postJson("/api/talos/research-jobs/{$jobId}/fixtures", [
            'sources' => [
                [
                    'client_id' => 'src-a',
                    'url' => 'https://example.com/replay',
                    'title' => 'Replay source',
                    'excerpt' => 'Replay keeps source-backed evidence inspectable.',
                    'claims' => [
                        [
                            'text' => 'Replay keeps evidence inspectable.',
                            'confidence' => 0.82,
                        ],
                    ],
                ],
            ],
        ]);

        $response
            ->assertOk()
            ->assertJsonPath('data.job.status', 'completed')
            ->assertJsonPath('data.report.status', 'succeeded')
            ->assertJsonPath('data.report.sources.0.client_id', 'src-a')
            ->assertJsonPath('data.report.claims.0.status', 'verified')
            ->assertJsonPath('data.report.claims.0.sources.0.client_id', 'src-a');

        $reportId = $response->json('data.report.id');
        $runId = $response->json('data.job.run_id');
        $this->assertIsString($reportId);
        $this->assertIsString($runId);

        $this->assertDatabaseHas('talos_research_reports', [
            'id' => $reportId,
            'run_id' => $runId,
            'status' => 'succeeded',
        ]);

        $this->assertDatabaseHas('talos_run_events', [
            'run_id' => $runId,
            'event_type' => 'research.completed',
            'payload->research_report_id' => $reportId,
        ]);
    }

    public function test_research_job_owner_scoping_and_malformed_settings_are_controlled(): void
    {
        $ownerResponse = $this->postJson('/api/talos/research-jobs', [
            'query' => 'Owner scoped research',
            'settings' => ['mode' => 'deterministic_fixture'],
        ])->assertCreated();

        $jobId = $ownerResponse->json('data.id');
        $this->assertIsString($jobId);

        $this->actingAs(User::factory()->create());

        $this->getJson("/api/talos/research-jobs/{$jobId}")
            ->assertNotFound();

        $this->postJson('/api/talos/research-jobs', [
            'query' => 'Bad settings',
            'settings' => [
                'mode' => 'live_web',
                'rounds' => 'many',
            ],
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['settings.mode', 'settings.rounds']);
    }

    public function test_research_report_export_and_follow_up_session_are_real_artifacts(): void
    {
        $created = $this->postJson('/api/talos/research-reports', [
            'title' => 'Follow-up report',
            'query' => 'Continue from source-backed findings.',
            'sources' => [
                [
                    'client_id' => 'src-1',
                    'url' => 'https://example.com/follow-up',
                    'title' => 'Follow-up source',
                    'status' => 'fetched',
                    'excerpt' => 'A source-backed follow-up.',
                ],
            ],
            'claims' => [
                [
                    'text' => 'Follow-up should carry report metadata.',
                    'status' => 'verified',
                    'source_refs' => ['src-1'],
                ],
            ],
        ])->assertCreated();

        $reportId = $created->json('data.id');
        $this->assertIsString($reportId);

        $this->getJson("/api/talos/research-reports/{$reportId}/export?format=markdown")
            ->assertOk()
            ->assertJsonPath('data.format', 'markdown')
            ->assertJsonPath('data.mime_type', 'text/markdown')
            ->assertJsonPath('data.research_report_id', $reportId)
            ->assertJsonPath('data.export_status', 'complete');

        $followUp = $this->postJson("/api/talos/research-reports/{$reportId}/follow-up-session", [
            'prompt' => 'Draft a follow-up benchmark plan.',
        ]);

        $followUp
            ->assertCreated()
            ->assertJsonPath('data.mode', 'research_follow_up')
            ->assertJsonPath('data.metadata.source', 'research_report_follow_up')
            ->assertJsonPath('data.metadata.research_report_id', $reportId);

        $this->assertDatabaseHas('talos_sessions', [
            'id' => $followUp->json('data.id'),
            'mode' => 'research_follow_up',
        ]);
    }
}
