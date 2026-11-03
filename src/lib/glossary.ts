import { GLOSSARY, type GlossaryEntry } from "../data/terms.ts";

// 文を「ただの文字」と「用語」の区切りに分けたもの。つなげると元の文に戻る（原文は変えない）
export type TextPart = { type: "text"; text: string } | { type: "term"; text: string; entry: GlossaryEntry };

type Candidate = { word: string; entry: GlossaryEntry };

// 用語と別の書き方を、長い順に並べる。長い用語（管理者権限）を短い用語（権限）より先に当てるため
const CANDIDATES: readonly Candidate[] = GLOSSARY.flatMap((entry) =>
  [entry.term, ...(entry.aliases ?? [])].map((word) => ({ word, entry })),
).sort((a, b) => b.word.length - a.word.length);

const ALNUM = /[A-Za-z0-9]/;

// 英数字で始まる、または終わる用語（BCP、ID など）は、英単語の一部（VIDEO の ID など）に当てない
function isWholeWord(text: string, start: number, word: string): boolean {
  const end = start + word.length;
  if (ALNUM.test(word[0]) && start > 0 && ALNUM.test(text[start - 1])) return false;
  if (ALNUM.test(word[word.length - 1]) && end < text.length && ALNUM.test(text[end])) return false;
  return true;
}

function longestAt(text: string, index: number): Candidate | null {
  for (const candidate of CANDIDATES) {
    if (text.startsWith(candidate.word, index) && isWholeWord(text, index, candidate.word)) return candidate;
  }
  return null;
}

// 文の中の用語に印を付ける。長い用語を先に当て、重ならないようにし、同じ用語は1つの文の中で最初の1回だけ印を付ける
// （画面がうるさくならないように）。2回目以降は、その中の短い用語にも印を付けない
export function splitByTerms(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const seen = new Set<GlossaryEntry>();
  let plain = "";
  const flush = () => {
    if (plain) parts.push({ type: "text", text: plain });
    plain = "";
  };

  let index = 0;
  while (index < text.length) {
    const candidate = longestAt(text, index);
    if (!candidate) {
      plain += text[index];
      index += 1;
      continue;
    }
    if (seen.has(candidate.entry)) {
      plain += candidate.word;
    } else {
      flush();
      parts.push({ type: "term", text: candidate.word, entry: candidate.entry });
      seen.add(candidate.entry);
    }
    index += candidate.word.length;
  }
  flush();
  return parts;
}
