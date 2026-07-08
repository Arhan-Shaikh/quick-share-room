import { useState, useCallback, useMemo } from 'react';
import {
  createTextShare,
  createMultiFileShare,
  EXPIRY_OPTIONS,
  MAX_FILE_SIZE,
  MAX_INLINE_FILE_BYTES,
  formatBytes,
} from '@/lib/sharing';
import { Upload, FileText, Copy, Check, Lock, Unlock, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

type Mode = 'idle' | 'text' | 'file';

const ShareCreator = () => {
  const [mode, setMode] = useState<Mode>('idle');
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [expiryMs, setExpiryMs] = useState(EXPIRY_OPTIONS[1].value);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const totalFileBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);
  const oversizeFile = useMemo(() => files.find((f) => f.size > MAX_FILE_SIZE), [files]);
  const canEncryptFiles = mode !== 'file' || totalFileBytes <= MAX_INLINE_FILE_BYTES;

  const handleShare = useCallback(async () => {
    setError('');
    setProgress(0);
    setUploading(true);
    try {
      // For files >5 MB E2E is not supported — silently fall back to no encryption on that path.
      const effectiveEncrypted = mode === 'file' ? encryptionEnabled && canEncryptFiles : encryptionEnabled;
      const opts = {
        expiryMs,
        encrypted: effectiveEncrypted,
        onProgress: (fraction: number) => setProgress(fraction),
      };
      if (mode === 'text' && text.trim()) {
        const result = await createTextShare(text.trim(), opts);
        setToken(result.token);
        setIsEncrypted(result.encrypted);
      } else if (mode === 'file' && files.length > 0) {
        if (oversizeFile) {
          throw new Error(`"${oversizeFile.name}" exceeds the 10 GB maximum.`);
        }
        const result = await createMultiFileShare(files, opts);
        setToken(result.token);
        setIsEncrypted(result.encrypted);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setUploading(false);
    }
  }, [mode, text, files, expiryMs, encryptionEnabled, canEncryptFiles, oversizeFile]);

  const handleCopy = () => {
    if (token) {
      navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      setFiles(dropped);
      setMode('file');
    }
  }, []);

  const reset = () => {
    setMode('idle');
    setText('');
    setFiles([]);
    setToken(null);
    setIsEncrypted(false);
    setError('');
    setProgress(0);
    setUploading(false);
  };

  const selectedExpiry = EXPIRY_OPTIONS.find(o => o.value === expiryMs);

  if (token) {
    const roomCode = token.includes('-') ? token.split('-')[0] : token;
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <div className="text-muted-foreground text-sm">
            Share this code. Expires in {selectedExpiry?.label || '15 minutes'}.
          </div>
          {isEncrypted && (
            <div className="flex items-center gap-1.5 text-xs text-primary">
              <Lock size={12} />
              <span>End-to-end encrypted</span>
            </div>
          )}
          {!isEncrypted && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Unlock size={12} />
              <span>No encryption — retrievable with room code only</span>
            </div>
          )}
        </div>

        {/* Room code */}
        <div className="text-center">
          <div className="text-xs text-muted-foreground mb-1">Room Code</div>
          <div className="text-4xl font-bold tracking-[0.3em] text-primary">
            {roomCode}
          </div>
          {!isEncrypted && (
            <p className="text-xs text-muted-foreground mt-2">
              Anyone with this code can retrieve the content
            </p>
          )}
        </div>

        {/* Full token (only for encrypted shares) */}
        {isEncrypted && (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Full encrypted token (includes decryption key):</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-card border border-border rounded px-3 py-2 text-xs font-mono break-all select-all">
                {token}
              </code>
              <button
                onClick={handleCopy}
                className="p-2 rounded bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors shrink-0"
              >
                {copied ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
          </div>
        )}

        {/* Copy room code for non-encrypted */}
        {!isEncrypted && (
          <div className="flex justify-center">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy code'}
            </button>
          </div>
        )}

        <div className="flex justify-center p-4 rounded bg-background">
          <QRCodeSVG value={token} size={160} fgColor="hsl(142, 70%, 50%)" bgColor="hsl(220, 15%, 8%)" />
        </div>
        <p className="text-xs text-muted-foreground text-center">
          {isEncrypted ? 'Scan QR code or paste the full token to retrieve' : 'Scan QR code or enter room code to retrieve'}
        </p>
        <button
          onClick={reset}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          Share something else →
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Expiry selector */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Expires in:</span>
        <div className="flex gap-1.5 flex-wrap">
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setExpiryMs(opt.value)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                expiryMs === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-accent'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Encryption toggle */}
      <button
        onClick={() => setEncryptionEnabled(!encryptionEnabled)}
        className={`flex items-center gap-2 w-full px-3 py-2 rounded border text-sm transition-colors ${
          encryptionEnabled
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        {encryptionEnabled ? <Lock size={14} /> : <Unlock size={14} />}
        <span className="font-medium">
          {encryptionEnabled ? 'E2E Encryption ON' : 'E2E Encryption OFF'}
        </span>
        <span className="text-xs ml-auto">
          {encryptionEnabled ? 'Requires full token to retrieve' : 'Retrievable with room code only'}
        </span>
      </button>

      {mode === 'idle' && (
        <div
          className={`border-2 border-dashed rounded p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="flex flex-col items-center gap-4">
            <Upload size={32} className="text-muted-foreground" />
            <p className="text-muted-foreground text-sm">
              Drop a file here, or choose below
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setMode('text')}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
              >
                <FileText size={14} className="inline mr-2" />
                Paste text
              </button>
              <label className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer">
                <Upload size={14} className="inline mr-2" />
                Upload files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const list = Array.from(e.target.files ?? []);
                    if (list.length > 0) { setFiles(list); setMode('file'); }
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {mode === 'text' && (
        <div className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your text here..."
            className="w-full h-40 bg-card border border-border rounded p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              disabled={!text.trim()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold disabled:opacity-30 hover:shadow-[var(--terminal-glow-strong)] transition-shadow"
            >
              Generate code
            </button>
            <button onClick={reset} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === 'file' && files.length > 0 && (
        <div className="space-y-3">
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="bg-card border border-border rounded p-3 flex items-center gap-3">
                <FileText size={18} className="text-primary shrink-0" />
                <div className="text-sm truncate flex-1">{f.name}</div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {(f.size / 1024).toFixed(1)} KB
                </div>
                <button
                  onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove file"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="text-xs text-muted-foreground text-right">
              Total: {(files.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)} KB · {files.length} file{files.length > 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleShare}
              className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:shadow-[var(--terminal-glow-strong)] transition-shadow"
            >
              Generate code
            </button>
            <button onClick={reset} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
};

export default ShareCreator;
