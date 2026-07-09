<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosResearchReport;
use App\Models\TalosDocument;
use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosDocumentArtifactApiTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_document_can_be_saved_from_run_artifact_and_export_includes_metadata(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'research prompt'),
            'provider' => 'openai',
            'model' => 'gpt-test',
        ]);
        assert($run instanceof TalosRun);

        $artifact = $run->artifacts()->create([
            'artifact_type' => 'research_report',
            'uri' => 'talos://research-reports/report-1',
            'mime_type' => 'application/json',
            'metadata' => ['sha256' => hash('sha256', 'report'), 'claim_count' => 2],
        ]);
        assert($artifact instanceof TalosRunArtifact);

        $created = $this->postJson('/api/talos/documents', [
            'run_id' => $run->id,
            'run_artifact_id' => $artifact->id,
            'title' => 'Board-ready AVM report',
            'document_type' => 'research_report',
            'format' => 'markdown',
            'content' => "# Board-ready AVM report\n\nEvidence-backed output.",
            'metadata' => ['audience' => 'pilot'],
        ]);

        $created
            ->assertCreated()
            ->assertJsonPath('data.run_id', $run->id)
            ->assertJsonPath('data.run_artifact_id', $artifact->id)
            ->assertJsonPath('data.content_preview', '# Board-ready AVM report')
            ->assertJsonMissingPath('data.content');

        $documentId = $created->json('data.id');
        $this->assertIsString($documentId);

        $this->getJson("/api/talos/documents/{$documentId}/export")
            ->assertOk()
            ->assertJsonPath('data.id', $documentId)
            ->assertJsonPath('data.content', "# Board-ready AVM report\n\nEvidence-backed output.")
            ->assertJsonPath('data.metadata.audience', 'pilot')
            ->assertJsonPath('data.provenance.run_id', $run->id)
            ->assertJsonPath('data.provenance.artifact_id', $artifact->id)
            ->assertJsonPath('data.provenance.prompt_hash', hash('sha256', 'research prompt'));
    }

    public function test_artifact_links_to_run_provenance_and_unsupported_preview_falls_back_to_download(): void
    {
        $run = TalosRun::query()->create([
            'user_id' => $this->user->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'binary artifact prompt'),
            'provider' => 'openai',
            'model' => 'gpt-test',
        ]);
        assert($run instanceof TalosRun);

        $artifact = $run->artifacts()->create([
            'artifact_type' => 'binary_bundle',
            'uri' => 'local://artifacts/bundle.bin',
            'mime_type' => 'application/octet-stream',
            'metadata' => ['sha256' => hash('sha256', 'bundle')],
        ]);
        assert($artifact instanceof TalosRunArtifact);

        $this->getJson('/api/talos/artifacts')
            ->assertOk()
            ->assertJsonPath('data.0.id', $artifact->id)
            ->assertJsonPath('data.0.run.id', $run->id)
            ->assertJsonPath('data.0.run.prompt_hash', hash('sha256', 'binary artifact prompt'));

        $this->getJson("/api/talos/artifacts/{$artifact->id}/preview")
            ->assertOk()
            ->assertJsonPath('data.preview_available', false)
            ->assertJsonPath('data.fallback', 'download')
            ->assertJsonPath('data.artifact.id', $artifact->id)
            ->assertJsonPath('data.artifact.uri', 'local://artifacts/bundle.bin');
    }

    public function test_research_artifact_preview_returns_report_with_sources_and_claims(): void
    {
        $created = $this->postJson('/api/talos/research-reports', [
            'title' => 'Previewable research report',
            'query' => 'Preview the generated artifact.',
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
                    'text' => 'Preview includes claim-source mapping.',
                    'status' => 'verified',
                    'source_refs' => ['src-1'],
                ],
            ],
        ])->assertCreated();

        $artifactId = $created->json('data.artifact.id');
        $this->assertIsString($artifactId);

        $this->getJson("/api/talos/artifacts/{$artifactId}/preview")
            ->assertOk()
            ->assertJsonPath('data.preview_available', true)
            ->assertJsonPath('data.preview_type', 'research_report')
            ->assertJsonPath('data.report.claims.0.sources.0.client_id', 'src-1');
    }

    public function test_artifacts_and_research_previews_are_scoped_to_the_authenticated_user(): void
    {
        $foreignUser = User::factory()->create();
        $foreignSession = TalosSession::query()->create([
            'user_id' => $foreignUser->id,
            'title' => 'Foreign artifact session',
            'mode' => 'verified_execution',
        ]);
        $foreignRun = TalosRun::query()->create([
            'session_id' => $foreignSession->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'foreign artifact prompt'),
        ]);
        $foreignReport = TalosResearchReport::query()->create([
            'user_id' => $foreignUser->id,
            'run_id' => $foreignRun->id,
            'title' => 'Foreign report',
            'query' => 'foreign',
            'status' => 'succeeded',
            'summary' => 'hidden',
            'report_markdown' => '# Hidden',
        ]);
        $foreignArtifact = $foreignRun->artifacts()->create([
            'artifact_type' => 'research_report',
            'uri' => "talos://research-reports/{$foreignReport->id}",
            'mime_type' => 'application/json',
            'metadata' => ['research_report_id' => $foreignReport->id],
        ]);
        assert($foreignArtifact instanceof TalosRunArtifact);

        $this->getJson('/api/talos/artifacts')
            ->assertOk()
            ->assertJsonMissing(['id' => $foreignArtifact->id]);

        $this->getJson("/api/talos/artifacts/{$foreignArtifact->id}")->assertNotFound();
        $this->getJson("/api/talos/artifacts/{$foreignArtifact->id}/preview")->assertNotFound();
    }

    public function test_documents_and_document_provenance_are_scoped_to_the_authenticated_user(): void
    {
        $foreignUser = User::factory()->create();
        $foreignRun = TalosRun::query()->create([
            'user_id' => $foreignUser->id,
            'mode' => 'verified_execution',
            'status' => 'succeeded',
            'prompt_hash' => hash('sha256', 'foreign document prompt'),
        ]);
        $foreignArtifact = $foreignRun->artifacts()->create([
            'artifact_type' => 'research_report',
            'uri' => 'talos://research-reports/foreign',
            'mime_type' => 'application/json',
        ]);
        assert($foreignArtifact instanceof TalosRunArtifact);
        $foreignReport = TalosResearchReport::query()->create([
            'user_id' => $foreignUser->id,
            'run_id' => $foreignRun->id,
            'title' => 'Foreign document report',
            'query' => 'foreign',
            'status' => 'succeeded',
            'summary' => 'hidden',
            'report_markdown' => '# Hidden',
        ]);
        $foreignDocument = TalosDocument::query()->create([
            'run_id' => $foreignRun->id,
            'run_artifact_id' => $foreignArtifact->id,
            'research_report_id' => $foreignReport->id,
            'title' => 'Foreign document',
            'document_type' => 'research_report',
            'format' => 'markdown',
            'status' => 'active',
            'content' => '# Hidden document',
            'content_hash' => hash('sha256', '# Hidden document'),
        ]);

        $this->getJson('/api/talos/documents')
            ->assertOk()
            ->assertJsonMissing(['id' => $foreignDocument->id]);

        $this->getJson("/api/talos/documents/{$foreignDocument->id}")->assertNotFound();
        $this->getJson("/api/talos/documents/{$foreignDocument->id}/export")->assertNotFound();

        $this->postJson('/api/talos/documents', [
            'run_id' => $foreignRun->id,
            'run_artifact_id' => $foreignArtifact->id,
            'research_report_id' => $foreignReport->id,
            'title' => 'Stolen provenance',
            'content' => '# Should not be saved',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['run_id', 'run_artifact_id', 'research_report_id']);
    }
}
