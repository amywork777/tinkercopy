import React, { useState, useEffect } from 'react';
import { getImportStats } from '@/lib/iframeInterceptor';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

/**
 * ImportStatsDebug component
 * 
 * This component displays import statistics for debugging purposes.
 * It can be added to any page to monitor STL imports from external sources.
 */
export function ImportStatsDebug() {
  const [stats, setStats] = useState(getImportStats());
  const [expanded, setExpanded] = useState(false);

  // Update stats every 2 seconds
  useEffect(() => {
    const intervalId = setInterval(() => {
      setStats(getImportStats());
    }, 2000);

    return () => clearInterval(intervalId);
  }, []);

  if (!expanded) {
    return (
      <Button 
        className="fixed bottom-4 right-4 z-50 opacity-60 hover:opacity-100"
        variant="outline"
        onClick={() => setExpanded(true)}
      >
        Show Import Stats
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg border border-border">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-sm">FISHCAD Import Statistics</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
            Hide
          </Button>
        </div>
        <CardDescription className="text-xs">
          Monitors STL imports from external domains
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Total imports:</span>
            <span className="font-mono">{stats.totalImports}</span>
          </div>
          <div className="flex justify-between">
            <span>Successful:</span>
            <span className="font-mono text-green-500">{stats.successfulImports}</span>
          </div>
          <div className="flex justify-between">
            <span>Errors:</span>
            <span className="font-mono text-red-500">{stats.importErrors}</span>
          </div>
          {stats.lastImportTime && (
            <div className="flex justify-between">
              <span>Last import:</span>
              <span className="font-mono">{new Date(stats.lastImportTime).toLocaleTimeString()}</span>
            </div>
          )}

          {Object.keys(stats.importsByOrigin).length > 0 && (
            <>
              <div className="text-xs font-semibold mt-2 mb-1">Imports by Origin</div>
              {Object.entries(stats.importsByOrigin).map(([origin, count]) => (
                <div key={origin} className="flex justify-between text-xs">
                  <span className="truncate" title={origin}>{origin}</span>
                  <span className="font-mono">{count}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default ImportStatsDebug; 