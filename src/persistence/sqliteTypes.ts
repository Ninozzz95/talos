export type TalosSqlValue = string | number | null
export type TalosSqlRow = Record<string, unknown>

export interface TalosSqlChanges {
    changes: number
    lastId?: number
}

export interface TalosSqlConnection {
    open(): Promise<void>
    isOpen(): Promise<boolean>
    close(): Promise<void>
    execute(statements: string): Promise<TalosSqlChanges>
    run(statement: string, values?: TalosSqlValue[]): Promise<TalosSqlChanges>
    query(statement: string, values?: TalosSqlValue[]): Promise<TalosSqlRow[]>
    beginTransaction(): Promise<void>
    commitTransaction(): Promise<void>
    rollbackTransaction(): Promise<void>
}

export type TalosSqlitePlatform = 'native' | 'web'

export interface TalosSqliteRuntime {
    readonly platform: TalosSqlitePlatform
    connect(): Promise<TalosSqlConnection>
    persist(): Promise<void>
    close(): Promise<void>
    /** Debt S1: close AND drop the stored passphrase, so the PIN really gates. */
    forgetSecret?(): Promise<void>
    /** Debt S1: move a legacy database onto a key we can wrap with the PIN. */
    adoptManagedSecret?(secret: string): Promise<void>
}
