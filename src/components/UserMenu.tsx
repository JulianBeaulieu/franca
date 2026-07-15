'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOutAction } from '@/app/actions/auth';

const MENU_LINKS = [
  { href: '/settings', label: 'Settings' },
  { href: '/stats', label: 'Stats' },
  { href: '/leaderboard', label: 'Leaderboard' },
] as const;

export function UserMenu({
  displayName,
  picture,
}: {
  displayName: string;
  picture: string | null;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full bg-green text-lg font-black text-white"
      >
        {picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picture} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          initial
        )}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-44 rounded-2xl border-2 border-swan bg-card p-2 shadow-lg">
          <p className="px-3 py-2 text-sm font-extrabold text-eel">{displayName}</p>
          {MENU_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                setOpen(false);
              }}
              className="block touch-manipulation rounded-xl px-3 py-2 text-left text-sm font-extrabold text-eel hover:bg-hover"
            >
              {item.label}
            </Link>
          ))}
          {/* Server Action form: Next.js binds the encrypted action reference,
              so no CSRF token is needed here. `signOutAction` itself calls
              Auth.js's `signOut`, which handles its own CSRF internally. */}
          <form action={signOutAction}>
            <button
              type="submit"
              className="w-full touch-manipulation rounded-xl px-3 py-2 text-left text-sm font-extrabold text-red hover:bg-red-light"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
