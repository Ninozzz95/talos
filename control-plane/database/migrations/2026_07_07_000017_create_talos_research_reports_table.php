<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_research_reports', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('run_id')->nullable();
            $table->string('context_set_id')->nullable();
            $table->string('benchmark_group_id')->nullable();
            $table->string('title');
            $table->text('query');
            $table->string('status')->default('draft');
            $table->longText('summary')->nullable();
            $table->longText('report_markdown')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->nullOnDelete();

            $table->foreign('context_set_id')
                ->references('id')
                ->on('talos_context_sets')
                ->nullOnDelete();

            $table->foreign('benchmark_group_id')
                ->references('id')
                ->on('talos_benchmark_groups')
                ->nullOnDelete();

            $table->index(['status', 'created_at']);
            $table->index('run_id');
            $table->index('context_set_id');
            $table->index('benchmark_group_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_research_reports');
    }
};
