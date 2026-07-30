export interface AlignedNarrationToken {
  text: string;
  startMs: number;
  endMs: number;
}

export interface SurfaceNarrationWord {
  text: string;
  startMs: number;
  endMs: number;
}

export function narrationSurfaceWords(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

export function narrationAlignmentTokens(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9']+/g) ?? [];
}

export function narrationAlignmentTokensForSurfaceWord(value: string): string[] {
  return narrationAlignmentTokens(value);
}

export function approvedNarrationMatchesAlignedTokens(
  approvedText: string,
  alignedWords: readonly string[]
): boolean {
  const approved = narrationAlignmentTokens(approvedText);
  const aligned = alignedWords.flatMap(narrationAlignmentTokens);
  return approved.length === aligned.length && approved.every((token, index) => token === aligned[index]);
}

export function mergeAlignedTokensIntoSurfaceWords(
  approvedText: string,
  aligned: readonly AlignedNarrationToken[]
): SurfaceNarrationWord[] {
  const surfaceWords = narrationSurfaceWords(approvedText);
  const expectedTokens = narrationAlignmentTokens(approvedText);
  const actualTokens = aligned.flatMap(({ text }) => narrationAlignmentTokens(text));
  if (expectedTokens.length !== actualTokens.length || expectedTokens.some((token, index) => token !== actualTokens[index])) {
    throw new Error(`Aligned narration tokens differ from the approved text (${expectedTokens.length} approved tokens, ${actualTokens.length} aligned tokens).`);
  }

  let tokenCursor = 0;
  return surfaceWords.map((text) => {
    const tokenCount = narrationAlignmentTokensForSurfaceWord(text).length;
    if (tokenCount === 0) throw new Error(`Approved narration word has no alignable token: ${JSON.stringify(text)}.`);
    const tokenSpan = aligned.slice(tokenCursor, tokenCursor + tokenCount);
    if (tokenSpan.length !== tokenCount) throw new Error(`Missing aligned timing tokens for approved narration word: ${JSON.stringify(text)}.`);
    tokenCursor += tokenCount;
    return {
      text,
      startMs: tokenSpan[0]!.startMs,
      endMs: tokenSpan.at(-1)!.endMs
    };
  });
}
