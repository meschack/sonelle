import { convertFileSrc } from "@tauri-apps/api/core";

export type MediaSourceKind = "book-cover" | "prepared-narration";

export interface MediaSourceRequest {
  kind: MediaSourceKind;
  source: string | null | undefined;
}

export type MediaSourceResolution =
  { status: "available"; url: string } | { status: "missing" } | { status: "invalid" };

export interface MediaSourceGateway {
  resolve(request: MediaSourceRequest): MediaSourceResolution;
}

type ConvertLocalSource = (path: string, protocol?: string) => string;

export function createDesktopMediaSourceGateway(
  convertLocalSource: ConvertLocalSource = convertFileSrc
): MediaSourceGateway {
  return {
    resolve({ source }) {
      if (source == null || source.trim().length === 0) return { status: "missing" };
      if (hasControlCharacter(source)) return { status: "invalid" };
      if (/^[a-z][a-z\d+.-]*:/iu.test(source)) return { status: "available", url: source };

      try {
        const url = convertLocalSource(source, "asset");
        return url.trim().length > 0 ? { status: "available", url } : { status: "invalid" };
      } catch {
        return { status: "invalid" };
      }
    }
  };
}

export interface FakeMediaSourceGateway extends MediaSourceGateway {
  readonly requests: readonly MediaSourceRequest[];
}

export function createFakeMediaSourceGateway(
  outcomes: Readonly<Record<string, MediaSourceResolution>> = {}
): FakeMediaSourceGateway {
  const requests: MediaSourceRequest[] = [];
  return {
    requests,
    resolve(request) {
      requests.push(request);
      if (request.source == null || request.source.trim().length === 0) {
        return { status: "missing" };
      }
      return outcomes[request.source] ?? { status: "invalid" };
    }
  };
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value);
}
