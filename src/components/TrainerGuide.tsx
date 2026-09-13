import React, { useState } from 'react';
import type { Exercise } from '../db/types';
import { getExerciseSteps } from '../engine/exerciseGuides';

interface TrainerGuideProps {
  exercise: Exercise;
}

export const TrainerGuide: React.FC<TrainerGuideProps> = ({ exercise }) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const steps = getExerciseSteps(exercise);
  const currentStep = steps[currentStepIndex];

  const handleNextStep = () => {
    setCurrentStepIndex((prev) => (prev + 1) % steps.length);
  };

  return (
    <div className="umamusume-trainer-card" onClick={handleNextStep}>
      {/* 上部：トレーナー立ち絵キャラ */}
      <div className="umamusume-character-area">
        <img
          src="/trainer.png"
          alt="AI Trainer RIO"
          className="umamusume-trainer-img"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div className="umamusume-fallback-icon">👩‍🏫</div>
      </div>

      {/* 右側：ウマ娘風 横長大型話者吹き出し */}
      <div className="umamusume-speech-box">
        <div className="umamusume-header">
          <span className="trainer-title">AI TRAINER RIO</span>
          <span className="step-badge">{currentStep.title} ({currentStepIndex + 1}/4)</span>
        </div>
        <p className="umamusume-speech-text">{currentStep.text}</p>
        <div className="tap-prompt">TAP TO NEXT ›</div>
      </div>
    </div>
  );
};