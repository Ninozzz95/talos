<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_browser_artifacts', function (Blueprint $table): void {
            $table->unique(['id', 'user_id'], 'talos_browser_artifacts_owner_v1_unique');
        });

        Schema::create('talos_browser_evidence_bundles', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('schema_version', 64);
            $table->string('task_id');
            $table->string('action_id');
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('talos_session_id');
            $table->foreign('talos_session_id', 'talos_browser_evidence_session_fk')
                ->references('id')->on('talos_sessions')->cascadeOnDelete();
            $table->foreign(['task_id', 'user_id', 'talos_session_id'], 'talos_browser_evidence_task_scope_fk')
                ->references(['id', 'user_id', 'talos_session_id'])->on('talos_browser_tasks')->cascadeOnDelete();
            $table->foreign(
                ['action_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_evidence_action_scope_fk',
            )->references(['id', 'task_id', 'user_id', 'talos_session_id'])
                ->on('talos_browser_actions')->cascadeOnDelete();
            $table->unsignedBigInteger('worker_state_version');
            $table->text('url');
            $table->text('title');
            $table->timestamp('captured_at');
            $table->json('frame');

            $table->string('snapshot_artifact_id')->nullable();
            $table->foreign('snapshot_artifact_id', 'talos_browser_evidence_snapshot_artifact_fk')
                ->references('id')->on('talos_browser_artifacts')->nullOnDelete();
            $table->foreign(
                ['snapshot_artifact_id', 'user_id'],
                'talos_browser_evidence_snapshot_owner_fk',
            )->references(['id', 'user_id'])->on('talos_browser_artifacts');
            $table->string('snapshot_mime')->nullable();
            $table->string('snapshot_sha256', 71)->nullable();
            $table->unsignedBigInteger('snapshot_byte_size')->nullable();
            $table->unsignedInteger('snapshot_width')->nullable();
            $table->unsignedInteger('snapshot_height')->nullable();
            $table->string('snapshot_redaction_status', 32)->nullable();

            $table->string('screenshot_artifact_id')->nullable();
            $table->foreign('screenshot_artifact_id', 'talos_browser_evidence_screenshot_artifact_fk')
                ->references('id')->on('talos_browser_artifacts')->nullOnDelete();
            $table->foreign(
                ['screenshot_artifact_id', 'user_id'],
                'talos_browser_evidence_screenshot_owner_fk',
            )->references(['id', 'user_id'])->on('talos_browser_artifacts');
            $table->string('screenshot_mime')->nullable();
            $table->string('screenshot_sha256', 71)->nullable();
            $table->unsignedBigInteger('screenshot_byte_size')->nullable();
            $table->unsignedInteger('screenshot_width')->nullable();
            $table->unsignedInteger('screenshot_height')->nullable();
            $table->string('screenshot_redaction_status', 32)->nullable();

            $table->string('before_evidence_id')->nullable();
            $table->string('integrity_sha256', 71);
            $table->json('claims');
            $table->timestamp('committed_at');
            $table->timestamp('reconciled_at')->nullable();
            $table->timestamps();

            $table->unique(
                ['id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_evidence_scope_unique',
            );
            $table->foreign(
                ['before_evidence_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_evidence_previous_scope_fk',
            )->references(['id', 'task_id', 'user_id', 'talos_session_id'])
                ->on('talos_browser_evidence_bundles');
            $table->unique(['action_id', 'integrity_sha256'], 'talos_browser_evidence_action_integrity_unique');
            $table->index(
                ['task_id', 'user_id', 'talos_session_id'],
                'talos_browser_evidence_task_scope_idx',
            );
            $table->index(
                ['action_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_evidence_action_scope_idx',
            );
            $table->index(
                ['before_evidence_id', 'task_id', 'user_id', 'talos_session_id'],
                'talos_browser_evidence_previous_scope_idx',
            );
            $table->index(
                ['snapshot_artifact_id', 'user_id'],
                'talos_browser_evidence_snapshot_artifact_idx',
            );
            $table->index(
                ['screenshot_artifact_id', 'user_id'],
                'talos_browser_evidence_screenshot_artifact_idx',
            );
            $table->index(['user_id', 'captured_at'], 'talos_browser_evidence_owner_captured_idx');
            $table->index(['talos_session_id', 'captured_at'], 'talos_browser_evidence_session_captured_idx');
            $table->index(['task_id', 'worker_state_version'], 'talos_browser_evidence_task_state_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_browser_evidence_bundles');
        Schema::table('talos_browser_artifacts', function (Blueprint $table): void {
            $table->dropUnique('talos_browser_artifacts_owner_v1_unique');
        });
    }
};
