import React from 'react';
import type { Achievement } from '../engine/achievements';

interface LevelUpModalProps {
  achievement: Achievement | null;
  onClose: () => void;
}

export const LevelUpModal: React.FC<LevelUpModalProps> = ({ achievement, onClose }) => {
  if (!achievement) return null;

  return (
    <div className="levelup-overlay" onClick={onClose}>
      <div className="levelup-card" onClick={(e) => e.stopPropagation()}>
        <div className="levelup-header">LEVEL UP!</div>
        <div className="levelup-level">LV.{achievement.level}</div>
        <div className="levelup-title">称号：【{achievement.title}】</div>
        <p className="levelup-message">{achievement.message}</p>
        <button className="btn primary big" onClick={onClose}>
          さらに鍛錬を続ける
        </button>
      </div>
    </div>
  );
};