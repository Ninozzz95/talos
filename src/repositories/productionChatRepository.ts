import { createCapacitorSqliteRuntime } from '@/persistence/capacitorSqliteRuntime'
import { registerTalosSqliteRuntime } from '@/services/databaseProtection'
import type { TalosChatRepository } from '@/repositories/chatRepository'
import { createSqliteChatRepository } from '@/repositories/sqliteChatRepository'

export function createProductionChatRepository(): TalosChatRepository {
    // Debt S1: the lock has to close the database and drop its passphrase, so
    // the runtime cannot stay private to the repository.
    const runtime = createCapacitorSqliteRuntime()
    registerTalosSqliteRuntime(runtime)
    return createSqliteChatRepository(runtime)
}
