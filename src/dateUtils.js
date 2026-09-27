// 日本時間（JST, UTC+9）基準の日付ユーティリティ。
// toISOString() は UTC なので、そのまま使うと日本時間 0:00〜8:59 が「前日」になってしまう。
// 日本にはサマータイムがないため、+9時間ずらして UTC として読むだけで正しい日付が得られる。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 'YYYY-MM-DD'（日本時間）
export const toJstDateString = (date = new Date()) =>
  new Date(date.getTime() + JST_OFFSET_MS).toISOString().split('T')[0];

// 日本時間の「時」（0〜23）
export const getJstHours = (date = new Date()) =>
  new Date(date.getTime() + JST_OFFSET_MS).getUTCHours();

// 'YYYY-MM-DD' に days 日を足した 'YYYY-MM-DD'（マイナスで過去）
export const addDaysToDateString = (dateStr, days) => {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};

// 'YYYY-MM-DD' の曜日（0:日 1:月 ... 6:土）
export const getDayOfWeek = (dateStr) =>
  new Date(dateStr + 'T00:00:00Z').getUTCDay();
