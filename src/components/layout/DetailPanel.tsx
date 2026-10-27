import React, { useState, useRef } from 'react';
import { Note, User, Tag } from '../../lib/types';
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
  Maximize2,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { api } from '../../lib/api';

interface AttachedImage {
  id: string;
  url: string;
  uploading?: boolean;
}

interface DetailPanelProps {
  note: Note | null;
  currentUserId?: string;
  currentUsername?: string;
  onClose: () => void;
  onDeleteNote: (id: string) => void;
  onToggleComplete?: (id: string, isCompleted: boolean, username?: string) => Promise<boolean> | void;
  onUpdateNote: (
    id: string,
    newContent: string,
    manualTags?: string[],
    reminderAt?: string | null,
    isCompleted?: boolean
  ) => Promise<{ note?: Note; error?: string }>;
  teammates: User[];
  allTags?: Tag[];
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const DetailPanel = React.memo<DetailPanelProps>(({
  note,
  currentUserId,
  currentUsername,
  onClose,
  onDeleteNote,
  onToggleComplete,
  onUpdateNote,
  teammates,
  allTags = [],
  onAddToast,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editAttachedImages, setEditAttachedImages] = useState<AttachedImage[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals & confirmation dialogs
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [isConfirmRemoveTagOpen, setIsConfirmRemoveTagOpen] = useState(false);
  const [tagToRemove, setTagToRemove] = useState<string | null>(null);
  const [isConfirmRemoveImageOpen, setIsConfirmRemoveImageOpen] = useState(false);
  const [imageToRemove, setImageToRemove] = useState<{ url: string; id?: string } | null>(null);
  const [activeLightBoxUrl, setActiveLightBoxUrl] = useState<string | null>(null);

  const [newTagInput, setNewTagInput] = useState('');
  const [showAddTag, setShowAddTag] = useState(false);

  // On-Demand AI Tag Suggestions inside Detail Panel
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  // Deadline & Reminder State for View & Edit Modes
  const [editReminderAt, setEditReminderAt] = useState<string | null>(null);
  const [editIsCompleted, setEditIsCompleted] = useState<boolean>(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [panelReminderDay, setPanelReminderDay] = useState<'today' | 'tomorrow' | 'in_2_days' | 'custom'>('today');
  const [panelCustomDate, setPanelCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [panelReminderTime, setPanelReminderTime] = useState<'09:00' | '12:00' | '14:00' | '18:00' | '21:00' | 'in_1hr' | 'custom'>('18:00');
  const [panelCustomTime, setPanelCustomTime] = useState('18:00');

  const computePanelDate = (
    day: 'today' | 'tomorrow' | 'in_2_days' | 'custom',
    customDateStr: string,
    timePreset: '09:00' | '12:00' | '14:00' | '18:00' | '21:00' | 'in_1hr' | 'custom',
    customTimeStr: string
  ): Date => {
    const now = new Date();
    if (timePreset === 'in_1hr') {
      return new Date(now.getTime() + 60 * 60 * 1000);
    }
    const target = new Date();
    if (day === 'today') {
      // today
    } else if (day === 'tomorrow') {
      target.setDate(target.getDate() + 1);
    } else if (day === 'in_2_days') {
      target.setDate(target.getDate() + 2);
    } else if (day === 'custom' && customDateStr) {
      const parts = customDateStr.split('-').map(Number);
      if (parts.length === 3) {
        target.setFullYear(parts[0], parts[1] - 1, parts[2]);
      }
    }
    const timeVal = timePreset === 'custom' ? customTimeStr : timePreset;
    const [hh, mm] = (timeVal || '18:00').split(':').map(Number);
    target.setHours(hh || 0, mm || 0, 0, 0);
    return target;
  };

  const getPanelPreviewText = () => {
    const d = computePanelDate(panelReminderDay, panelCustomDate, panelReminderTime, panelCustomTime);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dayStr = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${dayStr} at ${timeStr}`;
  };

  const isOwner = !currentUserId || !note ? true : note.user_id === currentUserId;

  // Multi-assignee collaborative task completion: author + all mentioned teammates
  const participants = React.useMemo(() => {
    if (!note?.reminder_at) return [];
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
  }, [note?.reminder_at, note?.author, note?.mentions, isOwner, currentUsername]);

  const completedList = (note?.completed_by || []).map((u) => u.toLowerCase().replace(/^@/, ''));
  const isCurrentDone = currentUsername
    ? (completedList.includes(currentUsername.toLowerCase().replace(/^@/, '')) || (Boolean(note?.is_completed) && participants.length <= 1))
    : Boolean(note?.is_completed);

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

  // Extract embedded image URLs from current note
  const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp|gif))/gi;
  const imageUrls: string[] = [];
  let m;
  const regexClone = new RegExp(imageRegex.source, 'gi');
  while ((m = regexClone.exec(note.content)) !== null) {
    const url = m[1] || m[2];
    if (url && !imageUrls.includes(url)) imageUrls.push(url);
  }

  // Prior tags available in workspace that are not yet attached to this note
  const priorAvailableTags = allTags.filter(
    (t) => !(note.tags || []).some((nt) => nt.name.toLowerCase() === t.name.toLowerCase())
  );

  const handleStartEdit = () => {
    if (!isOwner) return;
    // Separate plain text from markdown image links
    const textWithoutImages = note.content
      .replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '')
      .trim();
    setEditContent(textWithoutImages);
    setEditReminderAt(note.reminder_at || null);
    setEditIsCompleted(Boolean(note.is_completed));

    // Initialize existing attached images
    setEditAttachedImages(
      imageUrls.map((url, idx) => ({
        id: `img-init-${idx}-${Date.now()}`,
        url,
        uploading: false,
      }))
    );
    setIsEditing(true);
  };

  const getPresetDate = (type: 'today_6pm' | 'tonight_9pm' | 'tomorrow_9am' | 'in_1hr') => {
    const d = new Date();
    if (type === 'in_1hr') {
      d.setHours(d.getHours() + 1);
    } else if (type === 'today_6pm') {
      d.setHours(18, 0, 0, 0);
      if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1);
      }
    } else if (type === 'tonight_9pm') {
      d.setHours(21, 0, 0, 0);
      if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1);
      }
    } else if (type === 'tomorrow_9am') {
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
    }
    return d.toISOString();
  };

  const handleToggleComplete = async (targetUser?: string, explicitState?: boolean) => {
    if (!note) return;
    const u = targetUser || currentUsername;
    const nextCompleted = explicitState !== undefined ? explicitState : !isCurrentDone;
    if (onToggleComplete) {
      await onToggleComplete(note.id, nextCompleted, u);
      onAddToast(nextCompleted ? `Marked done for @${u || 'you'}! ✓` : `Marked pending for @${u || 'you'}.`, 'info');
    } else {
      const res = await onUpdateNote(
        note.id,
        note.content,
        undefined,
        note.reminder_at,
        nextCompleted
      );
      if (!res.error) {
        onAddToast(nextCompleted ? 'Task marked as completed! ✓' : 'Task marked active.', 'info');
      }
    }
  };

  const handleSetQuickReminder = async (isoString: string | null) => {
    if (!isOwner) return;
    const res = await onUpdateNote(
      note.id,
      note.content,
      undefined,
      isoString,
      note.is_completed
    );
    if (!res.error) {
      setShowReminderPicker(false);
      onAddToast(isoString ? 'Deadline reminder updated!' : 'Reminder cleared.', 'info');
    }
  };

  // Upload an image file to Cloudinary for this note
  const uploadImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onAddToast('Please select a valid image file (PNG, JPG, WebP).', 'error');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      onAddToast('Image size should be less than 8 MB.', 'error');
      return;
    }

    const tempId = 'edit-img-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setEditAttachedImages((prev) => [...prev, { id: tempId, url: '', uploading: true }]);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await api.uploadImage(base64Data);

        if (res.error || !res.url) {
          setEditAttachedImages((prev) => prev.filter((img) => img.id !== tempId));
          onAddToast(res.error || 'Failed to upload image.', 'error');
        } else {
          setEditAttachedImages((prev) =>
            prev.map((img) => (img.id === tempId ? { id: tempId, url: res.url!, uploading: false } : img))
          );
          onAddToast('Image attached to note!', 'success');
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setEditAttachedImages((prev) => prev.filter((img) => img.id !== tempId));
      onAddToast('Failed to read image file.', 'error');
    }
  };

  const handleMultipleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach((f) => uploadImageFile(f));
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items || []);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          uploadImageFile(file);
        }
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      files.forEach((f) => uploadImageFile(f));
    }
  };

  const handleSaveEdit = async () => {
    const isUploading = editAttachedImages.some((img) => img.uploading);
    if (isUploading) {
      onAddToast('Please wait for image uploads to complete before saving.', 'info');
      return;
    }

    const trimmedText = editContent.trim();
    const validImages = editAttachedImages.filter((img) => img.url);

    if (!trimmedText && validImages.length === 0) {
      onAddToast('Note content cannot be empty.', 'error');
      return;
    }

    // Reconstruct full content with image markdown tags
    const imageMarkdown = validImages.map((img) => `\n![image](${img.url})`).join('');
    const fullContent = (trimmedText + imageMarkdown).trim();

    const res = await onUpdateNote(
      note.id,
      fullContent,
      undefined,
      editReminderAt,
      editIsCompleted
    );
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
      const existing = new Set((note.tags || []).map((t) => t.name.toLowerCase()));
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

  const handleConfirmRemoveTag = async () => {
    if (!isOwner || !tagToRemove) return;

    const regex = new RegExp(`(?:^|\\s)#${tagToRemove}\\b`, 'gi');
    const updatedContent = note.content.replace(regex, '').trim();

    if (!updatedContent) {
      onAddToast('Cannot remove tag: thought would be empty. Delete the thought instead.', 'error');
      setIsConfirmRemoveTagOpen(false);
      setTagToRemove(null);
      return;
    }

    const res = await onUpdateNote(note.id, updatedContent);
    setIsConfirmRemoveTagOpen(false);
    setTagToRemove(null);

    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      onAddToast(`Removed tag #${tagToRemove}`, 'info');
    }
  };

  const handleConfirmRemoveImage = async () => {
    if (!imageToRemove) return;

    if (isEditing) {
      // In edit mode: remove from attachedImages draft
      setEditAttachedImages((prev) =>
        prev.filter((img) => img.id !== imageToRemove.id && img.url !== imageToRemove.url)
      );
      setIsConfirmRemoveImageOpen(false);
      setImageToRemove(null);
      onAddToast('Image removed from draft.', 'info');
    } else {
      // In view mode: immediately remove markdown from note content
      if (!isOwner) return;
      const targetUrl = imageToRemove.url;
      const urlEscaped = targetUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const imgRegex = new RegExp(`!\\[.*?\\]\\(${urlEscaped}\\)|${urlEscaped}`, 'gi');
      const updatedContent = note.content.replace(imgRegex, '').trim();

      const res = await onUpdateNote(note.id, updatedContent);
      setIsConfirmRemoveImageOpen(false);
      setImageToRemove(null);

      if (res.error) {
        onAddToast(res.error, 'error');
      } else {
        onAddToast('Image removed from thought.', 'info');
      }
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

  const reminderDate = note.reminder_at ? new Date(
    (note.reminder_at.endsWith('Z') || note.reminder_at.includes('+'))
      ? note.reminder_at
      : note.reminder_at + 'Z'
  ) : null;
  const isOverdue = reminderDate ? reminderDate.getTime() < Date.now() && !note.is_completed : false;
  const formattedReminder = reminderDate ? reminderDate.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) : null;

  const panelContent = (
    <div className="flex flex-col h-full bg-surface p-4.5 select-none overflow-y-auto overflow-x-hidden max-w-full">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleMultipleFilesSelected}
        accept="image/*"
        multiple
        className="hidden"
      />

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
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-ink-muted hover:text-ink hover:bg-canvas active:bg-hairline transition-colors cursor-pointer"
          title="Close Inspector"
          aria-label="Close Inspector"
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
                referrerPolicy="no-referrer"
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
                <Edit2 className="w-3 h-3" /> Edit Thought
              </button>
            )}
          </div>

          {isEditing ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`space-y-2 p-2 rounded-xl transition-all ${isDraggingOver ? 'border border-primary bg-primary-light/10' : ''
                }`}
            >
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onPaste={handlePaste}
                placeholder="Edit thought... drag or paste images directly..."
                className="w-full h-36 p-3 text-base sm:text-sm bg-canvas rounded-xl hairline-border text-ink focus:outline-none focus:border-primary resize-none font-sans"
              />

              {/* Edit Mode Attached Media Previews */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider flex items-center gap-1">
                    <ImageIcon className="w-3 h-3 text-primary" /> Attached Images ({editAttachedImages.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Plus className="w-3 h-3" /> Add Image
                  </button>
                </div>

                {editAttachedImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {editAttachedImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative group rounded-xl overflow-hidden border hairline-border bg-canvas aspect-square flex items-center justify-center"
                      >
                        {img.uploading ? (
                          <div className="flex flex-col items-center justify-center text-primary text-[10px] gap-1 p-1">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Uploading...</span>
                          </div>
                        ) : (
                          <>
                            <img src={img.url} alt="Attached" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => {
                                setImageToRemove({ url: img.url, id: img.id });
                                setIsConfirmRemoveImageOpen(true);
                              }}
                              className="absolute top-1 right-1 bg-black/75 hover:bg-status-error text-white rounded-full p-1 transition-colors shadow-md cursor-pointer"
                              title="Remove image"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Edit Mode Reminder & Deadline Setting */}
              <div className="pt-2 hairline-t space-y-2 max-w-full overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-rose-500" /> Deadline / Reminder
                  </span>
                  {editReminderAt && (
                    <button
                      type="button"
                      onClick={() => setEditReminderAt(null)}
                      className="text-[10px] text-status-error hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {editReminderAt ? (
                  <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-rose-500/10 hairline-border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs">
                    <span className="truncate">
                      🔔 {new Date(editReminderAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditReminderAt(null)}
                      className="text-[10px] text-status-error ml-2 cursor-pointer hover:underline shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-ink-subtle">Set quick deadline:</span>
                    <div className="grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditReminderAt(getPresetDate('today_6pm'))}
                        className="text-[10px] px-2 py-1 rounded-lg bg-canvas hover:bg-hairline text-ink hairline-border cursor-pointer text-center"
                      >
                        Today 6 PM
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditReminderAt(getPresetDate('tomorrow_9am'))}
                        className="text-[10px] px-2 py-1 rounded-lg bg-canvas hover:bg-hairline text-ink hairline-border cursor-pointer text-center"
                      >
                        Tomorrow 9 AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditReminderAt(getPresetDate('in_1hr'))}
                        className="text-[10px] px-2 py-1 rounded-lg bg-canvas hover:bg-hairline text-ink hairline-border cursor-pointer text-center"
                      >
                        In 1 Hour
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditReminderAt(getPresetDate('tonight_9pm'))}
                        className="text-[10px] px-2 py-1 rounded-lg bg-canvas hover:bg-hairline text-ink hairline-border cursor-pointer text-center"
                      >
                        Tonight 9 PM
                      </button>
                    </div>
                  </div>
                )}

                <label className="flex items-center gap-2 pt-1 text-xs text-ink cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editIsCompleted}
                    onChange={(e) => setEditIsCompleted(e.target.checked)}
                    className="rounded text-primary focus:ring-0 cursor-pointer"
                  />
                  <span>Mark as Completed Task</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
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
                  <Check className="w-3.5 h-3.5" /> Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-canvas rounded-xl hairline-border text-xs sm:text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans">
              {note.content.replace(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/g, '').trim()}
            </div>
          )}
        </div>

        {/* Attached Images Lightbox Grid (View Mode) */}
        {!isEditing && imageUrls.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider flex items-center gap-1">
                <ImageIcon className="w-3 h-3 text-primary" /> Attached Media ({imageUrls.length})
              </h4>
              {isOwner && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                >
                  <Plus className="w-3 h-3" /> Add Image
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {imageUrls.map((url, i) => (
                <div
                  key={i}
                  className="relative group rounded-xl overflow-hidden border hairline-border bg-canvas aspect-square"
                >
                  <img
                    src={url}
                    alt="Attachment"
                    onClick={() => setActiveLightBoxUrl(url)}
                    className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex items-center justify-center">
                    <Maximize2 className="w-5 h-5 text-white/90" />
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImageToRemove({ url });
                        setIsConfirmRemoveImageOpen(true);
                      }}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/70 hover:bg-status-error text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow-md"
                      title="Remove image from thought"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deadline & Task Management Section (View Mode) */}
        {!isEditing && (
          <div className="p-3 rounded-2xl bg-canvas hairline-border shadow-subtle space-y-2 max-w-full overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider">
                  Deadline & Task
                </span>
              </div>
              {isOwner && note.reminder_at && (
                <button
                  type="button"
                  onClick={() => handleSetQuickReminder(null)}
                  className="text-[10px] text-ink-muted hover:text-status-error transition-colors cursor-pointer"
                  title="Remove reminder"
                >
                  Clear
                </button>
              )}
            </div>

            {note.reminder_at ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold truncate ${note.is_completed
                        ? 'text-status-success'
                        : isOverdue
                          ? 'text-rose-600 dark:text-rose-400 font-bold'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}>
                      {note.is_completed
                        ? '✓ All Assignees Completed Task'
                        : isOverdue
                          ? `⚠️ Overdue (${formattedReminder})`
                          : `⏰ Due: ${formattedReminder}`}
                    </p>
                    <p className="text-[10px] text-ink-subtle">
                      {note.is_completed
                        ? 'Task completed by all assignees.'
                        : `${completedList.length}/${participants.length} assignees completed.`}
                    </p>
                  </div>
                </div>

                {/* Participant Badges & Collaborative Action Buttons */}
                {participants.length > 0 && (
                  <div className="pt-2 hairline-t space-y-1.5">
                    <span className="text-[9px] font-bold text-ink-subtle uppercase tracking-wider block">
                      Assignee Status:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {participants.map((p) => {
                        const isDone = completedList.includes(p.username);
                        if (isDone) {
                          return (
                            <div
                              key={p.username}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border hairline-border border-emerald-500/30"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 stroke-[3]" />
                              <span>Done by @{p.username}</span>
                              {(p.isCurrent || isOwner) && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleComplete(p.username, false)}
                                  className="text-[10px] text-emerald-700/80 hover:text-emerald-950 dark:text-emerald-300/80 dark:hover:text-white underline cursor-pointer ml-1"
                                  title="Mark pending"
                                >
                                  undo
                                </button>
                              )}
                            </div>
                          );
                        }

                        if (p.isCurrent || isOwner) {
                          return (
                            <button
                              key={p.username}
                              type="button"
                              onClick={() => handleToggleComplete(p.username, true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-surface hover:bg-emerald-600 hover:text-white text-ink border hairline-border border-emerald-500/40 hover:border-emerald-600 shadow-subtle transition-all cursor-pointer active:scale-95 min-h-[34px]"
                              title={`Mark done as @${p.username}`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Mark done as @${p.username}</span>
                            </button>
                          );
                        }

                        return (
                          <span
                            key={p.username}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-medium bg-canvas text-ink-muted border hairline-border border-hairline/60"
                          >
                            <Clock className="w-3 h-3 text-ink-subtle" />
                            <span>@{p.username} (Pending)</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Reschedule Presets */}
                {isOwner && (
                  <div className="pt-1.5 hairline-t flex flex-wrap gap-1">
                    <span className="text-[9px] text-ink-subtle w-full font-medium">Quick Reschedule:</span>
                    <button
                      type="button"
                      onClick={() => handleSetQuickReminder(getPresetDate('today_6pm'))}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-surface hover:bg-primary-light/50 text-ink-muted hover:text-ink hairline-border cursor-pointer transition-colors"
                    >
                      Today 6 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickReminder(getPresetDate('tomorrow_9am'))}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-surface hover:bg-primary-light/50 text-ink-muted hover:text-ink hairline-border cursor-pointer transition-colors"
                    >
                      Tomorrow 9 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReminderPicker(!showReminderPicker)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg hairline-border cursor-pointer transition-colors ${showReminderPicker
                          ? 'bg-primary text-white border-primary font-semibold'
                          : 'bg-surface hover:bg-primary-light/50 text-ink-muted hover:text-ink'
                        }`}
                    >
                      Custom...
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-ink-subtle">
                  No deadline set. Set an alert to receive a phone and desktop notification when this thought needs action.
                </p>
                {isOwner && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSetQuickReminder(getPresetDate('today_6pm'))}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold cursor-pointer transition-colors"
                    >
                      + Today 6 PM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickReminder(getPresetDate('tomorrow_9am'))}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 font-semibold cursor-pointer transition-colors"
                    >
                      + Tomorrow 9 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReminderPicker(!showReminderPicker)}
                      className={`text-[10px] px-2.5 py-1 rounded-lg hairline-border cursor-pointer transition-colors ${showReminderPicker
                          ? 'bg-primary text-white border-primary font-semibold'
                          : 'bg-surface hover:bg-primary-light/50 text-ink-muted hover:text-ink'
                        }`}
                    >
                      + Custom Date...
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Custom Button-Driven Reminder Selector (Never overflows w-72) */}
            {showReminderPicker && isOwner && (
              <div className="pt-2 hairline-t space-y-2 animate-slide-up text-ink">
                <div>
                  <span className="text-[9px] uppercase font-bold text-ink-subtle tracking-wider block mb-1">
                    1. Choose Day
                  </span>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => setPanelReminderDay('today')}
                      className={`px-2 py-1 text-[11px] font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${panelReminderDay === 'today'
                          ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                          : 'bg-surface hover:bg-hairline text-ink'
                        }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelReminderDay('tomorrow')}
                      className={`px-2 py-1 text-[11px] font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${panelReminderDay === 'tomorrow'
                          ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                          : 'bg-surface hover:bg-hairline text-ink'
                        }`}
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelReminderDay('in_2_days')}
                      className={`px-2 py-1 text-[11px] font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${panelReminderDay === 'in_2_days'
                          ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                          : 'bg-surface hover:bg-hairline text-ink'
                        }`}
                    >
                      In 2 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanelReminderDay('custom')}
                      className={`px-2 py-1 text-[11px] font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${panelReminderDay === 'custom'
                          ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                          : 'bg-surface hover:bg-hairline text-ink'
                        }`}
                    >
                      Pick Date...
                    </button>
                  </div>
                  {panelReminderDay === 'custom' && (
                    <input
                      type="date"
                      value={panelCustomDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setPanelCustomDate(e.target.value)}
                      className="mt-1 w-full px-2 py-1 text-xs rounded-lg bg-surface hairline-border text-ink focus:outline-none focus:border-primary"
                    />
                  )}
                </div>

                <div>
                  <span className="text-[9px] uppercase font-bold text-ink-subtle tracking-wider block mb-1">
                    2. Choose Time
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { label: '9 AM', val: '09:00' },
                      { label: '12 PM', val: '12:00' },
                      { label: '2 PM', val: '14:00' },
                      { label: '6 PM', val: '18:00' },
                      { label: '9 PM', val: '21:00' },
                      { label: '+1h', val: 'in_1hr' },
                    ].map((t) => (
                      <button
                        key={t.val}
                        type="button"
                        onClick={() => setPanelReminderTime(t.val as any)}
                        className={`px-1.5 py-1 text-[11px] font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${panelReminderTime === t.val
                            ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                            : 'bg-surface hover:bg-hairline text-ink'
                          }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPanelReminderTime('custom')}
                      className={`text-[10px] px-2 py-0.5 rounded-lg hairline-border cursor-pointer transition-colors ${panelReminderTime === 'custom'
                          ? 'bg-primary-light text-primary border-primary font-semibold'
                          : 'bg-surface text-ink-muted hover:text-ink'
                        }`}
                    >
                      Custom Time...
                    </button>
                    {panelReminderTime === 'custom' && (
                      <input
                        type="time"
                        value={panelCustomTime}
                        onChange={(e) => setPanelCustomTime(e.target.value)}
                        className="flex-1 max-w-[110px] px-1.5 py-0.5 text-xs rounded-lg bg-surface hairline-border text-ink focus:outline-none focus:border-primary"
                      />
                    )}
                  </div>
                </div>

                <div className="pt-2 hairline-t space-y-1.5">
                  <div className="text-[11px] text-ink flex items-center gap-1">
                    <Clock className="w-3 h-3 text-rose-500 shrink-0" />
                    <span className="text-ink-muted">Set for:</span>
                    <strong className="text-ink truncate">{getPanelPreviewText()}</strong>
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowReminderPicker(false)}
                      className="px-2.5 py-1 text-xs text-ink-muted hover:text-ink cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = computePanelDate(panelReminderDay, panelCustomDate, panelReminderTime, panelCustomTime);
                        handleSetQuickReminder(d.toISOString());
                        setShowReminderPicker(false);
                      }}
                      className="px-3 py-1 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-95 rounded-lg shadow-subtle flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Check className="w-3 h-3" />
                      <span>Set Reminder</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
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
            {(note.tags || []).length === 0 ? (
              <span className="text-xs text-ink-subtle italic">No tags</span>
            ) : (
              (note.tags || []).map((t) => (
                <div key={t.id} className="relative group">
                  <TagChip tag={t} />
                  {isOwner && (
                    <button
                      onClick={() => {
                        setTagToRemove(t.name);
                        setIsConfirmRemoveTagOpen(true);
                      }}
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

          {/* Prior Tags Quick-Pick Section */}
          {isOwner && priorAvailableTags.length > 0 && (
            <div className="mt-2.5 pt-2 hairline-t">
              <span className="text-[10px] text-ink-subtle block mb-1 font-semibold uppercase tracking-wider">
                Prior Tags in Workspace:
              </span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-1">
                {priorAvailableTags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleAddTagToNote(t.name)}
                    className="text-[10px] px-2 py-0.5 rounded-lg bg-canvas hover:bg-primary-light/60 text-ink-muted hover:text-primary hairline-border transition-colors cursor-pointer flex items-center gap-1"
                    title={`Click to add #${t.name} to this note`}
                  >
                    <span>+ #{t.name}</span>
                    {t.count !== undefined && (
                      <span className="text-[9px] opacity-60 font-mono">({t.count})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Teammates Mentioned Section */}
        <div>
          <h4 className="text-[10px] font-bold text-ink-subtle uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <UsersIcon className="w-3 h-3 text-mention-text" /> Teammates Mentioned
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {(note.mentions || []).length === 0 ? (
              <span className="text-xs text-ink-subtle italic">No teammates tagged</span>
            ) : (
              (note.mentions || []).map((m) => (
                <MentionChip key={m.id} mention={m} />
              ))
            )}
          </div>

          {/* Quick Mention Picker for note owner */}
          {isOwner && (
            <div className="pt-2">
              <span className="text-[10px] text-ink-subtle block mb-1 font-semibold uppercase tracking-wider">
                Tag a teammate:
              </span>
              <div className="flex flex-wrap gap-1">
                {teammates
                  .filter((u) => !(note.mentions || []).some((m) => m.username.toLowerCase() === u.username?.toLowerCase()))
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
        <div className="relative w-full max-w-[92vw] sm:w-84 sm:max-w-[85vw] h-full bg-surface shadow-2xl z-50 animate-slide-left">
          {panelContent}
        </div>
      </div>

      {/* Image Lightbox Modal */}
      {activeLightBoxUrl && (
        <div
          className="fixed inset-0 z-[10000] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setActiveLightBoxUrl(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setActiveLightBoxUrl(null)}
              className="absolute -top-11 right-0 min-h-[40px] min-w-[40px] flex items-center justify-center p-2 text-white/90 hover:text-white bg-black/40 rounded-full cursor-pointer"
              aria-label="Close image preview"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={activeLightBoxUrl}
              alt="Expanded Preview"
              className="max-h-[80vh] max-w-full object-contain rounded-2xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Delete Thought Confirmation Modal */}
      <Modal
        isOpen={isConfirmDeleteOpen}
        onClose={() => setIsConfirmDeleteOpen(false)}
        title="Delete Thought"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-normal">
            Are you sure you want to delete this thought? This action will permanently remove the note and its attached media.
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

      {/* Remove Tag Confirmation Modal */}
      <Modal
        isOpen={isConfirmRemoveTagOpen}
        onClose={() => {
          setIsConfirmRemoveTagOpen(false);
          setTagToRemove(null);
        }}
        title="Remove Tag"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-normal">
            Are you sure you want to remove tag <strong className="text-primary font-mono">#{tagToRemove}</strong> from this thought?
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsConfirmRemoveTagOpen(false);
                setTagToRemove(null);
              }}
              className="px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemoveTag}
              className="px-4 py-2 text-xs font-medium text-white bg-status-error hover:bg-red-700 rounded-xl transition-colors cursor-pointer"
            >
              Remove Tag
            </button>
          </div>
        </div>
      </Modal>

      {/* Remove Image Confirmation Modal */}
      <Modal
        isOpen={isConfirmRemoveImageOpen}
        onClose={() => {
          setIsConfirmRemoveImageOpen(false);
          setImageToRemove(null);
        }}
        title="Remove Image Attachment"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink leading-normal">
            Are you sure you want to remove this image from this thought?
          </p>
          {imageToRemove?.url && (
            <div className="w-24 h-24 rounded-xl overflow-hidden hairline-border bg-canvas mx-auto">
              <img src={imageToRemove.url} alt="To remove" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsConfirmRemoveImageOpen(false);
                setImageToRemove(null);
              }}
              className="px-3 py-2 text-xs font-medium text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRemoveImage}
              className="px-4 py-2 text-xs font-medium text-white bg-status-error hover:bg-red-700 rounded-xl transition-colors cursor-pointer"
            >
              Remove Image
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
});
