'use client';
import { useEffect, useRef, useState } from 'react';

interface CourseOption {
  id: number;
  code: string;
  name: string;
  native_name: string;
  emoji: string;
  xp_total: number;
  started: boolean;
}

export function CourseMenu({ activeEmoji }: { activeEmoji: string }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [courses, setCourses] = useState<CourseOption[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
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

  useEffect(() => {
    if (!open || courses !== null) return;
    void fetch('/api/courses')
      .then((r) => r.json() as Promise<{ activeCourseId: number | null; courses: CourseOption[] }>)
      .then((d) => {
        setCourses(d.courses);
        setActiveId(d.activeCourseId);
      })
      .catch(() => {
        setCourses([]);
      });
  }, [open, courses]);

  function choose(id: number): void {
    void fetch('/api/course', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ courseId: id }),
    })
      .then(() => {
        // Reload so the whole path/profile re-fetches under the new course.
        window.location.href = '/';
      })
      .catch(() => {
        setOpen(false);
      });
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Choose course"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
        }}
        className="flex h-11 min-w-11 touch-manipulation items-center justify-center rounded-2xl border-2 border-swan px-2 text-2xl"
      >
        {activeEmoji}
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border-2 border-swan bg-white p-2 shadow-lg">
          {courses === null ? (
            <p className="px-3 py-2 text-sm font-bold text-hare">Loading…</p>
          ) : (
            courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  choose(c.id);
                }}
                className={`flex w-full touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-left ${
                  c.id === activeId ? 'bg-green-light' : 'hover:bg-subtle'
                }`}
              >
                <span className="text-2xl" aria-hidden>
                  {c.emoji}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-extrabold text-eel">{c.name}</span>
                  <span className="block text-xs font-bold text-hare">{c.native_name}</span>
                </span>
                {c.started ? (
                  <span className="text-xs font-extrabold text-orange">{c.xp_total} XP</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
