'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { cn } from '@feedglow/ui';
import { X, Plus, Sparkles } from 'lucide-react';

interface Tag {
  id?: string;
  name: string;
  isAI?: boolean; // AI generated vs manual
  color?: string;
}

interface TagInputProps {
  tags: Tag[];
  suggestions?: Tag[]; // Autocomplete suggestions
  onAdd: (name: string) => void;
  onRemove: (tag: Tag) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TagInput({
  tags,
  suggestions = [],
  onAdd,
  onRemove,
  placeholder = '添加标签...',
  disabled = false,
}: TagInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter suggestions based on input
  const filteredSuggestions = suggestions.filter(
    s => s.name.toLowerCase().includes(input.toLowerCase()) && 
         !tags.some(t => t.name.toLowerCase() === s.name.toLowerCase())
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredSuggestions.length > 0 && showSuggestions) {
        onAdd(filteredSuggestions[selectedIndex].name);
      } else if (input.trim()) {
        onAdd(input.trim());
      }
      setInput('');
      setShowSuggestions(false);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filteredSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      // Remove last tag when backspace on empty input
      const lastManualTag = [...tags].reverse().find(t => !t.isAI);
      if (lastManualTag) {
        onRemove(lastManualTag);
      }
    }
  };

  // Close suggestions on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap gap-1.5 p-2 bg-[rgb(var(--bg-base))] border border-default rounded-lg min-h-[42px]">
        {/* Existing Tags */}
        {tags.map((tag, i) => (
          <span
            key={tag.id || i}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs",
              tag.isAI 
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" 
                : "bg-[rgb(var(--bg-hover))] text-secondary"
            )}
          >
            {tag.isAI && <Sparkles className="w-3 h-3" />}
            #{tag.name}
            {!tag.isAI && (
              <button
                onClick={() => onRemove(tag)}
                className="ml-0.5 hover:text-red-500 transition-colors"
                disabled={disabled}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
          disabled={disabled}
          className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 py-1 bg-[rgb(var(--bg-elevated))] border border-default rounded-lg shadow-xl z-10 max-h-[200px] overflow-y-auto">
          {filteredSuggestions.map((suggestion, i) => (
            <button
              key={suggestion.id || i}
              onClick={() => {
                onAdd(suggestion.name);
                setInput('');
                setShowSuggestions(false);
              }}
              className={cn(
                "w-full px-3 py-1.5 text-sm text-left flex items-center gap-2 transition-colors",
                i === selectedIndex 
                  ? "bg-[rgb(var(--bg-hover))] text-[rgb(var(--text-primary))]" 
                  : "text-secondary hover:bg-[rgb(var(--bg-hover))]"
              )}
            >
              <Plus className="w-3.5 h-3.5 text-muted" />
              #{suggestion.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
