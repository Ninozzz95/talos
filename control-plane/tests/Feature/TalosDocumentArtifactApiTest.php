<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosRun;
use App\Models\TalosRunArtifact;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosDocumentArtifactApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_document_can_be_saved_from_run_artifact_and_export_includes_metadata(): void
    {
        $run = TalosRun::query()->create([
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
}
