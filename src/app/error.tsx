"use client";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-bold">問題が発生しました</h1>
      <p className="leading-relaxed">
        画面を表示できませんでした。時間をおいて、もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-14 w-fit rounded-8 bg-blue-900 px-6 text-oln-16B-100 text-white hover:bg-blue-1000 hover:underline focus-visible:focus-ring"
      >
        もう一度試す
      </button>
    </main>
  );
}
