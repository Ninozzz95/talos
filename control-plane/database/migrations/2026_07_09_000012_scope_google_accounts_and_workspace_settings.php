<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('talos_external_accounts', 'user_id')) {
            Schema::table('talos_external_accounts', function (Blueprint $table): void {
                $table->foreignId('user_id')
                    ->nullable()
                    ->after('id')
                    ->constrained()
                    ->nullOnDelete();

                $table->unique(
                    ['user_id', 'provider', 'provider_account_id'],
                    'talos_external_accounts_owner_provider_unique',
                );
                $table->index(['user_id', 'provider', 'status'], 'talos_external_accounts_owner_provider_status_index');
            });
        }

        if (! Schema::hasColumn('talos_workspace_settings', 'user_id')) {
            Schema::table('talos_workspace_settings', function (Blueprint $table): void {
                $table->foreignId('user_id')
                    ->nullable()
                    ->after('id')
                    ->constrained()
                    ->nullOnDelete();

                $table->unique('user_id', 'talos_workspace_settings_user_unique');
            });
        }

        $this->backfillWorkspaceSettings();
        $this->backfillLegacyOwnership();
    }

    public function down(): void
    {
        if (Schema::hasColumn('talos_workspace_settings', 'user_id')) {
            Schema::table('talos_workspace_settings', function (Blueprint $table): void {
                $table->dropUnique('talos_workspace_settings_user_unique');
                $table->dropConstrainedForeignId('user_id');
            });
        }

        if (Schema::hasColumn('talos_external_accounts', 'user_id')) {
            Schema::table('talos_external_accounts', function (Blueprint $table): void {
                $table->dropIndex('talos_external_accounts_owner_provider_status_index');
                $table->dropUnique('talos_external_accounts_owner_provider_unique');
                $table->dropConstrainedForeignId('user_id');
            });
        }
    }

    private function backfillWorkspaceSettings(): void
    {
        $legacy = DB::table('talos_workspace_settings')
            ->where('id', 'default')
            ->whereNull('user_id')
            ->first();

        if ($legacy === null) {
            return;
        }

        $now = now();
        $users = DB::table('users')->get(['id']);
        foreach ($users as $user) {
            $userId = (int) $user->id;
            if (DB::table('talos_workspace_settings')->where('user_id', $userId)->exists()) {
                continue;
            }

            DB::table('talos_workspace_settings')->insert([
                'id' => 'user-'.$userId,
                'user_id' => $userId,
                'default_model_profile_id' => $this->ownedStringId(
                    'talos_model_profiles',
                    $legacy->default_model_profile_id ?? null,
                    $userId,
                ),
                'default_context_set_id' => $this->ownedStringId(
                    'talos_context_sets',
                    $legacy->default_context_set_id ?? null,
                    $userId,
                ),
                'preferences' => $legacy->preferences ?? json_encode([], JSON_THROW_ON_ERROR),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function backfillLegacyOwnership(): void
    {
        $this->backfillRuns();
        $this->backfillBenchmarkGroups();
        $this->backfillResearchReports();
        $this->backfillProductivityTables();
    }

    private function backfillRuns(): void
    {
        foreach (DB::table('talos_runs')->whereNull('user_id')->get(['id', 'session_id', 'model_profile_id', 'context_set_id']) as $run) {
            $ownerId = $this->ownerFromStringId('talos_sessions', $run->session_id ?? null)
                ?? $this->ownerFromStringId('talos_model_profiles', $run->model_profile_id ?? null)
                ?? $this->ownerFromStringId('talos_context_sets', $run->context_set_id ?? null);

            if ($ownerId !== null) {
                DB::table('talos_runs')->where('id', $run->id)->update(['user_id' => $ownerId]);
            }
        }
    }

    private function backfillBenchmarkGroups(): void
    {
        foreach (DB::table('talos_benchmark_groups')->whereNull('user_id')->get(['id', 'session_id', 'source_run_id']) as $group) {
            $ownerId = $this->ownerFromStringId('talos_runs', $group->source_run_id ?? null)
                ?? $this->ownerFromStringId('talos_sessions', $group->session_id ?? null);

            if ($ownerId !== null) {
                DB::table('talos_benchmark_groups')->where('id', $group->id)->update(['user_id' => $ownerId]);
            }
        }
    }

    private function backfillResearchReports(): void
    {
        if (! Schema::hasColumn('talos_research_reports', 'user_id')) {
            return;
        }

        foreach (DB::table('talos_research_reports')->whereNull('user_id')->get(['id', 'run_id', 'context_set_id', 'benchmark_group_id']) as $report) {
            $ownerId = $this->ownerFromStringId('talos_runs', $report->run_id ?? null)
                ?? $this->ownerFromStringId('talos_context_sets', $report->context_set_id ?? null)
                ?? $this->ownerFromStringId('talos_benchmark_groups', $report->benchmark_group_id ?? null);

            if ($ownerId !== null) {
                DB::table('talos_research_reports')->where('id', $report->id)->update(['user_id' => $ownerId]);
            }
        }
    }

    private function backfillProductivityTables(): void
    {
        foreach (['talos_notes', 'talos_tasks', 'talos_calendar_drafts'] as $tableName) {
            foreach (DB::table($tableName)->whereNull('user_id')->whereNotNull('run_id')->get(['id', 'run_id']) as $row) {
                $ownerId = $this->ownerFromStringId('talos_runs', $row->run_id ?? null);
                if ($ownerId !== null) {
                    DB::table($tableName)->where('id', $row->id)->update(['user_id' => $ownerId]);
                }
            }
        }

        foreach (DB::table('talos_documents')->whereNull('user_id')->get(['id', 'run_id', 'research_report_id']) as $document) {
            $ownerId = $this->ownerFromStringId('talos_runs', $document->run_id ?? null)
                ?? $this->ownerFromStringId('talos_research_reports', $document->research_report_id ?? null);

            if ($ownerId !== null) {
                DB::table('talos_documents')->where('id', $document->id)->update(['user_id' => $ownerId]);
            }
        }
    }

    private function ownedStringId(string $tableName, mixed $id, int $userId): ?string
    {
        if (! is_string($id) || $id === '') {
            return null;
        }

        return DB::table($tableName)
            ->where('id', $id)
            ->where('user_id', $userId)
            ->exists()
            ? $id
            : null;
    }

    private function ownerFromStringId(string $tableName, mixed $id): ?int
    {
        if (! is_string($id) || $id === '' || ! Schema::hasColumn($tableName, 'user_id')) {
            return null;
        }

        $owner = DB::table($tableName)->where('id', $id)->value('user_id');

        return is_numeric($owner) ? (int) $owner : null;
    }
};
