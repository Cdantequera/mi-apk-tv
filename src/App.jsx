import React, { useState, useEffect, useCallback } from 'react';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import Player from './components/Player';
import TvOsdBanner from './components/TvOsdBanner';
import { INITIAL_CHANNELS } from './data/channels';
import { useTvRemote } from './hooks/useTvRemote';
import { isTvDevice } from './utils/tvDetect';
import { Menu, ChevronLeft } from 'lucide-react';

const STORAGE_KEY = 'pctv_active_channels';
const FAVORITES_KEY = 'pctv_favorite_channels';

export default function App() {
  const [channels, setChannels] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filtrar canales obsoletos o eliminados (como la categoría Películas)
          const validUrls = new Set(INITIAL_CHANNELS.map((c) => c.url));
          const filtered = parsed.filter(
            (c) => c.category !== 'Películas' && validUrls.has(c.url)
          );
          if (filtered.length !== parsed.length) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
          }
          if (filtered.length > 0) {
            return filtered;
          }
        }
      }
    } catch (e) {
      console.error('Error cargando canales desde localStorage:', e);
    }
    return INITIAL_CHANNELS;
  });

  // Lista de URLs de canales favoritos
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('Error cargando favoritos desde localStorage:', e);
    }
    return [];
  });

  // Canal seleccionado por defecto
  const [selectedChannel, setSelectedChannel] = useState(() => channels[0] || INITIAL_CHANNELS[0]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return typeof document !== 'undefined' && !!document.fullscreenElement;
  });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Guardar en localStorage cuando se modifique la lista de canales
  const saveChannels = (newChannels) => {
    setChannels(newChannels);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newChannels));
    } catch (e) {
      console.error('Error guardando canales en localStorage:', e);
    }
  };

  // Alternar canal favorito
  const handleToggleFavorite = useCallback((channel) => {
    if (!channel?.url) return;
    setFavorites((prev) => {
      const isFav = prev.includes(channel.url);
      const next = isFav ? prev.filter((u) => u !== channel.url) : [...prev, channel.url];
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error guardando favoritos en localStorage:', e);
      }
      return next;
    });
  }, []);

  // Hook de navegación con control remoto de Smart TV
  const {
    isTvMode,
    osdChannel,
    showOsd,
    triggerOsd,
  } = useTvRemote({
    channels,
    selectedChannel,
    onSelectChannel: (channel) => {
      setSelectedChannel(channel);
    },
    isSidebarOpen,
    setIsSidebarOpen,
    onToggleFavorite: handleToggleFavorite,
    isFullscreen,
  });

  const handleSelectChannel = (channel) => {
    setSelectedChannel(channel);
    triggerOsd(channel);
  };

  // Eliminar múltiples canales caídos (recibe array de URLs)
  const handleDeleteOfflineChannels = (offlineUrls) => {
    if (!offlineUrls || offlineUrls.length === 0) return;
    const urlSet = new Set(offlineUrls);
    const updatedChannels = channels.filter((c) => !urlSet.has(c.url));
    saveChannels(updatedChannels);

    // Limpiar también de favoritos si estaban allí
    setFavorites((prev) => {
      const next = prev.filter((u) => !urlSet.has(u));
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error actualizando favoritos:', e);
      }
      return next;
    });

    if (selectedChannel && urlSet.has(selectedChannel.url)) {
      setSelectedChannel(updatedChannels[0] || null);
    }
  };

  // Eliminar un canal individual
  const handleDeleteSingleChannel = (channelUrl) => {
    if (!channelUrl) return;
    const updatedChannels = channels.filter((c) => c.url !== channelUrl);
    saveChannels(updatedChannels);

    setFavorites((prev) => {
      const next = prev.filter((u) => u !== channelUrl);
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      } catch (e) {
        console.error('Error actualizando favoritos:', e);
      }
      return next;
    });

    if (selectedChannel && selectedChannel.url === channelUrl) {
      setSelectedChannel(updatedChannels[0] || null);
    }
  };

  // Restaurar la lista original de canales
  const handleResetChannels = () => {
    setChannels(INITIAL_CHANNELS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Error limpiando localStorage:', e);
    }
    if (!selectedChannel || !INITIAL_CHANNELS.some((c) => c.url === selectedChannel.url)) {
      setSelectedChannel(INITIAL_CHANNELS[0]);
    }
  };

  const isCustomList = channels.length !== INITIAL_CHANNELS.length;
  const isSelectedFavorite = selectedChannel ? favorites.includes(selectedChannel.url) : false;

  return (
    <div className="w-screen h-screen flex flex-col bg-charcoal text-white overflow-hidden select-none font-sans relative">
      {/* Banner flotante de información en Smart TV al cambiar de canal */}
      <TvOsdBanner
        channel={osdChannel || selectedChannel}
        isVisible={showOsd}
        isFavorite={isSelectedFavorite}
      />

      {/* Barra superior de escritorio (se oculta automáticamente en Smart TV) */}
      <TitleBar currentChannel={selectedChannel} />

      {/* Disposición principal */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Barra lateral de canales */}
        <div
          className={`h-full transition-all duration-300 ease-in-out shrink-0 ${
            isSidebarOpen ? 'w-80 md:w-96' : 'w-0 overflow-hidden opacity-0 pointer-events-none'
          }`}
        >
          <Sidebar
            channels={channels}
            selectedChannel={selectedChannel}
            onSelectChannel={handleSelectChannel}
            onDeleteOfflineChannels={handleDeleteOfflineChannels}
            onDeleteSingleChannel={handleDeleteSingleChannel}
            onResetChannels={handleResetChannels}
            isCustomList={isCustomList}
            favorites={favorites}
            onToggleFavorite={handleToggleFavorite}
          />
        </div>

        {/* Reproductor de Video */}
        <main className="flex-1 h-full flex flex-col bg-charcoal-dark overflow-hidden relative">
          {/* Botón flotante para alternar barra lateral (Oculto en TV a pantalla completa) */}
          {(!isTvMode || isSidebarOpen) && !isFullscreen && (
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="absolute top-3 left-3 z-30 p-2 rounded-lg bg-charcoal-dark/80 hover:bg-pumpkin/90 text-gray-300 hover:text-white border border-charcoal-border hover:border-pumpkin backdrop-blur transition-all duration-150 shadow-lg focus:outline-none focus:ring-2 focus:ring-pumpkin"
              title={isSidebarOpen ? "Ocultar canales (Pantalla Completa TV)" : "Mostrar canales"}
            >
              {isSidebarOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
            </button>
          )}

          <Player
            channel={selectedChannel}
            isFavorite={isSelectedFavorite}
            onToggleFavorite={handleToggleFavorite}
            isTvMode={isTvMode}
            isSidebarOpen={isSidebarOpen}
          />
        </main>
      </div>
    </div>
  );
}
