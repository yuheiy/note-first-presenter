# Note-First Presenter

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
A top-level outline item whose text is exactly `---`, marking a boundary between note groups. Not a dedicated node type — it is an ordinary bullet recognized by a runtime predicate, so it edits and moves like any other note.

**Slide**:
A single screen in a presentation. Composed of a slide image (a rendered PDF page) and its corresponding note group.
_Avoid_: page (refers to the PDF page, not the presentation unit)
