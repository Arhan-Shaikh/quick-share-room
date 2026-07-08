import { useState, useEffect } from 'react';
import { retrieveShare, getTimeRemaining, checkShareEncryption, formatBytes, type SharedItem, type SharedFile } from '@/lib/sharing';

import { Download, Copy, Check, Clock, Key } from 'lucide-react';

const ShareRetriever = () => {
  const [code, setCode] = useState('');
  const [item, setItem] = useState<SharedItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [decryptionKey, setDecryptionKey] = useState('');
  const [keyError, setKeyError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRetrieve = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setNotFound(false);

    // Try full token first (contains dash + key)
    if (trimmed.includes('-') && trimmed.length >= 8) {
      const found = await retrieveShare(trimmed);
      if (found) {
        setItem(found);
        setPendingCode(null);
        setLoading(false);
        return;
      }
    }

    // Try as room code (6 chars)
    const roomCode = trimmed.replace(/-/g, '').substring(0, 6);
    if (roomCode.length < 6) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const result = await checkShareEncryption(roomCode);
    if (!result.found) {
      setNotFound(true);
      setItem(null);
      setPendingCode(null);
      setLoading(false);
      return;
    }

    if (result.encrypted) {
      // Need decryption key
      setPendingCode(roomCode);
      setDecryptionKey('');
      setKeyError(false);
    } else {
      // Not encrypted — retrieve directly
      const found = await retrieveShare(roomCode);
      if (found) {
        setItem(found);
        setPendingCode(null);
      } else {
        setNotFound(true);
      }
    }
    setLoading(false);
  };

  const handleDecrypt = async () => {
    if (!pendingCode || !decryptionKey.trim()) return;
    const found = await retrieveShare(`${pendingCode}-${decryptionKey.trim()}`);
    if (found) {
      setItem(found);
      setPendingCode(null);
      setKeyError(false);
    } else {
      setKeyError(true);
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

  const downloadOne = (f: SharedFile) => {
    const href = f.url ?? f.dataUrl;
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    a.download = f.name;
    // Storage signed URLs are cross-origin — open in new tab as fallback
    if (f.url) a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const reset = () => {
    setCode('');
    setItem(null);
    setNotFound(false);
    setPendingCode(null);
    setDecryptionKey('');
    setKeyError(false);
  };

  // Decrypted content view
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
              aria-label={copied ? 'Copied shared text' : 'Copy shared text'}
              className="absolute top-2 right-2 p-1.5 rounded bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            </button>
          </div>
        )}

        {item.type === 'file' && item.files && item.files.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              {item.files.length} file{item.files.length > 1 ? 's' : ''}
            </div>
            {item.files.map((f, i) => (
              <button
                key={i}
                onClick={() => downloadOne(f)}
                disabled={!f.url && !f.dataUrl}
                className="flex items-center gap-2 px-4 py-3 bg-card border border-border rounded hover:border-primary transition-colors w-full text-left disabled:opacity-40"
              >
                <Download size={16} className="text-primary shrink-0" />
                <span className="text-sm truncate flex-1">{f.name}</span>
                {typeof f.size === 'number' && (
                  <span className="text-xs text-muted-foreground shrink-0">{formatBytes(f.size)}</span>
                )}
              </button>
            ))}
            {item.files.length > 1 && (
              <button
                onClick={() => item.files!.forEach((f) => downloadOne(f))}
                className="text-xs text-primary hover:underline"
              >
                Download all
              </button>
            )}
          </div>
        )}

        {item.type === 'file' && !item.files && (
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

  // Key entry step (encrypted item found, need decryption key)
  if (pendingCode) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Found encrypted item <span className="text-primary font-mono font-bold">{pendingCode}</span>. Enter the decryption key to unlock.
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              value={decryptionKey}
              onChange={(e) => { setDecryptionKey(e.target.value); setKeyError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && handleDecrypt()}
              placeholder="Paste decryption key"
              className="w-full bg-card border border-border rounded pl-9 pr-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleDecrypt}
            disabled={!decryptionKey.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-30 hover:shadow-[var(--terminal-glow-strong)] transition-shadow"
          >
            Unlock
          </button>
        </div>
        {keyError && (
          <p className="text-destructive text-sm">Invalid decryption key.</p>
        )}
        <button
          onClick={reset}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          ← Back
        </button>
      </div>
    );
  }

  // Initial input
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setNotFound(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleRetrieve()}
          placeholder="Room code or full token"
          className="flex-1 bg-card border border-border rounded px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleRetrieve}
          disabled={code.trim().length < 6 || loading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-30 hover:shadow-[var(--terminal-glow-strong)] transition-shadow"
        >
          {loading ? '...' : 'Go'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Enter the 6-char room code, or paste the full token for encrypted shares.
      </p>
      {notFound && (
        <p className="text-destructive text-sm">
          Invalid code, expired, or not found.
        </p>
      )}
    </div>
  );
};

export default ShareRetriever;
