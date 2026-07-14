<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('talos_tool_calls', function (Blueprint $table): void {
            $table->string('evidence_snapshot_artifact_id')->nullable()->after('evidence_hash');
            $table->string('evidence_snapshot_id', 128)->nullable()->after('evidence_snapshot_artifact_id');
            $table->foreign('evidence_snapshot_artifact_id')
                ->references('id')
                ->on('talos_browser_artifacts')
                ->nullOnDelete();
            $table->index('evidence_snapshot_artifact_id', 'talos_tool_calls_evidence_snapshot_index');
        });
    }

    public function down(): void
    {
        Schema::table('talos_tool_calls', function (Blueprint $table): void {
            $table->dropForeign(['evidence_snapshot_artifact_id']);
            $table->dropIndex('talos_tool_calls_evidence_snapshot_index');
            $table->dropColumn(['evidence_snapshot_artifact_id', 'evidence_snapshot_id']);
        });
    }
};
