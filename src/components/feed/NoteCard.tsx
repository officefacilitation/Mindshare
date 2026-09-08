import React, { useState } from 'react';
import { Note } from '../../lib/types';
import { TagChip, MentionChip } from '../ui/Chip';
import { Modal } from '../ui/Modal';
import { Trash2, Edit3, Clock, ChevronRight, Image as ImageIcon, User as UserIcon } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  currentUserId?: string;
  onSelect: (note: Note) => void;
  isSelected?: boolean;
  onDelete: (id: string) => void;
  onTagClick?: (tagName: string) => void;
  onMentionClick?: (username: string) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  currentUserId,
  onSelect,
  isSelected,
  onDelete,
  onTagClick,
  onMentionClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const isOwner = !currentUserId || note.user_id === currentUserId;

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
        className={`group bg-surface rounded-2xl hairline-border p-3.5 sm:p-4.5 mb-3.5 transition-all duration-200 cursor-pointer hover:border-primary/40 hover:bg-surface/90 shadow-subtle ${
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

        {/* Main Text Content */}
        {cleanedText && (
          <div className="text-sm font-sans text-ink leading-relaxed whitespace-pre-wrap break-words">
            {displayContent}
            {shouldTruncate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="ml-1 text-xs text-primary font-medium hover:underline inline-flex items-center gap-0.5 cursor-pointer"
              >
                {isExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}

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
        {(note.tags.length > 0 || note.mentions.length > 0) && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2.5 hairline-t">
            {note.tags.map((t) => (
              <TagChip
                key={t.id}
                tag={t}
                onClick={(name) => {
                  if (onTagClick) onTagClick(name);
                }}
              />
            ))}
            {note.mentions.map((m) => (
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

        {/* Footer Meta & Quick Actions */}
        <div className="mt-3 flex items-center justify-between text-xs text-ink-muted pt-2 hairline-t">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-ink-subtle" />
              <span className="text-ink-subtle">{getRelativeTime(note.created_at)}</span>
            </div>
            {imageUrls.length > 0 && (
              <span className="flex items-center gap-1 text-ink-subtle text-[11px]">
                <ImageIcon className="w-3 h-3 text-primary" /> {imageUrls.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(note);
              }}
              className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-ink-muted hover:text-primary hover:bg-canvas active:bg-hairline transition-colors cursor-pointer"
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
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-ink-muted hover:text-status-error hover:bg-canvas active:bg-hairline transition-colors cursor-pointer"
                title="Delete Note"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-ink-subtle ml-0.5" />
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
