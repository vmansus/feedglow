'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Send, X, Loader2, Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '@feedglow/ui';
import type { Entry } from '@feedglow/shared';
import { chatWithEntry } from '@/lib/api';
import { t } from '@/lib/i18n';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  relatedEntries?: { id: number; title: string; relevance: number }[];
}

interface ChatPanelProps {
  entry: Entry;
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPanel({ entry, isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset messages when entry changes
  useEffect(() => {
    setMessages([]);
  }, [entry.id]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Use the API wrapper which handles 401 redirects
      const data = await chatWithEntry(
        entry.id as number,
        userMessage.content,
        messages.map(m => ({ role: m.role, content: m.content }))
      );
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        relatedEntries: data.relatedEntries,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      // Add error message (401 is handled by api wrapper with redirect)
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: t('entry.chat.error', { error: errorMsg }),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestedQuestions = [
    'Summarize the key points',
    'What are the implications?',
    'Explain this in simple terms',
    'What are the pros and cons?',
  ];

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="fixed right-0 top-0 bottom-0 w-96 surface-elevated border-l border-default flex flex-col z-40"
    >
      {/* Header */}
      <div className="p-4 border-b border-default flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[rgb(var(--text-primary))]">Ask AI</h3>
            <p className="text-xs text-muted truncate max-w-[200px]">{entry.title}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <Sparkles className="w-10 h-10 text-orange-500/50 mx-auto mb-3" />
            <p className="text-muted text-sm mb-4">Ask anything about this article</p>
            
            {/* Suggested questions */}
            <div className="space-y-2">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setInput(q)}
                  className="block w-full text-left px-3 py-2 text-sm text-secondary bg-[rgb(var(--bg-hover))] rounded-lg hover:bg-[rgb(var(--bg-active))] transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[85%] rounded-xl p-3',
                  message.role === 'user'
                    ? 'ml-auto bg-orange-500 text-white'
                    : 'bg-[rgb(var(--bg-hover))]'
                )}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                
                {/* Related entries */}
                {message.relatedEntries && message.relatedEntries.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-xs text-white/60 mb-2">Related articles:</p>
                    {message.relatedEntries.map((re) => (
                      <a
                        key={re.id}
                        href={`/entry/${re.id}`}
                        className="flex items-center gap-1 text-xs text-white/80 hover:text-white py-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span className="truncate">{re.title}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex items-center gap-2 text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-default">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 px-3 py-2 rounded-lg bg-[rgb(var(--bg-hover))] border border-default text-sm text-[rgb(var(--text-primary))] placeholder-muted focus:outline-none focus:ring-2 focus:ring-orange-500/50 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// Button to toggle chat panel
export function ChatButton({ onClick, isOpen }: { onClick: () => void; isOpen: boolean }) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg transition-colors flex items-center gap-2",
        isOpen
          ? "bg-orange-500 text-white"
          : "text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
      )}
      title="Ask AI about this article"
    >
      <MessageCircle className="w-4 h-4" />
    </motion.button>
  );
}
