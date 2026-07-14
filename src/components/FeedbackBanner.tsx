'use client';
import { Button } from './Button';

export function FeedbackBanner({
  status,
  correctAnswer,
  onContinue,
}: {
  status: 'correct' | 'incorrect' | 'typo';
  correctAnswer?: string;
  onContinue: () => void;
}): React.JSX.Element {
  const config = {
    correct: { bg: '#D7FFB8', title: 'Nice!', color: '#58A700', variant: 'green' as const },
    typo: { bg: '#FFF4D6', title: 'Almost — watch the typo', color: '#FF9600', variant: 'green' as const },
    incorrect: { bg: '#FFDFE0', title: 'Correct solution:', color: '#EA2B2B', variant: 'red' as const },
  }[status];
  return (
    <div
      className="fixed inset-x-0 bottom-0 px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
      style={{ backgroundColor: config.bg }}
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
        <div>
          <p className="text-xl font-extrabold" style={{ color: config.color }}>
            {config.title}
          </p>
          {status !== 'correct' && correctAnswer ? (
            <p className="font-bold" style={{ color: config.color }}>
              {correctAnswer}
            </p>
          ) : null}
        </div>
        <Button variant={config.variant} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
