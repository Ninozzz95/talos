<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_skills', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('name')->unique();
            $table->string('display_name');
            $table->text('description')->nullable();
            $table->string('trigger')->nullable();
            $table->text('content');
            $table->json('input_schema')->nullable();
            $table->json('output_schema')->nullable();
            $table->json('allowed_tools')->nullable();
            $table->string('risk_level')->default('low');
            $table->string('review_status')->default('draft');
            $table->string('eval_status')->default('not_run');
            $table->json('eval_result')->nullable();
            $table->string('source_type')->default('manual');
            $table->boolean('is_enabled')->default(true);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['is_enabled', 'review_status', 'eval_status']);
            $table->index('risk_level');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_skills');
    }
};
