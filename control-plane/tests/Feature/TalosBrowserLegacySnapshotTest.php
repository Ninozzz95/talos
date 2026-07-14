<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserEvent;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Services\Talos\Browser\BrowserSessionClient;
use App\Services\Talos\Browser\FakeBrowserSessionClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosBrowserLegacySnapshotTest extends TestCase
{
    use RefreshDatabase;

    private TalosSession $chatSession;

    private TalosBrowserSession $browserSession;

    private FakeBrowserSessionClient $client;

    protected function setUp(): void
    {
        parent::setUp();

        $user = $this->authenticateTalosUser();
        $this->chatSession = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Legacy browser snapshot',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
        $this->withHeader('X-Talos-Session-Id', $this->chatSession->id);
        $this->useIsolatedLocalStorage();

        $this->client = new FakeBrowserSessionClient;
        $this->app->instance(BrowserSessionClient::class, $this->client);

        $browserSessionId = $this->postJson('/api/talos/browser/sessions', [
            'talos_session_id' => $this->chatSession->id,
        ])->assertCreated()->json('data.id');
        $this->browserSession = TalosBrowserSession::query()->findOrFail($browserSessionId);
    }

    public function test_valid_real_worker_snapshot_is_canonicalized_before_persistence(): void
    {
        $this->client->snapshotResponse = $this->validSnapshot([
            'sessionId' => 'worker-1',
            'capturedAt' => '2026-07-13T10:00:00.000Z',
            'workerInternal' => ['must_not' => 'persist'],
            'nodes' => [[
                'ref' => 'r1',
                'role' => 'link',
                'name' => 'Open documentation',
                'href' => 'https://example.com/docs?from=browser',
                'visible' => true,
                'workerInternal' => 'discard',
            ], [
                'ref' => 'r2',
                'role' => 'heading',
                'name' => 'Overview',
                'level' => 2,
                'visible' => true,
            ]],
        ]);

        $artifactId = $this->postJson($this->snapshotRoute())
            ->assertCreated()
            ->assertJsonPath('data.metadata.format', 'accessibility_refs_v1')
            ->assertJsonPath('data.metadata.node_count', 2)
            ->json('data.id');

        $artifact = TalosBrowserArtifact::query()->findOrFail($artifactId);
        $stored = json_decode(Storage::disk('local')->get($artifact->storage_path), true, 32, JSON_THROW_ON_ERROR);

        $this->assertSame([
            'snapshotId' => 'snap_123e4567-e89b-12d3-a456-426614174000',
            'format' => 'accessibility_refs_v1',
            'url' => 'https://example.com/path',
            'title' => 'Example page',
            'nodes' => [[
                'ref' => 'r1',
                'role' => 'link',
                'name' => 'Open documentation',
                'visible' => true,
                'href' => 'https://example.com/docs?from=browser',
            ], [
                'ref' => 'r2',
                'role' => 'heading',
                'name' => 'Overview',
                'visible' => true,
                'level' => 2,
            ]],
            'textDigest' => 'Example page content',
        ], $stored);
    }

    public function test_snapshot_urls_do_not_require_php_dns_before_persistence(): void
    {
        $this->client->snapshotResponse = $this->validSnapshot([
            'url' => 'https://browser-authority.invalid/path',
            'nodes' => [$this->validNode([
                'role' => 'link',
                'href' => 'https://result-authority.invalid/article',
            ])],
        ]);

        $this->postJson($this->snapshotRoute())
            ->assertCreated()
            ->assertJsonPath('data.metadata.format', 'accessibility_refs_v1');

        $this->assertDatabaseCount('talos_browser_artifacts', 1);
    }

    public function test_a_late_legacy_snapshot_cannot_replace_newer_snapshot_evidence(): void
    {
        $this->client->snapshotResponse = $this->validSnapshot([
            'stateVersion' => 0,
        ]);
        $this->client->afterRequest = function (string $method): void {
            if ($method === 'snapshot') {
                TalosBrowserSession::query()->whereKey($this->browserSession->id)->update([
                    'worker_state_version' => 1,
                    'last_snapshot_artifact_id' => 'newer-evidence',
                ]);
            }
        };

        $this->postJson($this->snapshotRoute())
            ->assertConflict()
            ->assertJsonPath('code', 'TALOS_BROWSER_STALE_STATE');

        $this->assertSame(1, $this->browserSession->fresh()->worker_state_version);
        $this->assertSame('newer-evidence', $this->browserSession->fresh()->last_snapshot_artifact_id);
        $this->assertDatabaseCount('talos_browser_artifacts', 0);
    }

    public function test_malformed_worker_snapshots_are_rejected_without_persisting_artifacts_or_events(): void
    {
        $invalidPayloads = [
            'wrong format' => $this->validSnapshot(['format' => 'other']),
            'missing snapshot id' => $this->without($this->validSnapshot(), 'snapshotId'),
            'oversized snapshot id' => $this->validSnapshot(['snapshotId' => str_repeat('s', 129)]),
            'unsafe page url' => $this->validSnapshot(['url' => 'javascript:alert(1)']),
            'credentialed page url' => $this->validSnapshot(['url' => 'https://user:pass@example.com']),
            'localhost page url' => $this->validSnapshot(['url' => 'http://localhost/path']),
            'subdomain of localhost page url' => $this->validSnapshot(['url' => 'http://worker.localhost/path']),
            'metadata hostname page url' => $this->validSnapshot(['url' => 'http://metadata.google.internal/path']),
            'private literal page url' => $this->validSnapshot(['url' => 'http://127.0.0.1/path']),
            'oversized title' => $this->validSnapshot(['title' => str_repeat('t', 513)]),
            'oversized digest' => $this->validSnapshot(['textDigest' => str_repeat('d', 4001)]),
            'nodes is not a list' => $this->validSnapshot(['nodes' => ['node' => $this->validNode()]]),
            'too many nodes' => $this->validSnapshot(['nodes' => array_fill(0, 201, $this->validNode())]),
            'node is not an object' => $this->validSnapshot(['nodes' => ['node']]),
            'oversized ref' => $this->validSnapshot(['nodes' => [$this->validNode(['ref' => str_repeat('r', 129)])]]),
            'malformed ref' => $this->validSnapshot(['nodes' => [$this->validNode(['ref' => 'node-1'])]]),
            'duplicate refs' => $this->validSnapshot(['nodes' => [$this->validNode(), $this->validNode(['name' => 'Duplicate'])]]),
            'oversized role' => $this->validSnapshot(['nodes' => [$this->validNode(['role' => str_repeat('r', 65)])]]),
            'blank role' => $this->validSnapshot(['nodes' => [$this->validNode(['role' => '   '])]]),
            'oversized name' => $this->validSnapshot(['nodes' => [$this->validNode(['name' => str_repeat('n', 201)])]]),
            'blank name' => $this->validSnapshot(['nodes' => [$this->validNode(['name' => "\t"])]]),
            'visible is not boolean' => $this->validSnapshot(['nodes' => [$this->validNode(['visible' => 1])]]),
            'invalid level' => $this->validSnapshot(['nodes' => [$this->validNode(['level' => 7])]]),
            'unsafe href' => $this->validSnapshot(['nodes' => [$this->validNode(['href' => 'file:///etc/passwd'])]]),
            'credentialed href' => $this->validSnapshot(['nodes' => [$this->validNode(['href' => 'https://user:pass@example.com'])]]),
            'private literal href' => $this->validSnapshot(['nodes' => [$this->validNode(['href' => 'http://169.254.169.254/latest/meta-data'])]]),
        ];

        foreach ($invalidPayloads as $case => $payload) {
            $this->client->snapshotResponse = $payload;

            $this->postJson($this->snapshotRoute())
                ->assertStatus(502, $case)
                ->assertJsonPath('code', 'TALOS_BROWSER_SNAPSHOT_INVALID');

            $this->assertDatabaseCount('talos_browser_artifacts', 0);
            $this->assertSame(0, TalosBrowserEvent::query()
                ->where('browser_session_id', $this->browserSession->id)
                ->where('type', 'snapshot.captured')
                ->count(), $case);
            $this->assertNull($this->browserSession->fresh()->last_snapshot_artifact_id, $case);
        }
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function validSnapshot(array $overrides = []): array
    {
        return [
            'sessionId' => 'worker-1',
            'snapshotId' => 'snap_123e4567-e89b-12d3-a456-426614174000',
            'format' => 'accessibility_refs_v1',
            'url' => 'https://example.com/path',
            'title' => 'Example page',
            'nodes' => [$this->validNode()],
            'textDigest' => 'Example page content',
            'capturedAt' => '2026-07-13T10:00:00.000Z',
            ...$overrides,
        ];
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function validNode(array $overrides = []): array
    {
        return [
            'ref' => 'r1',
            'role' => 'heading',
            'name' => 'Example',
            'visible' => true,
            ...$overrides,
        ];
    }

    /** @param array<string, mixed> $payload @return array<string, mixed> */
    private function without(array $payload, string $key): array
    {
        unset($payload[$key]);

        return $payload;
    }

    private function snapshotRoute(): string
    {
        return "/api/talos/browser/sessions/{$this->browserSession->id}/snapshot";
    }
}
