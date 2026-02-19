import * as XLSX from 'xlsx';
import type { ChatMessage } from '@docintel/ai-engine';

export function exportChatToXlsx(messages: ChatMessage[], title: string): Blob {
  const data = messages.map((msg) => ({
    Role: msg.role === 'user' ? 'You' : 'DocIntel',
    Message: msg.content,
    Timestamp: new Date(msg.timestamp).toLocaleString(),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportDataToXlsx(
  rows: Record<string, string | number>[],
  sheetName: string,
): Blob {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
