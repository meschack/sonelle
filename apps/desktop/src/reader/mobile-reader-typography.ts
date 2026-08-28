const desktopReaderContentFontSizeMaximum = 24;
const mobileReaderContentFontSizeMaximum = 20;

export function readerContentFontSizeMaximum(mobile: boolean): number {
  return mobile ? mobileReaderContentFontSizeMaximum : desktopReaderContentFontSizeMaximum;
}

export function effectiveReaderContentFontSize(preferredSize: number, mobile: boolean): number {
  return Math.min(preferredSize, readerContentFontSizeMaximum(mobile));
}
