import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface ExternalLibraryFrameProps {
  src: string;
  title?: string;
  height?: string | number;
  width?: string | number;
  className?: string;
}

/**
 * ExternalLibraryFrame component
 * 
 * A wrapper for iframes that securely embeds external library content
 * from allowed origins like magic.taiyaki.ai and library.taiyaki.ai
 */
export function ExternalLibraryFrame({
  src,
  title = 'External Library',
  height = 600,
  width = '100%',
  className = '',
}: ExternalLibraryFrameProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if the source URL is from an allowed domain
  const isAllowedDomain = () => {
    try {
      const url = new URL(src);
      return ['magic.taiyaki.ai', 'library.taiyaki.ai'].includes(url.hostname);
    } catch (err) {
      return false;
    }
  };

  // Handle iframe load event
  const handleLoad = () => {
    setLoading(false);
  };

  // Handle iframe error event
  const handleError = () => {
    setLoading(false);
    setError('Failed to load external content');
  };

  // If the domain is not allowed, show an error
  if (!isAllowedDomain()) {
    return (
      <Card className={`flex items-center justify-center bg-red-50 dark:bg-red-900/20 ${className}`} style={{ height, width }}>
        <div className="text-center p-4">
          <p className="text-red-500 font-medium">Security Error</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            This domain is not in the allowed list of external libraries.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className={`relative ${className}`} style={{ height, width }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-50 dark:bg-red-900/20">
          <div className="text-center p-4">
            <p className="text-red-500 font-medium">{error}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Please try again later or contact support.
            </p>
          </div>
        </div>
      )}
      
      <iframe
        src={src}
        title={title}
        width="100%"
        height="100%"
        frameBorder="0"
        onLoad={handleLoad}
        onError={handleError}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        referrerPolicy="no-referrer-when-downgrade"
        className={`${loading || error ? 'invisible' : 'visible'}`}
      />
    </div>
  );
}

export default ExternalLibraryFrame; 