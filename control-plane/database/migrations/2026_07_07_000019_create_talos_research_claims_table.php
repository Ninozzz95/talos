<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_research_claims', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->string('research_report_id');
            $table->unsignedInteger('sequence')->default(1);
            $table->longText('text');
            $table->string('status')->default('pending');
            $table->decimal('confidence', 5, 4)->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('research_report_id')
                ->references('id')
                ->on('talos_research_reports')
                ->cascadeOnDelete();

            $table->index(['research_report_id', 'status']);
            $table->index(['research_report_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_research_claims');
    }
};
