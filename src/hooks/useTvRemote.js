import { useEffect, useState, useCallback, useRef } from 'react';
import { isTvDevice } from '../utils/tvDetect';

/**
 * Hook para detección y control con Control Remoto (D-Pad) de Smart TV / Android TV
 * Maneja flechas de dirección (Up, Down, Left, Right), botón OK (Enter), botón Volver (Back/Esc),
 * teclas de cambio de canal (ChannelUp / ChannelDown) y números de canal.
 */
export function useTvRemote({
  channels = [],
  selectedChannel,
  onSelectChannel,
  isSidebarOpen,
  setIsSidebarOpen,
  isPlaying,
  onTogglePlay,
  onToggleFavorite,
  onToggleFullscreen,
  isFullscreen
}) {
  const [isTvMode, setIsTvMode] = useState(() => isTvDevice());
  const [activeZone, setActiveZone] = useState('channels'); // 'channels' | 'player' | 'categories'
  const [osdChannel, setOsdChannel] = useState(null);
  const [showOsd, setShowOsd] = useState(false);
  const osdTimerRef = useRef(null);

  // Detección automática de entorno Android TV / Smart TV
  useEffect(() => {
    setIsTvMode(isTvDevice());
  }, []);

  // Mostrar banner OSD temporal (On-Screen Display) en pantalla al cambiar de canal en TV
  const triggerOsd = useCallback((channel) => {
    if (!channel) return;
    setOsdChannel(channel);
    setShowOsd(true);
    if (osdTimerRef.current) clearTimeout(osdTimerRef.current);
    osdTimerRef.current = setTimeout(() => {
      setShowOsd(false);
    }, 3500);
  }, []);

  // Cambio de canal relativo (siguiente o anterior)
  const changeChannelByOffset = useCallback(
    (offset) => {
      if (!channels || channels.length === 0) return;
      const currentIndex = channels.findIndex((c) => c.url === selectedChannel?.url);
      let nextIndex = currentIndex + offset;
      if (nextIndex < 0) nextIndex = channels.length - 1;
      if (nextIndex >= channels.length) nextIndex = 0;
      const nextChan = channels[nextIndex];
      if (nextChan) {
        onSelectChannel(nextChan);
        triggerOsd(nextChan);
      }
    },
    [channels, selectedChannel, onSelectChannel, triggerOsd]
  );

  // Escucha del botón Volver físico/remoto enviado desde Android MainActivity
  useEffect(() => {
    const handleNativeBack = () => {
      if (isFullscreen && onToggleFullscreen) {
        onToggleFullscreen();
      } else if (!isSidebarOpen && setIsSidebarOpen) {
        setIsSidebarOpen(true);
        setActiveZone('channels');
      }
    };

    window.addEventListener('tv_back_button', handleNativeBack);
    return () => window.removeEventListener('tv_back_button', handleNativeBack);
  }, [isFullscreen, onToggleFullscreen, isSidebarOpen, setIsSidebarOpen]);

  // Manejo global de teclas de control remoto
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar si el usuario está escribiendo en un input de búsqueda
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.target.blur();
        }
        return;
      }

      const key = e.key;
      const keyCode = e.keyCode || e.which;

      // 1. Teclas de cambio de canal de TV (ChannelUp / ChannelDown / PageUp / PageDown)
      if (key === 'ChannelUp' || key === 'PageUp' || keyCode === 166 || keyCode === 33) {
        e.preventDefault();
        changeChannelByOffset(1);
        return;
      }
      if (key === 'ChannelDown' || key === 'PageDown' || keyCode === 167 || keyCode === 34) {
        e.preventDefault();
        changeChannelByOffset(-1);
        return;
      }

      // 2. Tecla Reproducir / Pausar del control remoto
      if (key === 'MediaPlayPause' || keyCode === 179 || keyCode === 85) {
        e.preventDefault();
        if (onTogglePlay) onTogglePlay();
        return;
      }

      // 3. Botón Volver / Atrás del control remoto (Escape / Backspace / BrowserBack)
      if (key === 'Escape' || key === 'GoBack' || key === 'BrowserBack' || keyCode === 27 || keyCode === 4) {
        e.preventDefault();
        if (isFullscreen && onToggleFullscreen) {
          onToggleFullscreen();
        } else if (!isSidebarOpen && setIsSidebarOpen) {
          setIsSidebarOpen(true);
          setActiveZone('channels');
        }
        return;
      }

      // 4. Si el reproductor está a pantalla completa o la barra está cerrada, las flechas arriba/abajo hacen zapping de canal
      if (isFullscreen || !isSidebarOpen) {
        if (key === 'ArrowUp' || keyCode === 38 || keyCode === 19) {
          e.preventDefault();
          changeChannelByOffset(-1);
          return;
        }
        if (key === 'ArrowDown' || keyCode === 40 || keyCode === 20) {
          e.preventDefault();
          changeChannelByOffset(1);
          return;
        }
        if (key === 'ArrowLeft' || keyCode === 37 || keyCode === 21) {
          e.preventDefault();
          if (setIsSidebarOpen) setIsSidebarOpen(true);
          return;
        }
        if (key === 'Enter' || key === 'Select' || keyCode === 13 || keyCode === 23 || keyCode === 66) {
          e.preventDefault();
          if (onTogglePlay) {
            onTogglePlay();
          } else if (triggerOsd && selectedChannel) {
            triggerOsd(selectedChannel);
          }
          return;
        }
      }

      // 5. Botón Estrella / Favorito (teclas de color de control remoto o tecla 'F')
      if (key === 'f' || key === 'F' || keyCode === 170) {
        if (selectedChannel && onToggleFavorite) {
          e.preventDefault();
          onToggleFavorite(selectedChannel);
          triggerOsd({ ...selectedChannel, name: `${selectedChannel.name} (Favorito modificado)` });
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isFullscreen,
    isSidebarOpen,
    selectedChannel,
    changeChannelByOffset,
    onTogglePlay,
    onToggleFavorite,
    onToggleFullscreen,
    setIsSidebarOpen,
    triggerOsd
  ]);

  return {
    isTvMode,
    activeZone,
    setActiveZone,
    osdChannel,
    showOsd,
    triggerOsd,
    changeChannelByOffset
  };
}
