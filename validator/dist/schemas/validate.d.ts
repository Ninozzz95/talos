export interface ValidationFault {
    field: string;
    expected: string;
    received: string;
    message: string;
}
export interface ValidationResult {
    valid: boolean;
    errors?: ValidationFault[];
}
export declare function validateMutations(mutations: unknown[], context: Record<string, string>, allowedNodeTypes?: string[] | null, allowedBrowserOperations?: string[] | null, browserModeEnabled?: boolean): ValidationResult;
//# sourceMappingURL=validate.d.ts.map