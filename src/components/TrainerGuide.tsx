import React from 'react';

interface TrainerGuideProps {
  exerciseName: string;
  note?: string;
}

export const TrainerGuide: React.FC<TrainerGuideProps> = ({ exerciseName, note }) => {
  return (
    <div className="trainer-card">
      <div className="trainer-avatar-wrap">
        <img 
          src="/trainer.png" 
          alt="AI Trainer" 
          className="trainer-avatar"
          onError={(e) => {
            // 画像がない場合のフォールバック（絵文字表示）
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
        <div className="avatar-fallback">👩‍🏫</div>
      </div>
      <div className="speech-bubble">
        <div className="trainer-name">AI TRAINER RIO</div>
        <p className="speech-text">
          {note ? note : `「${exerciseName}」ね！狙った筋肉を意識して、丁寧な動作で効かせていきましょう！`}
        </p>
      </div>
    </div>
  );
};