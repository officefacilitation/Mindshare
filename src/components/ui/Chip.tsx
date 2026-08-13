import React from 'react';
import { Tag, UserContact } from '../../lib/types';
import { Sparkles, Hash, AtSign } from 'lucide-react';

interface TagChipProps {
  tag: Tag;
  onClick?: (name: string) => void;
  isSelected?: boolean;
  onRemove?: () => void;
}

export const TagChip: React.FC<TagChipProps> = ({
  tag,
  onClick,
  isSelected,
  onRemove,
}) => {
  const isAI = tag.is_manual === false;

  return (
    <span
      onClick={() => onClick && onClick(tag.name)}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer select-none active-press ${
        isSelected
          ? 'bg-primary text-white shadow-subtle'
          : isAI
          ? 'bg-primary-light text-primary hover:bg-primary-light/80 border border-primary/20'
          : 'bg-[#f0f0f0] text-primary hover:bg-[#e4e4e6] border border-transparent'
      }`}
    >
      {isAI ? (
        <Sparkles className="w-3 h-3 text-primary shrink-0" />
      ) : (
        <Hash className="w-3 h-3 opacity-60 shrink-0" />
      )}
      <span>{tag.name}</span>
      {tag.count !== undefined && (
        <span className="ml-0.5 opacity-60 text-[10px]">({tag.count})</span>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:text-red-500 font-bold"
        >
          ×
        </button>
      )}
    </span>
  );
};

interface MentionChipProps {
  mention: UserContact | string;
  onClick?: (username: string) => void;
  isSelected?: boolean;
  onRemove?: () => void;
}

export const MentionChip: React.FC<MentionChipProps> = ({
  mention,
  onClick,
  isSelected,
  onRemove,
}) => {
  const username = typeof mention === 'string' ? mention : mention.username;
  const displayName = typeof mention === 'string' ? mention : mention.display_name;
  const avatarUrl = typeof mention === 'object' ? mention.avatar_url : undefined;

  return (
    <span
      onClick={() => onClick && onClick(username)}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer select-none active-press ${
        isSelected
          ? 'bg-mention-text text-white shadow-subtle'
          : 'bg-mention-bg text-mention-text hover:bg-[#d2ece9] border border-transparent'
      }`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
        />
      ) : (
        <AtSign className="w-3 h-3 opacity-70 shrink-0" />
      )}
      <span>{username}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:text-red-500 font-bold"
        >
          ×
        </button>
      )}
    </span>
  );
};
