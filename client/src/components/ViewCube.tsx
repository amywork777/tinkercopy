import { useState, CSSProperties } from 'react';
import { useScene } from '@/hooks/use-scene';
import { cn } from "@/lib/utils";

export function ViewCube() {
  const { setCameraView, cameraView } = useScene();
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  
  // Simple function to change the camera view
  const changeView = (view: 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'isometric') => {
    setCameraView(view);
  };
  
  // Button style creator with hover and active states
  const createButtonStyle = (view: string): CSSProperties => {
    const isActive = cameraView === view;
    const isHovered = hoveredButton === view;
    
    return {
      padding: '4px 0',
      fontWeight: 'bold',
      fontSize: '10px',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column' as 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '36px',
      transition: 'all 0.2s ease',
    };
  };
  
  return (
    <div className="absolute bottom-3 right-3 w-[160px] z-[15] bg-card/80 backdrop-blur-sm rounded-md p-1.5 shadow-md border border-border grid grid-cols-3 gap-1">
      <button
        onClick={() => changeView('top')}
        onMouseEnter={() => setHoveredButton('top')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1",
          cameraView === 'top' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'top' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('top')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L4 9H20L12 3Z" fill="currentColor" />
            <rect x="5" y="11" width="14" height="10" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
        <span className="text-[8px]">T</span>
      </button>
      
      <button
        onClick={() => changeView('front')}
        onMouseEnter={() => setHoveredButton('front')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1",
          cameraView === 'front' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'front' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('front')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" fill="currentColor" />
          </svg>
        </div>
        <span className="text-[8px]">F</span>
      </button>
      
      <button
        onClick={() => changeView('right')}
        onMouseEnter={() => setHoveredButton('right')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1",
          cameraView === 'right' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'right' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('right')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20H20V4H4Z" fill="currentColor" opacity="0.5" />
            <path d="M20 4V20H16V4H20Z" fill="currentColor" />
          </svg>
        </div>
        <span className="text-[8px]">R</span>
      </button>
      
      <button
        onClick={() => changeView('bottom')}
        onMouseEnter={() => setHoveredButton('bottom')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1",
          cameraView === 'bottom' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'bottom' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('bottom')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="4" width="14" height="10" fill="currentColor" opacity="0.5" />
            <path d="M4 14L12 20L20 14H4Z" fill="currentColor" />
          </svg>
        </div>
        <span className="text-[8px]">B</span>
      </button>
      
      <button
        onClick={() => changeView('back')}
        onMouseEnter={() => setHoveredButton('back')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1",
          cameraView === 'back' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'back' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('back')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" fill="currentColor" opacity="0.5" />
            <path d="M4 4H20V8H4V4Z" fill="currentColor" />
          </svg>
        </div>
        <span className="text-[8px]">B</span>
      </button>
      
      <button
        onClick={() => changeView('left')}
        onMouseEnter={() => setHoveredButton('left')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1",
          cameraView === 'left' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'left' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('left')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20H20V4H4Z" fill="currentColor" opacity="0.5" />
            <path d="M4 4V20H8V4H4Z" fill="currentColor" />
          </svg>
        </div>
        <span className="text-[8px]">L</span>
      </button>
      
      <button
        onClick={() => changeView('isometric')}
        onMouseEnter={() => setHoveredButton('isometric')}
        onMouseLeave={() => setHoveredButton(null)}
        className={cn(
          "flex flex-col items-center justify-center rounded border p-1 col-span-3",
          cameraView === 'isometric' ? "bg-accent text-accent-foreground border-primary" : "bg-muted hover:bg-muted/80 text-foreground border-border",
          hoveredButton === 'isometric' ? "bg-muted/80" : ""
        )}
        style={createButtonStyle('isometric')}
      >
        <div className="mb-0.5 h-4 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="currentColor" />
            <path d="M12 3V13M12 21V13M4 7L12 13M20 7L12 13" stroke="currentColor" strokeWidth="1" strokeOpacity="0.3" />
          </svg>
        </div>
        <span className="text-[8px]">3D</span>
      </button>
    </div>
  );
} 