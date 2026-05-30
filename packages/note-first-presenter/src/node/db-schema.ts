import * as v from 'valibot';

export const dbInputSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbInput = v.InferOutput<typeof dbInputSchema>;

export function emptyDb(): DbInput {
  return { version: 1, title: '', outline: { type: 'doc', content: [] } };
}
