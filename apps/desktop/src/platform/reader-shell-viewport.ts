export interface ReaderShellViewport {
  isMobile(): boolean;
  listen(listener: (mobile: boolean) => void): () => void;
}

const mobileReaderQuery = "(max-width: 860px)";

export function createReaderShellViewport(
  matchMedia: Pick<Window, "matchMedia">["matchMedia"] | undefined = typeof window === "undefined"
    ? undefined
    : window.matchMedia?.bind(window)
): ReaderShellViewport {
  if (matchMedia == null) return desktopReaderShellViewport;
  const query = matchMedia(mobileReaderQuery);

  return {
    isMobile: () => query.matches,
    listen(listener) {
      const handleChange = (event: MediaQueryListEvent) => listener(event.matches);
      query.addEventListener("change", handleChange);
      return () => query.removeEventListener("change", handleChange);
    }
  };
}

const desktopReaderShellViewport: ReaderShellViewport = {
  isMobile: () => false,
  listen: () => () => undefined
};
