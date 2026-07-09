<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_hardware_profiles', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('host_fingerprint')->index();
            $table->string('os');
            $table->string('cpu_model')->nullable();
            $table->unsignedInteger('cpu_cores')->default(0);
            $table->unsignedInteger('ram_total_mb')->default(0);
            $table->unsignedInteger('ram_free_mb')->default(0);
            $table->json('gpus')->nullable();
            $table->json('runtimes')->nullable();
            $table->json('raw_evidence')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->timestamps();
        });

        Schema::create('talos_local_runtimes', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('kind')->index();
            $table->string('status')->index();
            $table->string('version')->nullable();
            $table->string('executable_path')->nullable();
            $table->json('evidence')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamps();
        });

        Schema::create('talos_model_catalog_entries', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('provider')->index();
            $table->string('model_id')->index();
            $table->string('display_name');
            $table->decimal('parameters_b', 6, 2)->nullable();
            $table->string('quantization')->nullable();
            $table->unsignedInteger('context_window')->nullable();
            $table->json('runtime_modes')->nullable();
            $table->unsignedInteger('estimated_vram_mb')->nullable();
            $table->unsignedInteger('estimated_ram_mb')->nullable();
            $table->json('tags')->nullable();
            $table->string('source_url')->nullable();
            $table->string('status')->default('available')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_model_catalog_entries');
        Schema::dropIfExists('talos_local_runtimes');
        Schema::dropIfExists('talos_hardware_profiles');
    }
};
