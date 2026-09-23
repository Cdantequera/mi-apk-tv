import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Tv } from 'lucide-react';
import { isTvDevice } from '../utils/tvDetect';

export default function TitleBar({ currentChannel }) {
  const [appWindow, setAppWindow] = useState(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isTvOrMobile, setIsTvOrMobile] = useState(false);

  useEffect(() => {
    // Detectar si estamos en Smart TV / Android o dispositivo móvil
    if (isTvDevice()) {
      setIsTvOrMobile(true);
      return;
    }

    // Dynamic import to support both Tauri desktop and browser dev mode seamlessly
    async function initTauri() {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        setAppWindow(win);
        const maximized = await win.isMaximized();
        setIsMaximized(maximized);

        const unlisten = await win.onResized(async () => {
          setIsMaximized(await win.isMaximized());
        });

        return () => {
          unlisten();
        };
      } catch (err) {
        // Running in a web browser without Tauri runtime
      }
    }

    initTauri();
  }, []);

  // En Smart TV o Android no mostramos la barra de controles de ventana de PC
  if (isTvOrMobile) {
    return null;
  }

  const handleMinimize = async () => {
    if (appWindow) {
      await appWindow.minimize();
    }
  };

  const handleToggleMaximize = async () => {
    if (appWindow) {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    }
  };

  const handleClose = async () => {
    if (appWindow) {
      await appWindow.close();
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-9 w-full bg-charcoal-dark border-b border-charcoal-border/50 flex items-center justify-between px-3 select-none z-50 text-xs"
    >
      {/* Brand & Active Stream Title */}
      <div className="flex items-center space-x-2 pointer-events-none" data-tauri-drag-region>
        <div className="w-5 h-5 rounded bg-pumpkin/20 flex items-center justify-center text-pumpkin">
          <Tv size={14} className="stroke-[2.5]" />
        </div>
        <span className="font-bold tracking-wide text-white">
          PcTv <span className="text-pumpkin font-semibold text-[10px] tracking-wider uppercase ml-1 px-1.5 py-0.5 rounded bg-pumpkin/10 border border-pumpkin/20">IPTV</span>
        </span>
        {currentChannel && (
          <span className="text-gray-400 text-xs truncate max-w-xs flex items-center space-x-1 pl-2 border-l border-charcoal-border">
            <span className="w-1.5 h-1.5 rounded-full bg-pumpkin animate-pulse"></span>
            <span className="truncate">{currentChannel.name}</span>
          </span>
        )}
      </div>

      {/* Window Controls */}
      <div className="flex items-center space-x-1 h-full -mr-1">
        <button
          onClick={handleMinimize}
          className="h-7 w-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-charcoal rounded transition-colors"
          title="Minimizar"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={handleToggleMaximize}
          className="h-7 w-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-charcoal rounded transition-colors"
          title={isMaximized ? "Restaurar" : "Maximizar"}
        >
          <Square size={12} className={isMaximized ? "stroke-[2.5]" : ""} />
        </button>
        <button
          onClick={handleClose}
          className="h-7 w-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-600 rounded transition-colors"
          title="Cerrar"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
