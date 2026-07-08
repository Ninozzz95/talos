<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_workspace_settings', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('default_model_profile_id')->nullable();
            $table->string('default_context_set_id')->nullable();
            $table->json('preferences')->nullable();
            $table->timestamps();

            $table
                ->foreign('default_model_profile_id')
                ->references('id')
                ->on('talos_model_profiles')
                ->nullOnDelete();
            $table
                ->foreign('default_context_set_id')
                ->references('id')
                ->on('talos_context_sets')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_workspace_settings');
    }
};
