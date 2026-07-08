<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_email_drafts', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->json('referenced_message_ids')->nullable();
            $table->json('to_addresses');
            $table->json('cc_addresses')->nullable();
            $table->string('subject');
            $table->longText('body');
            $table->string('status')->default('draft');
            $table->boolean('send_enabled')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['status', 'send_enabled']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_email_drafts');
    }
};
