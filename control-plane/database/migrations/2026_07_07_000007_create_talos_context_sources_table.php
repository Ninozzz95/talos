<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_context_sources', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('context_set_id');
            $table->string('file_id')->nullable();
            $table->string('file_chunk_id')->nullable();
            $table->string('source_type');
            $table->unsignedInteger('sequence')->default(1);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('context_set_id')->references('id')->on('talos_context_sets')->cascadeOnDelete();
            $table->foreign('file_id')->references('id')->on('talos_files')->nullOnDelete();
            $table->foreign('file_chunk_id')->references('id')->on('talos_file_chunks')->nullOnDelete();
            $table->index(['context_set_id', 'sequence']);
            $table->index(['file_id', 'source_type']);
            $table->index('file_chunk_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_context_sources');
    }
};
