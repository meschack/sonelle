# Mobile Reader Shell

## Owns

- selecting phone or desktop reader composition at the application boundary
- the phone reader's compact header and explicit navigation, content, tools, and playback slots
- the temporary reading-tools sheet and its return-to-reading action

## Refuses To Own

- reader state, chapter navigation rules, sentence rendering, or playback orchestration
- EPUB parsing, persistence, narration preparation, or Android audio behavior
- viewport checks scattered through reader content or inspector components

## Interface

`ReaderShellViewport` projects one media-query decision into `ReaderExperience`. Production uses the
platform adapter backed by `(max-width: 860px)`; integration tests provide a stable fake. The
composition root chooses `MobileReaderShell` only for the active reader. Library screens and the
desktop reader keep their existing composition.

`MobileReaderShell` receives already-composed navigation, reading content, tools, and playback
elements. It owns where those surfaces live, not what they do. The header returns to the Library and
opens search or settings inside the tools sheet. The reading column occupies a bounded scroll region,
so opening header controls or mounting playback does not resize the text column.

The visual direction is Sonelle's quiet reading desk reduced to one column: Satoshi carries controls,
SpaceMono Nerd Font Propo labels the current book, the existing green and paper palette stays intact,
and a fixed four-slot frame replaces the desktop rails rather than compressing them onto a phone.

## Domain Events

The shell emits no events itself. Returning to the Library invokes the existing `ReaderClosed` flow;
chapter, content, tool, and playback actions remain owned by their existing applications.

## Invariants

- phone composition is selected once at the application boundary
- desktop rails and inspector are not mounted inside the phone reader
- shell slots never duplicate reader or playback behavior
- tools are temporary chrome; closing them leaves the reading column and position unchanged

## Tests

The viewport adapter test covers initial selection, media-query changes, and cleanup. The component
test proves the four explicit slots and Library action. The composed-reader tracer opens a persisted
book in the mobile shell, changes chapter, opens and closes tools, returns to the Library, and reopens
the book while asserting desktop chrome is absent. Rendered browser QA uses phone and desktop
viewports when the in-app browser is available; Android packaging verifies the same composition is
compiled into the mobile application.
