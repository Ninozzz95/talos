<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_browser_checkpoints', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('task_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign('talos_session_id', 'talos_browser_checkpoints_session_fk')
                ->references('id')->on('talos_sessions')->cascadeOnDelete();
            $table->foreign(['task_id', 'user_id', 'talos_session_id'], 'talos_browser_checkpoints_task_scope_fk')
                ->references(['id', 'user_id', 'talos_session_id'])->on('talos_browser_tasks')->cascadeOnDelete();
            $table->unsignedBigInteger('task_state_version');
            $table->string('task_status', 32);
            $table->json('tab_inventory');
            $table->json('budget');
            $table->json('action_frontier');
            $table->json('evidence_frontier');
            $table->longText('runtime_reconciliation_token')->nullable();
            $table->timestamp('recorded_at');
            $table->timestamps();

            $table->unique(['task_id', 'task_state_version'], 'talos_browser_checkpoints_task_version_unique');
            $table->index(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_checkpoints_task_scope_idx',
            );
            $table->index(['user_id', 'recorded_at'], 'talos_browser_checkpoints_owner_recorded_idx');
            $table->index(['talos_session_id', 'recorded_at'], 'talos_browser_checkpoints_session_recorded_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_checkpoints');
    }
};
