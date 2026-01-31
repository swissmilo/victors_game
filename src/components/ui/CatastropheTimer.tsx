'use client';

import { useGameStore } from '@/stores';

export function CatastropheTimer() {
  const currentCatastrophe = useGameStore((state) => state.currentCatastrophe);
  const earthquake = useGameStore((state) => state.earthquake);
  const blackHole = useGameStore((state) => state.blackHole);
  const tsunami = useGameStore((state) => state.tsunami);
  const bloodRain = useGameStore((state) => state.bloodRain);
  
  // Get current countdown and phase based on active catastrophe
  const getDisplayInfo = () => {
    if (currentCatastrophe === 'earthquake') {
      const { phase, countdown, intensity } = earthquake;
      const intensityPercent = Math.round(intensity * 100);
      
      switch (phase) {
        case 'countdown':
          return {
            title: 'Next: Earthquake',
            countdown,
            color: 'text-amber-400',
            bgColor: 'bg-amber-900/50',
            showProgress: false,
            progress: 0,
            progressLabel: '',
            progressColor: 'bg-amber-500',
          };
        case 'rumbling':
          return {
            title: 'GROUND RUMBLING!',
            countdown: 0,
            color: 'text-amber-500',
            bgColor: 'bg-amber-900/60',
            showProgress: true,
            progress: intensityPercent,
            progressLabel: 'Tremors building...',
            progressColor: 'bg-amber-600',
          };
        case 'quake':
          return {
            title: 'EARTHQUAKE!',
            countdown: 0,
            color: 'text-orange-600',
            bgColor: 'bg-orange-900/80',
            showProgress: true,
            progress: 100,
            progressLabel: 'Blocks crumbling!',
            progressColor: 'bg-orange-700',
          };
        case 'settling':
          return {
            title: 'Settling...',
            countdown: 0,
            color: 'text-amber-300',
            bgColor: 'bg-amber-900/40',
            showProgress: true,
            progress: intensityPercent,
            progressLabel: `Intensity: ${intensityPercent}%`,
            progressColor: 'bg-amber-400',
          };
      }
    } else if (currentCatastrophe === 'black_hole') {
      const { phase, countdown, intensity, blackoutOpacity } = blackHole;
      const intensityPercent = Math.round(intensity * 100);
      
      switch (phase) {
        case 'countdown':
          return {
            title: 'Next: Black Hole',
            countdown,
            color: 'text-purple-400',
            bgColor: 'bg-purple-900/50',
            showProgress: false,
            progress: 0,
            progressLabel: '',
            progressColor: 'bg-purple-500',
          };
        case 'appearing':
          return {
            title: 'BLACK HOLE FORMING!',
            countdown: 0,
            color: 'text-purple-500',
            bgColor: 'bg-purple-900/60',
            showProgress: true,
            progress: intensityPercent,
            progressLabel: 'Singularity forming...',
            progressColor: 'bg-purple-600',
          };
        case 'pulling':
          return {
            title: 'GRAVITATIONAL PULL!',
            countdown: 0,
            color: 'text-purple-600',
            bgColor: 'bg-purple-900/80',
            showProgress: true,
            progress: 100,
            progressLabel: 'Being pulled in!',
            progressColor: 'bg-purple-700',
          };
        case 'consuming':
          return {
            title: 'CONSUMED!',
            countdown: 0,
            color: 'text-black',
            bgColor: 'bg-purple-900/90',
            showProgress: true,
            progress: Math.round(blackoutOpacity * 100),
            progressLabel: 'Entering the void...',
            progressColor: 'bg-black',
          };
        case 'blackout':
          return {
            title: '',
            countdown: 0,
            color: 'text-black',
            bgColor: 'bg-black',
            showProgress: false,
            progress: 0,
            progressLabel: '',
            progressColor: 'bg-black',
          };
      }
    } else if (currentCatastrophe === 'tsunami') {
      const { phase, countdown, waterLevel, baseWaterLevel, maxWaterLevel } = tsunami;
      const risePercent = Math.round(
        ((waterLevel - baseWaterLevel) / (maxWaterLevel - baseWaterLevel)) * 100
      );
      
      switch (phase) {
        case 'countdown':
          return {
            title: 'Next: Tsunami',
            countdown,
            color: 'text-blue-400',
            bgColor: 'bg-blue-900/50',
            showProgress: false,
            progress: 0,
            progressLabel: '',
            progressColor: 'bg-blue-500',
          };
        case 'rising':
          return {
            title: 'TSUNAMI RISING!',
            countdown: 0,
            color: 'text-red-500',
            bgColor: 'bg-red-900/50',
            showProgress: true,
            progress: risePercent,
            progressLabel: `Water Level: ${risePercent}%`,
            progressColor: 'bg-blue-500',
          };
        case 'peak':
          return {
            title: 'TSUNAMI PEAK!',
            countdown: 0,
            color: 'text-red-600',
            bgColor: 'bg-red-900/70',
            showProgress: true,
            progress: 100,
            progressLabel: 'Maximum Flood!',
            progressColor: 'bg-red-500',
          };
        case 'falling':
          return {
            title: 'Water Receding',
            countdown: 0,
            color: 'text-blue-300',
            bgColor: 'bg-blue-900/50',
            showProgress: true,
            progress: risePercent,
            progressLabel: `Water Level: ${risePercent}%`,
            progressColor: 'bg-blue-400',
          };
      }
    } else {
      const { phase, countdown, intensity } = bloodRain;
      const intensityPercent = Math.round(intensity * 100);
      
      switch (phase) {
        case 'countdown':
          return {
            title: 'Next: Blood Rain',
            countdown,
            color: 'text-red-400',
            bgColor: 'bg-red-900/50',
            showProgress: false,
            progress: 0,
            progressLabel: '',
            progressColor: 'bg-red-500',
          };
        case 'starting':
          return {
            title: 'BLOOD RAIN COMING!',
            countdown: 0,
            color: 'text-red-500',
            bgColor: 'bg-red-900/60',
            showProgress: true,
            progress: intensityPercent,
            progressLabel: `Intensity: ${intensityPercent}%`,
            progressColor: 'bg-red-600',
          };
        case 'active':
          return {
            title: 'BLOOD RAIN!',
            countdown: 0,
            color: 'text-red-600',
            bgColor: 'bg-red-900/80',
            showProgress: true,
            progress: 100,
            progressLabel: 'The blood rains down!',
            progressColor: 'bg-red-700',
          };
        case 'ending':
          return {
            title: 'Rain Subsiding',
            countdown: 0,
            color: 'text-red-300',
            bgColor: 'bg-red-900/40',
            showProgress: true,
            progress: intensityPercent,
            progressLabel: `Intensity: ${intensityPercent}%`,
            progressColor: 'bg-red-400',
          };
      }
    }
  };
  
  const info = getDisplayInfo();
  
  // Format countdown as MM:SS
  const minutes = Math.floor(info.countdown / 60);
  const seconds = Math.floor(info.countdown % 60);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2">
      <div className={`px-6 py-3 rounded-lg ${info.bgColor} backdrop-blur-sm border border-white/20`}>
        <div className={`text-center font-bold ${info.color}`}>
          {info.title}
        </div>
        
        {!info.showProgress ? (
          <div className="text-center text-white text-3xl font-mono font-bold">
            {timeString}
          </div>
        ) : (
          <div className="mt-1">
            {/* Progress bar */}
            <div className="w-48 h-4 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${info.progressColor} transition-all duration-100`}
                style={{ width: `${info.progress}%` }}
              />
            </div>
            <div className="text-center text-white text-sm mt-1">
              {info.progressLabel}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
