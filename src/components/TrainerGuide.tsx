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
    <div className="trainer-dialog-card" onClick={handleNextStep}>
      {/* キャラクター立ち絵領域 */}
      <div className="trainer-character-area">
        <img
          src="/trainer.png"
          alt="AI Trainer RIO"
          className="trainer-character-img"
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div className="trainer-fallback-icon">👩‍🏫</div>
      </div>

      {/* 横長大型話者吹き出し */}
      <div className="trainer-speech-box">
        <div className="trainer-header">
          <span className="trainer-title">AI TRAINER RIO</span>
          <span className="step-badge">{currentStep.title} ({currentStepIndex + 1}/4)</span>
        </div>
        <p className="trainer-speech-text">{currentStep.text}</p>
        <div className="tap-prompt">TAP TO NEXT ›</div>
      </div>
    </div>
  );
};