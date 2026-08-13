import React, { useState } from 'react';
import { Note } from '../../lib/types';
import { NoteCard } from './NoteCard';
import { Inbox, Sparkles, Filter, X } from 'lucide-react';

interface FeedListProps {
  notes: Note[];
  selectedNoteId?: string;
  onSelectNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onTagClick: (tagName: string) => void;
  onMentionClick: (username: string) => void;
  activeFilterTitle?: string;
  onClearFilter?: () => void;
}

const PAGE_SIZE = 20;

export const FeedList: React.FC<FeedListProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
  onDeleteNote,
  onTagClick,
  onMentionClick,
  activeFilterTitle,
  onClearFilter,
}) => {
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const visibleNotes = notes.slice(0, displayCount);
  const hasMore = notes.length > displayCount;

  return (
    <div className="space-y-4">
      {/* Active Filter Banner */}
      {activeFilterTitle && (
        <div className="flex items-center justify-between px-3.5 py-2 bg-primary-light/60 hairline-border border-primary/20 rounded-lg text-xs text-primary font-medium">
          <span className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Filtered by: <strong>{activeFilterTitle}</strong>
          </span>
          {onClearFilter && (
            <button
              onClick={onClearFilter}
              className="flex items-center gap-1 hover:underline text-[11px] font-semibold"
            >
              Clear filter <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Empty State */}
      {notes.length === 0 ? (
        <div className="bg-surface rounded-xl hairline-border p-8 text-center shadow-subtle my-4">
          <div className="w-12 h-12 rounded-full bg-canvas flex items-center justify-center mx-auto mb-3 text-ink-muted hairline-border">
            <Inbox className="w-6 h-6 text-ink-subtle" />
          </div>
          <h3 className="text-base font-semibold text-ink mb-1">No Thoughts Found</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed mb-4">
            {activeFilterTitle
              ? `No thoughts match "${activeFilterTitle}". Try adjusting your search query or filter keywords.`
              : "You haven't captured any thoughts yet. Type above using #tags and @mentions to get started."}
          </p>
          {onClearFilter && activeFilterTitle && (
            <button
              onClick={onClearFilter}
              className="px-3.5 py-1.5 text-xs font-semibold text-primary bg-primary-light rounded-lg hover:bg-primary-light/80 transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div>
          {visibleNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              isSelected={note.id === selectedNoteId}
              onSelect={onSelectNote}
              onDelete={onDeleteNote}
              onTagClick={onTagClick}
              onMentionClick={onMentionClick}
            />
          ))}

          {/* Load More Pagination */}
          {hasMore && (
            <div className="text-center pt-2 pb-6">
              <button
                onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
                className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink bg-surface hover:bg-canvas rounded-lg hairline-border transition-colors shadow-subtle inline-flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Load More Thoughts ({notes.length - displayCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
