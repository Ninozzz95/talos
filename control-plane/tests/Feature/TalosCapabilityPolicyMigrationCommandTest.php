<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\TalosCapabilityPolicy;
use App\Models\TalosCapabilityPolicySet;
use App\Models\TalosSession;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

final class TalosCapabilityPolicyMigrationCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_reports_legacy_rewrites_without_mutating_storage(): void
    {
        $this->legacyPolicy('allow_until_revoked');

        self::assertSame(0, Artisan::call('talos:capability-policies:migrate-v1'));
        $report = $this->report();

        self::assertSame('dry_run', $report['mode']);
        self::assertSame(1, $report['policies_scanned']);
        self::assertSame(1, $report['policies_to_rewrite']);
        self::assertSame(1, $report['grants_to_create']);
        self::assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $report['report_hash']);
        self::assertSame('allow_until_revoked', TalosCapabilityPolicy::query()->value('decision'));
        $this->assertDatabaseCount('talos_capability_grants', 0);
    }

    public function test_apply_requires_the_exact_current_dry_run_hash_and_is_idempotent(): void
    {
        $this->legacyPolicy('allow_for_session', true);
        Artisan::call('talos:capability-policies:migrate-v1');
        $hash = $this->report()['report_hash'];

        self::assertSame(1, Artisan::call('talos:capability-policies:migrate-v1', ['--apply' => true]));
        self::assertSame(1, Artisan::call('talos:capability-policies:migrate-v1', [
            '--apply' => true,
            '--report-hash' => str_repeat('0', 64),
        ]));
        self::assertSame('allow_for_session', TalosCapabilityPolicy::query()->value('decision'));

        self::assertSame(0, Artisan::call('talos:capability-policies:migrate-v1', [
            '--apply' => true,
            '--report-hash' => $hash,
        ]));
        self::assertSame('ask', TalosCapabilityPolicy::query()->value('decision'));
        $this->assertDatabaseHas('talos_capability_grants', [
            'scope' => 'session',
            'status' => 'active',
        ]);

        Artisan::call('talos:capability-policies:migrate-v1');
        $repeat = $this->report();
        self::assertSame(0, $repeat['policies_to_rewrite']);
        self::assertSame(0, $repeat['grants_to_create']);
    }

    private function legacyPolicy(string $decision, bool $withSession = false): void
    {
        $user = User::factory()->create();
        $session = $withSession ? TalosSession::query()->create([
            'user_id' => $user->id,
            'title' => 'Migration scope',
            'mode' => 'verified_execution',
            'surface' => 'chat',
        ]) : null;
        $set = TalosCapabilityPolicySet::query()->create([
            'id' => TalosCapabilityPolicySet::idForUser((int) $user->id),
            'user_id' => $user->id,
            'schema_version' => 1,
            'revision' => 3,
        ]);
        TalosCapabilityPolicy::query()->create([
            'policy_set_id' => $set->id,
            'capability' => $withSession ? 'files.write' : 'web.search',
            'decision' => $decision,
            'talos_session_id' => $session?->id,
            'expires_at' => $withSession ? now()->addHour() : null,
        ]);
    }

    /** @return array<string, mixed> */
    private function report(): array
    {
        $lines = array_values(array_filter(
            preg_split('/\R/', trim(Artisan::output())) ?: [],
            static fn (string $line): bool => trim($line) !== '',
        ));
        $decoded = json_decode((string) end($lines), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($decoded);

        return $decoded;
    }
}
