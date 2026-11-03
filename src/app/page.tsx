export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium opacity-70">
          中小病院の事務職員のための点検アシスタント
        </p>
        <h1 className="text-3xl font-bold leading-tight">
          病院のサイバー問診アシスタント
        </h1>
        <p className="text-lg leading-relaxed">
          その「はい」、本当に大丈夫？ ―
          サイバーセキュリティ対策チェックリストを、専門家の目でもう一度
        </p>
      </header>

      <button
        type="button"
        disabled
        className="rounded-lg bg-foreground px-5 py-3 font-medium text-background disabled:opacity-50"
      >
        サンプルで試す（準備中）
      </button>

      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed opacity-80">
        <li>対策の準拠を保証するものではなく、法的な判断もしません。</li>
        <li>厚生労働省の公式ツールではありません。</li>
        <li>患者情報は入力しないでください。</li>
      </ul>
    </main>
  );
}
