const ELLIPSIS = "...";

function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  if (ctx.measureText(ELLIPSIS).width > maxWidth) {
    return "";
  }

  let truncated = text.trim();

  while (truncated && ctx.measureText(`${truncated}${ELLIPSIS}`).width > maxWidth) {
    truncated = truncated.slice(0, -1).trimEnd();
  }

  return truncated ? `${truncated}${ELLIPSIS}` : ELLIPSIS;
}

export function wrapTextToLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = Number.POSITIVE_INFINITY
) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (!words.length) {
    return [];
  }

  const lines: string[] = [];
  let wordIndex = 0;

  while (wordIndex < words.length && lines.length < maxLines) {
    let line = words[wordIndex] ?? "";

    if (ctx.measureText(line).width > maxWidth) {
      line = truncateText(ctx, line, maxWidth);
      wordIndex += 1;
      lines.push(line);
      continue;
    }

    wordIndex += 1;

    while (wordIndex < words.length) {
      const candidate = `${line} ${words[wordIndex]}`;

      if (ctx.measureText(candidate).width > maxWidth) {
        break;
      }

      line = candidate;
      wordIndex += 1;
    }

    if (lines.length === maxLines - 1 && wordIndex < words.length) {
      const remainingText = `${line} ${words.slice(wordIndex).join(" ")}`;
      lines.push(truncateText(ctx, remainingText, maxWidth));
      return lines;
    }

    lines.push(line);
  }

  return lines;
}
