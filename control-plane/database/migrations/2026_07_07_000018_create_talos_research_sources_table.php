<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_research_sources', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('research_report_id');
            $table->string('client_id');
            $table->unsignedInteger('sequence')->default(1);
            $table->string('source_type')->default('web');
            $table->text('url');
            $table->string('title')->nullable();
            $table->string('status')->default('fetched');
            $table->longText('excerpt')->nullable();
            $table->string('content_hash', 64)->nullable();
            $table->string('file_id')->nullable();
            $table->string('file_chunk_id')->nullable();
            $table->text('failure_reason')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('research_report_id')
                ->references('id')
                ->on('talos_research_reports')
                ->cascadeOnDelete();

            $table->foreign('file_id')
                ->references('id')
                ->on('talos_files')
                ->nullOnDelete();

            $table->foreign('file_chunk_id')
                ->references('id')
                ->on('talos_file_chunks')
                ->nullOnDelete();

            $table->unique(['research_report_id', 'client_id']);
            $table->index(['research_report_id', 'status']);
            $table->index(['research_report_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_research_sources');
    }
};
