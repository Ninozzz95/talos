<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_research_jobs', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('run_id')->nullable();
            $table->longText('query');
            $table->string('status')->default('pending');
            $table->json('settings')->nullable();
            $table->json('progress')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->string('failure_code')->nullable();
            $table->text('failure_message')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->nullOnDelete();

            $table->index(['user_id', 'status', 'created_at']);
            $table->index('run_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_research_jobs');
    }
};
