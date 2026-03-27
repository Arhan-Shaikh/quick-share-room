import { useState } from 'react';
import ShareCreator from '@/components/ShareCreator';
import ShareRetriever from '@/components/ShareRetriever';

const Index = () => {
  const [tab, setTab] = useState<'share' | 'retrieve'>('share');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-primary">drop</span>
            <span className="text-foreground">zone</span>
            <span className="text-primary animate-pulse">_</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Ephemeral sharing. No account. No trace.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex border border-border rounded overflow-hidden">
          <button
            onClick={() => setTab('share')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'share'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            Share
          </button>
          <button
            onClick={() => setTab('retrieve')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              tab === 'retrieve'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            Retrieve
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[200px]">
          {tab === 'share' ? <ShareCreator /> : <ShareRetriever />}
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center space-y-1">
          <p>Data auto-expires after 15 minutes</p>
          <p>Stored locally in your browser</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
