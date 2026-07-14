import { z } from 'zod';
export declare const JsonObjectSchema: z.ZodPreprocess<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
export declare function boundedString(maxBytes: number): z.ZodString;
export declare function nonEmptyBoundedString(maxBytes: number): z.ZodString;
export declare const AbsoluteUriSchema: z.ZodString;
export declare const ToolNameSchema: z.ZodString;
//# sourceMappingURL=contractPrimitives.d.ts.map