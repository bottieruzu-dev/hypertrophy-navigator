import React from 'react';

interface BodyAnatomyProps {
  primaryMuscles: string[];
  secondaryMuscles?: string[];
}

export const BodyAnatomy: React.FC<BodyAnatomyProps> = ({ primaryMuscles, secondaryMuscles = [] }) => {
  const getMuscleClass = (code: string) => {
    if (primaryMuscles.includes(code)) return 'muscle primary-glow';
    if (secondaryMuscles.includes(code)) return 'muscle secondary-glow';
    return 'muscle inactive';
  };

  return (
    <div className="anatomy-container">
      <svg viewBox="0 0 200 320" className="anatomy-svg">
        <defs>
          <filter id="neon-blue" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="neon-purple" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* 人体ベースシルエット（前面） */}
        <g className="body-outline">
          {/* 頭部 */}
          <circle cx="100" cy="35" r="16" fill="var(--card)" stroke="var(--line)" strokeWidth="1.5"/>
          {/* 胴体・ベース */}
          <path d="M75,55 Q100,50 125,55 Q135,90 120,150 Q100,160 80,150 Q65,90 75,55 Z" fill="var(--card)" stroke="var(--line)" strokeWidth="1.5"/>
          {/* 腕ベース */}
          <path d="M70,58 L52,110 Q48,115 45,160 Q52,160 56,120 L73,75 Z" fill="var(--card)" stroke="var(--line)" strokeWidth="1"/>
          <path d="M130,58 L148,110 Q152,115 155,160 Q148,160 144,120 L127,75 Z" fill="var(--card)" stroke="var(--line)" strokeWidth="1"/>
          {/* 脚ベース */}
          <path d="M80,150 L75,230 L72,290 Q85,290 88,230 L95,155 Z" fill="var(--card)" stroke="var(--line)" strokeWidth="1"/>
          <path d="M120,150 L125,230 L128,290 Q115,290 112,230 L105,155 Z" fill="var(--card)" stroke="var(--line)" strokeWidth="1"/>
        </g>

        {/* --- 筋肉パーツレイヤー --- */}
        {/* 三角筋前部・中部 */}
        <path d="M68,58 Q60,65 58,80 Q70,82 73,66 Z" className={getMuscleClass('delt_front')} />
        <path d="M132,58 Q140,65 142,80 Q130,82 127,66 Z" className={getMuscleClass('delt_front')} />
        <path d="M62,62 Q54,75 56,88 Q64,88 66,74 Z" className={getMuscleClass('delt_lateral')} />
        <path d="M138,62 Q146,75 144,88 Q136,88 134,74 Z" className={getMuscleClass('delt_lateral')} />

        {/* 大胸筋（上部・中部・下部） */}
        <path d="M78,60 Q100,62 100,74 Q82,75 75,67 Z" className={getMuscleClass('chest_upper')} />
        <path d="M122,60 Q100,62 100,74 Q118,75 125,67 Z" className={getMuscleClass('chest_upper')} />
        <path d="M76,68 Q100,75 100,88 Q80,88 74,78 Z" className={getMuscleClass('chest_mid')} />
        <path d="M124,68 Q100,75 100,88 Q120,88 126,78 Z" className={getMuscleClass('chest_mid')} />

        {/* 腹直筋 */}
        <path d="M88,95 L98,95 L98,108 L88,108 Z M102,95 L112,95 L112,108 L102,108 Z" className={getMuscleClass('abs_rectus')} />
        <path d="M88,111 L98,111 L98,124 L88,124 Z M102,111 L112,111 L112,124 L102,124 Z" className={getMuscleClass('abs_rectus')} />
        <path d="M89,127 L98,127 L98,138 L89,138 Z M102,127 L111,127 L111,138 L102,138 Z" className={getMuscleClass('abs_rectus')} />

        {/* 上腕二頭筋 */}
        <path d="M63,82 Q56,100 64,112 Q70,100 68,84 Z" className={getMuscleClass('biceps_long')} />
        <path d="M137,82 Q144,100 136,112 Q130,100 132,84 Z" className={getMuscleClass('biceps_short')} />

        {/* 広背筋 */}
        <path d="M72,90 Q65,115 78,135 Q82,110 80,92 Z" className={getMuscleClass('lat')} />
        <path d="M128,90 Q135,115 122,135 Q118,110 120,92 Z" className={getMuscleClass('lat')} />

        {/* 大腿四頭筋 */}
        <path d="M78,160 Q68,200 76,230 Q88,230 92,165 Z" className={getMuscleClass('quads')} />
        <path d="M122,160 Q132,200 124,230 Q112,230 108,165 Z" className={getMuscleClass('quads')} />
      </svg>
    </div>
  );
};