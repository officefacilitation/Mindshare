import * as XLSX from 'xlsx';
import { Note } from './types';

export interface ExcelExportOptions {
  fileName?: string;
  userHandle?: string;
}

/**
 * Exports thoughts into a formatted Excel (.xlsx) workbook for backup.
 */
export function exportNotesToExcel(notes: Note[], options: ExcelExportOptions = {}): boolean {
  if (!notes || notes.length === 0) {
    return false;
  }

  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;

  const rows = notes.map((note, index) => {
    // Extract media URLs
    const mediaUrls: string[] = [];
    let m;
    const regexClone = new RegExp(imageRegex.source, 'gi');
    while ((m = regexClone.exec(note.content)) !== null) {
      const url = m[1] || m[2];
      if (url && !mediaUrls.includes(url)) mediaUrls.push(url);
    }

    // Clean text without markdown image tags
    const cleanContent = note.content
      .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '')
      .trim();

    // Format timestamps
    const createdDate = note.created_at
      ? new Date(
          note.created_at.endsWith('Z') || note.created_at.includes('+')
            ? note.created_at
            : note.created_at + 'Z'
        ).toLocaleString()
      : '';

    const updatedDate = note.updated_at
      ? new Date(
          note.updated_at.endsWith('Z') || note.updated_at.includes('+')
            ? note.updated_at
            : note.updated_at + 'Z'
        ).toLocaleString()
      : '';

    const tagsStr = (note.tags || []).map((t) => `#${t.name}`).join(', ');
    const mentionsStr = (note.mentions || []).map((m) => `@${m.username}`).join(', ');

    const reminderStr = note.reminder_at ? new Date(note.reminder_at).toLocaleString() : 'None';
    const completionStr = note.is_completed ? 'Completed' : (note.reminder_at ? 'Pending' : 'N/A');
    const completedByStr = (note.completed_by || []).map((u) => `@${u}`).join(', ');

    return {
      '#': index + 1,
      'Thought ID': note.id,
      'Created Date': createdDate,
      'Last Updated': updatedDate,
      'Thought Content': cleanContent,
      'Tags': tagsStr,
      'Mentions': mentionsStr,
      'Deadline': reminderStr,
      'Status': completionStr,
      'Completed By': completedByStr,
      'Attached Media URLs': mediaUrls.join('\n'),
      'Author': note.author?.username ? `@${note.author.username}` : (options.userHandle ? `@${options.userHandle}` : 'You'),
      'Author Name': note.author?.full_name || '',
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for polished presentation
  worksheet['!cols'] = [
    { wch: 5 },   // #
    { wch: 38 },  // Thought ID
    { wch: 22 },  // Created Date
    { wch: 22 },  // Last Updated
    { wch: 55 },  // Thought Content
    { wch: 25 },  // Tags
    { wch: 25 },  // Mentions
    { wch: 22 },  // Deadline
    { wch: 14 },  // Status
    { wch: 25 },  // Completed By
    { wch: 45 },  // Attached Media URLs
    { wch: 16 },  // Author
    { wch: 20 },  // Author Name
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Thoughts Backup');

  const dateStr = new Date().toISOString().split('T')[0];
  const defaultFileName = `mindshare_backup_${options.userHandle || 'notes'}_${dateStr}.xlsx`;
  const finalFileName = options.fileName || defaultFileName;

  XLSX.writeFile(workbook, finalFileName);
  return true;
}
