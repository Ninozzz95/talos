<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_benchmark_results', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('benchmark_group_id');
            $table->string('mode');
            $table->string('label')->nullable();
            $table->string('status')->default('completed');
            $table->string('prompt_hash', 64)->nullable();
            $table->string('context_hash', 64)->nullable();
            $table->string('evaluator_version');
            $table->json('metrics');
            $table->json('raw_report');
            $table->string('raw_log_path')->nullable();
            $table->boolean('trace_replayable')->default(false);
            $table->timestamps();

            $table->foreign('benchmark_group_id')
                ->references('id')
                ->on('talos_benchmark_groups')
                ->cascadeOnDelete();

            $table->unique(['benchmark_group_id', 'mode']);
            $table->index(['mode', 'created_at']);
            $table->index('trace_replayable');
            $table->index('evaluator_version');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_benchmark_results');
    }
};
