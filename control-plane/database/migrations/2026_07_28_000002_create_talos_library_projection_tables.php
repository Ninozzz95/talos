<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('talos_library_items', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('origin_session_id')->nullable();
            $table->string('source_type', 32);
            $table->string('source_id');
            $table->string('kind', 16);
            $table->string('origin', 16);
            $table->string('title');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('byte_size')->nullable();
            $table->string('checksum', 128)->nullable();
            $table->text('source_url')->nullable();
            $table->text('search_text')->nullable();
            $table->string('trust_boundary', 64);
            $table->timestamp('occurred_at');
            $table->json('metadata')->nullable();
            $table->timestamp('hidden_at')->nullable();
            $table->timestamp('unavailable_at')->nullable();
            $table->timestamps();

            $table->foreign('origin_session_id')
                ->references('id')
                ->on('talos_sessions')
                ->nullOnDelete();
            $table->unique(
                ['user_id', 'source_type', 'source_id'],
                'talos_library_source_unique',
            );
            $table->index(
                ['user_id', 'kind', 'occurred_at', 'id'],
                'talos_library_kind_order_index',
            );
            $table->index(
                ['user_id', 'origin', 'occurred_at', 'id'],
                'talos_library_origin_order_index',
            );
        });

        Schema::create('talos_library_item_sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('library_item_id');
            $table->string('session_id');
            $table->string('message_id')->nullable();
            $table->string('relation', 24);
            $table->string('binding_type', 24);
            $table->string('binding_id');
            $table->timestamp('occurred_at');
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->foreign('library_item_id')
                ->references('id')
                ->on('talos_library_items')
                ->cascadeOnDelete();
            $table->foreign('session_id')
                ->references('id')
                ->on('talos_sessions')
                ->cascadeOnDelete();
            $table->foreign('message_id')
                ->references('id')
                ->on('talos_messages')
                ->nullOnDelete();
            $table->unique(
                ['library_item_id', 'binding_type', 'binding_id', 'relation'],
                'talos_library_binding_unique',
            );
            $table->index(
                ['user_id', 'session_id', 'occurred_at', 'id'],
                'talos_library_session_order_index',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('talos_library_item_sessions');
        Schema::dropIfExists('talos_library_items');
    }
};
