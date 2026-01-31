'use client';

export function Crosshair() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-6 h-6">
        {/* Horizontal line */}
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-white/80 -translate-y-1/2" />
        {/* Vertical line */}
        <div className="absolute left-1/2 top-0 h-full w-0.5 bg-white/80 -translate-x-1/2" />
      </div>
    </div>
  );
}
