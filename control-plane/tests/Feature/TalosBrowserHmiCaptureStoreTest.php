<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosBrowserArtifact;
use App\Models\TalosBrowserHmiApproval;
use App\Models\TalosBrowserSession;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\Browser\TalosBrowserArtifactStore;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Tests\TestCase;

final class TalosBrowserHmiCaptureStoreTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->useIsolatedLocalStorage();
    }

    public function test_it_commits_both_artifacts_provenance_and_session_pointers_as_one_capture(): void
    {
        $session = $this->browserSession('commit', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-123');

        $stored = $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
            $session,
            'command-123',
            $result,
        );

        $this->assertSame('screenshot', $stored['screenshot']->type);
        $this->assertSame('snapshot', $stored['snapshot']->type);
        $this->assertSame('cap_123e4567-e89b-12d3-a456-426614174000', $stored['screenshot']->worker_capture_id);
        $this->assertSame('command-123', $stored['snapshot']->source_command_id);
        $this->assertSame(1, $stored['screenshot']->source_state_version);
        $this->assertSame(2, $stored['snapshot']->state_version);
        $this->assertSame('untrusted_browser_content', $stored['snapshot']->trust_boundary);
        $this->assertArrayNotHasKey('approval_id', $stored['screenshot']->metadata);
        $this->assertSame($result['frame_sha256'], $stored['screenshot']->metadata['source_frame_sha256'] ?? null);
        $this->assertSame($result['frame_sha256'], $stored['snapshot']->metadata['source_frame_sha256'] ?? null);
        $this->assertTrue(Storage::disk('local')->exists($stored['screenshot']->storage_path));
        $this->assertTrue(Storage::disk('local')->exists($stored['snapshot']->storage_path));

        $fresh = $session->fresh();
        $this->assertSame(2, $fresh->worker_state_version);
        $this->assertSame($stored['screenshot']->id, $fresh->last_screenshot_artifact_id);
        $this->assertSame($stored['snapshot']->id, $fresh->last_snapshot_artifact_id);
        $this->assertSame('https://example.com/after', $fresh->current_url);
        $this->assertStringNotContainsString('secret', (string) $fresh->current_url);
        $this->assertStringNotContainsString('?', (string) $fresh->current_url);
        $this->assertStringNotContainsString('#', (string) $fresh->current_url);
        $this->assertStringNotContainsString('secret', Storage::disk('local')->get($stored['snapshot']->storage_path));
        $this->assertStringNotContainsString('?', Storage::disk('local')->get($stored['snapshot']->storage_path));
        $this->assertStringNotContainsString('#', Storage::disk('local')->get($stored['snapshot']->storage_path));
    }

    public function test_policy_elevation_from_ordinary_target_to_sensitive_execution_commits_exact_evidence(): void
    {
        $session = $this->browserSession('policy-elevation', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-policy-elevation');
        $result['effect_classification'] = 'sensitive';
        $result['sensitive_effect_authorized'] = true;

        $stored = $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
            $session,
            'command-policy-elevation',
            $result,
        );

        $this->assertSame('active', $stored['session']->status);
        $this->assertSame('ordinary', $result['target']['required_effect_classification']);
        $this->assertSame($result['frame_sha256'], $stored['screenshot']->metadata['source_frame_sha256']);
        $this->assertDatabaseCount('talos_browser_artifacts', 2);
    }

    public function test_sensitive_target_requirement_cannot_be_downgraded_to_ordinary_execution(): void
    {
        $session = $this->browserSession('policy-downgrade', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-policy-downgrade');
        $result['target']['effect_attestation'] = 'unattestable';
        $result['target']['required_effect_classification'] = 'sensitive';

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI capture contract is invalid.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
                $session,
                'command-policy-downgrade',
                $result,
            );
        } finally {
            $this->assertDatabaseCount('talos_browser_artifacts', 0);
        }
    }

    public function test_replaying_the_same_hmi_capture_returns_the_original_artifacts_without_duplicates(): void
    {
        $session = $this->browserSession('replay', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-replay');
        $store = $this->app->make(TalosBrowserArtifactStore::class);

        $first = $store->storeHmiCapture($session, 'command-replay', $result);
        $second = $store->storeHmiCapture($session->fresh(), 'command-replay', $result);

        $this->assertFalse($first['replayed']);
        $this->assertTrue($second['replayed']);
        $this->assertSame($first['screenshot']->id, $second['screenshot']->id);
        $this->assertSame($first['snapshot']->id, $second['snapshot']->id);
        $this->assertDatabaseCount('talos_browser_artifacts', 2);
    }

    public function test_a_stale_execution_lease_cannot_commit_hmi_evidence(): void
    {
        $session = $this->browserSession('lease-fence', 1);
        $commandId = 'command-lease-fence';
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, $commandId);
        $source = TalosBrowserArtifact::query()->create([
            'browser_session_id' => $session->id,
            'user_id' => $session->user_id,
            'type' => 'screenshot',
            'mime' => 'image/png',
            'storage_disk' => 'local',
            'storage_path' => "talos/browser/{$session->user_id}/{$session->id}/source.png",
            'sha256' => $result['frame_sha256'],
            'metadata' => ['state_version' => 1],
        ]);
        $currentLease = (string) Str::uuid();
        $approval = TalosBrowserHmiApproval::query()->create([
            'id' => (string) Str::uuid(),
            'user_id' => $session->user_id,
            'browser_session_id' => $session->id,
            'command_id' => $commandId,
            'interaction_id' => $result['interaction_id'],
            'artifact_id' => $source->id,
            'artifact_sha256' => $result['frame_sha256'],
            'state_version' => 1,
            'normalized_x' => 0.5,
            'normalized_y' => 0.5,
            'button' => 'left',
            'click_count' => 1,
            'target_fingerprint' => $result['target']['fingerprint'],
            'category' => 'ordinary',
            'status' => 'executing',
            'payload_version' => 'talos_browser_hmi_pointer_v2',
            'payload' => ['schema_version' => 'talos_browser_hmi_pointer_v2'],
            'payload_hash' => 'sha256:'.str_repeat('a', 64),
            'request_hash' => 'sha256:'.str_repeat('b', 64),
            'expires_at' => now()->addMinute(),
            'approved_at' => now(),
            'execution_started_at' => now(),
            'execution_payload' => ['command_id' => $commandId],
            'execution_lease_token' => $currentLease,
            'execution_lease_expires_at' => now()->addMinute(),
            'execution_attempts' => 2,
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI execution lease is no longer current.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
                $session,
                $commandId,
                $result,
                (string) $approval->id,
                (string) Str::uuid(),
            );
        } finally {
            $this->assertDatabaseCount('talos_browser_artifacts', 1);
            $this->assertSame(1, $session->fresh()->worker_state_version);
        }
    }

    public function test_it_rejects_legacy_hmi_result_versions_before_writing(): void
    {
        $session = $this->browserSession('legacy', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-legacy');
        $result['schema_version'] = 'talos_browser_hmi_result_v1';

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI capture contract is invalid.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture($session, 'command-legacy', $result);
        } finally {
            $this->assertDatabaseCount('talos_browser_artifacts', 0);
            $this->assertSame([], Storage::disk('local')->allFiles("talos/browser/{$session->user_id}/{$session->id}"));
        }
    }

    public function test_it_rejects_an_incomplete_v2_result_without_a_source_frame_hash(): void
    {
        $session = $this->browserSession('missing-frame', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-missing-frame');
        unset($result['frame_sha256']);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI capture contract is invalid.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture($session, 'command-missing-frame', $result);
        } finally {
            $this->assertDatabaseCount('talos_browser_artifacts', 0);
            $this->assertSame([], Storage::disk('local')->allFiles("talos/browser/{$session->user_id}/{$session->id}"));
        }
    }

    public function test_it_rolls_back_rows_and_files_when_exact_state_compare_and_swap_fails(): void
    {
        $session = $this->browserSession('stale', 1);
        TalosBrowserSession::query()->whereKey($session->id)->update(['worker_state_version' => 2]);

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
                $session,
                'command-stale',
                $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-stale'),
            );
            $this->fail('A stale capture must not commit.');
        } catch (RuntimeException $exception) {
            $this->assertSame('Browser HMI capture was superseded by newer state.', $exception->getMessage());
        }

        $this->assertDatabaseCount('talos_browser_artifacts', 0);
        $this->assertSame([], Storage::disk('local')->allFiles("talos/browser/{$session->user_id}/{$session->id}"));
        $this->assertSame(2, $session->fresh()->worker_state_version);
        $this->assertNull($session->fresh()->last_screenshot_artifact_id);
        $this->assertNull($session->fresh()->last_snapshot_artifact_id);
    }

    public function test_it_rejects_worker_hash_mismatch_before_writing_any_file(): void
    {
        $session = $this->browserSession('hash', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-hash');
        $result['screenshot']['sha256'] = 'sha256:'.str_repeat('f', 64);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI screenshot hash is invalid.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture($session, 'command-hash', $result);
        } finally {
            $this->assertDatabaseCount('talos_browser_artifacts', 0);
            $this->assertSame([], Storage::disk('local')->allFiles("talos/browser/{$session->user_id}/{$session->id}"));
        }
    }

    public function test_it_rejects_worker_snapshot_hash_mismatch_before_writing_any_file(): void
    {
        $session = $this->browserSession('snapshot-hash', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-snapshot-hash');
        $result['snapshot']['sha256'] = 'sha256:'.str_repeat('f', 64);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI snapshot hash is invalid.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture($session, 'command-snapshot-hash', $result);
        } finally {
            $this->assertDatabaseCount('talos_browser_artifacts', 0);
            $this->assertSame([], Storage::disk('local')->allFiles("talos/browser/{$session->user_id}/{$session->id}"));
        }
    }

    public function test_it_accepts_a_full_http_destination_path_in_the_bound_target_descriptor(): void
    {
        $session = $this->browserSession('destination-path', 1);
        $result = $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-destination-path');
        $result['target']['tag'] = 'a';
        $result['target']['role'] = 'link';
        $result['target']['name'] = 'Account details';
        $result['target']['href'] = 'https://example.com/account/details';
        $result['target']['effect_attestation'] = 'unattestable';
        $result['target']['required_effect_classification'] = 'sensitive';
        $result['effect_classification'] = 'sensitive';
        $result['sensitive_effect_authorized'] = true;

        $stored = $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
            $session,
            'command-destination-path',
            $result,
        );

        $this->assertSame('active', $stored['session']->status);
        $this->assertDatabaseCount('talos_browser_artifacts', 2);
    }

    #[DataProvider('nonCommittableSessionStatusProvider')]
    public function test_hmi_capture_cannot_resurrect_a_non_committable_session(string $status): void
    {
        $session = $this->browserSession('lease-'.$status, 1);
        $session->update(['status' => $status]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Browser HMI capture lease is no longer active.');

        try {
            $this->app->make(TalosBrowserArtifactStore::class)->storeHmiCapture(
                $session,
                'command-'.$status,
                $this->workerResult((string) $session->worker_session_id, 1, 2, 'command-'.$status),
            );
        } finally {
            $this->assertSame($status, $session->fresh()->status);
            $this->assertDatabaseCount('talos_browser_artifacts', 0);
            $this->assertSame([], Storage::disk('local')->allFiles("talos/browser/{$session->user_id}/{$session->id}"));
        }
    }

    /** @return iterable<string, array{string}> */
    public static function nonCommittableSessionStatusProvider(): iterable
    {
        yield 'closing session' => ['closing'];
        yield 'closed session' => ['closed'];
    }

    private function browserSession(string $suffix, int $stateVersion): TalosBrowserSession
    {
        $user = User::factory()->create();
        $chat = TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'HMI capture '.$suffix,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);

        return TalosBrowserSession::query()->create([
            'user_id' => $user->id,
            'talos_session_id' => $chat->id,
            'worker_session_id' => 'worker-hmi-'.$suffix,
            'status' => 'active',
            'mode' => 'read_only',
            'viewport_width' => 800,
            'viewport_height' => 600,
            'capabilities' => ['screenshots' => true, 'accessibilitySnapshot' => true, 'hmiActions' => true],
            'policy' => [],
            'worker_state_version' => $stateVersion,
            'expires_at' => now()->addHour(),
        ]);
    }

    /** @return array<string, mixed> */
    private function workerResult(string $workerSessionId, int $sourceState, int $state, string $commandId): array
    {
        $screenshotBytes = 'deterministic png bytes';
        $snapshot = [
            'snapshot_id' => 'snap_123e4567-e89b-12d3-a456-426614174000',
            'format' => 'accessibility_refs_v1',
            'text_digest' => 'Page after click',
            'nodes' => [['ref' => 'r1', 'role' => 'heading', 'name' => 'After click', 'visible' => true]],
        ];

        return [
            'schema_version' => 'talos_browser_hmi_result_v2',
            'capture_id' => 'cap_123e4567-e89b-12d3-a456-426614174000',
            'interaction_id' => 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            'command_id' => $commandId,
            'session_id' => $workerSessionId,
            'source_state_version' => $sourceState,
            'state_version' => $state,
            'frame_sha256' => 'sha256:'.str_repeat('c', 64),
            'url' => 'https://user:secret@example.com/after?token=secret&tab=details#fragment',
            'title' => 'After click',
            'effect_classification' => 'ordinary',
            'sensitive_effect_authorized' => false,
            'target' => [
                'tag' => 'button',
                'role' => 'button',
                'name' => 'After click',
                'input_type' => null,
                'href' => null,
                'form_method' => null,
                'is_editable' => false,
                'is_submit' => false,
                'is_download' => false,
                'opens_new_context' => false,
                'effect_attestation' => 'browser_default',
                'required_effect_classification' => 'ordinary',
                'visible' => true,
                'disabled' => false,
                'fingerprint' => 'sha256:'.str_repeat('a', 64),
            ],
            'screenshot' => [
                'mime_type' => 'image/png',
                'width' => 800,
                'height' => 600,
                'sha256' => 'sha256:'.hash('sha256', $screenshotBytes),
                'base64' => base64_encode($screenshotBytes),
            ],
            'snapshot' => [
                ...$snapshot,
                'sha256' => 'sha256:'.hash('sha256', $this->canonicalJson($snapshot)),
            ],
            'captured_at' => now()->toJSON(),
        ];
    }

    private function canonicalJson(mixed $value): string
    {
        if (is_array($value)) {
            if (array_is_list($value)) {
                $value = array_map(fn (mixed $item): mixed => json_decode($this->canonicalJson($item), true), $value);
            } else {
                ksort($value);
                foreach ($value as $key => $item) {
                    $value[$key] = json_decode($this->canonicalJson($item), true);
                }
            }
        }

        return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
}
