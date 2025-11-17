import { useEffect, useCallback } from 'react';

interface UseExamSecurityProps {
  isActive: boolean;
  onViolation: (reason: string) => void;
}

export const useExamSecurity = ({ isActive, onViolation }: UseExamSecurityProps) => {
  const triggerViolation = useCallback((reason: string) => {
    if (isActive) {
      onViolation(reason);
    }
  }, [isActive, onViolation]);

  // 1. Enforce Fullscreen on start and re-enforce if exited
  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      console.warn("Fullscreen request failed", e);
      // Some devices/browsers might block this, we might need to be lenient or show a manual button
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      enterFullscreen();
    } else if (document.fullscreenElement && !isActive) {
       document.exitFullscreen().catch(() => {}); // Exit when not active
    }
  }, [isActive, enterFullscreen]);

  // 2. Event Listeners for Security
  useEffect(() => {
    if (!isActive) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerViolation("Keluar dari aplikasi/pindah tab");
      }
    };

    const handleBlur = () => {
      // Blur can sometimes trigger on authorized system dialogs, be careful.
      // Often visibilityChange is enough for mobile tab switching.
      // triggerViolation("Aplikasi kehilangan fokus");
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isActive) {
         // Try to force it back first before punishing
         triggerViolation("Keluar dari mode layar penuh");
      }
    };

    // Prevent right click
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    // Attempt to prevent standard keyboard shortcuts for screenshots (flaky but adds friction)
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'PrintScreen' ||
        (e.ctrlKey && e.key === 'p') || // Print
        (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) // Mac Screenshot
      ) {
        e.preventDefault();
        triggerViolation("Percobaan tangkapan layar terdeteksi");
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, triggerViolation]);

  return { enterFullscreen };
};