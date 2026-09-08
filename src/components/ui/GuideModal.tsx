import React from 'react';
import { Modal } from './Modal';
import { Hash, AtSign, Image as ImageIcon, Bell, Sparkles, Command, CheckCircle2, UserCheck, Shield } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Mindshare Team Workspace Guide">
      <div className="space-y-4 text-ink max-h-[70vh] overflow-y-auto pr-1 select-text text-xs">
        {/* Section 1: Capture Thoughts & Tags */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Hash className="w-4 h-4" /> 1. Private Thoughts & #Tags
          </h3>
          <p className="text-ink-muted leading-relaxed">
            Every thought you write is <strong>strictly private</strong> by default. No one else can see your thoughts or your private tags.
          </p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" />
              <span><strong>Hashtags:</strong> Type <code className="px-1 py-0.5 bg-surface hairline-border rounded font-mono">#project</code> or <code className="px-1 py-0.5 bg-surface hairline-border rounded font-mono">#meeting</code> anywhere in your note. Tags are organized automatically in your sidebar.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Shield className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>Tag Privacy:</strong> Your tags are 100% private to your account. Teammates cannot see or search each other's tag lists.</span>
            </li>
          </ul>
        </div>

        {/* Section 2: Teammate Mentions & Tagged Me */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-mention-text flex items-center gap-1.5">
            <AtSign className="w-4 h-4" /> 2. Teammate Mentions & "Tagged Me"
          </h3>
          <p className="text-ink-muted leading-relaxed">
            Need to share a thought or loop someone in? Mention their handle:
          </p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex items-start gap-1.5">
              <AtSign className="w-3.5 h-3.5 text-mention-text shrink-0 mt-0.5" />
              <span><strong>Tagging a Colleague:</strong> Type <code className="px-1 py-0.5 bg-surface hairline-border rounded font-mono">@username</code>. An autocomplete dropdown will suggest real registered teammates in your workspace.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Bell className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>"Tagged Me" Screen:</strong> When someone mentions your handle, a notification badge appears on your <strong>Tagged Me</strong> inbox tab, and that thought appears in your tagged screen with a <em>"Shared by @author"</em> badge.</span>
            </li>
          </ul>
        </div>

        {/* Section 3: Interactive On-Demand AI Tag Assistant */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" /> 3. Smart AI Tag Suggestions (No Junk Tags)
          </h3>
          <p className="text-ink-muted leading-relaxed">
            Mindshare never forces random tags into your workspace. You are in complete control:
          </p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex items-start gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span>Click the <strong>✨ Suggest Tags</strong> button in the thought composer or inspector.</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" />
              <span>AI analyzes your text and offers 3 smart candidate tags as interactive pills. Click any tag to add it to your thought, or dismiss them.</span>
            </li>
          </ul>
        </div>

        {/* Section 4: Your Profile, Handle & ID */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <UserCheck className="w-4 h-4" /> 4. Your Team Handle & Account ID
          </h3>
          <p className="text-ink-muted leading-relaxed">
            Click your profile badge in the top-right header or in the sidebar:
          </p>
          <ul className="space-y-1.5 pl-1">
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" />
              <span>View your <strong>Full Name</strong>, <strong>Email</strong>, and <strong>Account User ID</strong> (with 1-click copy).</span>
            </li>
            <li className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0 mt-0.5" />
              <span>Click <strong>Edit Profile & Handle</strong> to customize your <code className="px-1 py-0.5 bg-surface hairline-border rounded font-mono">@handle</code> anytime.</span>
            </li>
          </ul>
        </div>

        {/* Section 5: Media & Shortcuts */}
        <div className="p-3.5 rounded-xl bg-canvas hairline-border space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
            <ImageIcon className="w-4 h-4" /> 5. Images & Quick Shortcuts
          </h3>
          <ul className="space-y-1.5 pl-1">
            <li className="flex items-start gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span><strong>Drag & Drop or Paste:</strong> Drag images directly into the composer or paste from clipboard (<kbd className="px-1 py-0.5 bg-surface hairline-border rounded font-mono">Ctrl+V</kbd>).</span>
            </li>
            <li className="flex items-start gap-1.5">
              <Command className="w-3.5 h-3.5 text-ink-muted shrink-0 mt-0.5" />
              <span><strong>Quick Capture:</strong> Press <kbd className="px-1.5 py-0.5 bg-surface hairline-border rounded font-mono">Ctrl + Enter</kbd> (or <kbd className="px-1.5 py-0.5 bg-surface hairline-border rounded font-mono">Cmd + Enter</kbd>) to save immediately.</span>
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  );
};
