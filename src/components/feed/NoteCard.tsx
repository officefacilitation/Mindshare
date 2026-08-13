import React, { useState } from 'react';
import { Note } from '../../lib/types';
import { TagChip, MentionChip } from '../ui/Chip';
import { Sparkles, Trash2, Edit3, Clock, ChevronRight } from 'lucide-react';

interface NoteCardProps {
  note: Note;
  onSelect: (note: Note) => void;
  isSelected?: boolean;
  onDelete: (id: string) => void;
  onTagClick?: (tagName: string) => void;
  onMentionClick?: (username: string) => void;
}

export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onSelect,
  isSelected,
  onDelete,
  onTagClick,
  onMentionClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldTruncate = note.content.length > 160;
  const displayContent = shouldTruncate && !isExpanded
    ? note.content.substring(0, 160) + '...'
    : note.content;

  // Format relative timestamp
  const getRelativeTime = (dateStr: string) => {
    const time = new Date(dateStr).getTime();
    const diff = Math.floor((Date.now() - time) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <article
      onClick={() => onSelect(note)}
      className={`group bg-surface rounded-xl hairline-border p-4.5 mb-3.5 transition-all duration-200 cursor-pointer hover:border-primary/40 hover:bg-canvas/40 shadow-subtle ${
        isSelected ? 'border-primary ring-1 ring-primary/20 bg-primary-light/10' : ''
      }`}
    >
      {/* Main Content */}
      <div className="text-sm font-sans text-ink leading-relaxed whitespace-pre-wrap">
        {displayContent}
        {shouldTruncate && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="ml-1 text-xs text-primary font-medium hover:underline inline-flex items-center gap-0.5"
          >
            {isExpanded ? 'Show less' : 'Read more'}
          </button>
        )}
      </div>

      {/* Tags and Mentions Pill Row */}
      {(note.tags.length > 0 || note.mentions.length > 0) && (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2 hairline-t">
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
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-ink-subtle" />
          <span className="text-ink-subtle">{getRelativeTime(note.created_at)}</span>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(note);
            }}
            className="p-1 text-ink-muted hover:text-primary transition-colors"
            title="Inspect Note"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note.id);
            }}
            className="p-1 text-ink-muted hover:text-status-error transition-colors"
            title="Delete Note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-ink-subtle" />
        </div>
      </div>
    </article>
  );
};
