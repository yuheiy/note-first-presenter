# Note-first Presenter

A presentation tool where the user writes notes first in an outliner, then pairs them with slide images.

## Language

**Outline**:
The hierarchical document that the user edits in the Outliner. Stored as serialized JSON in the DB and passed across component boundaries as `unknown`.
_Avoid_: doc (at the component/data boundary; `state.doc` inside ProseMirror internals is fine)

**Note**:
An individual content item extracted from the outline for use in a presentation. Represented as `NoteNode`.
_Avoid_: item, bullet

**Note Group**:
A set of notes between `---` separators in the outline, corresponding to one slide. Each note group maps 1:1 to a slide.

**Separator**:
A top-level outline item whose text is three or more consecutive hyphens (`---`, `----`, …), marking a boundary between note groups. Not a dedicated node type — it is an ordinary bullet recognized by a runtime predicate, so it edits and moves like any other note.

**Slide**:
A single screen in a presentation. Composed of a slide image (a rendered PDF page) and its corresponding note group.
_Avoid_: page (refers to the PDF page, not the presentation unit)

**Active Slide**:
The slide the app is currently on — the one the slide list selects, the outliner keeps the caret inside, and the slideshow window shows. It is 1-based, and it is not routing: the app has two pages, the workspace and the slideshow, and the active slide is not one of the things that picks between them. It appears in the URL as the `?slide=` search param, where the first slide is written by leaving the param out. Owned by `useActiveSlide` (`packages/client/src/lib/routes.ts`): React state is the source of truth and the URL is a mirror, written with `replaceState` and read only for the initial value.

**Router Mode**:
Where the route lives in the URL: `history` (`/slideshow`, the default) or `hash` (`/#/slideshow`). Chosen per project via `routerMode` in the config file or `--router-mode`, and named after Slidev's option of the same name — but only the name and the two values are borrowed, not the URL shape. `hash` is what a static host that cannot rewrite unknown paths needs; `history` needs the emitted `404.html` or a server-side rewrite. See `docs/adr/0017`.
_Avoid_: routing mode, history mode/hash mode as the name of the _option_ (they are its values)

**Editor**:
The read-write mode of the app, where the author writes the outline and pairs it with slides. Exists only while the tool runs locally.
_Avoid_: Presenter (the product name, not a mode)

**Viewer**:
The read-only mode of the app, produced by the static build for sharing a finished presentation. Content changes to the outline are impossible in the Viewer; view-state operations (selecting slides, running the slideshow) remain available. Folding is not one of them — its only trigger is a keymap, and ProseMirror does not call keydown handlers when the view is not editable, so the Viewer renders the folded state the Editor saved without being able to change it.
_Avoid_: static build (refers to the artifact, not the mode), readonly mode
