import { z } from "zod";
import { metadataSchema, rallyMotionSchema } from "./contract.ts";

/** The generated JSON Schema files in `contracts/`, by file name. */
export function contractFiles(): Record<string, string> {
  const render = (schema: z.ZodType) => `${JSON.stringify(z.toJSONSchema(schema, { target: "draft-2020-12" }), null, 2)}\n`;
  return {
    "metadata.schema.json": render(metadataSchema),
    "rally.schema.json": render(rallyMotionSchema),
  };
}
