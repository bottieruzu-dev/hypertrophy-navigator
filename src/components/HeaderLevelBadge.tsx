import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { calculateUserLevel, type IconName } from '../engine/achievements';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Egg, Milk, Dumbbell, Flame, UtensilsCrossed,
  Wand2, Footprints, Bot, Zap, Crown, Award
} from 'lucide-react';

/** Lucideベクターアイコンのレンダラー */
const TitleIcon: React.FC<{ iconName: IconName; size?: number }> = ({ iconName, size = 14 }) => {
  const props = { size, className: "title-lucide-icon" };
  switch (iconName) {
    case 'Egg': return <Egg {...props} />;
    case 'Milk': return <Milk {...props} />;
    case 'Dumbbell': return <Dumbbell {...props} />;
    case 'Flame': return <Flame {...props} />;
    case 'UtensilsCrossed': return <UtensilsCrossed {...props} />;
    case 'Wand2': return <Wand2 {...props} />;
    case 'Footprints': return <Footprints {...props} />;
    case 'Bot': return <Bot {...props} />;
    case 'Zap': return <Zap {...props} />;
    case 'Crown': return <Crown {...props} />;
    default: return <Award {...props} />;
  }
};

export const HeaderLevelBadge: React.FC = () => {
  const [showDetail, setShowDetail] = useState(false);

  // 筋トレ・Week0・体組成・栄養ログの全実績をリアルタイム集計
  const stats = useLiveQuery(async () => {
    const allSets = await db.sets.toArray();
    const totalSets = allSets.length;
    const totalVolumeKg = allSets.reduce((sum, s) => sum + (s.volumeLoad || 0), 0);

    const bodyMetrics = await db.bodyMetrics.toArray();
    const bodyMetricDays = bodyMetrics.length;

    const nutritionLogs = await db.nutritionLogs.toArray();
    const totalProteinCheckedG = nutritionLogs.reduce((sum, n) => sum + (n.proteinCheckedG || 0), 0);

    return { totalSets, totalVolumeKg, bodyMetricDays, totalProteinCheckedG };
  }, []);

  const levelInfo = calculateUserLevel({
    totalSets: stats?.totalSets ?? 0,
    totalVolumeKg: stats?.totalVolumeKg ?? 0,
    bodyMetricDays: stats?.bodyMetricDays ?? 0,
    totalProteinCheckedG: stats?.totalProteinCheckedG ?? 0,
  });

  return (
    <>
      <div className="game-level-badge" onClick={() => setShowDetail(true)}>
        <div className="badge-level-box">
          <span className="badge-lv-label">LV</span>
          <span className="badge-lv-num">{levelInfo.level}</span>
        </div>
        <div className="badge-info-box">
          <div className="badge-title-wrap">
            <span className="badge-title">{levelInfo.title}</span>
            <TitleIcon iconName={levelInfo.iconName} size={13} />
          </div>
          <div className="badge-exp-bar">
            <div
              className="badge-exp-fill"
              style={{ width: `${levelInfo.progressPct}%` }}
            />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showDetail && (
          <motion.div
            className="levelup-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              className="level-status-modal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="status-modal-header">PLAYER STATUS</div>
              <div className="status-modal-avatar">
                <span className="status-lv-badge">LV.{levelInfo.level}</span>
              </div>
              
              <div className="status-modal-title-wrap">
                <TitleIcon iconName={levelInfo.iconName} size={22} />
                <span className="status-modal-title">{levelInfo.title}</span>
              </div>

              <div className="status-modal-exp-section">
                <div className="status-exp-label">
                  <span>EXP</span>
                  <span>{levelInfo.currentLevelExp} / {levelInfo.nextLevelExp} ({levelInfo.progressPct}%)</span>
                </div>
                <div className="badge-exp-bar big">
                  <div
                    className="badge-exp-fill"
                    style={{ width: `${levelInfo.progressPct}%` }}
                  />
                </div>
              </div>

              <div className="status-stats-grid">
                <div className="status-stat-card">
                  <div className="stat-label">総完了セット数</div>
                  <div className="stat-value">{stats?.totalSets ?? 0} <span className="stat-unit">SET</span></div>
                </div>
                <div className="status-stat-card">
                  <div className="stat-label">累計挙上量</div>
                  <div className="stat-value">{Math.floor(stats?.totalVolumeKg ?? 0).toLocaleString()} <span className="stat-unit">KG</span></div>
                </div>
                <div className="status-stat-card">
                  <div className="stat-label">体組成記録日数</div>
                  <div className="stat-value">{stats?.bodyMetricDays ?? 0} <span className="stat-unit">日</span></div>
                </div>
                <div className="status-stat-card">
                  <div className="stat-label">累計タンパク質</div>
                  <div className="stat-value">{Math.floor(stats?.totalProteinCheckedG ?? 0).toLocaleString()} <span className="stat-unit">G</span></div>
                </div>
              </div>

              <button className="btn primary big" onClick={() => setShowDetail(false)}>
                閉じる
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};