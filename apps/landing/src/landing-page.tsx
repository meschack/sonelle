import { For, Match, Switch, createSignal, onMount } from "solid-js";

import { detectDesktopPlatform, type DesktopPlatform } from "./platform";

const RELEASES_URL = "https://github.com/Meschack/sonelle/releases/latest";
const SOURCE_URL = "https://github.com/Meschack/sonelle";
const INSTALL_COMMAND =
  "curl -fsSL https://raw.githubusercontent.com/Meschack/sonelle/main/scripts/install-sonelle-macos.sh | sh";

const features = [
  {
    title: "The voice stays with the page.",
    copy: "Sentence-level highlighting keeps your place without turning the reader into a music player.",
    image: "/media/narration.png",
    alt: "Sonelle highlighting the sentence currently being narrated"
  },
  {
    title: "Your library stays where it belongs.",
    copy: "Books, bookmarks, narration, and reading progress stay on your device.",
    image: "/media/local-library.png",
    alt: "Sonelle's private local library"
  },
  {
    title: "Stay curious without leaving the story.",
    copy: "Look up a word, save a passage, or find a line across your library.",
    image: "/media/lookup.png",
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
      <div class="hero-copy reveal">
        <h1>
          Read with your eyes.
          <br />
          Listen at your pace.
        </h1>
        <p>Sonelle keeps narration with the page, so you can stay inside the story.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#install">
            Get Sonelle
          </a>
          <a class="button button-secondary" href="#film">
            Watch the film
          </a>
        </div>
      </div>
      <div class="hero-product reveal reveal-later" aria-label="Sonelle reader preview">
        <img src="/media/film-poster.png" alt="Sonelle open to a narrated EPUB book" />
      </div>
    </section>
  );
}

function ProductFilm() {
  let videoElement!: HTMLVideoElement;
  const [playing, setPlaying] = createSignal(false);

  return (
    <section class="film-section" id="film">
      <div class="film-inner section-shell">
        <div class="film-heading">
          <h2>See reading and listening move together.</h2>
          <p>A quiet tour of Sonelle, from importing a book to listening offline.</p>
        </div>
        <figure class="film-frame">
          <div class="film-video" data-playing={playing()}>
            <video
              ref={videoElement}
              controls
              playsinline
              preload="metadata"
              poster="/media/film-poster.png"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
            >
              <source src="/media/sonelle-product-film.mp4" type="video/mp4" />
              Your browser cannot play the Sonelle product film.
            </video>
            <button
              class="film-play"
              type="button"
              aria-label="Play Sonelle product film"
              onClick={() => void videoElement.play()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m9 7 8 5-8 5V7Z" />
              </svg>
            </button>
          </div>
          <figcaption>
            Sonelle product film <span>·</span> 1:09
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

function FeatureStory() {
  return (
    <section class="features section-shell" id="features" aria-label="What Sonelle does">
      <For each={features}>
        {(feature, index) => (
          <article class="feature-row">
            <div class="feature-copy">
              <h2>{feature.title}</h2>
              <p>{feature.copy}</p>
            </div>
            <div class="feature-image">
              <img src={feature.image} alt={feature.alt} loading="lazy" />
            </div>
            <span class="feature-number" aria-hidden="true">
              0{index() + 1}
            </span>
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
    <div class="platform-panel" id="platform-linux" role="tabpanel" aria-labelledby="tab-linux">
      <p>Sonelle detected Linux. Choose the package that fits your system.</p>
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
    <div class="platform-panel" id="platform-macos" role="tabpanel" aria-labelledby="tab-macos">
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

  return (
    <section class="install-section section-shell" id="install">
      <div class="install-heading">
        <h2>Ready when your next book is.</h2>
        <p>Choose your computer and we’ll show the clearest way in.</p>
      </div>
      <div class="platform-tabs" role="tablist" aria-label="Choose your computer">
        <For each={platforms}>
          {(item) => (
            <button
              id={`tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={platform() === item.id}
              aria-controls={`platform-${item.id}`}
              onClick={() => setPlatform(item.id)}
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
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div class="footer-inner section-shell">
        <div class="footer-cta">
          <h2>
            The story is ready
            <br />
            when you are.
          </h2>
          <a class="button button-light" href="#install">
            Get Sonelle <ArrowIcon />
          </a>
        </div>
        <div class="footer-meta">
          <Brand />
          <nav aria-label="Footer navigation">
            <a href={SOURCE_URL}>GitHub</a>
            <a href={RELEASES_URL}>Releases</a>
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
      <header class="site-header">
        <div class="header-inner section-shell">
          <Brand />
          <nav aria-label="Main navigation">
            <a href="#film">How it works</a>
            <a href="#features">Features</a>
            <a href="#install">Install</a>
          </nav>
          <a class="button button-primary header-action" href="#install">
            Get Sonelle
          </a>
        </div>
      </header>
      <main>
        <Hero />
        <ProductFilm />
        <FeatureStory />
        <InstallSection />
      </main>
      <Footer />
    </>
  );
}
