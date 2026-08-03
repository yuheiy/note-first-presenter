// The single definition of the db wire format, owned here and read by the CLI
// through the package subpath `@note-first-presenter/client/dbSchema` (ADR-0013).
// The client only derives `DbV1` from it; the runtime `v.parse` happens on the
// CLI side, at the trust boundary.
//
// This file must import nothing but valibot. It is bundled into the CLI's dist
// and read by Node outside the client package, so anything that only resolves
// inside the client (React, ProseMirror, generated code) breaks the CLI build.
import * as v from 'valibot';

export const dbSchema = v.object({
  version: v.literal(1),
  title: v.string(),
  outline: v.unknown(),
});

export type DbV1 = v.InferOutput<typeof dbSchema>;

export function defaultDb(): DbV1 {
  return {
    version: 1,
    title: '',
    outline: {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [{ type: 'list_item', content: [{ type: 'paragraph' }] }],
        },
      ],
    },
  };
}
