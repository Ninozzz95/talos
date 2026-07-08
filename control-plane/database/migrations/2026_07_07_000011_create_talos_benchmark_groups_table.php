<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_benchmark_groups', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('session_id')->nullable();
            $table->string('source_run_id')->nullable();
            $table->string('name');
            $table->string('scenario_path')->nullable();
            $table->string('scenario_hash', 64);
            $table->string('prompt_hash', 64)->nullable();
            $table->string('context_hash', 64)->nullable();
            $table->string('model')->nullable();
            $table->string('evaluator_version');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('session_id')
                ->references('id')
                ->on('talos_sessions')
                ->nullOnDelete();

            $table->foreign('source_run_id')
                ->references('id')
                ->on('talos_runs')
                ->nullOnDelete();

            $table->index(['created_at', 'name']);
            $table->index('scenario_hash');
            $table->index('prompt_hash');
            $table->index('context_hash');
            $table->index('evaluator_version');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_benchmark_groups');
    }
};
