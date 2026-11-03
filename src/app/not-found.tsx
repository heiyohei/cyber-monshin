import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="leading-relaxed">
        お探しのページは、移動したか、削除された可能性があります。
      </p>
      <Link href="/" className="underline">
        最初のページへ戻る
      </Link>
    </main>
  );
}
