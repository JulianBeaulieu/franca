import { FlameIcon, GemIcon, HeartIcon } from './icons';
import { CourseMenu } from './CourseMenu';
import { UserMenu } from './UserMenu';

export function TopBar({
  streak,
  gems,
  hearts,
  displayName,
  picture,
  courseEmoji,
}: {
  streak: number;
  gems: number;
  hearts: number;
  displayName?: string;
  picture?: string | null;
  courseEmoji?: string;
}): React.JSX.Element {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-swan bg-surface px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] font-extrabold text-eel">
      <span className="text-xl font-black text-green">Franca</span>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <FlameIcon /> <span style={{ color: '#FF9600' }}>{streak}</span>
        </span>
        <span className="flex items-center gap-1">
          <GemIcon /> <span style={{ color: '#1CB0F6' }}>{gems}</span>
        </span>
        <span className="flex items-center gap-1">
          <HeartIcon /> <span style={{ color: '#FF4B4B' }}>{hearts}</span>
        </span>
        {courseEmoji ? <CourseMenu activeEmoji={courseEmoji} /> : null}
        {displayName ? <UserMenu displayName={displayName} picture={picture ?? null} /> : null}
      </div>
    </header>
  );
}
