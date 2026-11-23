export function briefingLineStarts(lines: readonly { text: string }[]): number[] {
  const starts = [0];
  for (const line of lines) starts.push(starts[starts.length - 1]! + line.text.length);
  return starts;
}

/** Index of the line currently being revealed, or -1 when the transmission is idle/complete. */
export function briefingActiveLineIndex(lines: readonly { text: string }[], shown: number): number {
  const totalChars = lines.reduce((total, line) => total + line.text.length, 0);
  if (shown <= 0 || shown >= totalChars) return -1;

  const starts = briefingLineStarts(lines);
  for (let index = 0; index < lines.length; index += 1) {
    const start = starts[index]!;
    const end = starts[index + 1]!;
    if (shown > start && shown <= end) return index;
  }
  return -1;
}

export function briefingRevealedLines<T extends { text: string }>(
  lines: readonly T[],
  shown: number,
): Array<T & { visible: string; started: boolean; complete: boolean }> {
  const starts = briefingLineStarts(lines);
  return lines.map((line, index) => {
    const consumed = starts[index]!;
    const chars = Math.max(0, Math.min(line.text.length, shown - consumed));
    return {
      ...line,
      visible: line.text.slice(0, chars),
      started: chars > 0,
      complete: chars >= line.text.length,
    };
  });
}

/** Start offsets of words that do not fit on the current line and should wrap immediately. */
export function wrapBreakOffsets(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): number[] {
  if (maxWidth <= 0 || text.length === 0) return [];

  const breaks: number[] = [];
  let lineStart = 0;
  const word = /\S+/g;
  for (let match = word.exec(text); match; match = word.exec(text)) {
    const wordStart = match.index;
    if (wordStart === lineStart) continue;
    const wordEnd = wordStart + match[0].length;
    if (measure(text.slice(lineStart, wordEnd)) > maxWidth) {
      breaks.push(wordStart);
      lineStart = wordStart;
    }
  }
  return breaks;
}

export function createTextMeasure(template: HTMLElement): {
  measure: (text: string) => number;
  dispose: () => void;
} {
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "pre";
  probe.style.top = "0";
  probe.style.left = "0";
  probe.style.pointerEvents = "none";
  const syncFont = () => {
    const next = getComputedStyle(template);
    probe.style.font = next.font;
    probe.style.letterSpacing = next.letterSpacing;
    probe.style.wordSpacing = next.wordSpacing;
  };
  syncFont();
  document.body.appendChild(probe);
  return {
    measure: (text: string) => {
      syncFont();
      probe.textContent = text;
      return probe.getBoundingClientRect().width;
    },
    dispose: () => {
      probe.remove();
    },
  };
}
