// 送る前に、個人や機器を特定できる形式の文字列を探す。見つけた値そのものは表示しない
const PATTERNS: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/, "メールアドレス"],
  [/\b(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/, "IP アドレス"],
  [/\b([0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/i, "IP アドレス"],
  [/(^|[^\d])0\d{1,4}-\d{1,4}-\d{3,4}([^\d]|$)/, "電話番号"],
  [/(^|[^\d])0[5789]0\d{8}([^\d]|$)/, "電話番号"],
  [/https?:\/\/\S+/, "URL"],
  [/(^|[^\d-])〒?\d{3}-\d{4}([^\d-]|$)/, "郵便番号"],
];

export function detectPersonalInfo(text: string): string[] {
  const normalized = text.normalize("NFKC");
  const found = PATTERNS.filter(([pattern]) => pattern.test(normalized)).map(([, label]) => label);
  return [...new Set(found)];
}
