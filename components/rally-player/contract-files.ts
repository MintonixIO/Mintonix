import { z } from "zod";
import { analysisSchema, matchSchema } from "./contract.ts";

/** The generated JSON Schema files in `contracts/`, by file name. */
export function contractFiles(): Record<string, string> {
  const render = (schema: z.ZodType) => `${JSON.stringify(z.toJSONSchema(schema, { target: "draft-2020-12" }), null, 2)}\n`;
  return {
    "match.schema.json": render(matchSchema),
    "match-analysis.schema.json": render(analysisSchema),
  };
}
