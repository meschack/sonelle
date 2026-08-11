# Mobile Reader Shell

## Owns

- selecting phone or desktop reader composition at the application boundary
- the phone reader's compact header and explicit navigation, content, tools, and playback slots
- the compact narration dock's phone-sized projection of shared playback state and intents
- touch-first Library and contextual reading-tools sheets, including focus restoration and Back
  behavior

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
elements. It owns where those surfaces live, not what they do. The header opens a local Library sheet
or search and settings inside the tools sheet. Library rows project book identity and persisted
progress, while selection calls the existing library application and closes the sheet. The full
Library remains available as an explicit management action. The reading column occupies a bounded
scroll region, so opening sheets or mounting playback does not resize the text column.

The mobile playback slot receives `MobileNarrationDock`, a deliberately smaller projection than the
desktop rail. It shows current narration truth and emits previous, play/pause/resume, next, stop, and
open-controls intents into the existing playback application. Readiness or attention state changes
the controls affordance into a recovery link; the Reading tools sheet remains the one place for
voice, speed, sleep, and offline preparation controls. The dock does not prepare audio, persist
position, or interpret engine callbacks.

The EPUB contents navigator remains owned by shared reader chrome. On mobile it uses the same
touch-safe sheet language as the Library while preserving publisher hierarchy and anchor targets.
Both sheets push a temporary history entry, close on Android Back or their scrim, move focus into the
sheet on open, and restore focus to their trigger on dismissal. None of those presentation actions
changes the active sentence or scroll container.

The contextual tools sheet composes the existing Word, Search, Notes, and Tools inspector rather than
forking mobile-only use cases. Tapping a word on a phone opens its insight in that sheet; the anchored
desktop popover is intentionally suppressed there. Search and saved-passage selections still use the
reader navigation application. Changing tabs or dismissing the sheet never requests a narration
pause, changes the active sentence on its own, or recreates the reader document. Empty searches,
missing saved passages, dictionary lookup progress, unavailable definitions, and lookup failures keep
the humane state language owned by the shared inspector.

The visual direction is Sonelle's quiet reading desk reduced to one column: Satoshi carries controls,
SpaceMono Nerd Font Propo labels the current book, the existing green and paper palette stays intact,
and a fixed four-slot frame replaces the desktop rails rather than compressing them onto a phone.

The shell defines one 48-pixel minimum interaction target for its header, dock, contents, Library,
and contextual tools. Narrow widths wrap the narration transport beneath its status instead of
shrinking controls. `viewport-fit=cover` and safe-area insets protect the header, reading column,
dock, contents, and bottom sheets on cutout and gesture-navigation devices. Short landscape layouts
reduce decorative spacing while keeping the same document order and scrollable reading region.
Browser text adjustment remains enabled at 100%; larger reader text scrolls inside the reading slot
without pushing navigation or narration controls out of reach.

## Domain Events

The shell emits no events itself. Returning to the Library invokes the existing `ReaderClosed` flow;
chapter, content, tool, and playback actions remain owned by their existing applications.

## Invariants

- phone composition is selected once at the application boundary
- desktop rails and inspector are not mounted inside the phone reader
- shell slots never duplicate reader or playback behavior
- mobile narration controls invoke the shared playback application; desktop keeps its existing rail
- safe-area padding adds breathing room to system insets rather than replacing it
- narrow and large-text layouts wrap or scroll; essential controls never shrink below 48 pixels
- tools are temporary chrome; closing them leaves the reading column and position unchanged

## Tests

The viewport adapter test covers initial selection, media-query changes, and cleanup. The component
test proves the four explicit slots and Library sheet. The composed-reader tracer opens a persisted
book in the mobile shell, changes chapter, opens and closes tools, dismisses the Library through its
scrim and Back history, verifies focus and chapter stability, then switches books. Contents coverage
selects a nested target and exercises close action, scrim, Back, and focus restoration. Rendered
browser QA uses phone and desktop viewports when the in-app browser is available; Android packaging
verifies the same composition is compiled into the mobile application.

The contextual-tools tracer taps a reader word, resolves its intended definition, changes to Search
and Notes, opens the exact sentence from each result, and dismisses through the scrim. It holds the
reading scroll offset constant and proves no narration pause was requested throughout. The shell
component separately covers system Back and focus restoration for the tools sheet.

The dock component projects playing and needs-attention states and verifies each transport intent.
The composed-reader tracer proves the phone mounts the dock instead of the desktop rail and routes
its controls affordance to the shared settings sheet.

The mobile layout contract pins representative portrait/narrow, large-text, and short-landscape
rules: edge-to-edge viewport support, 48-pixel targets, safe-area coverage, ordered scroll regions,
and the wrapped narrow dock. Rendered device QA remains the final check for manufacturer-specific
system bars and font scaling.
