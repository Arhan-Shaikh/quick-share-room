import { useState, useEffect } from 'react';
import { retrieveShare, getTimeRemaining, type SharedItem } from '@/lib/sharing';
import { supabase } from '@/integrations/supabase/client';
import { decrypt } from '@/lib/crypto';
import { Download, Copy, Check, Clock, Key } from 'lucide-react';

const ShareRetriever = () => {
  const [code, setCode] = useState('');
  const [item, setItem] = useState<SharedItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const [pendingData, setPendingData] = useState<{ id: string; code: string; type: string; content: string; file_name: string | null; file_type: string | null; created_at: string; expires_at: string } | null>(null);
  const [decryptionKey, setDecryptionKey] = useState('');
  const [keyError, setKeyError] = useState(false);

  const handleRetrieve = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    // If it contains a dash and is long enough, try full token retrieval
    if (trimmed.includes('-') && trimmed.length >= 8) {
      const found = await retrieveShare(trimmed);
      if (found) {
        setItem(found);
        setNotFound(false);
        setPendingData(null);
        return;
      }
    }

    // Try as room code only (first 6 chars)
    const roomCode = trimmed.replace(/-/g, '').substring(0, 6);
    if (roomCode.length < 6) {
      setNotFound(true);
      return;
    }

    const { data, error } = await supabase
      .from('shared_items')
      .select('*')
      .eq('code', roomCode)
      .single();

    if (error || !data) {
      setNotFound(true);
      setItem(null);
      setPendingData(null);
    } else {
      setPendingData(data);
      setNotFound(false);
      setKeyError(false);
      setDecryptionKey('');
    }
  };

  const handleDecrypt = async () => {
    if (!pendingData || !decryptionKey.trim()) return;
    try {
      const decryptedContent = await decrypt(pendingData.content, decryptionKey.trim());
      setItem({
        id: pendingData.id,
        code: pendingData.code,
        type: pendingData.type as 'text' | 'file',
        content: decryptedContent,
        fileName: pendingData.file_name ?? undefined,
        fileType: pendingData.file_type ?? undefined,
        createdAt: pendingData.created_at,
        expiresAt: pendingData.expires_at,
      });
      setPendingData(null);
      setKeyError(false);
    } catch {
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

  const reset = () => {
    setCode('');
    setItem(null);
    setNotFound(false);
    setPendingData(null);
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

  // Key entry step (room code found, need decryption key)
  if (pendingData) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Found item <span className="text-primary font-mono font-bold">{pendingData.code}</span>. Enter the decryption key to unlock.
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
          disabled={code.trim().length < 6}
          className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-30 hover:shadow-[var(--terminal-glow-strong)] transition-shadow"
        >
          Go
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the full token to auto-decrypt, or enter just the 6-char room code.
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
