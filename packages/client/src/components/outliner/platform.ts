import { baseKeymap, macBaseKeymap } from 'prosemirror-commands';

/**
 * Whether this is a Mac, as ProseMirror sees it.
 *
 * Reuses ProseMirror's own detection instead of adding a second detector:
 * prosemirror-commands sets `baseKeymap = mac ? macBaseKeymap : pcBaseKeymap`,
 * so this identity check always agrees with the `Mod-` normalization that
 * prosemirror-keymap applies to the outliner's bindings — and therefore the
 * keyboard and the mouse can never answer "is this a Mac?" differently.
 *
 * Deliberately not react-aria's `isMac()`, which tests `/^Mac/i` against
 * `navigator.userAgentData?.platform || navigator.platform` and so answers
 * `false` on an iPhone, where ProseMirror's `/Mac|iP(hone|[oa]d)/` answers
 * `true`. Two detectors that disagree on any device is one too many.
 */
export const isMac = baseKeymap === macBaseKeymap;
