import React from 'react';
import { Tv, Star } from 'lucide-react';

export default function TvOsdBanner({ channel, isVisible, isFavorite }) {
  if (!isVisible || !channel) return null;

  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-300 pointer-events-none animate-in fade-in slide-in-from-top-4">
      <div className="bg-charcoal-dark/95 backdrop-blur-md border-2 border-pumpkin/60 text-white px-6 py-3.5 rounded-2xl shadow-2xl shadow-pumpkin/20 flex items-center space-x-4 min-w-[340px] max-w-lg">
        {/* Logo del canal o icono TV */}
        <div className="w-14 h-14 rounded-xl bg-charcoal border border-charcoal-border flex items-center justify-center overflow-hidden flex-shrink-0 p-1">
          {channel.logo ? (
            <img
              src={channel.logo}
              alt={channel.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          ) : (
            <Tv size={24} className="text-pumpkin" />
          )}
        </div>

        {/* Información del canal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-pumpkin px-2 py-0.5 rounded bg-pumpkin/15 border border-pumpkin/30">
              {channel.category || 'IPTV Live'}
            </span>
            {isFavorite && (
              <span className="flex items-center text-amber-400 text-xs">
                <Star size={13} className="fill-amber-400 mr-0.5" /> Favorito
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold text-white truncate mt-0.5">
            {channel.name}
          </h2>
          <div className="flex items-center space-x-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>En vivo • Smart TV</span>
          </div>
        </div>
      </div>
    </div>
  );
}
