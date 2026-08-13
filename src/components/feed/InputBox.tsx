import React, { useState, useRef, useEffect } from 'react';
import { Tag, UserContact } from '../../lib/types';
import { parseNoteContent } from '../../lib/parser';
import { TagChip, MentionChip } from '../ui/Chip';
import { Send, Hash, AtSign, Sparkles } from 'lucide-react';

interface InputBoxProps {
  onSaveNote: (content: string) => Promise<{ note?: any; error?: string }>;
  allTags: Tag[];
  allContacts: UserContact[];
  onAddToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const InputBox: React.FC<InputBoxProps> = ({
  onSaveNote,
  allTags,
  allContacts,
  onAddToast,
}) => {
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // Combobox Autocomplete State
  const [autocompleteMode, setAutocompleteMode] = useState<'tag' | 'mention' | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Parse current text for live preview chips
  const liveParsed = parseNoteContent(content);

  // Auto-resize textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        Math.max(textareaRef.current.scrollHeight, 64),
        360
      )}px`;
    }
  }, [content]);

  // Handle typing & trigger combobox popup when user types # or @
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    const caretPos = e.target.selectionStart;
    setContent(val);

    // Look backward from caret position to see if user is actively typing a #tag or @mention
    const textBeforeCaret = val.substring(0, caretPos);
    const lastHash = textBeforeCaret.lastIndexOf('#');
    const lastAt = textBeforeCaret.lastIndexOf('@');

    const lastTriggerPos = Math.max(lastHash, lastAt);

    if (lastTriggerPos !== -1 && lastTriggerPos >= textBeforeCaret.length - 20) {
      const char = val[lastTriggerPos];
      const query = textBeforeCaret.substring(lastTriggerPos + 1);

      // Verify no whitespace in query
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

    // Focus back on textarea
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, 50);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const res = await onSaveNote(content.trim());
    setIsSubmitting(false);

    if (res.error) {
      onAddToast(res.error, 'error');
    } else {
      setContent('');
      setAutocompleteMode(null);
      onAddToast('Thought captured! Auto-tagging running in background...', 'success');
      if (textareaRef.current) {
        textareaRef.current.style.height = '64px';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  };

  // Filter autocomplete options based on query
  const filteredTagSuggestions = allTags
    .filter((t) => t.name.toLowerCase().includes(autocompleteQuery))
    .slice(0, 5);

  const filteredContactSuggestions = allContacts
    .filter(
      (c) =>
        c.username.toLowerCase().includes(autocompleteQuery) ||
        c.display_name.toLowerCase().includes(autocompleteQuery)
    )
    .slice(0, 5);

  return (
    <div className="relative mb-6">
      <form
        onSubmit={handleSubmit}
        className={`bg-surface rounded-xl hairline-border transition-all duration-200 shadow-subtle ${
          isFocused ? 'border-primary ring-1 ring-primary/20' : ''
        }`}
      >
        <div className="p-4">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="What's on your mind? Type #tags and @people..."
            className="w-full min-h-[64px] max-h-[360px] bg-transparent text-ink placeholder:text-ink-subtle text-base font-sans leading-relaxed focus:outline-none resize-none"
            rows={2}
          />

          {/* Live Extracted Chips Bar */}
          {(liveParsed.tags.length > 0 || liveParsed.mentions.length > 0) && (
            <div className="pt-2 pb-1 flex flex-wrap items-center gap-1.5 hairline-t">
              <span className="text-[10px] uppercase font-semibold text-ink-subtle tracking-wider mr-1">
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

        {/* Card Footer Bar */}
        <div className="px-4 py-2.5 bg-canvas/40 hairline-t rounded-b-xl flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-primary" /> #topic
            </span>
            <span className="flex items-center gap-1">
              <AtSign className="w-3.5 h-3.5 text-mention-text" /> @person
            </span>
            <span className="hidden sm:inline-block text-[11px] text-ink-subtle">
              Press <kbd className="px-1 py-0.5 bg-surface hairline-border rounded text-[10px] font-mono">Ctrl+Enter</kbd> to save
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-xs ${content.length > 9000 ? 'text-status-error font-bold' : 'text-ink-subtle'}`}>
              {content.length}/10,000
            </span>
            <button
              type="submit"
              disabled={!content.trim() || isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-hover active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-subtle transition-all flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <span>Saving...</span>
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
        <div className="absolute left-4 z-40 bg-surface rounded-lg hairline-border shadow-dropdown py-1.5 w-64 max-h-48 overflow-y-auto animate-slide-up">
          <div className="px-3 py-1 text-[10px] font-semibold text-ink-muted uppercase tracking-wider hairline-b">
            Suggested {autocompleteMode === 'tag' ? 'Tags' : 'Contacts'}
          </div>

          {autocompleteMode === 'tag' && (
            <div>
              {filteredTagSuggestions.length === 0 ? (
                <div
                  onClick={() => handleSelectAutocomplete(autocompleteQuery)}
                  className="px-3 py-2 text-xs text-primary hover:bg-primary-light cursor-pointer flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3" /> Create new tag #{autocompleteQuery}
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
              {filteredContactSuggestions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-ink-subtle italic">
                  No matching contact found. Add in People sidebar first.
                </div>
              ) : (
                filteredContactSuggestions.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelectAutocomplete(c.username)}
                    className="px-3 py-1.5 text-xs text-ink hover:bg-canvas cursor-pointer flex items-center justify-between"
                  >
                    <span className="font-medium flex items-center gap-1.5">
                      <AtSign className="w-3 h-3 text-mention-text" /> @{c.username}
                    </span>
                    <span className="text-[10px] text-ink-subtle">{c.display_name}</span>
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
