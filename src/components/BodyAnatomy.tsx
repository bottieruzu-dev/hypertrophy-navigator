import React from 'react';

interface BodyAnatomyProps {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
}

export const BodyAnatomy: React.FC<BodyAnatomyProps> = ({ primaryMuscles, secondaryMuscles = [] }) => {
  const getMuscleStatus = (code: string) => {
    if (primaryMuscles.includes(code)) return 'primary';
    if (secondaryMuscles.includes(code)) return 'secondary';
    return 'inactive';
  };

  return (
    <div className="hud-anatomy-card">
      <div className="hud-header">
        <span className="hud-tag">TARGET SCANNER v2.0</span>
        <span className="hud-status">
          {primaryMuscles.length > 0 ? 'TARGET LOCKED' : 'STANDBY'}
        </span>
      </div>

      <div className="hud-anatomy-wrapper">
        <svg viewBox="0 0 240 340" className="hud-anatomy-svg">
          <defs>
            {/* 主働筋用 ネオンシアンフィルター */}
            <filter id="hud-cyan-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComponentTransfer in="blur" result="glow">
                <feFuncA type="linear" slope="2" />
              </feComponentTransfer>
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* 副次筋用 ネオンマゼンタフィルター */}
            <filter id="hud-purple-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* スキャンライン用パターン */}
            <pattern id="scanGrid" width="12" height="12" patternUnits="userSpaceOnUse">
              <path d="M 12 0 L 0 0 0 12" fill="none" stroke="rgba(0, 242, 254, 0.08)" strokeWidth="0.5" />
            </pattern>
          </defs>

          {/* 背景グリッドスキャン */}
          <rect width="240" height="340" fill="url(#scanGrid)" />

          {/* 照準・ターゲット枠 */}
          <g className="hud-crosshair" stroke="rgba(0, 242, 254, 0.25)" strokeWidth="1" fill="none">
            <circle cx="120" cy="160" r="110" strokeDasharray="4 4" />
            <line x1="120" y1="10" x2="120" y2="40" />
            <line x1="120" y1="280" x2="120" y2="310" />
            <line x1="10" y1="160" x2="40" y2="160" />
            <line x1="200" y1="160" x2="230" y2="160" />
          </g>

          {/* 人体高精細シルエット */}
          <g className="hud-body-frame" stroke="#2a324b" strokeWidth="1.2" fill="#121624">
            {/* 頭部・首 */}
            <path d="M120,25 C128,25 134,33 134,43 C134,53 128,60 120,60 C112,60 106,53 106,43 C106,33 112,25 120,25 Z" />
            <path d="M113,59 L127,59 L130,68 L110,68 Z" />

            {/* 胴体・骨盤ベース */}
            <path d="M92,68 C108,65 132,65 148,68 C158,110 148,165 135,175 C120,180 120,180 105,175 C92,165 82,110 92,68 Z" />

            {/* 左腕・右腕ベース */}
            <path d="M88,70 L65,115 L52,165 C48,168 56,172 62,165 L76,122 L88,88 Z" />
            <path d="M152,70 L175,115 L188,165 C192,168 184,172 178,165 L164,122 L152,88 Z" />

            {/* 脚部ベース */}
            <path d="M102,175 L95,245 L90,310 C100,312 108,308 108,245 L116,178 Z" />
            <path d="M138,175 L145,245 L150,310 C140,312 132,308 132,245 L124,178 Z" />
          </g>

          {/* --- 筋肉部位（インタラクティブ層） --- */}
          {/* 三角筋中部（delt_lateral） */}
          <path d="M78,72 Q68,88 74,102 Q84,98 86,80 Z" className={`hud-muscle ${getMuscleStatus('delt_lateral')}`} />
          <path d="M162,72 Q172,88 166,102 Q156,98 154,80 Z" className={`hud-muscle ${getMuscleStatus('delt_lateral')}`} />

          {/* 三角筋前部（delt_front） */}
          <path d="M86,70 Q78,82 84,95 Q92,92 92,76 Z" className={`hud-muscle ${getMuscleStatus('delt_front')}`} />
          <path d="M154,70 Q162,82 156,95 Q148,92 148,76 Z" className={`hud-muscle ${getMuscleStatus('delt_front')}`} />

          {/* 大胸筋上部（chest_upper） */}
          <path d="M94,74 Q120,76 120,90 Q98,92 92,80 Z" className={`hud-muscle ${getMuscleStatus('chest_upper')}`} />
          <path d="M146,74 Q120,76 120,90 Q142,92 148,80 Z" className={`hud-muscle ${getMuscleStatus('chest_upper')}`} />

          {/* 大胸筋中部（chest_mid） */}
          <path d="M92,82 Q120,90 120,106 Q96,106 90,92 Z" className={`hud-muscle ${getMuscleStatus('chest_mid')}`} />
          <path d="M148,82 Q120,90 120,106 Q144,106 150,92 Z" className={`hud-muscle ${getMuscleStatus('chest_mid')}`} />

          {/* 腹直筋（abs_rectus） */}
          <path d="M106,112 L117,112 L117,128 L106,128 Z M123,112 L134,112 L134,128 L123,128 Z" className={`hud-muscle ${getMuscleStatus('abs_rectus')}`} />
          <path d="M106,131 L117,131 L117,147 L106,147 Z M123,131 L134,131 L134,147 L123,147 Z" className={`hud-muscle ${getMuscleStatus('abs_rectus')}`} />
          <path d="M107,150 L117,150 L117,164 L107,164 Z M123,150 L133,150 L133,164 L123,164 Z" className={`hud-muscle ${getMuscleStatus('abs_rectus')}`} />

          {/* 上腕二頭筋（biceps_long / biceps_short） */}
          <path d="M74,104 Q68,126 78,138 Q84,126 82,106 Z" className={`hud-muscle ${getMuscleStatus('biceps_long')}`} />
          <path d="M166,104 Q172,126 162,138 Q156,126 158,106 Z" className={`hud-muscle ${getMuscleStatus('biceps_short')}`} />

          {/* 広背筋（lat） */}
          <path d="M88,110 Q78,140 95,165 Q100,135 98,112 Z" className={`hud-muscle ${getMuscleStatus('lat')}`} />
          <path d="M152,110 Q162,140 145,165 Q140,135 142,112 Z" className={`hud-muscle ${getMuscleStatus('lat')}`} />

          {/* 大腿四頭筋（quads） */}
          <path d="M98,185 Q86,230 96,270 Q110,270 114,190 Z" className={`hud-muscle ${getMuscleStatus('quads')}`} />
          <path d="M142,185 Q154,230 144,270 Q130,270 126,190 Z" className={`hud-muscle ${getMuscleStatus('quads')}`} />
        </svg>
      </div>
    </div>
  );
};