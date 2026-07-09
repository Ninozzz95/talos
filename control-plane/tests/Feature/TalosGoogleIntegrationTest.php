<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosAuditEvent;
use App\Models\TalosCalendarDraft;
use App\Models\TalosExternalAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TalosGoogleIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->authenticateTalosUser();
    }

    public function test_google_external_accounts_are_user_owned_at_the_schema_boundary(): void
    {
        $this->assertTrue(Schema::hasColumn('talos_external_accounts', 'user_id'));
    }

    public function test_google_account_api_never_exposes_tokens(): void
    {
        $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'display_name' => 'Operator',
            'encrypted_access_token' => Crypt::encryptString('access-token-secret'),
            'encrypted_refresh_token' => Crypt::encryptString('refresh-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events.readonly'],
            'status' => 'connected',
            'token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);

        $response = $this->getJson('/api/talos/google/accounts')
            ->assertOk()
            ->assertJsonPath('data.0.provider', 'google')
            ->assertJsonPath('data.0.email', 'operator@example.test')
            ->assertJsonPath('data.0.has_refresh_token', true);

        $json = json_encode($response->json(), JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('access-token-secret', $json);
        $this->assertStringNotContainsString('refresh-token-secret', $json);
        $this->assertStringNotContainsString('encrypted_access_token', $json);
        $this->assertStringNotContainsString('encrypted_refresh_token', $json);
    }

    public function test_google_accounts_are_visible_only_to_the_authenticated_owner(): void
    {
        $otherUser = User::factory()->create();
        $ownedAccount = $this->googleAccount([
            'provider_account_id' => 'owned-google-user',
            'email' => 'owned@example.test',
        ]);
        $foreignAccount = $this->googleAccount([
            'user_id' => $otherUser->id,
            'provider_account_id' => 'foreign-google-user',
            'email' => 'foreign@example.test',
        ]);

        $this->getJson('/api/talos/google/accounts')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ownedAccount->id)
            ->assertJsonMissing(['id' => $foreignAccount->id])
            ->assertJsonMissing(['email' => 'foreign@example.test']);

        $this->actingAs($otherUser);

        $this->getJson('/api/talos/google/accounts')
            ->assertOk()
            ->assertJsonPath('data.0.id', $foreignAccount->id)
            ->assertJsonMissing(['id' => $ownedAccount->id])
            ->assertJsonMissing(['email' => 'owned@example.test']);
    }

    public function test_google_disconnect_marks_account_revoked_and_audits_without_token_leak(): void
    {
        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'display_name' => 'Operator',
            'encrypted_refresh_token' => Crypt::encryptString('refresh-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/drive.file'],
            'status' => 'connected',
            'connected_at' => now(),
        ]);

        $this->postJson('/api/talos/google/disconnect', ['account_id' => $account->id])
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked');

        $this->assertDatabaseHas('talos_external_accounts', [
            'id' => $account->id,
            'status' => 'revoked',
        ]);

        $auditPayloads = DB::table('talos_audit_events')->pluck('payload')->implode("\n");
        $this->assertStringContainsString('google.account.disconnected', DB::table('talos_audit_events')->pluck('event_type')->implode("\n"));
        $this->assertStringNotContainsString('refresh-token-secret', $auditPayloads);
    }

    public function test_google_disconnect_cannot_revoke_a_foreign_account(): void
    {
        $foreignUser = User::factory()->create();
        $foreignAccount = $this->googleAccount([
            'user_id' => $foreignUser->id,
            'provider_account_id' => 'foreign-google-user',
            'email' => 'foreign@example.test',
            'encrypted_refresh_token' => Crypt::encryptString('foreign-refresh-token-secret'),
        ]);

        $this->postJson('/api/talos/google/disconnect', ['account_id' => $foreignAccount->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['account_id']);

        $foreignAccount->refresh();
        $this->assertSame('connected', $foreignAccount->status);
        $this->assertNotNull($foreignAccount->encrypted_refresh_token);
        $this->assertSame(0, TalosAuditEvent::query()
            ->where('event_type', 'google.account.disconnected')
            ->where('subject_id', $foreignAccount->id)
            ->count());
    }

    public function test_google_drive_import_requires_connected_account_and_download_permission(): void
    {
        $this->postJson('/api/talos/google/drive/import', [
            'account_id' => 'missing',
            'file_id' => 'drive-file-1',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['account_id']);
    }

    public function test_google_drive_import_creates_untrusted_context_file_with_provenance(): void
    {
        config([
            'filesystems.disks.local.root' => storage_path('framework/testing/task-5-drive-' . uniqid()),
        ]);
        Storage::purge('local');

        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'display_name' => 'Operator',
            'encrypted_refresh_token' => Crypt::encryptString('refresh-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/drive.file'],
            'status' => 'connected',
            'connected_at' => now(),
        ]);

        app()->bind(\App\Services\Google\GoogleDriveService::class, function () {
            return new class {
                public function listFiles(TalosExternalAccount $account, array $filters = []): array
                {
                    return [];
                }

                public function importableFile(TalosExternalAccount $account, string $fileId): array
                {
                    return [
                        'id' => $fileId,
                        'name' => 'Drive Notes.md',
                        'mime_type' => 'text/markdown',
                        'modified_time' => '2026-07-09T10:00:00Z',
                        'can_download' => true,
                        'contents' => "# Drive Notes\n\nImported safely.",
                    ];
                }
            };
        });

        $this->postJson('/api/talos/google/drive/import', [
            'account_id' => $account->id,
            'file_id' => 'drive-file-1',
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'available')
            ->assertJsonPath('data.metadata.source_provider', 'google_drive')
            ->assertJsonPath('data.metadata.trust_level', 'untrusted');
    }

    public function test_google_drive_endpoints_reject_foreign_accounts_without_contacting_google(): void
    {
        Http::fake();
        $foreignUser = User::factory()->create();
        $foreignAccount = $this->googleAccount([
            'user_id' => $foreignUser->id,
            'provider_account_id' => 'foreign-google-user',
            'email' => 'foreign@example.test',
            'encrypted_access_token' => Crypt::encryptString('foreign-access-token-secret'),
            'encrypted_refresh_token' => Crypt::encryptString('foreign-refresh-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/drive.file'],
        ]);

        $this->getJson("/api/talos/google/drive/files?account_id={$foreignAccount->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['account_id']);

        $this->postJson('/api/talos/google/drive/import', [
            'account_id' => $foreignAccount->id,
            'file_id' => 'drive-file-1',
        ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['account_id']);

        Http::assertNothingSent();
    }

    public function test_google_calendar_calendars_lists_readable_calendars_without_token_leak(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/users/me/calendarList*' => Http::response([
                'items' => [[
                    'id' => 'primary',
                    'summary' => 'Operator Calendar',
                    'primary' => true,
                    'accessRole' => 'owner',
                ]],
            ]),
        ]);

        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'encrypted_access_token' => Crypt::encryptString('access-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events.readonly'],
            'status' => 'connected',
            'token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);

        $response = $this->getJson("/api/talos/google/calendar/calendars?account_id={$account->id}")
            ->assertOk()
            ->assertJsonPath('data.calendars.0.id', 'primary')
            ->assertJsonPath('data.calendars.0.summary', 'Operator Calendar')
            ->assertJsonPath('data.calendars.0.primary', true);

        $json = json_encode($response->json(), JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('access-token-secret', $json);
    }

    public function test_google_calendar_endpoints_reject_foreign_accounts_without_contacting_google(): void
    {
        Http::fake();
        $foreignUser = User::factory()->create();
        $foreignAccount = $this->googleAccount([
            'user_id' => $foreignUser->id,
            'provider_account_id' => 'foreign-google-user',
            'email' => 'foreign@example.test',
            'encrypted_access_token' => Crypt::encryptString('foreign-access-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events.readonly'],
        ]);

        $this->getJson("/api/talos/google/calendar/calendars?account_id={$foreignAccount->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['account_id']);

        $this->postJson('/api/talos/google/calendar/sync', ['account_id' => $foreignAccount->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['account_id']);

        Http::assertNothingSent();
    }

    public function test_google_calendar_sync_requires_read_scope(): void
    {
        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'encrypted_refresh_token' => Crypt::encryptString('refresh-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/drive.file'],
            'status' => 'connected',
            'connected_at' => now(),
        ]);

        $this->postJson('/api/talos/google/calendar/sync', ['account_id' => $account->id])
            ->assertForbidden()
            ->assertJsonPath('message', 'Google Calendar read scope is not granted.');
    }

    public function test_google_calendar_sync_persists_untrusted_event_drafts_and_sync_cursor(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/primary/events*' => Http::response([
                'nextSyncToken' => 'sync-token-1',
                'items' => [[
                    'id' => 'google-event-1',
                    'summary' => 'AVM sync review',
                    'description' => 'Review synced from Google Calendar.',
                    'start' => [
                        'dateTime' => now()->addDay()->toRfc3339String(),
                        'timeZone' => 'Europe/Rome',
                    ],
                    'end' => [
                        'dateTime' => now()->addDay()->addHour()->toRfc3339String(),
                        'timeZone' => 'Europe/Rome',
                    ],
                    'attendees' => [
                        ['email' => 'ops@example.test'],
                    ],
                    'htmlLink' => 'https://calendar.google.test/event/google-event-1',
                    'updated' => '2026-07-09T10:00:00Z',
                ]],
            ]),
        ]);

        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'encrypted_access_token' => Crypt::encryptString('access-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events.readonly'],
            'status' => 'connected',
            'token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);

        $response = $this->postJson('/api/talos/google/calendar/sync', ['account_id' => $account->id])
            ->assertOk()
            ->assertJsonPath('data.synced_count', 1)
            ->assertJsonPath('data.events.0.title', 'AVM sync review')
            ->assertJsonPath('data.events.0.metadata.external_provider', 'google_calendar')
            ->assertJsonPath('data.events.0.metadata.external_account_id', $account->id)
            ->assertJsonPath('data.events.0.metadata.external_event_id', 'google-event-1')
            ->assertJsonPath('data.events.0.metadata.trust_level', 'untrusted');

        $json = json_encode($response->json(), JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('access-token-secret', $json);

        $draft = TalosCalendarDraft::query()->where('title', 'AVM sync review')->firstOrFail();
        $this->assertSame($this->user->id, (int) $draft->user_id);
        $this->assertSame('google_calendar', $draft->metadata['external_provider']);
        $this->assertSame($account->id, $draft->metadata['external_account_id']);
        $this->assertSame('google-event-1', $draft->metadata['external_event_id']);

        $this->assertDatabaseHas('talos_external_sync_states', [
            'external_account_id' => $account->id,
            'provider' => 'google',
            'resource_type' => 'calendar_events',
            'resource_id' => 'primary',
            'sync_cursor' => 'sync-token-1',
            'status' => 'idle',
        ]);
    }

    public function test_google_calendar_publish_requires_write_scope_and_draft_confirmation(): void
    {
        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'encrypted_refresh_token' => Crypt::encryptString('refresh-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events.readonly'],
            'status' => 'connected',
            'connected_at' => now(),
        ]);

        $draft = TalosCalendarDraft::query()->create([
            'user_id' => $this->user->id,
            'title' => 'AVM review',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'timezone' => 'Europe/Rome',
            'attendees' => ['ops@example.test'],
            'status' => 'draft',
            'confirmation_required' => true,
        ]);

        $this->postJson("/api/talos/google/calendar/drafts/{$draft->id}/publish", [
            'account_id' => $account->id,
            'confirmed' => true,
        ])
            ->assertForbidden()
            ->assertJsonPath('message', 'Google Calendar write scope is not granted.');
    }

    public function test_google_calendar_publish_requires_explicit_confirmation_without_calling_google(): void
    {
        Http::fake();

        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'encrypted_access_token' => Crypt::encryptString('access-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events'],
            'status' => 'connected',
            'token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);

        $draft = TalosCalendarDraft::query()->create([
            'user_id' => $this->user->id,
            'title' => 'AVM review',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'timezone' => 'Europe/Rome',
            'attendees' => ['ops@example.test'],
            'status' => 'draft',
            'confirmation_required' => true,
        ]);

        $this->postJson("/api/talos/google/calendar/drafts/{$draft->id}/publish", [
            'account_id' => $account->id,
            'confirmed' => false,
        ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Google Calendar publish requires confirmed=true.');

        Http::assertNothingSent();
        $this->assertSame(0, TalosAuditEvent::query()
            ->where('event_type', 'google.calendar.event_published')
            ->count());
    }

    public function test_google_calendar_publish_writes_google_event_and_audit_without_token_leak(): void
    {
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/primary/events' => Http::response([
                'id' => 'google-event-1',
                'htmlLink' => 'https://calendar.google.test/event/google-event-1',
                'status' => 'confirmed',
            ]),
        ]);

        $account = $this->googleAccount([
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'encrypted_access_token' => Crypt::encryptString('access-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events'],
            'status' => 'connected',
            'token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);

        $draft = TalosCalendarDraft::query()->create([
            'user_id' => $this->user->id,
            'title' => 'AVM review',
            'description' => 'Publish after HMI confirmation.',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'timezone' => 'Europe/Rome',
            'attendees' => ['ops@example.test'],
            'status' => 'draft',
            'confirmation_required' => true,
        ]);

        $response = $this->postJson("/api/talos/google/calendar/drafts/{$draft->id}/publish", [
            'account_id' => $account->id,
            'confirmed' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.external_provider', 'google_calendar')
            ->assertJsonPath('data.external_event_id', 'google-event-1')
            ->assertJsonPath('data.status', 'published');

        $json = json_encode($response->json(), JSON_THROW_ON_ERROR);
        $this->assertStringNotContainsString('access-token-secret', $json);

        $draft->refresh();
        $this->assertSame('google_calendar', $draft->metadata['external_provider']);
        $this->assertSame($account->id, $draft->metadata['external_account_id']);
        $this->assertSame('google-event-1', $draft->metadata['external_event_id']);

        $this->assertDatabaseHas('talos_audit_events', [
            'event_type' => 'google.calendar.event_published',
            'subject_type' => 'calendar_draft',
            'subject_id' => $draft->id,
        ]);
    }

    public function test_google_calendar_publish_cannot_publish_a_foreign_draft(): void
    {
        Http::fake();
        $foreignUser = User::factory()->create();
        $account = $this->googleAccount([
            'provider_account_id' => 'owned-google-user',
            'email' => 'owned@example.test',
            'encrypted_access_token' => Crypt::encryptString('access-token-secret'),
            'scopes' => ['https://www.googleapis.com/auth/calendar.events'],
        ]);
        $foreignDraft = TalosCalendarDraft::query()->create([
            'user_id' => $foreignUser->id,
            'title' => 'Foreign AVM review',
            'starts_at' => now()->addDay(),
            'ends_at' => now()->addDay()->addHour(),
            'timezone' => 'Europe/Rome',
            'attendees' => ['ops@example.test'],
            'status' => 'draft',
            'confirmation_required' => true,
        ]);

        $this->postJson("/api/talos/google/calendar/drafts/{$foreignDraft->id}/publish", [
            'account_id' => $account->id,
            'confirmed' => true,
        ])
            ->assertNotFound();

        Http::assertNothingSent();
        $foreignDraft->refresh();
        $this->assertSame('draft', $foreignDraft->status);
        $this->assertNull($foreignDraft->metadata);
        $this->assertSame(0, TalosAuditEvent::query()
            ->where('event_type', 'google.calendar.event_published')
            ->where('subject_id', $foreignDraft->id)
            ->count());
    }

    public function test_google_oauth_callback_rejects_invalid_state(): void
    {
        $this->withSession(['talos_google_oauth_state' => 'expected-state'])
            ->get('/integrations/google/callback?state=wrong-state&code=test-code')
            ->assertStatus(403);
    }

    public function test_google_redirect_requires_oauth_configuration(): void
    {
        config([
            'services.google.client_id' => null,
            'services.google.client_secret' => null,
        ]);

        $this->getJson('/integrations/google/redirect')
            ->assertStatus(503)
            ->assertJsonPath('code', 'GOOGLE_OAUTH_NOT_CONFIGURED');
    }

    public function test_google_redirect_stores_state_and_requests_offline_incremental_access(): void
    {
        config([
            'services.google.client_id' => 'google-client-id',
            'services.google.client_secret' => 'google-client-secret',
            'services.google.redirect' => 'http://localhost/integrations/google/callback',
            'services.google.scopes' => [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/calendar.events.readonly',
            ],
        ]);

        $response = $this->get('/integrations/google/redirect')
            ->assertRedirect();

        $state = session('talos_google_oauth_state');
        $this->assertIsString($state);
        $this->assertNotSame('', $state);

        $location = $response->headers->get('Location');
        $this->assertIsString($location);

        parse_str((string) parse_url($location, PHP_URL_QUERY), $query);

        $this->assertSame('google-client-id', $query['client_id']);
        $this->assertSame('http://localhost/integrations/google/callback', $query['redirect_uri']);
        $this->assertSame('code', $query['response_type']);
        $this->assertSame('offline', $query['access_type']);
        $this->assertSame('true', $query['include_granted_scopes']);
        $this->assertSame($state, $query['state']);
        $this->assertStringContainsString('https://www.googleapis.com/auth/drive.file', (string) $query['scope']);
        $this->assertStringContainsString('https://www.googleapis.com/auth/calendar.events.readonly', (string) $query['scope']);
    }

    /**
     * @param array<string, mixed> $overrides
     */
    private function googleAccount(array $overrides = []): TalosExternalAccount
    {
        $account = TalosExternalAccount::query()->create([
            'user_id' => $overrides['user_id'] ?? $this->user->id,
            'provider' => 'google',
            'provider_account_id' => 'google-user-1',
            'email' => 'operator@example.test',
            'display_name' => 'Operator',
            'encrypted_access_token' => $overrides['encrypted_access_token'] ?? null,
            'encrypted_refresh_token' => $overrides['encrypted_refresh_token'] ?? null,
            'scopes' => $overrides['scopes'] ?? [],
            'status' => 'connected',
            'token_expires_at' => $overrides['token_expires_at'] ?? now()->addHour(),
            'connected_at' => now(),
            ...$overrides,
        ]);

        assert($account instanceof TalosExternalAccount);

        return $account;
    }
}
