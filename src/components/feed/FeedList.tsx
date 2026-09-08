import React, { useState } from 'react';
import { Note } from '../../lib/types';
import { NoteCard } from './NoteCard';
import { Inbox, Sparkles, Filter, X } from 'lucide-react';

interface FeedListProps {
  notes: Note[];
  currentUserId?: string;
  selectedNoteId?: string;
  isLoading?: boolean;
  onSelectNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onTagClick: (tagName: string) => void;
  onMentionClick: (username: string) => void;
  activeFilterTitle?: string;
  onClearFilter?: () => void;
}

const PAGE_SIZE = 25;

export const FeedList: React.FC<FeedListProps> = ({
  notes,
  currentUserId,
  selectedNoteId,
  isLoading = false,
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
        <div className="flex items-center justify-between px-3.5 py-2 bg-primary-light/60 hairline-border border-primary/20 rounded-xl text-xs text-primary font-medium">
          <span className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Filtered by: <strong>{activeFilterTitle}</strong>
          </span>
          {onClearFilter && (
            <button
              onClick={onClearFilter}
              className="flex items-center gap-1 hover:underline text-[11px] font-semibold cursor-pointer"
            >
              Clear filter <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-3 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-2xl bg-surface hairline-border shadow-subtle animate-pulse space-y-2.5">
              <div className="h-4 bg-hairline/60 rounded-md w-3/4" />
              <div className="h-3 bg-hairline/40 rounded-md w-1/2" />
              <div className="flex gap-2 pt-1">
                <div className="h-4 bg-hairline/50 rounded-full w-14" />
                <div className="h-4 bg-hairline/50 rounded-full w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-surface rounded-2xl hairline-border p-8 sm:p-10 text-center shadow-subtle my-4">
          <div className="w-12 h-12 rounded-2xl bg-canvas flex items-center justify-center mx-auto mb-3 text-ink-muted hairline-border">
            <Inbox className="w-6 h-6 text-ink-subtle" />
          </div>
          <h3 className="text-base font-semibold text-ink mb-1">No Thoughts in this View</h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto leading-relaxed mb-4">
            {activeFilterTitle
              ? `No thoughts match "${activeFilterTitle}". Try adjusting your search query or switching tabs.`
              : "Capture your first thought above using #tags or tag teammates with @name."}
          </p>
          {onClearFilter && activeFilterTitle && (
            <button
              onClick={onClearFilter}
              className="px-3.5 py-1.5 text-xs font-semibold text-primary bg-primary-light rounded-xl hover:bg-primary-light/80 transition-colors cursor-pointer"
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
              currentUserId={currentUserId}
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
                className="px-4 py-2 text-xs font-semibold text-ink-muted hover:text-ink bg-surface hover:bg-canvas rounded-xl hairline-border transition-colors shadow-subtle inline-flex items-center gap-1.5 cursor-pointer"
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
