<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_tools', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('connector_id');
            $table->string('name')->unique();
            $table->string('display_name');
            $table->text('description')->nullable();
            $table->json('input_schema');
            $table->string('risk_level')->default('low');
            $table->string('capability')->nullable();
            $table->json('policy')->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->boolean('planning_enabled')->default(true);
            $table->timestamps();

            $table->index(['connector_id', 'is_enabled', 'planning_enabled']);
            $table->index('risk_level');
            $table->foreign('connector_id')->references('id')->on('talos_connectors')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_tools');
    }
};
