# Sonelle landing redesign

## Brief and direction

Help a person with EPUB books understand reading with sentence-synced narration, then find an honest desktop installation path. Preserve the established paper/deep-green identity, current logo, Satoshi, SpaceMono Nerd Font Propo, and tracked product film. No new platform availability, testimonials, pricing, or audience restrictions are implied.

The direction is **a reading desk with a voice**. The signature is an interactive passage with sentence highlighting and a slim audio margin. It illustrates the reading interaction; it does not synthesize or play narration in the browser. The product film demonstrates the fuller experience. The passage is fictional sample text already used in the project's marketing assets.

## Audit

| Evidence                                                                       | Consequence                                                                    | Response                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| The hero grid requires 620px + 480px + a 52px gap until the 1050px breakpoint. | It exceeds its container at common desktop widths; the preview can be clipped. | Use intrinsic, shrinkable columns and stack before either side becomes cramped.                |
| The opening copy never names EPUB or local reading.                            | Visitors must infer what the app does.                                         | State the product category and local ownership above the fold.                                 |
| The same narration proposition occurs in the hero, film, and first feature.    | The long page spends too much space repeating itself.                          | Give each section a different role: proposition, demonstration, benefits, installation.        |
| Feature imagery includes full marketing compositions with embedded headings.   | Scaled images repeat nearby copy and make the interface small.                 | Crop the existing assets to their interface region through CSS, with descriptive alternatives. |
| Feature numbers suggest a sequence where there is none.                        | Decorative labels misrepresent the structure.                                  | Use meaningful topic labels instead.                                                           |
| Installation is followed by another large download pitch.                      | The ending repeats a decision already offered.                                 | Make installation the concluding CTA; keep the footer compact.                                 |

Initial desktop inspection used the T3 collaborative preview. Its automation host disconnected during reference research. External reference content was retrieved, but external rendered layouts were not successfully inspected; no responsive or visual behavior is claimed from those references.

## Reference decisions

- [Readwise Reader](https://readwise.io/read): its retrieved feature explanations connect specific reading interactions to reader benefits. Borrow that content discipline; adapt to EPUB reading and sentence narration. Reject the broad all-content positioning, integrations, and testimonial sections for this narrower product.
- [Things](https://culturedcode.com/things/): its retrieved page structure proceeds from a concise product explanation to an introduction film, features, and platform-specific acquisition. Borrow that journey; adapt acquisition to Sonelle's existing release guidance. Do not transfer awards, store availability, or pricing.

These are structural/content references, not verified visual moodboard references. The project's established identity and reading surface are the visual anchor.

## System and wireframe

- Paper `#FCF9F8`: page. Forest `#153F34`: headings/actions and film backdrop. Ink `#242625`: text. Muted `#59665F`: supporting text. Mint `#DCEBE4`: reader surround. Spoken yellow `#F7D86B`: selected sentence only.
- Satoshi: interface, body, and expressive display. SpaceMono Nerd Font Propo: captions/commands. Georgia/system serif: the illustrative book passage, distinguishing reading from interface text without a new remote font dependency.
- Content width: 1200px. Desktop gutter: 48px; tablet: 28px; phone: 20px. Spacing: 8px base, 24–32px within groups, 80–104px between major sections.
- Display: 64–84px desktop, 44–56px phone. Section title: 38–52px. Body: 17–19px, 1.6 line height. Reading excerpt: 20–23px, generous line height.

```text
Brand                 Experience / Features        Get Sonelle

Private EPUB reader                    Interactive reading preview
Emotional headline                     Chapter title
Specific explanation                   Passage + sentence margin
Get Sonelle / Watch film                Previous / next sentence

EPUB books            Sentence narration           Local library

Product film heading                  Short introduction + duration
[ full-width existing product film ]

Features heading
Narration explanation                 Cropped product view
Cropped library view                  Local ownership explanation
Learning explanation                  Cropped word-lookup view

Install heading                       Linux / macOS / Windows
Early-access context                  Existing platform guidance

Brand + brief product description     Source / Releases / Privacy / License
```

## Behavior and adaptations

- Reading preview changes only the selected sentence on deliberate user interaction. No autoplay, timed reveals, or added ambient motion. Current selection is exposed to assistive technology; buttons work by keyboard.
- Film remains user-initiated with native controls, metadata preload, poster, and a fallback release link. Hide the custom play button while playing and restore it on completion.
- Platform selection keeps automatic desktop detection, with manual selection, arrow/Home/End keyboard navigation, and a single selected tab in the tab order. Linux copy describes the selected system without falsely claiming detection after manual selection. Keep existing release, installer, and unavailable-Windows destinations.
- Below 1000px, stack the hero while preserving the passage's readable width. Below 760px, stack features and installation. Below 600px, simplify header navigation; retain the installation action, both hero actions, and every useful section.
- Crop narration and lookup stills to the existing interface area rather than stretching them. The library still is a separate book-cover composition: crop its right-hand cover illustration and give it accurate illustrative alternative text. Keep the complete film composition in the video poster. Load feature stills lazily.
- Semantic section headings, visible focus, a skip link, legible contrast, descriptive links, and reduced-motion behavior are required. Privacy stays linked as a supporting page.

## Ownership and verification

The landing module owns public presentation and browser interactions; it refuses desktop storage, playback orchestration, narration preparation, and release production. Its interface is `LandingPage`; platform detection stays in `platform.ts`. It emits no domain events because it performs no long-running app work.

Verify the production build, landing TypeScript, existing platform tests, responsive overflow/crops at desktop/tablet/phone widths, sentence controls, installation keyboard navigation, film playback, and the privacy journey. Publishing and release-status changes are outside this redesign.

### Completed verification · 2026-10-06

- Landing TypeScript, production build, focused formatting, and `git diff --check` passed. All three existing platform-detection tests passed.
- Local Chrome/Playwright checks passed at 320, 390, 600, 768, 1000, 1024, 1100, 1280, and 1440px. Every installation panel was checked at every width: no document overflow or broken images.
- Sentence selection, previous/next controls, platform keyboard navigation and focus, macOS command copying, film playback and completion, and navigation to privacy passed. No browser runtime errors were reported.
- Axe scans with WCAG A/AA tags through 2.2 returned zero violations for Linux, macOS, and Windows panel states.
- Desktop, tablet, and phone screenshots were visually reviewed. The library cover crop was corrected after that review. Verification scripts, measurements, and screenshots are local artifacts in `/tmp/sonelle-landing-qa/`; no test dependencies were added to the project.
