<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_artifact_generations', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('run_id');
            $table->string('artifact_id')->nullable();
            $table->string('document_id')->nullable();
            $table->char('request_hash', 64);
            $table->string('format', 16);
            $table->string('filename', 255);
            $table->string('status', 32);
            $table->string('failure_code', 128)->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->cascadeOnDelete();
            $table->foreign('artifact_id')
                ->references('id')
                ->on('talos_run_artifacts')
                ->nullOnDelete();
            $table->foreign('document_id')
                ->references('id')
                ->on('talos_documents')
                ->nullOnDelete();
            $table->index(['user_id', 'status'], 'talos_artifact_generations_owner_status_index');
            $table->index(['run_id', 'status'], 'talos_artifact_generations_run_status_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_artifact_generations');
    }
};
