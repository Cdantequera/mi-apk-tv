import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ExternalLink,
  Radio,
  Star
} from 'lucide-react';
import { isRedirectUrl, resolveStreamUrl } from '../utils/urlResolver';
import { isTvDevice } from '../utils/tvDetect';

export default function Player({
  channel,
  isFavorite,
  onToggleFavorite,
  isTvMode: propIsTvMode,
  isSidebarOpen
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);

  const isTv = propIsTvMode !== undefined ? propIsTvMode : isTvDevice();

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingStatus, setResolvingStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeStreamUrl, setActiveStreamUrl] = useState('');
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(() => {
    return typeof document !== 'undefined' && !!document.fullscreenElement;
  });
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  // Escuchar cambios nativos de pantalla completa
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

  // En TV / APK, cuando está en pantalla completa o con barra oculta, se activa modo limpio
  const isFullscreenOnTv = isTv && (isFullscreen || isSidebarOpen === false);

  const isYouTube = channel?.url?.includes('youtube.com') ||
                    channel?.url?.includes('youtu.be') ||
                    !!channel?.youtubeChannelId;

  // Obtener URL de inserción (embed) para YouTube Live
  const getYouTubeEmbedUrl = (chan) => {
    if (!chan) return '';
    if (chan.youtubeChannelId) {
      return `https://www.youtube-nocookie.com/embed/live_stream?channel=${chan.youtubeChannelId}&autoplay=1`;
    }
    const url = chan.url || '';
    if (url.includes('/channel/')) {
      const channelId = url.split('/channel/')[1].split('/')[0].split('?')[0];
      return `https://www.youtube-nocookie.com/embed/live_stream?channel=${channelId}&autoplay=1`;
    }
    return url;
  };

  // Inicialización y carga de transmisión HLS (.m3u8)
  const loadStream = useCallback((streamUrl) => {
    if (!streamUrl || !videoRef.current) return;

    setIsError(false);
    setIsBuffering(true);
    setErrorMessage('');

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const video = videoRef.current;

    // En Smart TV / APK, el audio debe estar siempre habilitado y al 100% para el control remoto
    if (isTv) {
      video.muted = false;
      video.volume = 1.0;
      setIsMuted(false);
      setVolume(1.0);
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        xhrSetup: function (xhr, url) {
          // Si la URL es de vodgc (El Trece, TN, etc.)
          if (url.includes('vodgc.net')) {
            // Evita enviar cookies o cabeceras de origen cruzado innecesarias
            xhr.withCredentials = false;
          }
        },
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        if (isTv) {
          video.muted = false;
          video.volume = 1.0;
        }
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              if (isTv) {
                video.muted = false;
                video.volume = 1.0;
              }
            })
            .catch(() => {
              if (isTv) {
                // En Smart TV / APK nunca mutear el video; el control remoto físico maneja el volumen
                video.muted = false;
                video.volume = 1.0;
                video.play()
                  .then(() => setIsPlaying(true))
                  .catch((err) => console.warn('Autoplay en TV:', err));
              } else {
                // En navegadores web de escritorio con políticas de autoplay estrictas
                video.muted = true;
                setIsMuted(true);
                video.play()
                  .then(() => setIsPlaying(true))
                  .catch(() => setIsPlaying(false));
              }
            });
        }
      });

      let networkRetries = 0;
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (data.response?.code === 403 || data.response?.code === 401) {
                setIsBuffering(false);
                setIsError(true);
                setErrorMessage('Enlace no disponible (403): El token de transmisión expiró o está protegido.');
                hls.destroy();
                break;
              }
              networkRetries++;
              if (networkRetries <= 2) {
                hls.startLoad();
              } else {
                setIsBuffering(false);
                setIsError(true);
                setErrorMessage('Error de red o transmisión no disponible');
                hls.destroy();
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setIsBuffering(false);
              setIsError(true);
              setErrorMessage('Transmisión no disponible');
              hls.destroy();
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      if (isTv) {
        video.muted = false;
        video.volume = 1.0;
      }
      video.addEventListener('loadedmetadata', () => {
        setIsBuffering(false);
        if (isTv) {
          video.muted = false;
          video.volume = 1.0;
        }
        video.play().then(() => setIsPlaying(true));
      });
    } else {
      setIsError(true);
      setErrorMessage('Tu sistema no soporta decodificación HLS.');
      setIsBuffering(false);
    }
  }, [isTv]);

  // Manejo de carga de canal con resolución nativa en Rust para redirecciones dinámicas
  useEffect(() => {
    let isCancelled = false;

    const setupChannel = async () => {
      if (!channel?.url) return;

      if (isYouTube) {
        setIsResolving(false);
        setIsBuffering(false);
        setIsError(false);
        return;
      }

      // Limpiar instancia previa de HLS
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Si es un enlace de acortador o redirección dinámica (como Pluto TV jmp2.uk)
      if (isRedirectUrl(channel.url)) {
        setIsResolving(true);
        setResolvingStatus('Resolviendo enlace seguro y redirección...');
        setIsBuffering(false);
        setIsError(false);
        setErrorMessage('');

        try {
          const finalUrl = await resolveStreamUrl(channel.url);
          if (isCancelled) return;

          setResolvingStatus('Cargando señal...');
          setActiveStreamUrl(finalUrl);
          setIsResolving(false);
          loadStream(finalUrl);
        } catch (err) {
          if (isCancelled) return;
          console.error('[Player] Error resolviendo stream URL:', err);
          setIsResolving(false);
          setIsBuffering(false);
          setIsError(true);
          setErrorMessage(
            typeof err === 'string'
              ? err
              : 'No se pudo resolver la redirección del servidor remoto. Es posible que el enlace haya expirado.'
          );
        }
      } else {
        // Enlace directo HLS
        setIsResolving(false);
        setActiveStreamUrl(channel.url);
        loadStream(channel.url);
      }
    };

    setupChannel();

    return () => {
      isCancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel, isYouTube, loadStream]);

  // Manejo de eventos nativos del elemento <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isYouTube) return;

    const handleWaiting = () => setIsBuffering(true);
    const handlePlaying = () => {
      setIsBuffering(false);
      setIsPlaying(true);
      if (isTv && videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = 1.0;
        setIsMuted(false);
        setVolume(1.0);
      }
    };
    const handlePause = () => setIsPlaying(false);
    const handleError = () => {
      setIsBuffering(false);
      setIsError(true);
      setErrorMessage('Transmisión no disponible');
    };

    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
    };
  }, [isYouTube, isTv]);

  // Asegurar que el audio siempre esté activo y al 100% en Smart TV / APK
  useEffect(() => {
    if (isTv && videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.volume = 1.0;
      setIsMuted(false);
      setVolume(1.0);
    }
  }, [channel, isTv]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isBuffering && !isError && !isResolving) setShowControls(false);
    }, 3000);
  };

  // Ocultar controles automáticamente después de iniciar reproducción
  useEffect(() => {
    if (isPlaying && !isBuffering && !isError && !isResolving) {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying, isBuffering, isError, isResolving, channel]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) videoRef.current.pause();
    else videoRef.current.play().catch(console.error);
  };

  const handleVolumeChange = (e) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = newVol === 0;
      setIsMuted(newVol === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  };

  // Reintento manual de conexión
  const handleRetry = async () => {
    if (!channel?.url) return;

    if (isRedirectUrl(channel.url)) {
      setIsResolving(true);
      setResolvingStatus('Reintentando resolución de enlace...');
      setIsError(false);
      setErrorMessage('');

      try {
        const finalUrl = await resolveStreamUrl(channel.url);
        setResolvingStatus('Cargando señal...');
        setActiveStreamUrl(finalUrl);
        setIsResolving(false);
        loadStream(finalUrl);
      } catch (err) {
        setIsResolving(false);
        setIsBuffering(false);
        setIsError(true);
        setErrorMessage(
          typeof err === 'string'
            ? err
            : 'No se pudo reconectar con el servidor remoto. Intenta nuevamente más tarde.'
        );
      }
    } else {
      loadStream(activeStreamUrl || channel.url);
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative flex-1 h-full bg-charcoal-dark flex items-center justify-center overflow-hidden group select-none"
    >
      {/* Reproductor YouTube Live o HLS Nativo */}
      {isYouTube ? (
        <div className="w-full h-full bg-black relative flex items-center justify-center">
          <iframe
            src={getYouTubeEmbedUrl(channel)}
            title={channel?.name || 'YouTube Live'}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          className="w-full h-full object-contain bg-black"
          onClick={togglePlay}
          playsInline
        />
      )}

      {/* Pantalla de Resolución Nativa en Rust (Tauri / jmp2.uk / Redirecciones dinámicas) */}
      {!isYouTube && isResolving && !isError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-charcoal/95 backdrop-blur-md z-25 p-6 text-center">
          <div className="relative mb-5">
            <div className="w-16 h-16 rounded-2xl bg-pumpkin/10 border border-pumpkin/30 flex items-center justify-center shadow-lg shadow-pumpkin/10">
              <Loader2 className="w-8 h-8 text-pumpkin animate-spin stroke-[2.5]" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-charcoal-dark border border-pumpkin flex items-center justify-center">
              <Radio className="w-3.5 h-3.5 text-pumpkin animate-pulse" />
            </div>
          </div>
          <h3 className="text-white text-base font-bold tracking-wide mb-1.5">
            {resolvingStatus || 'Resolviendo enlace seguro y redirección...'}
          </h3>
          <p className="text-pumpkin text-xs font-medium tracking-wide mb-4">
            Obteniendo token de sesión y salto HTTP 302 vía Rust Backend
          </p>
          <div className="flex items-center space-x-2 text-[11px] text-gray-300 bg-charcoal-dark/90 px-3.5 py-1.5 rounded-full border border-charcoal-border shadow-inner">
            <span className="w-2 h-2 rounded-full bg-pumpkin animate-ping"></span>
            <span className="font-mono truncate max-w-xs">{channel?.url}</span>
          </div>
        </div>
      )}

      {/* Buffering HLS */}
      {!isYouTube && isBuffering && !isError && !isResolving && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none">
          <Loader2 className="w-12 h-12 text-pumpkin animate-spin mb-3 stroke-[2.5]" />
          <span className="text-white text-sm font-medium tracking-wide">
            Cargando transmisión...
          </span>
          <span className="text-pumpkin text-xs mt-1 animate-pulse font-medium">
            Estableciendo búfer HLS
          </span>
        </div>
      )}

      {/* Error Fallback: Transmisión no disponible */}
      {!isYouTube && isError && !isResolving && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-charcoal/95 backdrop-blur-md z-30 p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-pumpkin/15 border border-pumpkin/30 flex items-center justify-center mb-4 text-pumpkin">
            <AlertTriangle className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h3 className="text-pumpkin text-xl font-bold mb-2">
            {errorMessage || 'Transmisión no disponible'}
          </h3>
          <p className="text-gray-300 text-xs max-w-md mb-6 leading-relaxed">
            El servidor remoto del canal no responde o el enlace dinámico no pudo ser verificado.
          </p>
          <button
            onClick={handleRetry}
            className="flex items-center space-x-2 px-5 py-2.5 bg-pumpkin hover:bg-pumpkin-hover text-white rounded-lg text-xs font-semibold shadow-lg shadow-pumpkin/30 transition-all duration-150 transform hover:scale-105"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reintentar conexión</span>
          </button>
        </div>
      )}

      {/* Superposición Superior (Nombre de Canal, Categoría e Indicadores) */}
      {!isFullscreenOnTv && (
        <div
          className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between z-10 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-600/90 text-white rounded-md text-[10px] font-bold tracking-wider uppercase">
              <span className="w-2 h-2 rounded-full bg-white animate-ping mr-0.5"></span>
              <span>EN VIVO</span>
            </div>
            <div className="flex items-center space-x-2">
              {channel?.logo && (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  className="w-6 h-6 object-contain rounded bg-black/40 p-0.5"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-white font-bold text-sm tracking-wide leading-none">
                    {channel?.name || 'Selecciona un canal'}
                  </h1>
                  {channel && onToggleFavorite && (
                    <button
                      onClick={() => onToggleFavorite(channel)}
                      className="p-1 rounded-md hover:bg-white/10 transition-colors"
                      title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isFavorite
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-gray-400 hover:text-amber-400'
                        } transition-transform active:scale-125`}
                      />
                    </button>
                  )}
                </div>
                <span className="text-pumpkin text-[11px] font-medium">
                  {channel?.category || ''}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isYouTube ? (
              <a
                href={channel.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center space-x-1 text-xs text-pumpkin bg-charcoal/80 hover:bg-charcoal px-2.5 py-1 rounded border border-charcoal-border transition-colors"
                title="Abrir en YouTube"
              >
                <span>YouTube Live</span>
                <ExternalLink size={12} />
              </a>
            ) : (
              <>
                {isRedirectUrl(channel?.url) && (
                  <span className="flex items-center space-x-1 text-[11px] text-pumpkin bg-pumpkin/10 px-2 py-1 rounded border border-pumpkin/20 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-pumpkin animate-pulse"></span>
                    <span>Dinámico (Pluto TV)</span>
                  </span>
                )}
                <div className="text-xs text-gray-300 font-mono bg-charcoal/80 px-2.5 py-1 rounded border border-charcoal-border">
                  HLS • 1080p
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Barra de Controles Inferior (Para HLS) */}
      {!isYouTube && !isFullscreenOnTv && (
        <div
          className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent z-10 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-pumpkin hover:bg-pumpkin-hover text-white flex items-center justify-center shadow-md shadow-pumpkin/30 transition-transform active:scale-95"
                title={isPlaying ? 'Pausar' : 'Reproducir'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              {/* Controles de volumen en pantalla (Solo en PC; en TV/APK el volumen se controla con el control remoto físico) */}
              {!isTv && (
                <div className="flex items-center space-x-2">
                  <button onClick={toggleMute} className="text-gray-300 hover:text-pumpkin transition-colors p-1">
                    {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-pumpkin" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-20 h-1.5 bg-charcoal-border rounded-lg appearance-none cursor-pointer accent-pumpkin"
                  />
                </div>
              )}
            </div>

            <button
              onClick={toggleFullscreen}
              className="text-gray-300 hover:text-pumpkin transition-colors p-1.5 rounded-lg hover:bg-charcoal"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
