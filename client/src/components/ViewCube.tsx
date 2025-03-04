import { useRef, useState, CSSProperties } from 'react';
import { useScene } from '@/hooks/use-scene';

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
      background: isHovered ? '#333333' : '#222222',
      color: 'white',
      border: isActive ? '1px solid white' : '1px solid #444444',
      padding: '10px 0',
      borderRadius: '4px',
      fontWeight: 'bold',
      fontSize: '12px',
      cursor: 'pointer',
      boxShadow: isActive ? '0 0 4px rgba(255, 255, 255, 0.5)' : 'none',
      display: 'flex',
      flexDirection: 'column' as 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '48px',
      transition: 'all 0.2s ease',
    };
  };
  
  return (
    <div 
      style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        width: '220px',
        zIndex: 50,
        background: 'rgba(20, 20, 20, 0.8)',
        borderRadius: '6px',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(100, 100, 100, 0.3)',
        display: 'grid',
        gap: '8px',
        gridTemplateColumns: '1fr 1fr 1fr',
      }}
    >
      <button
        onClick={() => changeView('top')}
        onMouseEnter={() => setHoveredButton('top')}
        onMouseLeave={() => setHoveredButton(null)}
        style={createButtonStyle('top')}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L4 9H20L12 3Z" fill="white" />
            <rect x="5" y="11" width="14" height="10" fill="white" opacity="0.5" />
          </svg>
        </div>
        Top
      </button>
      
      <button
        onClick={() => changeView('front')}
        onMouseEnter={() => setHoveredButton('front')}
        onMouseLeave={() => setHoveredButton(null)}
        style={createButtonStyle('front')}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" fill="white" />
          </svg>
        </div>
        Front
      </button>
      
      <button
        onClick={() => changeView('right')}
        onMouseEnter={() => setHoveredButton('right')}
        onMouseLeave={() => setHoveredButton(null)}
        style={createButtonStyle('right')}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20H20V4H4Z" fill="white" opacity="0.5" />
            <path d="M20 4V20H16V4H20Z" fill="white" />
          </svg>
        </div>
        Right
      </button>
      
      <button
        onClick={() => changeView('bottom')}
        onMouseEnter={() => setHoveredButton('bottom')}
        onMouseLeave={() => setHoveredButton(null)}
        style={createButtonStyle('bottom')}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="4" width="14" height="10" fill="white" opacity="0.5" />
            <path d="M4 14L12 20L20 14H4Z" fill="white" />
          </svg>
        </div>
        Bottom
      </button>
      
      <button
        onClick={() => changeView('back')}
        onMouseEnter={() => setHoveredButton('back')}
        onMouseLeave={() => setHoveredButton(null)}
        style={createButtonStyle('back')}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" fill="white" opacity="0.5" />
            <path d="M4 4H20V8H4V4Z" fill="white" />
          </svg>
        </div>
        Back
      </button>
      
      <button
        onClick={() => changeView('left')}
        onMouseEnter={() => setHoveredButton('left')}
        onMouseLeave={() => setHoveredButton(null)}
        style={createButtonStyle('left')}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4V20H20V4H4Z" fill="white" opacity="0.5" />
            <path d="M4 4V20H8V4H4Z" fill="white" />
          </svg>
        </div>
        Left
      </button>
      
      <button
        onClick={() => changeView('isometric')}
        onMouseEnter={() => setHoveredButton('isometric')}
        onMouseLeave={() => setHoveredButton(null)}
        style={{...createButtonStyle('isometric'), gridColumn: 'span 3'}}
      >
        <div style={{ marginBottom: '2px', height: '24px' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L4 7V17L12 21L20 17V7L12 3Z" fill="white" />
            <path d="M12 3V13M12 21V13M4 7L12 13M20 7L12 13" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
          </svg>
        </div>
        3D View
      </button>
    </div>
  );
} 