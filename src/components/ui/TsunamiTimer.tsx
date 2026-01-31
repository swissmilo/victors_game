'use client';

import { useGameStore } from '@/stores';

export function TsunamiTimer() {
  const tsunami = useGameStore((state) => state.tsunami);
  const { phase, countdown, waterLevel, baseWaterLevel, maxWaterLevel } = tsunami;
  
  // Format countdown as MM:SS
  const minutes = Math.floor(countdown / 60);
  const seconds = Math.floor(countdown % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Calculate water rise percentage
  const risePercent = Math.round(
    ((waterLevel - baseWaterLevel) / (maxWaterLevel - baseWaterLevel)) * 100
  );
  
  // Get phase display text and color
  const getPhaseInfo = () => {
    switch (phase) {
      case 'countdown':
        return { text: 'Next Tsunami', color: 'text-yellow-400', bgColor: 'bg-yellow-900/50' };
      case 'rising':
        return { text: 'TSUNAMI RISING!', color: 'text-red-500', bgColor: 'bg-red-900/50' };
      case 'peak':
        return { text: 'TSUNAMI PEAK!', color: 'text-red-600', bgColor: 'bg-red-900/70' };
      case 'falling':
        return { text: 'Water Receding', color: 'text-blue-400', bgColor: 'bg-blue-900/50' };
    }
  };
  
  const phaseInfo = getPhaseInfo();
  
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2">
      <div className={`px-6 py-3 rounded-lg ${phaseInfo.bgColor} backdrop-blur-sm border border-white/20`}>
        <div className={`text-center font-bold ${phaseInfo.color}`}>
          {phaseInfo.text}
        </div>
        
        {phase === 'countdown' ? (
          <div className="text-center text-white text-3xl font-mono font-bold">
            {timeString}
          </div>
        ) : (
          <div className="mt-1">
            {/* Water level bar */}
            <div className="w-48 h-4 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${risePercent}%` }}
              />
            </div>
            <div className="text-center text-white text-sm mt-1">
              Water Level: {risePercent}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
