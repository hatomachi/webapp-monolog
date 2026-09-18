import { MonologEntry } from '../types';

/**
 * MonologEntry を Obsidian 互換の Markdown ブロックにフォーマット
 */
export function formatEntryToMarkdown(entry: MonologEntry): string {
  const shortTime = entry.timeStr.slice(0, 5); // HH:mm
  let locationPart = '';

  if (entry.location) {
    if (entry.location.address) {
      locationPart = ` 📍 *${entry.location.address}*`;
    } else {
      locationPart = ` 📍 *[${entry.location.latitude}, ${entry.location.longitude}]*`;
    }
  }

  // 本文の複数行処理（箇条書きリスト内でのインデント）
  const lines = entry.text.split('\n');
  const firstLine = lines[0];
  const restLines = lines.slice(1).map((l) => `  ${l}`).join('\n');

  let body = `- **${shortTime}**${locationPart}  \n  ${firstLine}`;
  if (restLines) {
    body += `\n${restLines}`;
  }

  // メタデータ（ID、座標等）
  const metaParts = [`id=${entry.id}`];
  if (entry.location) {
    metaParts.push(`geo=${entry.location.latitude},${entry.location.longitude}`);
  }
  const commentTag = `  <!-- monolog:${metaParts.join(';')} -->`;

  return `${body}\n${commentTag}`;
}

export function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()] || '';
}

export function encodeUtf8Base64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export function decodeBase64Utf8(base64: string): string {
  return decodeURIComponent(escape(atob(base64.replace(/\n/g, ''))));
}

/**
 * 保存先ファイルパスの解決 (例: "00_Inbox/monolog/2026/2026-09-17.md")
 */
export function resolveFilePath(basePath: string, dateStr: string): string {
  const year = dateStr.slice(0, 4);
  const cleanBasePath = (basePath || '').replace(/^\/+|\/+$/g, '');
  return cleanBasePath ? `${cleanBasePath}/${year}/${dateStr}.md` : `${year}/${dateStr}.md`;
}

/**
 * 既存のMarkdownファイル内容に新規エントリを追記・マージ（二重登録防止）
 */
export function buildMarkdownForDate(
  dateStr: string,
  existingContent: string,
  entries: MonologEntry[]
): { updatedContent: string; successfullyAppendedEntries: MonologEntry[] } {
  let content = existingContent;

  // 新規作成時の初期ヘッダー
  if (!content.trim()) {
    const dayOfWeek = getDayOfWeek(dateStr);
    content = `# ${dateStr} (${dayOfWeek})\n\n`;
  }

  const successfullyAppendedEntries: MonologEntry[] = [];

  // 日時順（古い順）にソートして追記
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const entry of sortedEntries) {
    // 既にファイル内に同じIDが存在している場合はスキップ（二重追記防止）
    if (content.includes(`id=${entry.id}`)) {
      successfullyAppendedEntries.push(entry);
      continue;
    }

    const formattedEntry = formatEntryToMarkdown(entry);
    if (!content.endsWith('\n\n') && !content.endsWith('\n')) {
      content += '\n\n';
    } else if (!content.endsWith('\n\n')) {
      content += '\n';
    }
    content += formattedEntry + '\n';
    successfullyAppendedEntries.push(entry);
  }

  return { updatedContent: content, successfullyAppendedEntries };
}
