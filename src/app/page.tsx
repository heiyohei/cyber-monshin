import { SAMPLE_VENDOR_QUESTION } from "@/data/backup";
import { buildCard } from "@/lib/card";
import { initialStates } from "@/lib/verdict";
import { InterviewDemo } from "./interview-demo";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium opacity-70">
          中小病院の事務職員のための点検アシスタント
        </p>
        <h1 className="text-3xl font-bold leading-tight">
          病院のサイバー問診アシスタント
        </h1>
        <p className="leading-relaxed">
          その「はい」、本当に大丈夫？ ―
          サイバーセキュリティ対策チェックリストを、専門家の目でもう一度
        </p>
      </header>

      <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed opacity-80">
        <li>対策の準拠を保証するものではなく、法的な判断もしません。</li>
        <li>厚生労働省の公式ツールではありません。</li>
        <li>すべての対策を確かめるものではありません。今回はバックアップと復旧だけを確かめます。ほかの項目は今後の拡張です。</li>
        <li>患者情報は入力しないでください。回答はこのサイトに保存しませんが、処理のため AI の Claude を提供する Anthropic 社へ送ります。</li>
        <li>開発中の確認用の画面です。根拠は仮の文面です。</li>
      </ul>

      <InterviewDemo
        initialCard={buildCard(initialStates(), "yes")}
        vendorQuestion={SAMPLE_VENDOR_QUESTION.question}
        requirements={SAMPLE_VENDOR_QUESTION.requirements}
      />
    </main>
  );
}
