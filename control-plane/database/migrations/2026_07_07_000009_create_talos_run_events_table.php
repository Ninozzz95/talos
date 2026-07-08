<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_run_events', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('run_id');
            $table->unsignedInteger('sequence');
            $table->string('event_type')->default('unknown.generic');
            $table->string('node_id')->nullable();
            $table->string('severity')->default('info');
            $table->json('payload')->nullable();
            $table->timestamp('occurred_at')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->cascadeOnDelete();

            $table->unique(['run_id', 'sequence']);
            $table->index(['run_id', 'event_type']);
            $table->index(['run_id', 'node_id']);
            $table->index('severity');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_run_events');
    }
};
