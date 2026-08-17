import React from 'react';
import { Modal } from './Modal';
import { Hash, AtSign, Image as ImageIcon, Search, Sparkles, Command, CheckCircle2 } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mindshare Instructions & User Guide">
      <div className="space-y-5 text-ink max-h-[70vh] overflow-y-auto pr-1 select-text">
        {/* Section 1: Capture */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> 1. Instant Thought Capture
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            Capture thoughts, meeting notes, ideas, and tasks instantly. Use hashtags and mentions directly inside your text:
          </p>
          <ul className="text-xs space-y-1 text-ink pl-1">
            <li className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-primary shrink-0" />
              <span><strong>Hashtags:</strong> Type <code className="px-1 bg-surface hairline-border rounded font-mono">#topic</code> to organize thoughts.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <AtSign className="w-3.5 h-3.5 text-mention-text shrink-0" />
              <span><strong>Mentions:</strong> Type <code className="px-1 bg-surface hairline-border rounded font-mono">@username</code> to mention contacts.</span>
            </li>
          </ul>
        </div>

        {/* Section 2: Image Uploads */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4" /> 2. Multiple Images (Drag & Drop, Paste, Cloudinary)
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            Attach multiple images to any thought easily:
          </p>
          <ul className="text-xs space-y-1 text-ink pl-1">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span><strong>Drag & Drop:</strong> Drag photo files directly into the input card.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span><strong>Clipboard Paste:</strong> Copy any screenshot or image (<code className="px-1 bg-surface hairline-border rounded font-mono">Ctrl+V</code>) directly into the textarea.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span><strong>Cancel / Remove:</strong> Each uploaded image shows a thumbnail with an <code className="px-1 bg-surface hairline-border rounded font-mono">X</code> button to remove before saving.</span>
            </li>
          </ul>
        </div>

        {/* Section 3: Advanced Boolean Search */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Search className="w-4 h-4" /> 3. Advanced Boolean Search
          </h3>
          <p className="text-xs text-ink-muted leading-relaxed">
            Search with sub-10ms speed across 10,000+ notes using boolean operators:
          </p>
          <div className="space-y-1.5 text-xs font-mono bg-surface p-2.5 rounded-lg hairline-border text-ink">
            <div><span className="text-primary font-bold">#work & #urgent</span> <span className="text-ink-subtle">// Both tags present</span></div>
            <div><span className="text-primary font-bold">#ideas \| #todo</span> <span className="text-ink-subtle">// Either tag present</span></div>
            <div><span className="text-primary font-bold">launch & @alex</span> <span className="text-ink-subtle">// Text "launch" AND @alex</span></div>
          </div>
        </div>

        {/* Section 4: AI & Shortcuts */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Command className="w-4 h-4" /> 4. AI & Keyboard Shortcuts
          </h3>
          <ul className="text-xs space-y-1 text-ink pl-1">
            <li className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span><strong>Background AI:</strong> Groq LLM automatically generates relevant tags for your notes asynchronously.</span>
            </li>
            <li className="flex items-center gap-1.5">
              <Command className="w-3.5 h-3.5 text-ink-muted shrink-0" />
              <span><strong>Save Shortcut:</strong> Press <kbd className="px-1.5 py-0.5 bg-surface hairline-border rounded text-[10px] font-mono">Ctrl + Enter</kbd> (or <kbd className="px-1.5 py-0.5 bg-surface hairline-border rounded text-[10px] font-mono">Cmd + Enter</kbd>) to save immediately.</span>
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
