import React, { useState, useRef, useEffect } from 'react';
import { Tag, User } from '../../lib/types';
import { parseNoteContent } from '../../lib/parser';
import { TagChip, MentionChip } from '../ui/Chip';
import { api } from '../../lib/api';
import { Send, Hash, AtSign, Sparkles, Image as ImageIcon, Loader2, X, Plus } from 'lucide-react';

interface InputBoxProps {
  onSaveNote: (content: string, manualTags?: string[]) => Promise<{ note?: any; error?: string }>;
  allTags: Tag[];
  allTeammates: User[];
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (lastTriggerPos !== -1 && lastTriggerPos >= textBeforeCaret.length - 20) {
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
    const res = await onSaveNote(fullContent);
    setIsSubmitting(false);

    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      setContent('');
      setAttachedImages([]);
      setSuggestedAITags([]);
      setAutocompleteMode(null);
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
    .slice(0, 5);

  // Filter teammate mentions from real registered team accounts
  const filteredTeammateSuggestions = allTeammates
    .filter(
      (u) =>
        u.username?.toLowerCase().includes(autocompleteQuery) ||
        u.full_name?.toLowerCase().includes(autocompleteQuery)
    )
    .slice(0, 5);

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
        <div className="p-4 sm:p-4.5">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Capture a thought... type #tag, tag teammates with @name, paste or drag images..."
            className="w-full min-h-[68px] max-h-[360px] bg-transparent text-ink placeholder:text-ink-subtle text-sm sm:text-base font-sans leading-relaxed focus:outline-none resize-none"
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
        </div>

        {/* Footer Actions */}
        <div className="px-3 sm:px-4 py-2.5 bg-canvas/40 hairline-t rounded-b-2xl flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-ink-muted">
            {/* Quick helper buttons */}
            <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
              <Hash className="w-3 h-3 text-primary" /> #topic
            </span>
            <span className="flex items-center gap-1 text-[11px] text-ink-subtle">
              <AtSign className="w-3 h-3 text-mention-text" /> @teammate
            </span>

            {/* On-Demand AI Tag Suggestions Button */}
            <button
              type="button"
              onClick={handleRequestAISuggestions}
              disabled={isSuggestingTags || !content.trim()}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-primary bg-primary-light/60 hover:bg-primary-light rounded-lg hairline-border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Analyze text and suggest 3 smart tags"
            >
              {isSuggestingTags ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              <span>Suggest Tags</span>
            </button>

            {/* Attach image button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-ink-muted hover:text-ink font-medium cursor-pointer"
              title="Add images"
            >
              <ImageIcon className="w-3.5 h-3.5" /> + Image
            </button>

            <span className="hidden md:inline-block text-[11px] text-ink-subtle">
              <kbd className="px-1 py-0.5 bg-surface hairline-border rounded text-[10px] font-mono">Ctrl+Enter</kbd> to save
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto sm:ml-0">
            <span className={`text-xs ${content.length > 9000 ? 'text-status-error font-bold' : 'text-ink-subtle'}`}>
              {content.length}/10,000
            </span>
            <button
              type="submit"
              disabled={(!content.trim() && attachedImages.length === 0) || isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-subtle transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Capture
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
              {filteredTagSuggestions.length === 0 ? (
                <div
                  onClick={() => handleSelectAutocomplete(autocompleteQuery)}
                  className="px-3 py-2 text-xs text-primary hover:bg-primary-light cursor-pointer flex items-center gap-1"
                >
                  <Hash className="w-3 h-3" /> Create new tag #{autocompleteQuery}
                </div>
              ) : (
                filteredTagSuggestions.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => handleSelectAutocomplete(t.name)}
                    className="px-3 py-1.5 text-xs text-ink hover:bg-canvas cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-medium">#{t.name}</span>
                    <span className="text-[10px] text-ink-subtle">{t.count || 0} notes</span>
                  </div>
                ))
              )}
            </div>
          )}

          {autocompleteMode === 'mention' && (
            <div>
              {filteredTeammateSuggestions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-ink-subtle italic">
                  No teammate handle matching "@{autocompleteQuery}".
                </div>
              ) : (
                filteredTeammateSuggestions.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => handleSelectAutocomplete(u.username || '')}
                    className="px-3 py-1.5 text-xs text-ink hover:bg-canvas cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-medium flex items-center gap-1.5">
                      <AtSign className="w-3 h-3 text-mention-text" /> @{u.username}
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
