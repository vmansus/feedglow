'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@feedglow/ui';
import { 
  X, 
  Link2, 
  Check, 
  Twitter, 
  MessageCircle,
  Copy,
  ExternalLink,
  Globe
} from 'lucide-react';
import type { Entry } from '@feedglow/shared';
import toast from 'react-hot-toast';

interface ShareModalProps {
  entry: Entry;
  isOpen: boolean;
  onClose: () => void;
  shareUrl?: string; // From API, if shared
  onShare?: () => Promise<string>; // Generate share link
  onUnshare?: () => Promise<void>; // Remove share
}

export function ShareModal({ 
  entry, 
  isOpen, 
  onClose, 
  shareUrl,
  onShare,
  onUnshare 
}: ShareModalProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(shareUrl || null);

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('链接已复制');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败');
    }
  };

  const handleGenerateShare = async () => {
    if (!onShare) return;
    setIsSharing(true);
    try {
      const url = await onShare();
      setGeneratedUrl(url);
      toast.success('分享链接已生成');
    } catch {
      toast.error('生成分享链接失败');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!onUnshare) return;
    setIsSharing(true);
    try {
      await onUnshare();
      setGeneratedUrl(null);
      toast.success('已取消分享');
    } catch {
      toast.error('取消分享失败');
    } finally {
      setIsSharing(false);
    }
  };

  const shareToTwitter = () => {
    const text = encodeURIComponent(entry.title);
    const url = encodeURIComponent(generatedUrl || entry.url);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  };

  const shareToTelegram = () => {
    const url = encodeURIComponent(generatedUrl || entry.url);
    const text = encodeURIComponent(entry.title);
    window.open(`https://t.me/share/url?url=${url}&text=${text}`, '_blank');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50"
          >
            <div className="bg-[rgb(var(--bg-elevated))] border border-default rounded-2xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-default">
                <h2 className="font-semibold text-lg">分享文章</h2>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-muted hover:text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="p-5 space-y-4">
                {/* Article Info */}
                <div className="p-3 bg-[rgb(var(--bg-base))] rounded-lg">
                  <p className="text-sm font-medium line-clamp-2">{entry.title}</p>
                  <p className="text-xs text-muted mt-1">{entry.feedTitle}</p>
                </div>

                {/* Share Link Section */}
                {generatedUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-green-500">
                      <Globe className="w-4 h-4" />
                      <span>公开分享链接已创建</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={generatedUrl}
                        readOnly
                        className="flex-1 px-3 py-2 bg-[rgb(var(--bg-base))] border border-default rounded-lg text-sm"
                      />
                      <button
                        onClick={() => handleCopy(generatedUrl)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          copied 
                            ? "bg-green-500/20 text-green-500" 
                            : "bg-[rgb(var(--bg-hover))] text-muted hover:text-[rgb(var(--text-primary))]"
                        )}
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    {onUnshare && (
                      <button
                        onClick={handleUnshare}
                        disabled={isSharing}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors"
                      >
                        取消公开分享
                      </button>
                    )}
                  </div>
                ) : onShare ? (
                  <button
                    onClick={handleGenerateShare}
                    disabled={isSharing}
                    className="w-full py-2.5 rounded-lg bg-orange-500 text-white font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Link2 className="w-4 h-4" />
                    {isSharing ? '生成中...' : '生成公开分享链接'}
                  </button>
                ) : null}

                {/* Share to Social */}
                <div className="pt-4 border-t border-default">
                  <p className="text-xs text-muted mb-3">分享到社交平台</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={shareToTwitter}
                      className="flex-1 py-2 rounded-lg bg-[rgb(var(--bg-hover))] hover:bg-[rgb(var(--bg-active))] transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <Twitter className="w-4 h-4" />
                      Twitter
                    </button>
                    <button
                      onClick={shareToTelegram}
                      className="flex-1 py-2 rounded-lg bg-[rgb(var(--bg-hover))] hover:bg-[rgb(var(--bg-active))] transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Telegram
                    </button>
                  </div>
                </div>

                {/* Copy Original URL */}
                <div className="pt-4 border-t border-default">
                  <button
                    onClick={() => handleCopy(entry.url)}
                    className="w-full py-2 rounded-lg border border-default hover:bg-[rgb(var(--bg-hover))] transition-colors flex items-center justify-center gap-2 text-sm text-muted"
                  >
                    <ExternalLink className="w-4 h-4" />
                    复制原文链接
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
