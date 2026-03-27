import { useState, useEffect } from 'react';
import { retrieveShare, getTimeRemaining, type SharedItem } from '@/lib/sharing';
import { Download, Copy, Check, Clock } from 'lucide-react';

const ShareRetriever = () => {
  const [code, setCode] = useState('');
  const [item, setItem] = useState<SharedItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const handleRetrieve = () => {
    if (code.trim().length < 6) return;
    const found = retrieveShare(code.trim());
    if (found) {
      setItem(found);
      setNotFound(false);
    } else {
      setItem(null);
      setNotFound(true);
    }
  };

  useEffect(() => {
    if (!item) return;
    const tick = () => setTimeLeft(getTimeRemaining(item));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [item]);

  const handleCopy = () => {
    if (item?.type === 'text') {
      navigator.clipboard.writeText(item.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (item?.type === 'file' && item.content) {
      const a = document.createElement('a');
      a.href = item.content;
      a.download = item.fileName || 'download';
      a.click();
    }
  };

  const reset = () => {
    setCode('');
    setItem(null);
    setNotFound(false);
  };

  if (item) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock size={12} />
          <span>Expires in {timeLeft}</span>
        </div>

        {item.type === 'text' && (
          <div className="relative">
            <pre className="bg-card border border-border rounded p-4 text-sm whitespace-pre-wrap break-words max-h-60 overflow-auto">
              {item.content}
            </pre>
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        )}

        {item.type === 'file' && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded hover:border-primary transition-colors w-full"
          >
            <Download size={18} className="text-primary" />
            <span className="text-sm truncate">{item.fileName}</span>
          </button>
        )}

        <button
          onClick={reset}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Retrieve another →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 6));
            setNotFound(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleRetrieve()}
          placeholder="ENTER CODE"
          maxLength={6}
          className="flex-1 bg-card border border-border rounded px-3 py-2 text-center text-lg tracking-[0.3em] font-semibold text-foreground placeholder:text-muted-foreground placeholder:tracking-[0.15em] placeholder:text-sm placeholder:font-normal focus:outline-none focus:ring-1 focus:ring-primary uppercase"
        />
        <button
          onClick={handleRetrieve}
          disabled={code.length < 6}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-30 hover:shadow-[var(--terminal-glow-strong)] transition-shadow"
        >
          Go
        </button>
      </div>
      {notFound && (
        <p className="text-destructive text-sm">
          Code not found or expired.
        </p>
      )}
    </div>
  );
};

export default ShareRetriever;
