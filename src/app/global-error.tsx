"use client";

export default function GlobalError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <h1>問題が発生しました</h1>
        <p>画面を表示できませんでした。時間をおいて、もう一度お試しください。</p>
        <button type="button" onClick={() => retry()}>
          もう一度試す
        </button>
      </body>
    </html>
  );
}
