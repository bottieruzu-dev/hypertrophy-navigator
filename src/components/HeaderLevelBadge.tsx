import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { calculateUserLevel } from '../engine/achievements';
import { motion, AnimatePresence } from 'framer-motion';

export const HeaderLevelBadge: React.FC = () => {
  const [showDetail, setShowDetail] = useState(false);

  const stats = useLiveQuery(async () => {
    const allSets = await db.sets.toArray();
    const totalSets = allSets.length;
    const totalVolume = allSets.reduce((sum, s) => sum + (s.volumeLoad || 0), 0);
    return { totalSets, totalVolume };
  }, []);

  const totalSets = stats?.totalSets ?? 0;
  const totalVolume = stats?.totalVolume ?? 0;
  const levelInfo = calculateUserLevel(totalSets, totalVolume);

  return (
    <>
      <div className="game-level-badge" onClick={() => setShowDetail(true)}>
        <div className="badge-level-box">
          <span className="badge-lv-label">LV</span>
          <span className="badge-lv-num">{levelInfo.level}</span>
        </div>
        <div className="badge-info-box">
          <div className="badge-title">{levelInfo.title}</div>
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
              <div className="status-modal-title">{levelInfo.title}</div>

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
                  <div className="stat-value">{totalSets} <span className="stat-unit">SET</span></div>
                </div>
                <div className="status-stat-card">
                  <div className="stat-label">累計挙上ボリューム</div>
                  <div className="stat-value">{Math.floor(totalVolume).toLocaleString()} <span className="stat-unit">KG</span></div>
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