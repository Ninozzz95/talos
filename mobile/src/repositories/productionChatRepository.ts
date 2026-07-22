import { createCapacitorSqliteRuntime } from '@/persistence/capacitorSqliteRuntime'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'

export function createProductionChatRepository(): TalosChatRepository {
    return createSqliteChatRepository(createCapacitorSqliteRuntime())
}
