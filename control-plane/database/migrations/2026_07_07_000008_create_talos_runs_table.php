<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_runs', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('session_id')->nullable();
            $table->string('model_profile_id')->nullable();
            $table->string('context_set_id')->nullable();
            $table->string('mode')->default('avm_on');
            $table->string('status')->default('queued');
            $table->string('prompt_hash', 64)->nullable();
            $table->longText('prompt')->nullable();
            $table->string('provider')->nullable();
            $table->string('model')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->foreign('session_id')
                ->references('id')
                ->on('talos_sessions')
                ->cascadeOnDelete();

            $table->foreign('model_profile_id')
                ->references('id')
                ->on('talos_model_profiles')
                ->nullOnDelete();

            $table->foreign('context_set_id')
                ->references('id')
                ->on('talos_context_sets')
                ->nullOnDelete();

            $table->index(['session_id', 'created_at']);
            $table->index(['status', 'created_at']);
            $table->index('model_profile_id');
            $table->index('context_set_id');
            $table->index('prompt_hash');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_runs');
    }
};
