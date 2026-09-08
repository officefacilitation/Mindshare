import React, { useState } from 'react';
import { Note, User } from '../../lib/types';
import { TagChip, MentionChip } from '../ui/Chip';
import {
  FileText,
  Clock,
  Trash2,
  Edit2,
  X,
  Plus,
  Check,
  Tag as TagIcon,
  Users as UsersIcon,
  Image as ImageIcon,
  Sparkles,
  Loader2,
  User as UserIcon,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { api } from '../../lib/api';

interface DetailPanelProps {
  note: Note | null;
  currentUserId?: string;
  onClose: () => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, newContent: string, manualTags?: string[]) => Promise<{ note?: Note; error?: string }>;
  teammates: User[];
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  note,
  currentUserId,
  onClose,
  onDeleteNote,
  onUpdateNote,
  teammates,
  onAddToast,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [activeLightBoxUrl, setActiveLightBoxUrl] = useState<string | null>(null);

  const [newTagInput, setNewTagInput] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);

  // On-Demand AI Tag Suggestions inside Detail Panel
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  if (!note) {
    return (
      <aside className="hidden xl:block w-72 h-[calc(100vh-57px)] sticky top-[57px] bg-canvas hairline-l p-6 text-center select-none shrink-0">
        <div className="h-full flex flex-col items-center justify-center text-ink-muted">
          <div className="w-12 h-12 rounded-2xl bg-surface flex items-center justify-center hairline-border mb-3 shadow-subtle">
            <FileText className="w-6 h-6 text-ink-subtle" />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-1">No Thought Selected</h3>
          <p className="text-xs text-ink-muted leading-relaxed max-w-[200px]">
            Click any note card to inspect details, attachments, tags, and teammates.
          </p>
        </div>
      </aside>
    );
  }

  const isOwner = !currentUserId || note.user_id === currentUserId;

  // Extract embedded image URLs
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;
  const imageUrls: string[] = [];
  let m;
  while ((m = imageRegex.exec(note.content)) !== null) {
    const url = m[1] || m[2];
    if (url && !imageUrls.includes(url)) imageUrls.push(url);
  }

  const handleStartEdit = () => {
    if (!isOwner) return;
    setEditContent(note.content);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    const res = await onUpdateNote(note.id, editContent.trim());
    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast('Thought updated successfully!', 'success');
      setIsEditing(false);
    }
  };

  const handleRequestAISuggestions = async () => {
    setIsSuggestingTags(true);
    setSuggestedTags([]);

    const res = await api.suggestTags(note.content);
    setIsSuggestingTags(false);

    if (res.error || !res.tags || res.tags.length === 0) {
      onAddToast(res.error || 'No suggestions found.', 'info');
    } else {
      const existing = new Set(note.tags.map((t) => t.name.toLowerCase()));
      const filtered = res.tags.filter((t) => !existing.has(t.toLowerCase()));
      setSuggestedTags(filtered);
      if (filtered.length > 0) {
        onAddToast('Click any suggested tag to add it to this note.', 'success');
      } else {
        onAddToast('All suggested tags are already present.', 'info');
      }
    }
  };

  const handleAddTagToNote = async (tagToAdd?: string) => {
    const tagName = (tagToAdd || newTagInput).trim().replace(/^#/, '').toLowerCase();
    if (!tagName) return;

    const updatedContent = `${note.content} #${tagName}`;
    const res = await onUpdateNote(note.id, updatedContent);
    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Added tag #${tagName}`, 'success');
      setNewTagInput('');
      setShowAddTag(false);
      setSuggestedTags((prev) => prev.filter((t) => t.toLowerCase() !== tagName));
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    if (!isOwner) return;
    const regex = new RegExp(`(?:^|\\s)#${tagName}\\b`, 'gi');
    const updatedContent = note.content.replace(regex, '').trim();
    const res = await onUpdateNote(note.id, updatedContent);
    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Removed tag #${tagName}`, 'info');
    }
  };

  const handleAddMentionToNote = async (username: string) => {
    if (!isOwner) return;
    const updatedContent = `${note.content} @${username}`;
    const res = await onUpdateNote(note.id, updatedContent);
    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Mentioned @${username}`, 'success');
    }
  };

  const handleConfirmDelete = () => {
    onDeleteNote(note.id);
    setIsConfirmDeleteOpen(false);
    onClose();
  };

  const formattedDate = new Date(
    (note.created_at.endsWith('Z') || note.created_at.includes('+'))
      ? note.created_at
      : note.created_at + 'Z'
  ).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const panelContent = (
    <div className="flex flex-col h-full bg-surface p-4.5 select-none overflow-y-auto">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-3.5 mb-3 hairline-b">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink uppercase tracking-wider">Thought Inspector</span>
          {!isOwner && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-mention-text/10 text-mention-text font-semibold">
              Shared with you
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-hairline/40 transition-colors cursor-pointer"
          title="Close Inspector"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Author Section if shared */}
      {!isOwner && note.author && (
        <div className="mb-4 p-3 rounded-xl bg-canvas hairline-border text-xs">
          <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider block mb-1">
            Author
          </span>
          <div className="flex items-center gap-2">
            {note.author.avatar_url ? (
              <img
                src={note.author.avatar_url}
                alt={note.author.username || 'author'}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-mention-text/20 text-mention-text flex items-center justify-center text-[10px] font-bold">
                {(note.author.full_name || note.author.username || 'T')[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-ink leading-tight">{note.author.full_name || note.author.username}</p>
              <p className="text-[11px] font-mono text-ink-muted">@{note.author.username}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content Section */}
      <div className="flex-1 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider">Content</h4>
            {isOwner && !isEditing && (
              <button
                onClick={handleStartEdit}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
              >
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-36 p-3 text-xs sm:text-sm bg-canvas rounded-xl hairline-border text-ink focus:outline-none focus:border-primary resize-none font-sans"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs text-ink-muted hover:text-ink cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-xl shadow-subtle flex items-center gap-1 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-canvas rounded-xl hairline-border text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans">
              {note.content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '').trim()}
            </div>
          )}
        </div>

        {/* Attached Images Lightbox Grid */}
        {imageUrls.length > 0 && (
          <div>
            <h4 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-2 flex items-center gap-1">
              <ImageIcon className="w-3 h-3 text-primary" /> Attached Media ({imageUrls.length})
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {imageUrls.map((url, i) => (
                <div
                  key={i}
                  onClick={() => setActiveLightBoxUrl(url)}
                  className="relative group rounded-xl overflow-hidden border hairline-border bg-canvas aspect-square cursor-pointer hover:opacity-90 transition-opacity"
                >
                  <img src={url} alt="Attachment" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider flex items-center gap-1">
              <TagIcon className="w-3 h-3 text-primary" /> Tags
            </h4>
            {isOwner && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRequestAISuggestions}
                  disabled={isSuggestingTags}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  title="Ask AI to suggest tags"
                >
                  {isSuggestingTags ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>Suggest</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddTag(!showAddTag)}
                  className="text-[11px] text-ink-muted hover:text-ink flex items-center gap-0.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Tag
                </button>
              </div>
            )}
          </div>

          {/* AI Suggestions Row */}
          {suggestedTags.length > 0 && (
            <div className="mb-2 p-2 rounded-xl bg-primary-light/40 hairline-border">
              <span className="text-[10px] font-semibold text-primary block mb-1">Click to add AI tag:</span>
              <div className="flex flex-wrap gap-1">
                {suggestedTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTagToNote(tag)}
                    className="px-2 py-0.5 text-[10px] font-medium bg-surface hover:bg-primary hover:text-white text-primary rounded-lg hairline-border transition-colors cursor-pointer"
                  >
                    + #{tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showAddTag && isOwner && (
            <form onSubmit={(e) => { e.preventDefault(); handleAddTagToNote(); }} className="flex gap-1.5 mb-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="tag-name"
                autoFocus
                className="flex-1 px-2.5 py-1 text-xs rounded-lg hairline-border bg-canvas text-ink focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold text-white bg-primary rounded-lg shadow-subtle cursor-pointer"
              >
                Add
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-1.5">
            {note.tags.length === 0 ? (
              <span className="text-xs text-ink-subtle italic">No tags</span>
            ) : (
              note.tags.map((t) => (
                <div key={t.id} className="relative group">
                  <TagChip tag={t} />
                  {isOwner && (
                    <button
                      onClick={() => handleRemoveTag(t.name)}
                      className="ml-1 text-[10px] text-ink-subtle hover:text-status-error cursor-pointer"
                      title="Remove tag"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Teammates Mentioned Section */}
        <div>
          <h4 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <UsersIcon className="w-3 h-3 text-mention-text" /> Teammates Mentioned
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {note.mentions.length === 0 ? (
              <span className="text-xs text-ink-subtle italic">No teammates tagged</span>
            ) : (
              note.mentions.map((m) => (
                <MentionChip key={m.id} mention={m} />
              ))
            )}
          </div>

          {/* Quick Mention Picker for note owner */}
          {isOwner && (
            <div className="pt-2">
              <span className="text-[10px] text-ink-subtle block mb-1">Tag a teammate:</span>
              <div className="flex flex-wrap gap-1">
                {teammates
                  .filter((u) => !note.mentions.some((m) => m.username.toLowerCase() === u.username?.toLowerCase()))
                  .map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleAddMentionToNote(u.username || '')}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-canvas hover:bg-hairline text-ink-muted hover:text-ink hairline-border transition-colors cursor-pointer"
                    >
                      + @{u.username}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Timestamps */}
        <div className="pt-3 hairline-t text-xs text-ink-subtle space-y-1">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span>Captured {formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Footer Delete Action (Owner Only) */}
      {isOwner && (
        <div className="pt-4 mt-auto hairline-t flex justify-end">
          <button
            onClick={() => setIsConfirmDeleteOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-status-error hover:bg-status-error/10 rounded-xl transition-colors font-medium cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Thought
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside className="hidden xl:block w-72 h-[calc(100vh-57px)] sticky top-[57px] hairline-l shrink-0">
        {panelContent}
      </aside>

      {/* Mobile/Tablet Slide-over Drawer */}
      <div className="fixed inset-0 z-50 xl:hidden flex justify-end">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
        <div className="relative w-80 max-w-[85vw] h-full bg-surface shadow-2xl z-50 animate-slide-left">
          {panelContent}
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {activeLightBoxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              onClick={() => setActiveLightBoxUrl(null)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={activeLightBoxUrl}
              alt="Expanded Preview"
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title="Delete Thought"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-normal">
            Are you sure you want to delete this thought? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsConfirmDeleteOpen(false)}
              className="px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
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
