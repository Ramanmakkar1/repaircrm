import { describe, expect, it } from "vitest";
import { z } from "zod";

import { PRODUCT_FIELDS } from "@/components/import/fields";
import { mappingResponseSchema, parseMappingSuggestion } from "@/lib/ai/import-mapping";
import { strictJsonSchema } from "@/lib/ai/structured-schema";

/**
 * The JSON schemas handed to OpenAI's strict structured-output mode.
 *
 * Strict mode refuses a schema where an object has an optional property or
 * allows extra keys, and caps the number of enum values in the whole schema.
 * Whether OpenAI accepts a given schema is only knowable with a live key; these
 * tests pin the rules we can check offline.
 */

type Schema = Record<string, unknown>;

/** Every object in the schema, however deeply nested. */
function* allSchemas(node: unknown): Generator<Schema> {
  if (Array.isArray(node)) {
    for (const item of node) yield* allSchemas(item);
  } else if (node && typeof node === "object") {
    yield node as Schema;
    for (const value of Object.values(node)) yield* allSchemas(value);
  }
}

/** Strict mode: every object lists all its properties as required and forbids extras. */
function expectStrict(schema: unknown) {
  let objects = 0;
  for (const node of allSchemas(schema)) {
    if (node.properties && typeof node.properties === "object") {
      objects += 1;
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties).sort());
    }
  }
  return objects;
}

function enumValueCount(schema: unknown): number {
  let total = 0;
  for (const node of allSchemas(schema)) if (Array.isArray(node.enum)) total += node.enum.length;
  return total;
}

describe("strictJsonSchema", () => {
  it("makes every property required, turning the optional ones nullable, and forbids extra keys", () => {
    const strict = strictJsonSchema({
      type: "object",
      properties: { name: { type: "string" }, note: { type: "string" } },
      required: ["name"],
    });

    expect(strict).toEqual({
      type: "object",
      properties: {
        name: { type: "string" },
        note: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["name", "note"],
      additionalProperties: false,
    });
  });

  it("drops $schema and rewrites oneOf as anyOf, converting the objects inside each branch", () => {
    const strict = strictJsonSchema({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      oneOf: [
        { type: "object", properties: { action: { const: "a" }, amount: { type: "number" } }, required: ["action"] },
        { type: "object", properties: { action: { const: "b" } }, required: ["action"] },
      ],
    });

    expect(strict).not.toHaveProperty("$schema");
    expect(strict).not.toHaveProperty("oneOf");
    expect(strict.anyOf).toEqual([
      {
        type: "object",
        properties: { action: { const: "a" }, amount: { anyOf: [{ type: "number" }, { type: "null" }] } },
        required: ["action", "amount"],
        additionalProperties: false,
      },
      { type: "object", properties: { action: { const: "b" } }, required: ["action"], additionalProperties: false },
    ]);
  });

  it("converts objects inside array items and nested properties", () => {
    const strict = strictJsonSchema({
      type: "object",
      properties: {
        lines: {
          type: "array",
          items: { type: "object", properties: { sku: { type: "string" }, qty: { type: "integer" } }, required: ["sku"] },
        },
      },
      required: ["lines"],
    });

    expect(strict).toMatchObject({
      properties: {
        lines: {
          type: "array",
          items: {
            properties: { sku: { type: "string" }, qty: { anyOf: [{ type: "integer" }, { type: "null" }] } },
            required: ["sku", "qty"],
            additionalProperties: false,
          },
        },
      },
    });
  });

  it("keeps plain keywords such as enum values and leaves leaf schemas as they are", () => {
    expect(strictJsonSchema({ type: "string", enum: ["a", "b"] })).toEqual({ type: "string", enum: ["a", "b"] });
    expect(strictJsonSchema({ type: "integer", minimum: -1, maximum: 9 })).toEqual({ type: "integer", minimum: -1, maximum: 9 });
  });

  it("does not change the schema it is given", () => {
    const input = { type: "object", properties: { a: { type: "string" } }, required: [] as string[] };
    const before = JSON.stringify(input);
    strictJsonSchema(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  it("turns a real zod discriminated union into a strict schema", () => {
    const union = z.discriminatedUnion("action", [
      z.object({ action: z.literal("search"), query: z.string() }),
      z.object({ action: z.literal("add"), name: z.string(), price: z.number().optional() }),
    ]);

    const strict = strictJsonSchema(z.toJSONSchema(union));

    expect(expectStrict(strict)).toBe(2);
    const branches = (strict.anyOf as Schema[]).map((branch) => Object.keys(branch.properties as Schema).sort());
    expect(branches).toEqual([["action", "query"], ["action", "name", "price"]]);
  });
});

describe("mappingResponseSchema", () => {
  const fieldKeys = PRODUCT_FIELDS.map((field) => field.key);
  const mappingOf = (columns: number) =>
    ((mappingResponseSchema(columns).schema.properties as Schema).mapping as Schema).properties as Record<string, Schema>;

  it("lists the allowed column numbers for an ordinary sheet", () => {
    const fields = mappingOf(5);
    expect(Object.keys(fields)).toEqual(fieldKeys);
    for (const key of fieldKeys) {
      expect(fields[key]).toEqual({ type: "integer", enum: [-1, 0, 1, 2, 3, 4] });
    }
  });

  it("is a strict schema: every field and note required, no extra keys", () => {
    for (const columns of [1, 5, 100]) {
      const { schema } = mappingResponseSchema(columns);
      expect(expectStrict(schema)).toBe(2);
      expect(schema.required).toEqual(["mapping", "notes"]);
    }
  });

  it("stays under the enum-value cap for a 100-column sheet by using a number range instead", () => {
    const { schema } = mappingResponseSchema(100);

    expect(enumValueCount(schema)).toBeLessThanOrEqual(1000);
    const fields = mappingOf(100);
    for (const key of fieldKeys) {
      expect(fields[key]).toEqual({ type: "integer", minimum: -1, maximum: 99 });
    }
  });

  it("switches form exactly where the enum values would pass 1,000", () => {
    const perField = (columns: number) => mappingOf(columns).name;
    const widest = Math.floor(1000 / fieldKeys.length) - 1; // largest column count whose enums still fit

    expect(perField(widest)).toHaveProperty("enum");
    expect(enumValueCount(mappingResponseSchema(widest).schema)).toBeLessThanOrEqual(1000);
    expect(perField(widest + 1)).not.toHaveProperty("enum");
    expect(perField(widest + 1)).toMatchObject({ minimum: -1, maximum: widest });
  });

  it("agrees with the validator that reads the answer: the last column is accepted, one past it is not", () => {
    const columns = 100;
    const answer = (index: number) => JSON.stringify({ mapping: { name: index }, notes: [] });

    expect(parseMappingSuggestion(answer(99), columns)).toMatchObject({ mapping: { name: 99 } });
    expect(parseMappingSuggestion(answer(-1), columns)).toMatchObject({ mapping: { name: -1 } });
    expect(parseMappingSuggestion(answer(100), columns)).toBeNull();
    expect(parseMappingSuggestion(answer(-2), columns)).toBeNull();
  });
});
