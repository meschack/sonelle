# 0034: Landing application and early-access source installation

## Status

Accepted.

## Context

Sonelle needs a public product surface that explains the reading experience and gives each desktop platform an honest installation path. Linux release bundles are usable. The current macOS bundle is not Developer ID signed and notarized, and the Windows bundle still needs diagnosis.

The existing Remotion product film is the clearest demonstration of Sonelle. Its rendered output previously lived under an ignored marketing directory, which made it unavailable to a deployed static site.

## Decision

Create an independent Solid and Vite application at `apps/landing`.

The landing application owns:

- product presentation and the product film;
- browser-side platform detection;
- platform-specific installation guidance;
- links to GitHub releases and source material.

It refuses to own:

- desktop runtime behavior;
- release artifact production;
- narration, storage, or reader state;
- claims that an unverified platform is supported.

The landing site uses the desktop application's Satoshi interface font, SpaceMono Nerd Font Propo for commands and technical details, and its paper/deep-green palette. The tracked website assets include the final product film and its poster.

Linux visitors are directed to release bundles. macOS visitors may use an explicitly early-access script that downloads a pinned release source archive, confirms tool installation, builds an ad-hoc-signed application locally, and installs it into the user's Applications directory. Windows is described as unavailable until its native packaging failure is understood.

The macOS script is a temporary bridge. Developer ID signing and notarization remain the intended distribution path.

## Consequences

- The website can deploy independently without coupling browser concerns to the reader.
- The product film adds approximately 16 MB of tracked media but is loaded with metadata-only preload.
- The source installer has a much larger trust and setup surface than a signed application bundle, so it must remain inspectable, confirm external installers, avoid `sudo`, pin the release it builds, and preserve an existing Sonelle installation as a timestamped backup.
- A macOS machine is still required for end-to-end installer verification.
- Windows installation remains intentionally unavailable.

## Verification

The landing application is checked through its public platform-selection interface and production build. The installer receives shell syntax and static-analysis checks on Linux; its actual build and application installation must be verified on macOS before it is promoted beyond early access.
