import React, { useState, useMemo } from 'react';
import {
  Search,
  Radio,
  ChevronRight,
  ChevronDown,
  Play,
  Tv2,
  Activity,
  Loader2,
  EyeOff,
  Trash2,
  RotateCcw,
  Star
} from 'lucide-react';
import { checkChannelHealth } from '../utils/healthCheck';

export default function Sidebar({
  channels,
  selectedChannel,
  onSelectChannel,
  onDeleteOfflineChannels,
  onDeleteSingleChannel,
  onResetChannels,
  isCustomList,
  favorites = [],
  onToggleFavorite
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [healthMap, setHealthMap] = useState({}); // { [url]: 'idle' | 'checking' | 'online' | 'offline' }
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [hideOffline, setHideOffline] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'favorites'

  // Escaneo progresivo en tiempo real de todos los canales con concurrencia optimizada
  const handleScanChannels = async () => {
    if (isScanning || channels.length === 0) return;

    setIsScanning(true);
    setScanProgress({ current: 0, total: channels.length });

    const CONCURRENCY = 6;
    let nextIndex = 0;
    let completedCount = 0;

    const worker = async () => {
      while (nextIndex < channels.length) {
        const currentIndex = nextIndex++;
        const channel = channels[currentIndex];
        if (!channel) break;

        setHealthMap(prev => ({
          ...prev,
          [channel.url]: 'checking'
        }));

        const status = await checkChannelHealth(channel.url);

        setHealthMap(prev => ({
          ...prev,
          [channel.url]: status
        }));

        completedCount++;
        setScanProgress({ current: completedCount, total: channels.length });
      }
    };

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, channels.length) },
      () => worker()
    );

    await Promise.all(workers);
    setIsScanning(false);
  };

  // Filtrado reactivo (Búsqueda + Filtro de canales caídos + Favoritos)
  const groupedChannels = useMemo(() => {
    const favoriteSet = new Set(favorites);

    const filtered = channels.filter(channel => {
      if (filterMode === 'favorites' && !favoriteSet.has(channel.url)) {
        return false;
      }

      const matchesSearch =
        channel.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        channel.category.toLowerCase().includes(searchTerm.toLowerCase());

      const status = healthMap[channel.url];

      if (hideOffline && status === 'offline') {
        return false;
      }

      return matchesSearch;
    });

    return filtered.reduce((acc, channel) => {
      const cat = channel.category || 'Otros';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(channel);
      return acc;
    }, {});
  }, [channels, searchTerm, healthMap, hideOffline, filterMode, favorites]);

  const toggleCategory = (category) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const onlineCount = useMemo(() => {
    return Object.values(healthMap).filter(s => s === 'online').length;
  }, [healthMap]);

  const offlineCount = useMemo(() => {
    return Object.values(healthMap).filter(s => s === 'offline').length;
  }, [healthMap]);

  const favoritesCount = useMemo(() => {
    const channelUrls = new Set(channels.map(c => c.url));
    return favorites.filter(u => channelUrls.has(u)).length;
  }, [favorites, channels]);

  return (
    <aside className="w-80 h-full flex flex-col bg-charcoal border-r border-charcoal-border/60 select-none">
      <div className="p-4 border-b border-charcoal-border/50 bg-charcoal-dark/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Radio className="text-pumpkin w-5 h-5 animate-pulse" />
            <h2 className="font-bold text-sm tracking-wide text-white uppercase">
              Canales en Vivo
            </h2>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-pumpkin/15 text-pumpkin border border-pumpkin/30">
            {channels.length}
          </span>
        </div>

        {/* Pestañas de Navegación: Todos / Favoritos */}
        <div className="flex p-0.5 bg-charcoal-dark/90 rounded-lg border border-charcoal-border/50">
          <button
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all duration-150 ${
              filterMode === 'all'
                ? 'bg-pumpkin text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>Todos</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filterMode === 'all'
                  ? 'bg-white/20 text-white'
                  : 'bg-charcoal text-gray-400'
              }`}
            >
              {channels.length}
            </span>
          </button>

          <button
            onClick={() => setFilterMode('favorites')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all duration-150 ${
              filterMode === 'favorites'
                ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                : 'text-gray-400 hover:text-amber-400 hover:bg-white/5'
            }`}
          >
            <Star
              className={`w-3.5 h-3.5 ${
                filterMode === 'favorites' ? 'fill-current text-white' : 'text-amber-400'
              }`}
            />
            <span>Favoritos</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                filterMode === 'favorites'
                  ? 'bg-white/25 text-white'
                  : 'bg-charcoal text-amber-400/80 border border-amber-500/20'
              }`}
            >
              {favoritesCount}
            </span>
          </button>
        </div>

        {/* Botón Escanear Canales (#FD802E) */}
        <button
          onClick={handleScanChannels}
          disabled={isScanning}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 rounded-lg bg-pumpkin hover:bg-pumpkin-hover active:bg-pumpkin-active disabled:opacity-60 text-white font-semibold text-xs shadow-md shadow-pumpkin/25 transition-all duration-150 transform active:scale-[0.98]"
        >
          {isScanning ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verificando ({scanProgress.current}/{scanProgress.total})...</span>
            </>
          ) : (
            <>
              <Activity className="w-4 h-4" />
              <span>Escanear Canales</span>
            </>
          )}
        </button>

        {/* Resumen de Estado */}
        {(onlineCount > 0 || offlineCount > 0) && (
          <div className="flex items-center justify-between text-[11px] px-1 text-gray-400">
            <span className="flex items-center space-x-1 text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{onlineCount} Online</span>
            </span>
            <span className="flex items-center space-x-1 text-rose-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>{offlineCount} Caídos</span>
            </span>
          </div>
        )}

        {/* Botón Eliminar Canales Caídos (Rojos) */}
        {offlineCount > 0 && !isScanning && (
          <button
            onClick={() => {
              const offlineUrls = Object.entries(healthMap)
                .filter(([_, s]) => s === 'offline')
                .map(([u]) => u);
              if (onDeleteOfflineChannels) {
                onDeleteOfflineChannels(offlineUrls);
              }
              setHealthMap((prev) => {
                const next = { ...prev };
                offlineUrls.forEach((u) => delete next[u]);
                return next;
              });
            }}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 hover:text-white font-semibold text-xs shadow-sm transition-all duration-150 transform active:scale-[0.98]"
            title="Eliminar permanentemente de la lista los canales en rojo"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Eliminar {offlineCount} canales caídos</span>
          </button>
        )}

        {/* Notificación de lista depurada y opción de Restaurar */}
        {isCustomList && (
          <div className="flex items-center justify-between px-2 py-1 bg-charcoal-dark/70 rounded-md border border-charcoal-border/50 text-[11px] text-gray-400">
            <span className="truncate">Lista depurada ({channels.length})</span>
            <button
              onClick={onResetChannels}
              className="text-pumpkin hover:text-pumpkin-hover underline font-medium flex items-center space-x-1 shrink-0 ml-2 transition-colors"
              title="Restaurar lista original completa"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restablecer</span>
            </button>
          </div>
        )}

        {/* Switch Ocultar canales caídos */}
        <div className="flex items-center justify-between px-1 py-0.5">
          <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer select-none">
            <EyeOff className="w-3.5 h-3.5 text-gray-400" />
            <span>Ocultar canales caídos</span>
          </label>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={hideOffline}
              onChange={(e) => setHideOffline(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-4 bg-charcoal-border peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-pumpkin"></div>
          </label>
        </div>

        {/* Buscador */}
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar canal o categoría..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-charcoal-dark border border-charcoal-border rounded-lg text-xs text-white placeholder-gray-400 focus:outline-none focus:border-pumpkin focus:ring-1 focus:ring-pumpkin transition-all"
          />
        </div>
      </div>

      {/* Lista de Canales con Logos e Indicadores */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {Object.keys(groupedChannels).length === 0 ? (
          filterMode === 'favorites' ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Star className="w-6 h-6 stroke-[2]" />
              </div>
              <h3 className="text-white text-xs font-semibold">Tu lista de favoritos está vacía</h3>
              <p className="text-gray-400 text-[11px] leading-relaxed max-w-[210px] mx-auto">
                Haz clic en el ícono de estrella de cualquier canal para guardarlo en favoritos.
              </p>
            </div>
          ) : (
            <div className="text-center py-8 px-4 text-gray-400 text-xs">
              {hideOffline
                ? "No hay canales online disponibles con este filtro."
                : `No se encontraron canales que coincidan con "${searchTerm}".`}
            </div>
          )
        ) : (
          Object.entries(groupedChannels).map(([category, channelList]) => {
            const isCollapsed = !!collapsedCategories[category];

            return (
              <div key={category} className="space-y-1">
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-gray-300 hover:text-pumpkin hover:bg-charcoal-hover/40 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-2 truncate">
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-pumpkin" />
                    )}
                    <span className="truncate">{category}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 bg-charcoal-dark px-1.5 py-0.5 rounded">
                    {channelList.length}
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-1 pl-2">
                    {channelList.map((channel) => {
                      const isActive = selectedChannel?.url === channel.url;
                      const status = healthMap[channel.url];
                      const isFav = favorites.includes(channel.url);

                      return (
                        <button
                          key={channel.id || channel.url}
                          ref={(el) => {
                            if (isActive && el) {
                              el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                            }
                          }}
                          onClick={() => onSelectChannel(channel)}
                          className={`w-full group text-left px-3 py-2.5 rounded-lg text-xs flex items-center justify-between transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-pumpkin focus:ring-offset-1 focus:ring-offset-charcoal-dark focus:scale-[1.01] ${
                            isActive
                              ? 'bg-pumpkin text-white font-medium shadow-md shadow-pumpkin/25 translate-x-1 ring-1 ring-pumpkin-hover'
                              : 'text-gray-300 hover:text-white hover:bg-charcoal-hover/80 hover:translate-x-0.5 focus:bg-charcoal-hover focus:text-white'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <div
                              className={`w-6 h-6 rounded flex items-center justify-center shrink-0 overflow-hidden ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-charcoal-dark text-gray-400 group-hover:text-pumpkin group-hover:bg-charcoal'
                              }`}
                            >
                              {channel.logo ? (
                                <img
                                  src={channel.logo}
                                  alt={channel.name}
                                  className="w-full h-full object-contain p-0.5"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : isActive ? (
                                <Play className="w-3 h-3 fill-current" />
                              ) : (
                                <Tv2 className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <span className="truncate">{channel.name}</span>
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
                            {/* ⭐ Botón de Favorito */}
                            {onToggleFavorite && (
                              <span
                                role="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleFavorite(channel);
                                }}
                                className={`p-1 rounded hover:bg-white/10 transition-all ${
                                  isFav
                                    ? 'text-amber-400 opacity-100'
                                    : 'text-gray-500 hover:text-amber-400 opacity-0 group-hover:opacity-100'
                                }`}
                                title={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    isFav ? 'fill-amber-400 text-amber-400' : ''
                                  } transition-transform active:scale-125`}
                                />
                              </span>
                            )}
                            {/* 🟡 Verificando: Círculo parpadeante */}
                            {status === 'checking' && (
                              <span className="relative flex h-2.5 w-2.5" title="Verificando conectividad...">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                              </span>
                            )}

                            {/* 🟢 Online: Círculo verde */}
                            {status === 'online' && (
                              <span className="flex items-center space-x-1" title="Canal Online / Activo">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/30"></span>
                                <span className={`text-[10px] hidden group-hover:inline font-semibold ${isActive ? 'text-white' : 'text-emerald-400'}`}>
                                  Activo
                                </span>
                              </span>
                            )}

                            {/* 🔴 Offline: Círculo rojo + papelera para eliminar individualmente */}
                            {status === 'offline' && (
                              <div className="flex items-center space-x-1.5">
                                <span className="flex items-center space-x-1" title="Canal Caído / Offline">
                                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-500/30"></span>
                                  <span className={`text-[10px] hidden group-hover:inline font-semibold ${isActive ? 'text-white' : 'text-rose-400'}`}>
                                    Caído
                                  </span>
                                </span>
                                {onDeleteSingleChannel && (
                                  <span
                                    role="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onDeleteSingleChannel(channel.url);
                                      setHealthMap((prev) => {
                                        const next = { ...prev };
                                        delete next[channel.url];
                                        return next;
                                      });
                                    }}
                                    className="p-0.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/20 rounded transition-colors"
                                    title="Eliminar este canal caído"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-400" />
                                  </span>
                                )}
                              </div>
                            )}

                            {isActive && (
                              <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-3 border-t border-charcoal-border/40 text-[11px] text-gray-400 flex items-center justify-between bg-charcoal-dark/20">
        <span>Canal activo:</span>
        <span className="text-pumpkin font-medium truncate max-w-[150px]">
          {selectedChannel ? selectedChannel.name : 'Ninguno'}
        </span>
      </div>
    </aside>
  );
}
