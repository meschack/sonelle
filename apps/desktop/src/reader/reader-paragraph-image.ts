import { downloadBlob } from "./reader-export";
import { slugify } from "./reader-formatting";

const imageWidth = 2_046;
const imageHeight = 1_440;
const horizontalPadding = 154;
const paragraphWidth = imageWidth - horizontalPadding * 2;
const paragraphTop = 334;
const paragraphBottom = 1_034;
const paragraphFontSizes = [64, 58, 52, 46, 40, 36, 32, 28, 25, 22, 20, 18] as const;
const sonelleLogoPath = "/sonelle-icon.png";

export interface ParagraphImageContent {
  paragraphText: string;
  bookTitle: string;
  author: string;
  chapterTitle: string;
}

export interface ParagraphImageExporter {
  export(content: ParagraphImageContent): Promise<string>;
}

interface ParagraphImageExporterDependencies {
  createCanvas?(): HTMLCanvasElement;
  download?(fileName: string, blob: Blob): void;
  loadLogo?(): Promise<CanvasImageSource>;
  readyForFonts?(): Promise<unknown>;
}

export interface ParagraphImageLayout {
  width: number;
  height: number;
  paragraphFontSize: number;
  paragraphLineHeight: number;
  lines: string[];
}

type MeasureText = (text: string, fontSize: number) => number;

export function createParagraphImageExporter(
  dependencies: ParagraphImageExporterDependencies = {}
): ParagraphImageExporter {
  const createCanvas = dependencies.createCanvas ?? (() => document.createElement("canvas"));
  const download = dependencies.download ?? downloadBlob;
  const loadLogo = dependencies.loadLogo ?? (() => loadImage(sonelleLogoPath));
  const readyForFonts =
    dependencies.readyForFonts ?? (() => document.fonts?.ready ?? Promise.resolve());

  return {
    async export(content) {
      const paragraphText = normalizeParagraphText(content.paragraphText);
      if (paragraphText.length === 0) {
        throw new Error("This paragraph does not contain any text to save.");
      }

      const [, logo] = await Promise.all([readyForFonts(), loadLogo()]);
      const canvas = createCanvas();
      canvas.width = imageWidth;
      const context = canvas.getContext("2d");
      if (context == null) {
        throw new Error("Sonelle could not create the paragraph image on this device.");
      }

      const layout = createParagraphImageLayout(paragraphText, (text, fontSize) => {
        context.font = paragraphFont(fontSize);
        return context.measureText(text).width;
      });
      canvas.width = layout.width;
      canvas.height = layout.height;
      drawParagraphImage(context, layout, { ...content, paragraphText }, logo);

      const blob = await canvasToPng(canvas);
      const fileName = paragraphImageFileName(content);
      download(fileName, blob);
      return fileName;
    }
  };
}

export function createParagraphImageLayout(
  paragraphText: string,
  measureText: MeasureText
): ParagraphImageLayout {
  const normalized = normalizeParagraphText(paragraphText);
  const startingSize =
    normalized.length <= 320
      ? 64
      : normalized.length <= 650
        ? 50
        : normalized.length <= 1_100
          ? 44
          : normalized.length <= 1_900
            ? 34
            : 30;
  const sizes = paragraphFontSizes.filter((fontSize) => fontSize <= startingSize);

  for (const paragraphFontSize of sizes) {
    const lines = wrapParagraph(normalized, paragraphWidth, paragraphFontSize, measureText);
    const paragraphLineHeight = Math.round(paragraphFontSize * 1.52);
    const paragraphHeight =
      lines.length === 0 ? 0 : (lines.length - 1) * paragraphLineHeight + paragraphFontSize;
    if (paragraphHeight <= paragraphBottom - paragraphTop) {
      return {
        width: imageWidth,
        height: imageHeight,
        paragraphFontSize,
        paragraphLineHeight,
        lines
      };
    }
  }

  throw new Error("This paragraph is too long to fit into a single image.");
}

function drawParagraphImage(
  context: CanvasRenderingContext2D,
  layout: ParagraphImageLayout,
  content: ParagraphImageContent,
  logo: CanvasImageSource
) {
  context.fillStyle = "#f7f4f1";
  context.fillRect(0, 0, layout.width, layout.height);

  context.fillStyle = "#164f42";
  context.fillRect(0, 0, 20, layout.height);

  context.fillStyle = "#d87a67";
  context.fillRect(horizontalPadding, 116, 58, 8);
  context.font = uiFont(23, 750);
  context.fillStyle = "#164f42";
  context.textBaseline = "alphabetic";
  context.fillText("A PASSAGE FROM", horizontalPadding + 82, 128);

  context.font = uiFont(23, 650);
  context.fillStyle = "#68736f";
  context.textAlign = "right";
  context.fillText(
    fitText(context, content.chapterTitle || "Untitled chapter", 720),
    layout.width - horizontalPadding,
    128
  );
  context.textAlign = "left";

  context.font = uiFont(142, 700);
  context.fillStyle = "#efc54e";
  context.fillText("“", horizontalPadding - 10, 292);

  context.font = paragraphFont(layout.paragraphFontSize);
  context.fillStyle = "#262b29";
  layout.lines.forEach((line, index) => {
    drawJustifiedLine(
      context,
      line,
      horizontalPadding,
      paragraphTop + index * layout.paragraphLineHeight,
      paragraphWidth,
      index === layout.lines.length - 1
    );
  });

  const footerTop = 1_180;
  context.fillStyle = "#d7d7d2";
  context.fillRect(horizontalPadding, footerTop - 66, paragraphWidth, 2);

  context.font = uiFont(32, 760);
  context.fillStyle = "#164f42";
  context.fillText(
    fitText(context, content.bookTitle || "Untitled book", 1_020),
    horizontalPadding,
    footerTop
  );

  context.font = uiFont(25, 560);
  context.fillStyle = "#68736f";
  context.fillText(
    fitText(context, content.author || "Unknown author", 1_020),
    horizontalPadding,
    footerTop + 48
  );

  const logoSize = 66;
  const brandTextX = layout.width - horizontalPadding - 144;
  context.drawImage(logo, brandTextX - logoSize - 18, footerTop - 46, logoSize, logoSize);
  context.font = uiFont(32, 760);
  context.fillStyle = "#164f42";
  context.fillText("Sonelle", brandTextX, footerTop + 2);

  context.font = uiFont(18, 650);
  context.fillStyle = "#77817d";
  context.fillText("READ · LISTEN · REMEMBER", horizontalPadding, layout.height - 76);
}

function drawJustifiedLine(
  context: CanvasRenderingContext2D,
  line: string,
  x: number,
  y: number,
  width: number,
  isLastLine: boolean
) {
  const words = line.split(" ");
  if (isLastLine || words.length < 2) {
    context.fillText(line, x, y);
    return;
  }

  const wordsWidth = words.reduce((total, word) => total + context.measureText(word).width, 0);
  const gap = (width - wordsWidth) / (words.length - 1);
  let cursor = x;

  words.forEach((word) => {
    context.fillText(word, cursor, y);
    cursor += context.measureText(word).width + gap;
  });
}

function wrapParagraph(
  text: string,
  maxWidth: number,
  fontSize: number,
  measureText: MeasureText
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const parts =
      measureText(word, fontSize) <= maxWidth
        ? [word]
        : breakLongWord(word, maxWidth, fontSize, measureText);

    for (const part of parts) {
      const candidate = line.length === 0 ? part : `${line} ${part}`;
      if (line.length === 0 || measureText(candidate, fontSize) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = part;
      }
    }
  }

  if (line.length > 0) lines.push(line);
  return lines;
}

function breakLongWord(
  word: string,
  maxWidth: number,
  fontSize: number,
  measureText: MeasureText
): string[] {
  const parts: string[] = [];
  let part = "";

  for (const character of Array.from(word)) {
    const candidate = part + character;
    if (part.length > 0 && measureText(candidate, fontSize) > maxWidth) {
      parts.push(part);
      part = character;
    } else {
      part = candidate;
    }
  }

  if (part.length > 0) parts.push(part);
  return parts;
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;

  const characters = Array.from(text);
  while (characters.length > 1) {
    characters.pop();
    const candidate = `${characters.join("").trimEnd()}…`;
    if (context.measureText(candidate).width <= maxWidth) return candidate;
  }
  return "…";
}

function normalizeParagraphText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function paragraphFont(fontSize: number): string {
  return `500 ${fontSize}px "SpaceMono Nerd Font Propo", "Space Mono", monospace`;
}

function uiFont(fontSize: number, weight: number): string {
  return `${weight} ${fontSize}px Satoshi, sans-serif`;
}

function paragraphImageFileName(content: ParagraphImageContent): string {
  const book = slugify(content.bookTitle) || "book";
  const chapter = slugify(content.chapterTitle) || "chapter";
  return `${book}-${chapter}-paragraph.png`;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob == null) {
        reject(new Error("Sonelle could not finish the paragraph image."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Sonelle could not load its logo for this image."));
    image.src = source;
  });
}
