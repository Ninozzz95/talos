<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_model_comparisons', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->longText('prompt');
            $table->string('mode')->default('blind');
            $table->string('task_type')->default('chat');
            $table->boolean('blind')->default(true);
            $table->unsignedInteger('shuffle_seed')->nullable();
            $table->string('status')->default('queued');
            $table->unsignedSmallInteger('timeout_seconds')->default(60);
            $table->string('winner_lane_id')->nullable();
            $table->timestamp('revealed_at')->nullable();
            $table->string('benchmark_group_id')->nullable();
            $table->json('scorecard')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('benchmark_group_id')
                ->references('id')
                ->on('talos_benchmark_groups')
                ->nullOnDelete();

            $table->index(['user_id', 'created_at']);
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_model_comparisons');
    }
};
