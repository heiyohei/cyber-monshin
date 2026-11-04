import type { ViewpointStatus } from "./verdict.ts";

// 問診の1回分（そのときの質問、送った回答、その回答から読み取ったこと）。
// ブラウザの中だけで持ち、サーバーへは送らず、保存ファイル（save-file.ts）にも入れない。
// 写真で答えたときも、残すのは「回答する」で送った文だけで、写真は残さない
// quote は、読み取りのもとになった回答の言葉（サーバーで回答に含まれることを確かめたもの）。回答の一部なので、ほかの控えと同じ扱いにする。
// quoteAnswer は、その言葉があった回答の番号（何問目の回答か）。
// 確かめられずに「わからない」にしたときや、ベンダーの返事で変わったときはない
export type HistoryReading = {
  viewpointId: string;
  status: ViewpointStatus;
  reason: string;
  quote?: string;
  quoteAnswer?: number;
};
export type HistoryQuestion = { text: string; why: string };
export type HistoryEntry = {
  question: HistoryQuestion;
  answer: string;
  // 読み取りが届くまでは null。届いたら、読み取った観点（0件のこともある）
  readings: HistoryReading[] | null;
};

// 回答を送ったときに、質問と回答を控える。元の配列は変えない。
// 送信に失敗したときは、画面が元の配列に戻すので、やり直しても二重に入らない
export function appendHistory(history: readonly HistoryEntry[], question: HistoryQuestion, answer: string): HistoryEntry[] {
  return [...history, { question: { text: question.text, why: question.why }, answer, readings: null }];
}

// 読み取った観点を1つ足す。同じ観点が2回届いたら、あとの方に置き換える（「直前の回答から読み取ったこと」と同じ決まり）
export function upsertReading(readings: readonly HistoryReading[], reading: HistoryReading): HistoryReading[] {
  return [...readings.filter((item) => item.viewpointId !== reading.viewpointId), reading];
}

// 読み取りの結果が届いたら、最後の回に付ける。控えがなければ何もしない
export function attachReadings(history: readonly HistoryEntry[], readings: readonly HistoryReading[]): HistoryEntry[] {
  if (history.length === 0) return [];
  const last = history[history.length - 1];
  return [...history.slice(0, -1), { ...last, readings: [...readings] }];
}

// 「続ける」で届いた読み取りは、直前の回答についてのものなので、最後の回の読み取りに足す（置き換えない）。
// 同じ観点はあとの方に置き換える。控えがなければ何もしない
export function addReadings(history: readonly HistoryEntry[], readings: readonly HistoryReading[]): HistoryEntry[] {
  if (history.length === 0) return [];
  const last = history[history.length - 1];
  const merged = readings.reduce(upsertReading, last.readings ?? []);
  return [...history.slice(0, -1), { ...last, readings: merged }];
}
