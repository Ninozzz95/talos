<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_research_claim_source', function (Blueprint $table): void {
            $table->string('research_claim_id');
            $table->string('research_source_id');
            $table->string('support_status')->default('supports');
            $table->text('evidence_excerpt')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->primary(['research_claim_id', 'research_source_id'], 'talos_research_claim_source_primary');

            $table->foreign('research_claim_id', 'talos_research_claim_source_claim_fk')
                ->references('id')
                ->on('talos_research_claims')
                ->cascadeOnDelete();

            $table->foreign('research_source_id', 'talos_research_claim_source_source_fk')
                ->references('id')
                ->on('talos_research_sources')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_research_claim_source');
    }
};
