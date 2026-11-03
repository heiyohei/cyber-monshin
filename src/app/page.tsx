import { SOURCES } from "@/data/backup";
import { SAMPLE_HOSPITAL } from "@/data/sample";
import { buildCard } from "@/lib/card";
import { initialStates } from "@/lib/verdict";
import { InterviewDemo } from "./interview-demo";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-std-16N-170 text-solid-gray-800">
          中小病院の事務職員のための点検アシスタント
        </p>
        <h1 className="text-std-32B-150 text-solid-gray-900">
          病院のサイバー問診アシスタント
        </h1>
        <p className="text-std-16N-170">
          その「はい」、本当に大丈夫？ ―
          サイバーセキュリティ対策チェックリストを、専門家の目でもう一度
        </p>
      </header>

      <ul className="list-disc space-y-1 rounded-8 bg-solid-gray-50 py-4 pr-4 pl-9 text-std-16N-170 text-solid-gray-800">
        <li>対策の準拠を保証するものではなく、法的な判断もしません。</li>
        <li>厚生労働省の公式ツールではありません。</li>
        <li>すべての対策を確かめるものではありません。今回はバックアップと復旧だけを確かめます。ほかの項目は今後の拡張です。</li>
        <li>患者情報は入力しないでください。回答はこのサイトに保存しませんが、処理のため AI の Claude を提供する Anthropic 社へ送ります。</li>
        <li>黒戸記念病院と黒戸町は架空です。</li>
      </ul>

      <InterviewDemo initialCard={buildCard(initialStates(), SAMPLE_HOSPITAL.lastYearAnswer)} />

      <footer className="flex flex-col gap-2 border-t border-solid-gray-200 pt-4 text-dns-14N-130 text-solid-gray-800">
        <p>
          出典：厚生労働省の次の資料をもとに作成しました（公共データ利用規約 第1.0版）。根拠の文は原文の引用で、質問、判定の基準、次の一手、言い換えは本アプリが加工したものです。
        </p>
        <ul className="list-disc pl-5">
          {SOURCES.map((source) => (
            <li key={source.url}>
              <a href={source.url} className="text-blue-900 underline focus-visible:focus-ring">
                {source.title}
              </a>
            </li>
          ))}
        </ul>
        <p>
          画面は、デジタル庁デザインシステムのデザイントークン（MIT License）を使って作成しました。厚生労働省とデジタル庁が作成、提供するものではありません。
        </p>
      </footer>
    </main>
  );
}
