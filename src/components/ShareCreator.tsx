import { useState, useCallback } from 'react';
import { createTextShare, createFileShare } from '@/lib/sharing';
import { Upload, FileText, Copy, Check } from 'lucide-react';

type Mode = 'idle' | 'text' | 'file';

const ShareCreator = () => {
  const [mode, setMode] = useState<Mode>('idle');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const handleShare = useCallback(async () => {
    setError('');
    try {
      if (mode === 'text' && text.trim()) {
        const c = createTextShare(text.trim());
        setCode(c);
      } else if (mode === 'file' && file) {
        const c = await createFileShare(file);
        setCode(c);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }, [mode, text, file]);

  const handleCopy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) {
      setFile(f);
      setMode('file');
    }
  }, []);

  const reset = () => {
    setMode('idle');
    setText('');
    setFile(null);
    setCode(null);
    setError('');
  };

  if (code) {
    return (
      <div className="space-y-6">
        <div className="text-muted-foreground text-sm">
          Share this code. It expires in 15 minutes.
        </div>
        <div className="flex items-center gap-3">
          <div className="text-4xl font-bold tracking-[0.3em] text-primary">
            {code}
          </div>
          <button
            onClick={handleCopy}
            className="p-2 rounded bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
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
                Upload file
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setFile(f); setMode('file'); }
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

      {mode === 'file' && file && (
        <div className="space-y-3">
          <div className="bg-card border border-border rounded p-4 flex items-center gap-3">
            <FileText size={20} className="text-primary" />
            <div className="text-sm truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground ml-auto">
              {(file.size / 1024).toFixed(1)} KB
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
