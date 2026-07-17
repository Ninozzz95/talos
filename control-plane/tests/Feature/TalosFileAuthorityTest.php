<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosAuditEvent;
use App\Models\TalosFile;
use App\Models\TalosSession;
use App\Models\User;
use App\Services\Talos\FileAuthority\TalosFileAuthorityException;
use App\Services\Talos\FileAuthority\TalosFileAuthorityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

final class TalosFileAuthorityTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_user_can_create_list_and_revoke_a_per_file_grant(): void
    {
        $file = $this->availableFile($this->user, 'quarterly-plan.md');

        $grant = $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'label' => 'Quarterly plan',
            'permissions' => ['model.read', 'browser.upload'],
            'file_ids' => [$file->id],
        ])
            ->assertCreated()
            ->assertJsonPath('data.scope', 'file')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.files.0.id', $file->id)
            ->assertJsonMissingPath('data.files.0.storage_path')
            ->json('data');

        $this->getJson('/api/talos/file-authority/grants')
            ->assertOk()
            ->assertJsonPath('data.0.id', $grant['id']);

        $this->deleteJson('/api/talos/file-authority/grants/'.$grant['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');

        $this->assertDatabaseHas('talos_file_authority_grants', [
            'id' => $grant['id'],
            'user_id' => $this->user->id,
            'status' => 'revoked',
        ]);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'file_authority.grant_created')->count());
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'file_authority.grant_revoked')->count());
    }

    public function test_file_and_session_scopes_enforce_exact_shape_and_owned_available_files(): void
    {
        $file = $this->availableFile($this->user, 'owned.md');
        $foreign = User::factory()->create();
        $foreignFile = $this->availableFile($foreign, 'foreign.md');
        $pending = $this->availableFile($this->user, 'pending.md');
        $pending->forceFill(['status' => 'uploaded'])->save();
        $session = $this->talosSession($this->user, 'Scoped chat');

        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'permissions' => ['model.read'],
            'file_ids' => [$file->id, $pending->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('file_ids');

        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'permissions' => ['model.read'],
            'file_ids' => [$foreignFile->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('file_ids');

        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'session',
            'permissions' => ['model.read'],
            'file_ids' => [$file->id],
        ])->assertUnprocessable()->assertJsonValidationErrors('session_id');

        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'session',
            'session_id' => $session->id,
            'permissions' => ['model.read'],
            'file_ids' => [$file->id],
        ])->assertCreated()->assertJsonPath('data.talos_session_id', $session->id);
    }

    public function test_global_grant_requires_explicit_warning_acknowledgement_and_has_no_file_list(): void
    {
        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'global',
            'permissions' => ['model.read', 'browser.upload'],
            'warning_acknowledged' => false,
        ])->assertUnprocessable()->assertJsonValidationErrors('warning_acknowledged');

        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'global',
            'permissions' => ['model.read', 'browser.upload'],
            'warning_acknowledged' => true,
            'file_ids' => ['01900000-0000-7000-8000-000000000001'],
        ])->assertUnprocessable()->assertJsonValidationErrors('file_ids');

        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'global',
            'label' => 'All Vault files',
            'permissions' => ['model.read', 'browser.upload'],
            'warning_acknowledged' => true,
        ])->assertCreated()
            ->assertJsonPath('data.scope', 'global')
            ->assertJsonPath('data.files', []);
    }

    public function test_expired_or_foreign_grants_are_not_exposed_and_cross_owner_revoke_is_not_found(): void
    {
        $file = $this->availableFile($this->user, 'expiry.md');
        $grant = $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'permissions' => ['model.read'],
            'file_ids' => [$file->id],
            'expires_at' => now()->addMinute()->toISOString(),
        ])->assertCreated()->json('data');

        $other = User::factory()->create();
        $this->actingAs($other);

        $this->getJson('/api/talos/file-authority/grants')->assertOk()->assertJsonPath('data', []);
        $this->deleteJson('/api/talos/file-authority/grants/'.$grant['id'])->assertNotFound();
    }

    public function test_automatic_resolution_returns_only_used_grants_and_rejects_a_stale_checksum(): void
    {
        $selected = $this->availableFile($this->user, 'selected.md');
        $unrelated = $this->availableFile($this->user, 'unrelated.md');
        $selectedGrant = $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'permissions' => ['browser.upload'],
            'file_ids' => [$selected->id],
        ])->assertCreated()->json('data.id');
        $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'permissions' => ['browser.upload'],
            'file_ids' => [$unrelated->id],
        ])->assertCreated();
        $service = $this->app->make(TalosFileAuthorityService::class);

        self::assertSame(
            [$selectedGrant],
            $service->activeGrantIdsForFiles((int) $this->user->id, [(string) $selected->id], 'browser.upload'),
        );

        $selected->forceFill(['checksum' => hash('sha256', 'mutated bytes')])->save();
        $this->expectExceptionObject(new TalosFileAuthorityException(
            'TALOS_FILE_AUTHORITY_DENIED',
            'The selected grant does not authorize every requested file in this session.',
            'attachment_grant_ids',
        ));
        $service->activeGrantIdsForFiles((int) $this->user->id, [(string) $selected->id], 'browser.upload');
    }

    public function test_preview_resolution_does_not_record_usage_until_authority_is_consumed(): void
    {
        $file = $this->availableFile($this->user, 'approval-preview.md');
        $grantId = $this->postJson('/api/talos/file-authority/grants', [
            'scope' => 'file',
            'permissions' => ['browser.upload'],
            'file_ids' => [$file->id],
        ])->assertCreated()->json('data.id');
        $service = $this->app->make(TalosFileAuthorityService::class);

        self::assertSame(
            [$grantId],
            $service->activeGrantIdsForFiles((int) $this->user->id, [(string) $file->id], 'browser.upload'),
        );
        self::assertNull($service->listForUser((int) $this->user->id)->firstWhere('id', $grantId)?->last_used_at);
        self::assertSame(0, TalosAuditEvent::query()->where('event_type', 'file_authority.grant_used')->count());

        $service->authorizeFiles(
            (int) $this->user->id,
            [(string) $file->id],
            [$grantId],
            'browser.upload',
        );

        self::assertNotNull($service->listForUser((int) $this->user->id)->firstWhere('id', $grantId)?->last_used_at);
        self::assertSame(1, TalosAuditEvent::query()->where('event_type', 'file_authority.grant_used')->count());
    }

    private function availableFile(User $owner, string $name): TalosFile
    {
        $contents = 'Fixture '.$name;

        return TalosFile::query()->create([
            'user_id' => $owner->id,
            'original_name' => $name,
            'mime_type' => 'text/markdown',
            'size_bytes' => strlen($contents),
            'checksum' => hash('sha256', $contents),
            'status' => 'available',
            'storage_path' => 'ingested/private/'.hash('sha256', $name),
            'parser' => 'markdown',
        ]);
    }

    private function talosSession(User $owner, string $title): TalosSession
    {
        return TalosSession::query()->create([
            'user_id' => $owner->id,
            'title' => $title,
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]);
    }
}
