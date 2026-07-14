<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->uuid('interaction_id')->nullable()->after('command_id');
            $table->json('execution_payload')->nullable()->after('execution_started_at');
            $table->timestamp('execution_lease_expires_at')->nullable()->after('execution_payload');
            $table->unsignedInteger('execution_attempts')->default(0)->after('execution_lease_expires_at');
            $table->index(['browser_session_id', 'interaction_id'], 'talos_browser_hmi_interaction_index');
        });

        Schema::table('talos_browser_artifacts', function (Blueprint $table): void {
            $table->unique(
                ['browser_session_id', 'source_command_id', 'type'],
                'talos_browser_artifacts_command_type_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::table('talos_browser_artifacts', function (Blueprint $table): void {
            $table->dropUnique('talos_browser_artifacts_command_type_unique');
        });

        Schema::table('talos_browser_hmi_approvals', function (Blueprint $table): void {
            $table->dropIndex('talos_browser_hmi_interaction_index');
            $table->dropColumn([
                'interaction_id',
                'execution_payload',
                'execution_lease_expires_at',
                'execution_attempts',
            ]);
        });
    }
};
