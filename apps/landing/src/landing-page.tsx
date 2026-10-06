import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";

import { detectDesktopPlatform, type DesktopPlatform } from "./platform";

const RELEASES_URL = "https://github.com/Meschack/sonelle/releases/latest";
const SOURCE_URL = "https://github.com/Meschack/sonelle";
const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/Meschack/sonelle/main/scripts/install-sonelle-macos.sh | sh";

const features = [
  {
    label: "Read & listen",
    title: "The voice stays with the page.",
    copy: "Listen as you read, with the spoken sentence gently highlighted. Find your place at a glance and follow the story at your own pace.",
    image: "/media/narration.png",
    visual: "reader",
    alt: "Sonelle highlighting the sentence currently being narrated"
  },
  {
    label: "Made for your library",
    title: "Your library stays where it belongs.",
    copy: "Bring your own EPUBs. Keep your books, bookmarks, prepared narration, and reading progress on your device. Your reading desk goes offline with you.",
    image: "/media/local-library.png",
    visual: "book",
    alt: "Illustrative cover of A Map of Quiet Water, a sample EPUB book"
  },
  {
    label: "Room for curiosity",
    title: "Stay curious without leaving the story.",
    copy: "Meet an unfamiliar word? Look it up beside the page. Save words and passages to revisit, then carry on right where you left off.",
    image: "/media/lookup.png",
    visual: "reader",
    alt: "A word definition beside the open book in Sonelle"
  }
] as const;

const platforms: { id: DesktopPlatform; label: string }[] = [
  { id: "linux", label: "Linux" },
  { id: "macos", label: "macOS" },
  { id: "windows", label: "Windows" }
];

function Brand() {
  return (
    <a class="brand" href="#top" aria-label="Sonelle home">
      <img src="/brand/sonelle-logo.svg" alt="" />
      <span>Sonelle</span>
    </a>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" />
    </svg>
  );
}

function Hero() {
  return (
    <section class="hero section-shell" id="top">
      <div class="hero-copy">
        <p class="eyebrow">A private EPUB reader</p>
        <h1>
          A good book.
          <br />A little <span>company.</span>
        </h1>
        <p class="hero-description">
          Read your books. Listen along. Sonelle keeps the spoken sentence in view, and your library
          right on your device.
        </p>
        <div class="hero-actions">
          <a class="button button-primary" href="#install">
            Get Sonelle <ArrowIcon />
          </a>
          <a class="film-link" href="#film">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m9 6 9 6-9 6V6Z" />
            </svg>
            Watch the film <span>1:09</span>
          </a>
        </div>
        <p class="hero-note">Linux downloads · macOS early access</p>
      </div>
      <ReadingPreview />
      <div class="hero-details" aria-label="Sonelle at a glance">
        <span>Bring your EPUBs</span>
        <span>Read & listen together</span>
        <span>Keep your library local</span>
      </div>
    </section>
  );
}

function ReadingPreview() {
  const sentences = [
    "By the time Mara reached the harbor, the rain had polished every window into a small mirror.",
    "She paused beneath the station clock and listened as the chapter unfolded in a measured, familiar voice.",
    "The page no longer asked her to choose between reading closely and letting the story carry her."
  ];
  const [selected, setSelected] = createSignal(1);

  return (
    <figure class="reading-preview" aria-label="Interactive sentence highlighting preview">
      <div class="reader-surround">
        <div class="reader-topline">
          <span>Between the lines</span>
          <span>Reading preview</span>
        </div>
        <div class="reader-sheet">
          <div class="reader-book">
            <span>A Map of Quiet Water</span>
            <span>Chapter 3</span>
          </div>
          <h2>Harbor Light</h2>
          <div class="reader-passage">
            <For each={sentences}>
              {(sentence, index) => (
                <div class="preview-sentence" data-active={selected() === index()}>
                  <button
                    class="sentence-marker"
                    type="button"
                    aria-label={`Highlight sentence ${index() + 1}`}
                    aria-pressed={selected() === index()}
                    onClick={() => setSelected(index())}
                  >
                    <span />
                  </button>
                  <p>
                    <span>{sentence}</span>
                  </p>
                </div>
              )}
            </For>
          </div>
          <div class="reader-controls">
            <span aria-live="polite" aria-atomic="true">
              Sentence {selected() + 1} of {sentences.length}
            </span>
            <div>
              <button
                type="button"
                aria-label="Previous sentence"
                onClick={() => setSelected((selected() + sentences.length - 1) % sentences.length)}
              >
                <span class="previous-arrow">
                  <ArrowIcon />
                </span>
              </button>
              <button
                type="button"
                aria-label="Next sentence"
                onClick={() => setSelected((selected() + 1) % sentences.length)}
              >
                <ArrowIcon />
              </button>
            </div>
          </div>
        </div>
      </div>
      <figcaption>
        <span class="caption-line" /> Try the controls. Follow one sentence at a time.
      </figcaption>
    </figure>
  );
}

function ProductFilm() {
  let videoElement!: HTMLVideoElement;
  const [playing, setPlaying] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  const playFilm = async () => {
    try {
      await videoElement.play();
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <section class="film-section" id="film">
      <div class="film-inner section-shell">
        <div class="film-heading">
          <div>
            <p class="eyebrow">Meet your reading desk</p>
            <h2>
              Less between you
              <br />
              and your next chapter.
            </h2>
          </div>
          <p>
            From the first import to the next sentence.
            <br />
            Take a quiet, one-minute look around.
          </p>
        </div>
        <figure class="film-frame">
          <div class="film-video" data-playing={playing()}>
            <video
              ref={videoElement}
              controls
              playsinline
              preload="metadata"
              poster="/media/film-poster.png"
              aria-label="Sonelle product film"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            >
              <source src="/media/sonelle-product-film.mp4" type="video/mp4" />
              Your browser cannot play the Sonelle product film.
            </video>
            <button
              class="film-play"
              type="button"
              aria-label="Play Sonelle product film"
              onClick={() => void playFilm()}
              tabIndex={playing() ? -1 : 0}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 7 8 5-8 5V7Z" />
              </svg>
            </button>
          </div>
          <figcaption>
            <span>Read. Listen. Stay with the story.</span>
            <span>Sonelle in 1:09</span>
          </figcaption>
          <Show when={failed()}>
            <p class="film-error" role="alert">
              The film couldn’t play.{" "}
              <a href="/media/sonelle-product-film.mp4">Open the film directly</a>.
            </p>
          </Show>
        </figure>
      </div>
    </section>
  );
}

function FeatureStory() {
  return (
    <section class="features section-shell" id="features" aria-label="What Sonelle does">
      <div class="features-heading">
        <p class="eyebrow">Built around the book</p>
        <h2>
          A reading desk.
          <br />
          <span>Nothing in the way.</span>
        </h2>
        <p>
          A place for the story, a voice to follow,
          <br />
          and a little room to make it yours.
        </p>
      </div>
      <For each={features}>
        {(feature) => (
          <article class="feature-row">
            <div class="feature-copy">
              <p class="eyebrow">{feature.label}</p>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </div>
            <div
              class="feature-image"
              classList={{ "feature-image-book": feature.visual === "book" }}
            >
              <img src={feature.image} alt={feature.alt} loading="lazy" />
            </div>
          </article>
        )}
      </For>
    </section>
  );
}

function LinuxInstall() {
  const downloads = [
    ["AppImage", "Portable · x86_64"],
    ["Debian / Ubuntu", ".deb · x86_64"],
    ["Fedora / openSUSE", ".rpm · x86_64"]
  ] as const;

  return (
    <div
      class="platform-panel"
      id="platform-linux"
      role="tabpanel"
      aria-labelledby="tab-linux"
      tabIndex={0}
    >
      <p>Choose the Linux package that fits your system.</p>
      <div class="platform-actions">
        <a class="button button-primary" href={RELEASES_URL}>
          <DownloadIcon /> Download for Linux
        </a>
        <a class="text-link" href={RELEASES_URL}>
          View all releases <ArrowIcon />
        </a>
      </div>
      <div class="download-list">
        <For each={downloads}>
          {([name, detail]) => (
            <a href={RELEASES_URL} class="download-row">
              <strong>{name}</strong>
              <span>{detail}</span>
              <DownloadIcon />
            </a>
          )}
        </For>
      </div>
    </div>
  );
}

function MacInstall() {
  const [copied, setCopied] = createSignal(false);

  const copyWithSelection = () => {
    const field = document.createElement("textarea");
    field.value = INSTALL_COMMAND;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const didCopy = document.execCommand("copy");
    field.remove();
    return didCopy;
  };

  const copyCommand = async () => {
    let didCopy = copyWithSelection();

    if (!didCopy) {
      try {
        await navigator.clipboard.writeText(INSTALL_COMMAND);
        didCopy = true;
      } catch {
        didCopy = false;
      }
    }

    if (!didCopy) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      class="platform-panel"
      id="platform-macos"
      role="tabpanel"
      aria-labelledby="tab-macos"
      tabIndex={0}
    >
      <p>
        The guided installer builds a pinned Sonelle release locally and places it in your
        Applications folder.
      </p>
      <div class="terminal-command">
        <code>
          <span aria-hidden="true">$</span> {INSTALL_COMMAND}
        </code>
        <button type="button" onClick={() => void copyCommand()}>
          {copied() ? "Copied" : "Copy"}
        </button>
      </div>
      <p class="install-note">Early access · You review changes before anything is installed.</p>
      <a class="text-link" href={`${SOURCE_URL}/blob/main/scripts/install-sonelle-macos.sh`}>
        Inspect the installer <ArrowIcon />
      </a>
    </div>
  );
}

function WindowsInstall() {
  return (
    <div
      class="platform-panel platform-message"
      id="platform-windows"
      role="tabpanel"
      aria-labelledby="tab-windows"
      tabIndex={0}
    >
      <h3>Windows needs a little more cooking.</h3>
      <p>
        We’re fixing the native package before calling it ready. No mystery installer, no crossed
        fingers.
      </p>
      <a class="text-link" href={SOURCE_URL}>
        Follow progress on GitHub <ArrowIcon />
      </a>
    </div>
  );
}

function InstallSection() {
  const [platform, setPlatform] = createSignal<DesktopPlatform>("linux");

  onMount(() => {
    setPlatform(detectDesktopPlatform(navigator.userAgent, navigator.platform));
  });

  const navigatePlatforms = (event: KeyboardEvent, currentIndex: number) => {
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % platforms.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex + platforms.length - 1) % platforms.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = platforms.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setPlatform(platforms[nextIndex].id);
    document.getElementById(`tab-${platforms[nextIndex].id}`)?.focus();
  };

  return (
    <section class="install-section section-shell" id="install">
      <div class="install-heading">
        <p class="eyebrow">Make yourself at home</p>
        <h2>
          Your next chapter
          <br />
          starts here.
        </h2>
        <p>Bring a book. We’ll keep your place.</p>
        <p class="install-context">
          Choose your computer for installation details. Sonelle is in early access, and
          availability varies by platform.
        </p>
        <a class="text-link" href={SOURCE_URL}>
          Explore the source <ArrowIcon />
        </a>
      </div>
      <div class="install-options">
        <div class="platform-tabs" role="tablist" aria-label="Choose your computer">
          <For each={platforms}>
            {(item, index) => (
              <button
                id={`tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={platform() === item.id}
                aria-controls={`platform-${item.id}`}
                tabIndex={platform() === item.id ? 0 : -1}
                onClick={() => setPlatform(item.id)}
                onKeyDown={(event) => navigatePlatforms(event, index())}
              >
                {item.label}
              </button>
            )}
          </For>
        </div>
        <Switch>
          <Match when={platform() === "linux"}>
            <LinuxInstall />
          </Match>
          <Match when={platform() === "macos"}>
            <MacInstall />
          </Match>
          <Match when={platform() === "windows"}>
            <WindowsInstall />
          </Match>
        </Switch>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div class="footer-inner section-shell">
        <div class="footer-brand">
          <Brand />
          <p>A little closer to the story.</p>
        </div>
        <div class="footer-meta">
          <nav aria-label="Footer navigation">
            <a href={SOURCE_URL}>GitHub</a>
            <a href={RELEASES_URL}>Releases</a>
            <a href="/privacy.html">Privacy</a>
            <a href={`${SOURCE_URL}/blob/main/LICENSE`}>License</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <header class="site-header">
        <div class="header-inner section-shell">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#film">The experience</a>
            <a href="#features">Features</a>
            <a href={SOURCE_URL}>
              Source <span aria-hidden="true">↗</span>
            </a>
          </nav>
          <a class="button button-primary header-action" href="#install">
            Get Sonelle <ArrowIcon />
          </a>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <Hero />
        <ProductFilm />
        <FeatureStory />
        <InstallSection />
      </main>
      <Footer />
    </>
  );
}
