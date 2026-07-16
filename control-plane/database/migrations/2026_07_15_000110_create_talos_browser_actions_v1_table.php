<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_actions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('task_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign('talos_session_id', 'talos_browser_actions_session_fk')
                ->references('id')->on('talos_sessions')->cascadeOnDelete();
            $table->foreign(['task_id', 'user_id', 'talos_session_id'], 'talos_browser_actions_task_scope_fk')
                ->references(['id', 'user_id', 'talos_session_id'])->on('talos_browser_tasks')->cascadeOnDelete();
            $table->string('intent_id');
            $table->unsignedBigInteger('sequence');
            $table->string('kind', 64);
            $table->json('arguments');
            $table->unsignedBigInteger('expected_state_version');
            $table->string('risk', 32);
            $table->string('idempotency_key', 71);
            $table->json('preconditions');
            $table->string('status', 32);
            $table->string('result_sha256', 71)->nullable();
            $table->string('error_code', 128)->nullable();
            $table->timestamp('requested_at');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('committed_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamp('reconciled_at')->nullable();
            $table->timestamps();

            $table->unique(['id', 'task_id', 'user_id', 'talos_session_id'], 'talos_browser_actions_scope_unique');
            $table->unique(['task_id', 'sequence'], 'talos_browser_actions_task_sequence_unique');
            $table->unique(['task_id', 'idempotency_key'], 'talos_browser_actions_task_idempotency_unique');
            $table->index(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_actions_task_scope_idx',
            );
            $table->index(['user_id', 'status'], 'talos_browser_actions_owner_status_idx');
            $table->index(['talos_session_id', 'requested_at'], 'talos_browser_actions_session_requested_idx');
            $table->index(['task_id', 'status'], 'talos_browser_actions_task_status_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_actions');
    }
};
