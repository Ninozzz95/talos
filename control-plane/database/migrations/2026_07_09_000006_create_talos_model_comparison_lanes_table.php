<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_model_comparison_lanes', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('comparison_id');
            $table->string('model_profile_id');
            $table->string('display_alias');
            $table->unsignedSmallInteger('position');
            $table->unsignedSmallInteger('weight')->default(100);
            $table->string('status')->default('queued');
            $table->longText('response_text')->nullable();
            $table->unsignedInteger('latency_ms')->nullable();
            $table->decimal('cost', 12, 6)->nullable();
            $table->string('run_id')->nullable();
            $table->string('error_code')->nullable();
            $table->text('error_message')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('comparison_id')
                ->references('id')
                ->on('talos_model_comparisons')
                ->cascadeOnDelete();

            $table->foreign('model_profile_id')
                ->references('id')
                ->on('talos_model_profiles')
                ->restrictOnDelete();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->nullOnDelete();

            $table->unique(['comparison_id', 'display_alias']);
            $table->index(['comparison_id', 'position']);
            $table->index(['model_profile_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_model_comparison_lanes');
    }
};
