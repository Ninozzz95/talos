<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_recovery_commands', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('task_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_recovery_commands_task_scope_fk',
            )->references(['id', 'user_id', 'talos_session_id'])
                ->on('talos_browser_tasks')->cascadeOnDelete();
            $table->string('command_id', 128);
            $table->string('command_sha256', 71);
            $table->string('strategy', 32);
            $table->string('reason_code', 128);
            $table->text('remediation');
            $table->string('resulting_task_id')->nullable();
            $table->json('payload');
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->unique(
                ['id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_recovery_commands_scope_unique',
            );
            $table->unique(
                ['user_id', 'command_id'],
                'talos_browser_recovery_commands_command_unique',
            );
            $table->index(
                ['task_id', 'occurred_at'],
                'talos_browser_recovery_commands_task_time_idx',
            );
            $table->index(
                ['user_id', 'occurred_at'],
                'talos_browser_recovery_commands_owner_time_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_recovery_commands');
    }
};
