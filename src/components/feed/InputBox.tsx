import React, { useState, useRef, useEffect } from 'react';
import { Tag, User } from '../../lib/types';
import { parseNoteContent } from '../../lib/parser';
import { TagChip, MentionChip } from '../ui/Chip';
import { api } from '../../lib/api';
import { Send, Hash, AtSign, Sparkles, Image as ImageIcon, Loader2, X, Plus, Clock, Bell, Check } from 'lucide-react';

interface InputBoxProps {
  onSaveNote: (
    content: string,
    manualTags?: string[],
    reminderAt?: string | null,
    isCompleted?: boolean
  ) => Promise<{ note?: any; error?: string }>;
  allTags: Tag[];
  allTeammates: User[];
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  isTaskMode?: boolean;
}

interface AttachedImage {
  id: string;
  url: string;
  uploading?: boolean;
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSaveNote,
  allTags,
  allTeammates,
  onAddToast,
  isTaskMode = false,
}) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Attached images
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  // Interactive On-Demand AI Tag Suggestions
  const [isSuggestingTags, setIsSuggestingTags] = useState(false);
  const [suggestedAITags, setSuggestedAITags] = useState<string[]>([]);

  // Combobox Autocomplete State
  const [autocompleteMode, setAutocompleteMode] = useState<'tag' | 'mention' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);

  // Reminder & Deadline State
  const [reminderAt, setReminderAt] = useState<string | null>(null);
  const [showReminderBuilder, setShowReminderBuilder] = useState(false);
  const [reminderDay, setReminderDay] = useState<'today' | 'tomorrow' | 'in_2_days' | 'custom'>('today');
  const [reminderCustomDate, setReminderCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [reminderTime, setReminderTime] = useState<'09:00' | '12:00' | '14:00' | '18:00' | '21:00' | 'in_1hr' | 'custom'>('18:00');
  const [reminderCustomTime, setReminderCustomTime] = useState('18:00');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute target Date from current button selections
  const computeReminderDate = (
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
      // Keep today
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

  // Helper to format reminder for display
  const formatReminderBadge = (isoStr: string) => {
    const d = new Date(isoStr);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;
    return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${timeStr}`;
  };

  const getReminderPreviewText = () => {
    const d = computeReminderDate(reminderDay, reminderCustomDate, reminderTime, reminderCustomTime);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const dayStr = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : d.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
    return `${dayStr} at ${timeStr}`;
  };

  const handleConfirmReminder = () => {
    const d = computeReminderDate(reminderDay, reminderCustomDate, reminderTime, reminderCustomTime);
    setReminderAt(d.toISOString());
    setShowReminderBuilder(false);
    onAddToast(`Reminder set for ${getReminderPreviewText()}`, 'info');
  };

  const handleClearReminder = () => {
    setReminderAt(null);
    setShowReminderBuilder(false);
    onAddToast('Reminder removed.', 'info');
  };

  const liveParsed = parseNoteContent(content);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        Math.max(textareaRef.current.scrollHeight, 68),
        360
      )}px`;
    }
  }, [content]);

  // Request interactive AI suggestions for current text
  const handleRequestAISuggestions = async () => {
    if (!content.trim()) {
      onAddToast('Write your thought first, then request AI tag suggestions.', 'info');
      return;
    }

    setIsSuggestingTags(true);
    setSuggestedAITags([]);

    const res = await api.suggestTags(content.trim());
    setIsSuggestingTags(false);

    if (res.error || !res.tags || res.tags.length === 0) {
      onAddToast(res.error || 'No suggestions found.', 'info');
    } else {
      // Filter out tags that are already in the note
      const existing = new Set(liveParsed.tags.map((t) => t.toLowerCase()));
      const filtered = res.tags.filter((t) => !existing.has(t.toLowerCase()));

      if (filtered.length === 0) {
        onAddToast('Your note already includes the suggested tags!', 'info');
      } else {
        setSuggestedAITags(filtered);
        onAddToast('AI tag suggestions ready! Click any tag to add it.', 'success');
      }
    }
  };

  // Add an AI suggested tag into the note content
  const handleAcceptSuggestedTag = (tag: string) => {
    const clean = tag.toLowerCase().trim();
    const separator = content.endsWith(' ') || content.length === 0 ? '' : ' ';
    setContent(`${content}${separator}#${clean} `);
    setSuggestedAITags((prev) => prev.filter((t) => t !== tag));
  };

  // Upload an image file to Cloudinary
  const uploadImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onAddToast('Please select a valid image file (PNG, JPG, WebP).', 'error');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      onAddToast('Image size should be less than 8 MB.', 'error');
      return;
    }

    const tempId = 'img-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setAttachedImages((prev) => [...prev, { id: tempId, url: '', uploading: true }]);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        const res = await api.uploadImage(base64Data);

        if (res.error || !res.url) {
          setAttachedImages((prev) => prev.filter((img) => img.id !== tempId));
          onAddToast(res.error || 'Failed to upload image.', 'error');
        } else {
          setAttachedImages((prev) =>
            prev.map((img) => (img.id === tempId ? { id: tempId, url: res.url!, uploading: false } : img))
          );
          onAddToast('Image attached!', 'success');
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setAttachedImages((prev) => prev.filter((img) => img.id !== tempId));
      onAddToast('Failed to read image file.', 'error');
    }
  };

  const handleMultipleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach((f) => uploadImageFile(f));
    e.target.value = '';
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

  const handleRemoveAttachedImage = (id: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
    onAddToast('Image removed.', 'info');
  };

  // Content change & autocomplete detection
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const caretPos = e.target.selectionStart;
    setContent(val);

    const textBeforeCaret = val.substring(0, caretPos);
    const lastHash = textBeforeCaret.lastIndexOf('#');
    const lastAt = textBeforeCaret.lastIndexOf('@');

    const lastTriggerPos = Math.max(lastHash, lastAt);

    if (lastTriggerPos !== -1 && lastTriggerPos >= textBeforeCaret.length - 32) {
      const char = val[lastTriggerPos];
      const query = textBeforeCaret.substring(lastTriggerPos + 1);

      if (!/\s/.test(query)) {
        setAutocompleteMode(char === '#' ? 'tag' : 'mention');
        setAutocompleteQuery(query.toLowerCase());
        setTriggerIndex(lastTriggerPos);
        return;
      }
    }

    setAutocompleteMode(null);
    setTriggerIndex(null);
  };

  const handleSelectAutocomplete = (itemText: string) => {
    if (triggerIndex === null || !textareaRef.current) return;
    const symbol = autocompleteMode === 'tag' ? '#' : '@';
    const before = content.substring(0, triggerIndex);
    const textAfterCaret = content.substring(textareaRef.current.selectionStart);

    const inserted = `${before}${symbol}${itemText} ${textAfterCaret}`;
    setContent(inserted);

    setAutocompleteMode(null);
    setTriggerIndex(null);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 50);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const hasUploading = attachedImages.some((img) => img.uploading);
    if (hasUploading) {
      onAddToast('Please wait for image uploads to complete.', 'info');
      return;
    }

    const trimmedText = content.trim();
    const validImages = attachedImages.filter((img) => img.url);

    if (!trimmedText && validImages.length === 0) return;
    if (isSubmitting) return;

    const imageMarkdown = validImages.map((img) => `\n![image](${img.url})`).join('');
    const fullContent = (trimmedText + imageMarkdown).trim();

    setIsSubmitting(true);
    const res = await onSaveNote(fullContent, undefined, reminderAt);
    setIsSubmitting(false);

    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      setContent('');
      setAttachedImages([]);
      setSuggestedAITags([]);
      setAutocompleteMode(null);
      setReminderAt(null);
      setShowReminderBuilder(false);
      onAddToast('Thought captured!', 'success');
      if (textareaRef.current) {
        textareaRef.current.style.height = '68px';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  };

  // Filter tag suggestions from user's private tags
  const filteredTagSuggestions = allTags
    .filter((t) => t.name.toLowerCase().includes(autocompleteQuery))
    .slice(0, 8);

  // Filter teammate mentions from real registered team accounts
  const filteredTeammateSuggestions = allTeammates
    .filter(
      (u) =>
        u.username?.toLowerCase().includes(autocompleteQuery) ||
        u.full_name?.toLowerCase().includes(autocompleteQuery)
    )
    .slice(0, 5);

  // Helper to insert trigger character from mobile buttons
  const handleInsertTrigger = (char: '#' | '@') => {
    const separator = content.endsWith(' ') || content.length === 0 ? '' : ' ';
    const newContent = `${content}${separator}${char}`;
    setContent(newContent);
    setAutocompleteMode(char === '#' ? 'tag' : 'mention');
    setAutocompleteQuery('');
    setTriggerIndex(newContent.length - 1);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = newContent.length;
        textareaRef.current.selectionEnd = newContent.length;
      }
    }, 50);
  };

  return (
    <div className="relative mb-6">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleMultipleFilesSelected}
        accept="image/*"
        multiple
        className="hidden"
      />

      <form
        onSubmit={handleSubmit}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`bg-surface rounded-2xl hairline-border transition-all duration-200 shadow-subtle ${
          isFocused ? 'border-primary ring-1 ring-primary/20' : ''
        } ${isDraggingOver ? 'border-primary bg-primary-light/10 ring-2 ring-primary/40' : ''}`}
      >
        <div className="p-3.5 sm:p-4.5">
          {/* Active Reminder Badge */}
          {reminderAt && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 hairline-border border-rose-500/30 text-xs font-medium mb-2.5 shadow-subtle">
              <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Remind me: <strong>{formatReminderBadge(reminderAt)}</strong></span>
              <button
                type="button"
                onClick={() => setShowReminderBuilder(true)}
                className="ml-1 text-[11px] font-semibold text-primary hover:underline cursor-pointer"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => setReminderAt(null)}
                className="ml-0.5 p-0.5 hover:bg-rose-500/20 rounded-md cursor-pointer"
                title="Remove reminder"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => {
              setIsFocused(true);
              if (isTaskMode && !reminderAt) {
                setShowReminderBuilder(true);
              }
            }}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder={
              isTaskMode
                ? "Add a task or deadline... type @name to assign, #tags to categorize..."
                : "Capture a thought... type #tag, tag teammates with @name, paste or drag images..."
            }
            className="w-full min-h-[68px] max-h-[360px] bg-transparent text-ink placeholder:text-ink-subtle text-base sm:text-sm font-sans leading-relaxed focus:outline-none resize-none"
            rows={2}
          />

          {/* Attached Image Previews with Remove Button */}
          {attachedImages.length > 0 && (
            <div className="pt-2 pb-2 flex flex-wrap gap-2 hairline-t">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group rounded-xl overflow-hidden border hairline-border bg-canvas w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center shrink-0"
                >
                  {img.uploading ? (
                    <div className="flex flex-col items-center justify-center text-primary text-[10px] gap-1 p-1">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Uploading...</span>
                    </div>
                  ) : (
                    <>
                      <img src={img.url} alt="Attached Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachedImage(img.id)}
                        className="absolute top-1 right-1 bg-black/70 hover:bg-red-600 text-white rounded-full p-1 transition-colors shadow-md cursor-pointer"
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

          {/* Interactive AI Suggested Tags Banner */}
          {suggestedAITags.length > 0 && (
            <div className="pt-2 pb-2 px-3 my-2 bg-primary-light/30 rounded-xl hairline-border flex flex-wrap items-center gap-2 animate-slide-up">
              <span className="text-[11px] font-semibold text-primary flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> AI Suggestions:
              </span>
              {suggestedAITags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleAcceptSuggestedTag(tag)}
                  className="px-2.5 py-1 text-xs bg-surface hover:bg-primary hover:text-white text-primary rounded-lg hairline-border transition-colors flex items-center gap-1 font-medium shadow-subtle cursor-pointer"
                  title="Click to add to thought"
                >
                  <Plus className="w-3 h-3" /> #{tag}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSuggestedAITags([])}
                className="ml-auto text-[11px] text-ink-muted hover:text-ink cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Live Extracted Chips Bar */}
          {(liveParsed.tags.length > 0 || liveParsed.mentions.length > 0) && (
            <div className="pt-2 pb-1 flex flex-wrap items-center gap-1.5 hairline-t">
              <span className="text-[10px] uppercase font-bold text-ink-subtle tracking-wider mr-1">
                Extracted:
              </span>
              {liveParsed.tags.map((t) => (
                <TagChip key={t} tag={{ id: t, name: t }} />
              ))}
              {liveParsed.mentions.map((m) => (
                <MentionChip key={m} mention={m} />
              ))}
            </div>
          )}

          {/* Inline Button-Driven Reminder Builder - Never overflows screen */}
          {showReminderBuilder && (
            <div className="mt-3 p-3.5 bg-canvas/70 rounded-xl hairline-border space-y-3 animate-slide-up text-ink">
              <div className="flex items-center justify-between pb-2 hairline-b">
                <span className="text-xs font-bold text-ink flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-rose-500" /> Schedule Reminder
                </span>
                <button
                  type="button"
                  onClick={() => setShowReminderBuilder(false)}
                  className="p-1 rounded-lg text-ink-subtle hover:text-ink hover:bg-surface cursor-pointer"
                  title="Close builder"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Step 1: Day selection buttons */}
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-subtle tracking-wider block mb-1.5">
                  1. Choose Day
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReminderDay('today')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${
                      reminderDay === 'today'
                        ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                        : 'bg-surface hover:bg-canvas text-ink'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setReminderDay('tomorrow')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${
                      reminderDay === 'tomorrow'
                        ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                        : 'bg-surface hover:bg-canvas text-ink'
                    }`}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setReminderDay('in_2_days')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${
                      reminderDay === 'in_2_days'
                        ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                        : 'bg-surface hover:bg-canvas text-ink'
                    }`}
                  >
                    In 2 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setReminderDay('custom')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${
                      reminderDay === 'custom'
                        ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                        : 'bg-surface hover:bg-canvas text-ink'
                    }`}
                  >
                    Pick Date...
                  </button>
                </div>

                {reminderDay === 'custom' && (
                  <div className="mt-2">
                    <input
                      type="date"
                      value={reminderCustomDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setReminderCustomDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-surface hairline-border text-ink focus:outline-none focus:border-primary cursor-pointer"
                    />
                  </div>
                )}
              </div>

              {/* Step 2: Time selection buttons */}
              <div>
                <span className="text-[10px] uppercase font-bold text-ink-subtle tracking-wider block mb-1.5">
                  2. Choose Time
                </span>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {[
                    { label: '9:00 AM', val: '09:00' },
                    { label: '12:00 PM', val: '12:00' },
                    { label: '2:00 PM', val: '14:00' },
                    { label: '6:00 PM', val: '18:00' },
                    { label: '9:00 PM', val: '21:00' },
                    { label: '+1 Hour', val: 'in_1hr' },
                  ].map((t) => (
                    <button
                      key={t.val}
                      type="button"
                      onClick={() => setReminderTime(t.val as any)}
                      className={`px-2 py-1.5 text-xs font-medium rounded-lg hairline-border transition-all cursor-pointer text-center ${
                        reminderTime === t.val
                          ? 'bg-primary text-white border-primary shadow-subtle font-semibold'
                          : 'bg-surface hover:bg-canvas text-ink'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setReminderTime('custom')}
                    className={`text-[11px] px-2.5 py-1 rounded-lg hairline-border cursor-pointer transition-colors ${
                      reminderTime === 'custom'
                        ? 'bg-primary-light text-primary border-primary font-semibold'
                        : 'bg-surface text-ink-muted hover:text-ink'
                    }`}
                  >
                    Custom Time...
                  </button>
                  {reminderTime === 'custom' && (
                    <input
                      type="time"
                      value={reminderCustomTime}
                      onChange={(e) => setReminderCustomTime(e.target.value)}
                      className="flex-1 max-w-[160px] px-2 py-1 text-xs rounded-lg bg-surface hairline-border text-ink focus:outline-none focus:border-primary cursor-pointer"
                    />
                  )}
                </div>
              </div>

              {/* Live Preview & Final Save / Cancel Buttons */}
              <div className="pt-2.5 hairline-t flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-ink flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="text-ink-muted text-[11px]">Will remind:</span>
                  <strong className="text-ink font-semibold">{getReminderPreviewText()}</strong>
                </div>

                <div className="flex items-center gap-2 ml-auto">
                  {reminderAt && (
                    <button
                      type="button"
                      onClick={handleClearReminder}
                      className="px-2.5 py-1 text-xs text-status-error hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowReminderBuilder(false)}
                    className="px-3 py-1 text-xs text-ink-muted hover:text-ink cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReminder}
                    className="px-3.5 py-1 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-95 rounded-xl shadow-subtle flex items-center gap-1 cursor-pointer transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Set Reminder</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-3 sm:px-4 py-2.5 bg-canvas/40 hairline-t rounded-b-2xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            {/* Quick helper touch buttons - insert symbol & open autocomplete */}
            <button
              type="button"
              onClick={() => handleInsertTrigger('#')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-canvas hover:bg-surface active:bg-hairline hairline-border text-[11px] text-ink hover:text-primary font-medium transition-colors cursor-pointer"
              title="Add a private #tag"
            >
              <Hash className="w-3 h-3 text-primary" />
              <span>tag</span>
            </button>

            <button
              type="button"
              onClick={() => handleInsertTrigger('@')}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-canvas hover:bg-surface active:bg-hairline hairline-border text-[11px] text-ink hover:text-mention-text font-medium transition-colors cursor-pointer"
              title="Mention a teammate"
            >
              <AtSign className="w-3 h-3 text-mention-text" />
              <span>mention</span>
            </button>

            {/* On-Demand AI Tag Suggestions Button */}
            <button
              type="button"
              onClick={handleRequestAISuggestions}
              disabled={isSuggestingTags || !content.trim()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-primary bg-primary-light/60 hover:bg-primary-light active:scale-95 rounded-lg hairline-border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Analyze text and suggest 3 smart tags"
            >
              {isSuggestingTags ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              <span>Suggest</span>
            </button>

            {/* Attach image button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-surface text-xs text-ink-muted hover:text-ink font-medium transition-colors cursor-pointer"
              title="Add images"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Image</span>
            </button>

            {/* Set Phone/Desktop Reminder Button */}
            <button
              type="button"
              onClick={() => setShowReminderBuilder((prev) => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg hairline-border text-[11px] font-medium transition-all cursor-pointer ${
                reminderAt || showReminderBuilder
                  ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 font-semibold shadow-subtle'
                  : 'bg-canvas hover:bg-surface text-ink hover:text-rose-600'
              }`}
              title="Schedule phone and desktop deadline reminder"
            >
              <Bell className="w-3.5 h-3.5 text-rose-500" />
              <span>{reminderAt ? 'Reminder Set' : 'Remind'}</span>
            </button>

            <span className="hidden md:inline-block text-[11px] text-ink-subtle">
              <kbd className="px-1 py-0.5 bg-surface hairline-border rounded text-[10px] font-mono">Ctrl+Enter</kbd>
            </span>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className={`text-[11px] sm:text-xs ${content.length > 9000 ? 'text-status-error font-bold' : 'text-ink-subtle'}`}>
              {content.length}/10,000
            </span>
            <button
              type="submit"
              disabled={(!content.trim() && attachedImages.length === 0) || isSubmitting}
              className="px-3.5 sm:px-4 py-1.5 min-h-[34px] text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-subtle transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> {isTaskMode ? 'Add Task' : 'Capture'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Combobox Autocomplete Dropdown Popup */}
      {autocompleteMode && (
        <div className="absolute left-4 z-40 bg-surface rounded-xl hairline-border shadow-dropdown py-1.5 w-64 max-w-[calc(100vw-32px)] max-h-48 overflow-y-auto animate-slide-up">
          <div className="px-3 py-1 text-[10px] font-bold text-ink-subtle uppercase tracking-wider hairline-b">
            Suggested {autocompleteMode === 'tag' ? 'Private Tags' : 'Teammates'}
          </div>

          {autocompleteMode === 'tag' && (
            <div>
              {filteredTagSuggestions.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectAutocomplete(t.name)}
                  className="px-3.5 py-2 min-h-[36px] text-xs text-ink hover:bg-canvas active:bg-hairline cursor-pointer flex items-center justify-between"
                >
                  <span className="font-medium">#{t.name}</span>
                  <span className="text-[10px] text-ink-subtle">{t.count || 0} notes</span>
                </div>
              ))}

              {autocompleteQuery.trim().length >= 2 &&
                !filteredTagSuggestions.some((t) => t.name.toLowerCase() === autocompleteQuery.trim().toLowerCase()) && (
                  <div
                    onClick={() => handleSelectAutocomplete(autocompleteQuery.trim())}
                    className="px-3.5 py-2.5 min-h-[38px] text-xs text-primary hover:bg-primary-light active:bg-primary-light cursor-pointer flex items-center gap-1.5 hairline-t"
                  >
                    <Hash className="w-3.5 h-3.5" /> Create new tag #{autocompleteQuery.trim()}
                  </div>
                )}

              {filteredTagSuggestions.length === 0 && autocompleteQuery.trim().length < 2 && (
                <div className="px-3.5 py-2.5 text-xs text-ink-subtle italic">
                  Type 2+ letters to search or create tags...
                </div>
              )}
            </div>
          )}

          {autocompleteMode === 'mention' && (
            <div>
              {filteredTeammateSuggestions.length === 0 ? (
                <div className="px-3.5 py-2.5 min-h-[38px] text-xs text-ink-subtle italic">
                  No teammate handle matching "@{autocompleteQuery}".
                </div>
              ) : (
                filteredTeammateSuggestions.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => handleSelectAutocomplete(u.username || '')}
                    className="px-3.5 py-2 min-h-[36px] text-xs text-ink hover:bg-canvas active:bg-hairline cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-medium flex items-center gap-1.5">
                      <AtSign className="w-3.5 h-3.5 text-mention-text" /> @{u.username}
                    </span>
                    <span className="text-[10px] text-ink-subtle">{u.full_name?.split(' ')[0] || ''}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
