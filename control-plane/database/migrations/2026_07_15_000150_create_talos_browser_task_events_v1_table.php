<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_task_events', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('task_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_task_events_task_scope_fk',
            )->references(['id', 'user_id', 'talos_session_id'])->on('talos_browser_tasks')->cascadeOnDelete();
            $table->string('command_id', 128);
            $table->string('command_sha256', 71);
            $table->string('event_type', 128);
            $table->string('actor_type', 32);
            $table->string('actor_id', 256)->nullable();
            $table->string('from_status', 32)->nullable();
            $table->unsignedBigInteger('from_state_version')->nullable();
            $table->string('to_status', 32);
            $table->unsignedBigInteger('to_state_version');
            $table->json('payload');
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->unique(
                ['id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_task_events_scope_unique',
            );
            $table->unique(
                ['task_id', 'to_state_version'],
                'talos_browser_task_events_version_unique',
            );
            $table->unique(
                ['user_id', 'command_id'],
                'talos_browser_task_events_command_unique',
            );
            $table->index(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_task_events_task_scope_idx',
            );
            $table->index(
                ['user_id', 'occurred_at'],
                'talos_browser_task_events_owner_time_idx',
            );
            $table->index(
                ['talos_session_id', 'occurred_at'],
                'talos_browser_task_events_session_time_idx',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_task_events');
    }
};
