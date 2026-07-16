<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_session_leases', function (Blueprint $table): void {
            $table->unique(
                ['id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_leases_scope_unique',
            );
        });

        Schema::create('talos_browser_lease_commands', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('lease_id');
            $table->string('task_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign(
                ['lease_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_lease_commands_lease_scope_fk',
            )->references(['id', 'task_id', 'user_id', 'talos_session_id'])
                ->on('talos_browser_session_leases')->cascadeOnDelete();
            $table->string('command_id', 128);
            $table->string('command_sha256', 71);
            $table->string('operation', 32);
            $table->json('payload');
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->unique(
                ['id', 'lease_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_lease_commands_scope_unique',
            );
            $table->unique(
                ['user_id', 'command_id'],
                'talos_browser_lease_commands_command_unique',
            );
            $table->index(
                ['lease_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_lease_commands_lease_scope_idx',
            );
            $table->index(
                ['task_id', 'occurred_at'],
                'talos_browser_lease_commands_task_time_idx',
            );
            $table->index(
                ['user_id', 'occurred_at'],
                'talos_browser_lease_commands_owner_time_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_lease_commands');
        Schema::table('talos_browser_session_leases', function (Blueprint $table): void {
            $table->dropUnique('talos_browser_leases_scope_unique');
        });
    }
};
