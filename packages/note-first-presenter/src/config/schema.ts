import * as v from 'valibot';

export const configSchema = v.strictObject({
  slides: v.optional(v.string()),
  build: v.optional(
    v.strictObject({
      outDir: v.optional(v.string()),
    }),
  ),
  export: v.optional(
    v.strictObject({
      outDir: v.optional(v.string()),
      imageDir: v.optional(v.string()),
      format: v.optional(
        v.strictObject({
          template: v.string(),
          extension: v.string(),
        }),
      ),
    }),
  ),
});

export type NoteFirstPresenterConfig = v.InferOutput<typeof configSchema>;
