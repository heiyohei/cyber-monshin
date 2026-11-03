import { ACCOUNTS_ITEM } from "./accounts.ts";
import { BACKUP_ITEM } from "./backup.ts";
import { CONTINUITY_ITEM } from "./continuity.ts";
import { DEVICES_ITEM } from "./devices.ts";
import type { FocusItem, PlannedItem } from "./types.ts";
import { UPDATE_ITEM } from "./update.ts";

// 利用者が選べる重点項目。並びは攻撃の流れ（入られる→広がる→戻せない→止まる）
export const ITEMS: readonly FocusItem[] = [DEVICES_ITEM, UPDATE_ITEM, ACCOUNTS_ITEM, BACKUP_ITEM, CONTINUITY_ITEM];

// まだ作っていない重点項目。データはあっても、承認の前は選べない
export const DRAFT_ITEMS: readonly FocusItem[] = [];

export const PLANNED_ITEMS: readonly PlannedItem[] = [
  { id: "devices", name: "機器と外部接続の把握", stage: "入られる", checkItems: ["2-①", "2-②", "2-⑭"] },
  { id: "update", name: "更新プログラム", stage: "入られる", checkItems: ["2-⑥"] },
  { id: "accounts", name: "アカウントと権限", stage: "広がる", checkItems: ["2-④", "2-⑤", "2-⑧", "2-⑪", "2-⑫"] },
  { id: "continuity", name: "診療を止めない備え", stage: "止まる", checkItems: ["3-①", "3-③"] },
].filter((planned) => !ITEMS.some((item) => item.id === planned.id));

export const DEFAULT_ITEM_ID = "backup";

export function getItem(id: string): FocusItem | undefined {
  return ITEMS.find((item) => item.id === id);
}

// 承認の前の項目も含めて探す。評価と、作成済みの問診の処理で使う。
// 利用者が新しく始められるかは、API で getItem を使って確かめる
export function findItem(id: string): FocusItem | undefined {
  return getItem(id) ?? DRAFT_ITEMS.find((item) => item.id === id);
}
