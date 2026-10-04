/** OpenAI strict objects require every property; optional values become null. */
export function strictJsonSchema(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === "$schema" || key === "required" || key === "properties" || key === "additionalProperties") continue;
    const name = key === "oneOf" ? "anyOf" : key;
    output[name] = Array.isArray(value)
      ? value.map((item) => item && typeof item === "object" ? strictJsonSchema(item as Record<string, unknown>) : item)
      : value && typeof value === "object" ? strictJsonSchema(value as Record<string, unknown>) : value;
  }
  if (input.properties && typeof input.properties === "object") {
    const required = Array.isArray(input.required) ? input.required : [];
    const properties = Object.fromEntries(Object.entries(input.properties).map(([key, value]) => {
      const property = strictJsonSchema(value as Record<string, unknown>);
      return [key, required.includes(key) ? property : { anyOf: [property, { type: "null" }] }];
    }));
    output.properties = properties;
    output.required = Object.keys(properties);
    output.additionalProperties = false;
  }
  return output;
}
