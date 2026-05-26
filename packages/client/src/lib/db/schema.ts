import * as v from 'valibot';

export const dbSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbV1 = v.InferOutput<typeof dbSchema>;

export function defaultDb(): DbV1 {
  return { version: 1, title: '', outline: { type: 'doc', content: [] } };
}
