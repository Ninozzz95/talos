<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_notes', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('run_id')->nullable();
            $table->string('scope_type')->default('global');
            $table->string('scope_id')->nullable();
            $table->string('title');
            $table->longText('content');
            $table->string('status')->default('active');
            $table->json('metadata')->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->nullOnDelete();

            $table->index(['scope_type', 'scope_id', 'status']);
            $table->index('run_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_notes');
    }
};
