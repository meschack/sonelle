import { downloadBlob } from "./reader-export";
import { slugify } from "./reader-formatting";

const imageWidth = 2_046;
const minimumImageHeight = 720;
const maximumImageHeight = 1_440;
const horizontalPadding = 154;
const quoteWidth = imageWidth - horizontalPadding * 2;
const quoteTop = 292;
const footerSpace = 314;
const quoteFontSizes = [64, 58, 52, 46, 40, 36, 32, 28, 25, 22, 20, 18] as const;
const sonelleLogoPath = "/sonelle-icon.png";

export interface QuoteImageContent {
  sentenceTexts: string[];
  bookTitle: string;
  author: string;
  chapterTitle: string;
}

export interface QuoteImageExporter {
  export(content: QuoteImageContent): Promise<string>;
}

interface QuoteImageExporterDependencies {
  createCanvas?(): HTMLCanvasElement;
  download?(fileName: string, blob: Blob): void;
  loadLogo?(): Promise<CanvasImageSource>;
  readyForFonts?(): Promise<unknown>;
}

export interface QuoteImageLayout {
  width: number;
  height: number;
  quoteFontSize: number;
  quoteLineHeight: number;
  lines: string[];
}

type MeasureText = (text: string, fontSize: number) => number;

export function createQuoteImageExporter(
  dependencies: QuoteImageExporterDependencies = {}
): QuoteImageExporter {
  const createCanvas = dependencies.createCanvas ?? (() => document.createElement("canvas"));
  const download = dependencies.download ?? downloadBlob;
  const loadLogo = dependencies.loadLogo ?? (() => loadImage(sonelleLogoPath));
  const readyForFonts =
    dependencies.readyForFonts ?? (() => document.fonts?.ready ?? Promise.resolve());

  return {
    async export(content) {
      const sentenceTexts = normalizeSentenceTexts(content.sentenceTexts);
      if (sentenceTexts.length === 0) {
        throw new Error("This passage does not contain any text to save.");
      }

      const [, logo] = await Promise.all([readyForFonts(), loadLogo()]);
      const canvas = createCanvas();
      canvas.width = imageWidth;
      const context = canvas.getContext("2d");
      if (context == null) {
        throw new Error("Sonelle could not create the quote image on this device.");
      }

      const layout = createQuoteImageLayout(sentenceTexts, (text, fontSize) => {
        context.font = quoteFont(fontSize);
        return context.measureText(text).width;
      });
      canvas.width = layout.width;
      canvas.height = layout.height;
      drawQuoteImage(context, layout, { ...content, sentenceTexts }, logo);

      const blob = await canvasToPng(canvas);
      const fileName = quoteImageFileName(content);
      download(fileName, blob);
      return fileName;
    }
  };
}

export function createQuoteImageLayout(
  sentenceText: string | readonly string[],
  measureText: MeasureText
): QuoteImageLayout {
  const quote = normalizeSentenceTexts(
    typeof sentenceText === "string" ? [sentenceText] : sentenceText
  ).join(" ");
  const startingSize =
    quote.length <= 320
      ? 64
      : quote.length <= 650
        ? 50
        : quote.length <= 1_100
          ? 44
          : quote.length <= 1_900
            ? 34
            : 30;

  for (const quoteFontSize of quoteFontSizes.filter((fontSize) => fontSize <= startingSize)) {
    const lines = wrapQuote(quote, quoteWidth, quoteFontSize, measureText);
    const quoteLineHeight = Math.round(quoteFontSize * 1.52);
    const quoteHeight =
      lines.length === 0 ? 0 : (lines.length - 1) * quoteLineHeight + quoteFontSize;
    const height = Math.max(minimumImageHeight, quoteTop + quoteHeight + footerSpace);
    if (height <= maximumImageHeight) {
      return { width: imageWidth, height, quoteFontSize, quoteLineHeight, lines };
    }
  }

  throw new Error("This selection is too long to fit into a single image.");
}

function drawQuoteImage(
  context: CanvasRenderingContext2D,
  layout: QuoteImageLayout,
  content: QuoteImageContent,
  logo: CanvasImageSource
) {
  context.fillStyle = "#f7f4f1";
  context.fillRect(0, 0, layout.width, layout.height);

  context.fillStyle = "#164f42";
  context.fillRect(0, 0, 20, layout.height);

  context.fillStyle = "#d87a67";
  context.fillRect(horizontalPadding, 96, 58, 8);
  context.font = uiFont(23, 750);
  context.fillStyle = "#164f42";
  context.textBaseline = "alphabetic";
  context.fillText("A PASSAGE FROM", horizontalPadding + 82, 108);

  context.font = uiFont(23, 650);
  context.fillStyle = "#68736f";
  context.textAlign = "right";
  context.fillText(
    fitText(context, content.chapterTitle || "Untitled chapter", 720),
    layout.width - horizontalPadding,
    108
  );
  context.textAlign = "left";

  context.font = uiFont(132, 700);
  context.fillStyle = "#efc54e";
  context.fillText("“", horizontalPadding - 10, 252);

  context.font = quoteFont(layout.quoteFontSize);
  context.fillStyle = "#262b29";
  layout.lines.forEach((line, index) => {
    drawJustifiedLine(
      context,
      line,
      horizontalPadding,
      quoteTop + index * layout.quoteLineHeight,
      quoteWidth,
      index === layout.lines.length - 1
    );
  });

  const footerTop = layout.height - 190;
  context.fillStyle = "#d7d7d2";
  context.fillRect(horizontalPadding, footerTop - 66, quoteWidth, 2);

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
  context.fillText("READ · LISTEN · REMEMBER", horizontalPadding, layout.height - 48);
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

function wrapQuote(
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

function normalizeSentenceTexts(texts: readonly string[]): string[] {
  return texts.map((text) => text.replace(/\s+/gu, " ").trim()).filter((text) => text.length > 0);
}

function quoteFont(fontSize: number): string {
  return `500 ${fontSize}px "SpaceMono Nerd Font Propo", "Space Mono", monospace`;
}

function uiFont(fontSize: number, weight: number): string {
  return `${weight} ${fontSize}px Satoshi, sans-serif`;
}

function quoteImageFileName(content: QuoteImageContent): string {
  const book = slugify(content.bookTitle) || "book";
  const chapter = slugify(content.chapterTitle) || "chapter";
  return `${book}-${chapter}-quote.png`;
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob == null) {
        reject(new Error("Sonelle could not finish the quote image."));
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
