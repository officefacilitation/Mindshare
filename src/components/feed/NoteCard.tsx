import React, { useState } from 'react';
import { Note } from '../../lib/types';
import { TagChip, MentionChip } from '../ui/Chip';
import { Modal } from '../ui/Modal';
import { Trash2, Edit3, Clock, Image as ImageIcon, Check } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  currentUserId?: string;
  currentUsername?: string;
  onSelect: (note: Note) => void;
  isSelected?: boolean;
  onDelete: (id: string) => void;
  onToggleComplete?: (id: string, isCompleted: boolean, username?: string) => void;
  onTagClick?: (tagName: string) => void;
  onMentionClick?: (username: string) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  currentUserId,
  currentUsername,
  onSelect,
  isSelected,
  onDelete,
  onToggleComplete,
  onTagClick,
  onMentionClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const isOwner = !currentUserId || note.user_id === currentUserId;

  // Multi-assignee collaborative task completion: author + all mentioned teammates
  const participants = React.useMemo(() => {
    if (!note.reminder_at) return [];
    const list: { username: string; isAuthor: boolean; isCurrent: boolean }[] = [];
    const authorHandle = (note.author?.username || (isOwner && currentUsername ? currentUsername : ''))?.toLowerCase().trim();
    const curr = (currentUsername || '').toLowerCase().trim();

    if (authorHandle) {
      list.push({
        username: authorHandle,
        isAuthor: true,
        isCurrent: authorHandle === curr,
      });
    }

    (note.mentions || []).forEach((m) => {
      const uname = (m.username || '').toLowerCase().trim();
      if (uname && !list.some((p) => p.username === uname)) {
        list.push({
          username: uname,
          isAuthor: false,
          isCurrent: uname === curr,
        });
      }
    });

    if (curr && !list.some((p) => p.username === curr)) {
      list.push({
        username: curr,
        isAuthor: false,
        isCurrent: true,
      });
    }

    return list;
  }, [note.reminder_at, note.author, note.mentions, isOwner, currentUsername]);

  const completedList = (note.completed_by || []).map((u) => u.toLowerCase());
  const isCurrentDone = currentUsername ? completedList.includes(currentUsername.toLowerCase()) : Boolean(note.is_completed);

  // Format reminder deadline
  const getReminderStatus = (reminderStr?: string | null, isCompleted?: boolean) => {
    if (!reminderStr) return null;
    const time = new Date(reminderStr).getTime();
    const now = Date.now();
    const isPast = now > time;
    const d = new Date(reminderStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const label = isToday ? `Today, ${timeStr}` : isTomorrow ? `Tomorrow, ${timeStr}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;

    if (isCompleted) {
      return { label: `Done (${label})`, isPast: false, isCompleted: true };
    }
    if (isPast) {
      return { label: `Overdue: ${label}`, isPast: true, isCompleted: false };
    }
    return { label: `Due: ${label}`, isPast: false, isCompleted: false };
  };

  const reminderStatus = getReminderStatus(note.reminder_at, note.is_completed);

  // Extract embedded image URLs from markdown ![alt](url)
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;
  const imageUrls: string[] = [];
  let m;
  while ((m = imageRegex.exec(note.content)) !== null) {
    const url = m[1] || m[2];
    if (url && !imageUrls.includes(url)) imageUrls.push(url);
  }

  // Clean raw markdown image syntax for text display
  const cleanedText = note.content
    .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '')
    .trim();

  const shouldTruncate = cleanedText.length > 220;
  const displayContent = shouldTruncate && !isExpanded
    ? cleanedText.substring(0, 220) + '...'
    : cleanedText;

  // Format relative timestamp
  const getRelativeTime = (dateStr: string) => {
    if (!dateStr) return 'Just now';
    const normalized = (dateStr.endsWith('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z';
    const time = new Date(normalized).getTime();
    const diff = Math.floor((Date.now() - time) / 1000);

    if (isNaN(diff) || diff <= 30) return 'Just now';
    if (diff < 60) return '1m ago';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(normalized).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(note.id);
    setIsConfirmDeleteOpen(false);
  };

  return (
    <>
      <article
        onClick={() => onSelect(note)}
        className={`group bg-surface rounded-2xl hairline-border p-3.5 sm:p-4.5 mb-3.5 transition-all duration-200 cursor-pointer hover:border-primary/40 hover:bg-surface/90 shadow-subtle max-w-full overflow-hidden break-words ${
          isSelected ? 'border-primary ring-1 ring-primary/20 bg-primary-light/10' : ''
        }`}
      >
        {/* Author header if shared note */}
        {!isOwner && note.author && (
          <div className="mb-2.5 flex items-center justify-between pb-2 hairline-b text-xs text-ink-muted">
            <div className="flex items-center gap-2">
              {note.author.avatar_url ? (
                <img
                  src={note.author.avatar_url}
                  alt={note.author.username || 'author'}
                  referrerPolicy="no-referrer"
                  className="w-4 h-4 rounded-full object-cover"
                />
              ) : (
                <div className="w-4 h-4 rounded-full bg-mention-text/15 text-mention-text flex items-center justify-center text-[9px] font-bold">
                  {(note.author.full_name || note.author.username || 'T')[0].toUpperCase()}
                </div>
              )}
              <span>
                Shared by <strong className="font-mono text-ink">@{note.author.username}</strong>
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-mention-text/10 text-mention-text font-semibold">
              Tagged you
            </span>
          </div>
        )}

        {/* Main Text Content with optional task checkbox */}
        <div className="flex items-start gap-2.5">
          {note.reminder_at && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleComplete) onToggleComplete(note.id, !isCurrentDone, currentUsername);
              }}
              className={`mt-0.5 w-5 h-5 rounded-lg flex items-center justify-center hairline-border transition-all cursor-pointer shrink-0 ${
                isCurrentDone
                  ? 'bg-status-success text-white border-status-success shadow-subtle'
                  : 'bg-canvas hover:border-primary text-transparent'
              }`}
              title={isCurrentDone ? 'Mark pending' : `Mark done as @${currentUsername || 'me'}`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </button>
          )}

          <div className="flex-1 min-w-0">
            {cleanedText && (
              <div className="text-sm font-sans leading-relaxed whitespace-pre-wrap break-words text-ink">
                {displayContent}
                {shouldTruncate && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(!isExpanded);
                    }}
                    className="ml-1 text-xs text-primary font-medium hover:underline inline-flex items-center gap-0.5 cursor-pointer no-underline"
                  >
                    {isExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
                {note.reminder_at && (note.is_completed || completedList.length > 0) && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {note.is_completed ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hairline-border border-emerald-500/30 shadow-xs">
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                        <span>Completed by all assignees</span>
                      </span>
                    ) : (
                      completedList.map((uname) => (
                        <span
                          key={uname}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hairline-border border-emerald-500/30 shadow-xs"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                          <span>Done by @{uname}</span>
                        </span>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Embedded Image Previews */}
        {imageUrls.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {imageUrls.map((url, i) => (
              <div
                key={i}
                className="relative rounded-xl overflow-hidden border hairline-border bg-canvas max-h-48 max-w-full"
              >
                <img
                  src={url}
                  alt="Attachment"
                  className="object-cover max-h-48 w-auto rounded-xl hover:scale-[1.02] transition-transform"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {/* Tags and Mentions Pill Row */}
        {((note.tags || []).length > 0 || (note.mentions || []).length > 0) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2.5 hairline-t">
            {(note.tags || []).map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                onClick={(name) => {
                  if (onTagClick) onTagClick(name);
                }}
              />
            ))}
            {(note.mentions || []).map((m) => (
              <MentionChip
                key={m.id}
                mention={m}
                onClick={(username) => {
                  if (onMentionClick) onMentionClick(username);
                }}
              />
            ))}
          </div>
        )}

        {/* Collaborative Multi-Assignee Task Completion Row */}
        {note.reminder_at && participants.length > 0 && (
          <div className="mt-3.5 pt-2.5 hairline-t space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-ink-muted">
              <span className="font-semibold text-ink-subtle uppercase tracking-wider text-[10px] flex items-center gap-1">
                <Clock className="w-3 h-3 text-rose-500" /> Deadline Assignees
              </span>
              <span className="text-[10px] text-ink-subtle">
                {completedList.length}/{participants.length} done
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {participants.map((p) => {
                const isDone = completedList.includes(p.username);
                if (isDone) {
                  return (
                    <div
                      key={p.username}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border hairline-border border-emerald-500/30"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                      <span>Done by @{p.username}</span>
                      {p.isCurrent && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onToggleComplete) onToggleComplete(note.id, false, p.username);
                          }}
                          className="text-[10px] text-emerald-700/80 hover:text-emerald-950 dark:text-emerald-300/80 dark:hover:text-white underline cursor-pointer ml-1"
                          title="Undo completion"
                        >
                          undo
                        </button>
                      )}
                    </div>
                  );
                }

                if (p.isCurrent) {
                  return (
                    <button
                      key={p.username}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onToggleComplete) onToggleComplete(note.id, true, p.username);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-surface hover:bg-emerald-600 hover:text-white text-ink border hairline-border border-emerald-500/40 hover:border-emerald-600 shadow-subtle transition-all cursor-pointer active:scale-95 min-h-[34px]"
                      title={`Mark done as @${p.username}`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Mark done as @{p.username}</span>
                    </button>
                  );
                }

                return (
                  <span
                    key={p.username}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-canvas text-ink-muted border hairline-border border-hairline/60"
                  >
                    <Clock className="w-3 h-3 text-ink-subtle" />
                    <span>@{p.username} (Pending)</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Meta & Quick Actions */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted pt-2 hairline-t overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
            <div className="flex items-center gap-1 shrink-0">
              <Clock className="w-3 h-3 text-ink-subtle" />
              <span className="text-ink-subtle">{getRelativeTime(note.created_at)}</span>
            </div>
            {imageUrls.length > 0 && (
              <span className="flex items-center gap-1 text-ink-subtle text-[11px] shrink-0">
                <ImageIcon className="w-3 h-3 text-primary" /> {imageUrls.length}
              </span>
            )}
            {reminderStatus && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide max-w-[200px] sm:max-w-[260px] truncate shrink-0 ${
                  reminderStatus.isCompleted
                    ? 'bg-status-success/10 text-status-success hairline-border border-status-success/20'
                    : reminderStatus.isPast
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 hairline-border border-rose-500/40 animate-pulse'
                    : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 hairline-border border-rose-500/30'
                }`}
                title={reminderStatus.label}
              >
                <Clock className="w-3 h-3 shrink-0 text-rose-500" />
                <span className="truncate">{reminderStatus.label}</span>
              </span>
            )}
            {!note.reminder_at && isOwner && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(note);
                }}
                className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                title="Convert this thought to a deadline task"
              >
                <Clock className="w-3 h-3 shrink-0 text-rose-500" />
                <span>+ Deadline</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(note);
              }}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-ink-muted hover:text-primary hover:bg-canvas active:bg-hairline transition-colors cursor-pointer"
              title="Inspect Note"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            {isOwner && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsConfirmDeleteOpen(true);
                }}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-ink-muted hover:text-status-error hover:bg-status-error/10 active:bg-status-error/20 transition-colors cursor-pointer"
                title="Delete Note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </article>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title="Delete Thought"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-normal">
            Are you sure you want to delete this thought? This action will permanently remove the note and its images.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsConfirmDeleteOpen(false);
              }}
              className="px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs font-medium text-white bg-status-error hover:bg-red-700 rounded-xl transition-colors cursor-pointer"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
