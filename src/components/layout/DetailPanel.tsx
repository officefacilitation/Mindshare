import React, { useState } from 'react';
import { Note, UserContact } from '../../lib/types';
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
  User as UserIcon,
} from 'lucide-react';
import { Modal } from '../ui/Modal';

interface DetailPanelProps {
  note: Note | null;
  onClose: () => void;
  onDeleteNote: (id: string) => void;
  onUpdateNote: (id: string, newContent: string) => Promise<{ note?: Note; error?: string }>;
  allContacts: UserContact[];
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({
  note,
  onClose,
  onDeleteNote,
  onUpdateNote,
  allContacts,
  onAddToast,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);

  const [newTagInput, setNewTagInput] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);

  if (!note) {
    return (
      <aside className="hidden xl:block w-72 h-[calc(100vh-57px)] sticky top-[57px] bg-canvas hairline-l p-6 text-center select-none shrink-0">
        <div className="h-full flex flex-col items-center justify-center text-ink-muted">
          <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center hairline-border mb-3 shadow-subtle">
            <FileText className="w-6 h-6 text-ink-subtle" />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-1">No Thought Selected</h3>
          <p className="text-xs text-ink-muted leading-relaxed max-w-[200px]">
            Click any note card in the center feed to inspect full content, AI tags, and contacts.
          </p>
        </div>
      </aside>
    );
  }

  const handleStartEdit = () => {
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

  const handleAddTagToNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagInput.trim()) return;
    const cleanedTag = newTagInput.trim().replace(/^#/, '').toLowerCase();
    const updatedContent = `${note.content} #${cleanedTag}`;
    const res = await onUpdateNote(note.id, updatedContent);
    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Added tag #${cleanedTag}`, 'success');
      setNewTagInput('');
      setShowAddTag(false);
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    const regex = new RegExp(`(?:^|\\s)#${tagName}\\b`, 'gi');
    const updatedContent = note.content.replace(regex, '').trim();
    await onUpdateNote(note.id, updatedContent || note.content);
    onAddToast(`Removed #${tagName}`, 'info');
  };

  const handleAddMentionToNote = async (username: string) => {
    if (note.mentions.some((m) => m.username.toLowerCase() === username.toLowerCase())) return;
    const updatedContent = `${note.content} @${username}`;
    const res = await onUpdateNote(note.id, updatedContent);
    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Mentioned @${username}`, 'success');
    }
  };

  const handleRemoveMention = async (username: string) => {
    const regex = new RegExp(`(?:^|\\s)@${username}\\b`, 'gi');
    const updatedContent = note.content.replace(regex, '').trim();
    await onUpdateNote(note.id, updatedContent || note.content);
    onAddToast(`Removed @${username}`, 'info');
  };

  const handleConfirmDelete = async () => {
    await onDeleteNote(note.id);
    onAddToast('Thought deleted.', 'info');
    setIsConfirmDeleteOpen(false);
    onClose();
  };

  const formattedDate = new Date(note.created_at).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const panelContent = (
    <div className="flex flex-col h-full p-5 overflow-y-auto bg-surface xl:bg-canvas">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 hairline-b">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5 text-primary" /> Inspector Detail
        </div>
        <div className="flex items-center gap-1">
          {!isEditing ? (
            <button
              onClick={handleStartEdit}
              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-hairline/50 transition-colors"
              title="Edit Thought"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleSaveEdit}
              className="p-1 rounded text-status-success hover:bg-status-success/10 transition-colors"
              title="Save Changes"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-hairline/50 transition-colors"
            title="Close Inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 space-y-5">
        <div>
          <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2">
            Thought Content
          </label>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full min-h-[160px] p-3 text-sm rounded-lg hairline-border bg-canvas text-ink focus:outline-none focus:border-primary font-sans leading-relaxed resize-y"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-2.5 py-1 text-xs text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 text-xs bg-primary text-white font-medium rounded-md hover:bg-primary-hover"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg bg-surface hairline-border text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans select-text">
              {note.content}
            </div>
          )}
        </div>

        {/* Tag Manager */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider flex items-center gap-1">
              <TagIcon className="w-3 h-3" /> Tags ({note.tags.length})
            </label>
            <button
              onClick={() => setShowAddTag(!showAddTag)}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" /> Add Tag
            </button>
          </div>

          {showAddTag && (
            <form onSubmit={handleAddTagToNote} className="mb-2 flex gap-1.5">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="tagname"
                className="flex-1 px-2.5 py-1 text-xs rounded-md hairline-border bg-canvas focus:outline-none focus:border-primary"
                autoFocus
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs bg-primary text-white rounded-md font-medium"
              >
                Add
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-1.5">
            {note.tags.length === 0 ? (
              <span className="text-xs text-ink-subtle italic">No tags linked</span>
            ) : (
              note.tags.map((t) => (
                <TagChip
                  key={t.id}
                  tag={t}
                  onRemove={() => handleRemoveTag(t.name)}
                />
              ))
            )}
          </div>
        </div>

        {/* Mentions / People Manager */}
        <div>
          <label className="block text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <UserIcon className="w-3 h-3" /> Mentioned Contacts ({note.mentions.length})
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {note.mentions.length === 0 ? (
              <span className="text-xs text-ink-subtle italic">No contacts mentioned</span>
            ) : (
              note.mentions.map((m) => (
                <MentionChip
                  key={m.id}
                  mention={m}
                  onRemove={() => handleRemoveMention(m.username)}
                />
              ))
            )}
          </div>

          {/* Quick Mention Picker */}
          <div className="pt-1">
            <span className="text-[10px] text-ink-subtle block mb-1">Quick mention contact:</span>
            <div className="flex flex-wrap gap-1">
              {allContacts
                .filter((c) => !note.mentions.some((m) => m.username.toLowerCase() === c.username.toLowerCase()))
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleAddMentionToNote(c.username)}
                    className="text-[10px] px-2 py-0.5 rounded bg-canvas hover:bg-hairline text-ink-muted hover:text-ink border hairline-border transition-colors"
                  >
                    + @{c.username}
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="pt-3 hairline-t text-xs text-ink-subtle space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-ink-muted" />
            <span>Created {formattedDate}</span>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="pt-4 mt-auto hairline-t flex justify-end">
        <button
          onClick={() => setIsConfirmDeleteOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-status-error hover:bg-status-error/10 rounded-lg transition-colors font-medium active-press"
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete Thought
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Inspector Panel (xl: screens) */}
      <aside className="hidden xl:block w-72 h-[calc(100vh-57px)] sticky top-[57px] hairline-l shrink-0">
        {panelContent}
      </aside>

      {/* Mobile/Tablet Slide-over Drawer (screens < xl) */}
      <div className="fixed inset-0 z-50 xl:hidden flex justify-end">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
        <div className="relative w-80 max-w-[85vw] h-full bg-surface shadow-2xl z-50 animate-slide-left">
          {panelContent}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title="Delete Thought"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-normal">
            Are you sure you want to delete this thought? This action will remove the note and its linked tag relationships.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsConfirmDeleteOpen(false)}
              className="px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs font-medium text-white bg-status-error hover:bg-red-700 rounded-lg transition-colors"
            >
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
