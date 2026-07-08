<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_run_artifacts', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('run_id');
            $table->string('artifact_type');
            $table->text('uri');
            $table->string('mime_type')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('run_id')
                ->references('id')
                ->on('talos_runs')
                ->cascadeOnDelete();

            $table->index(['run_id', 'artifact_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_run_artifacts');
    }
};
