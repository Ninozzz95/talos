<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_documents', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('run_id')->nullable();
            $table->string('run_artifact_id')->nullable();
            $table->string('research_report_id')->nullable();
            $table->string('title');
            $table->string('document_type')->default('document');
            $table->string('format')->default('markdown');
            $table->string('status')->default('active');
            $table->longText('content');
            $table->string('content_hash', 64);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->nullOnDelete();

            $table->foreign('run_artifact_id')
                ->references('id')
                ->on('talos_run_artifacts')
                ->nullOnDelete();

            $table->foreign('research_report_id')
                ->references('id')
                ->on('talos_research_reports')
                ->nullOnDelete();

            $table->index(['document_type', 'status']);
            $table->index('run_id');
            $table->index('run_artifact_id');
            $table->index('research_report_id');
            $table->index('content_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_documents');
    }
};
