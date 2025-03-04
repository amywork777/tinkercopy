import { createContext, useContext, useEffect, useState } from 'react';

type DeviceType = 'mobile' | 'tablet' | 'desktop';

type DeviceContextType = {
  deviceType: DeviceType;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
};

const DeviceContext = createContext<DeviceContextType>({
  deviceType: 'desktop',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  width: typeof window !== 'undefined' ? window.innerWidth : 1920,
  height: typeof window !== 'undefined' ? window.innerHeight : 1080,
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceContextType>({
    deviceType: 'desktop',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    width: typeof window !== 'undefined' ? window.innerWidth : 1920,
    height: typeof window !== 'undefined' ? window.innerHeight : 1080,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Determine device type based on width
      // These breakpoints align with common Tailwind breakpoints
      let deviceType: DeviceType = 'desktop';
      let isMobile = false;
      let isTablet = false;
      let isDesktop = true;
      
      if (width < 640) {
        deviceType = 'mobile';
        isMobile = true;
        isTablet = false;
        isDesktop = false;
      } else if (width >= 640 && width < 1024) {
        deviceType = 'tablet';
        isMobile = false;
        isTablet = true;
        isDesktop = false;
      }
      
      setDeviceInfo({
        deviceType,
        isMobile,
        isTablet,
        isDesktop,
        width,
        height,
      });
    };

    // Initial check
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Clean up
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <DeviceContext.Provider value={deviceInfo}>
      {children}
    </DeviceContext.Provider>
  );
}

export const useDevice = () => useContext(DeviceContext); 