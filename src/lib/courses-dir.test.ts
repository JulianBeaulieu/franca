import { describe, expect, it } from 'vitest';
import { parseCoursesDirs } from './courses-dir';

describe('parseCoursesDirs', () => {
  it('returns a single directory unchanged', () => {
    expect(parseCoursesDirs('/app/courses')).toEqual(['/app/courses']);
  });

  it('splits a colon-separated list preserving order', () => {
    expect(parseCoursesDirs('/app/courses:/data/courses')).toEqual([
      '/app/courses',
      '/data/courses',
    ]);
  });

  it('trims whitespace and drops empty segments', () => {
    expect(parseCoursesDirs(' /a : : /b :')).toEqual(['/a', '/b']);
  });

  it('returns an empty list for an empty string', () => {
    expect(parseCoursesDirs('')).toEqual([]);
  });

  it('preserves order so last-wins can be applied downstream', () => {
    expect(parseCoursesDirs('/baked:/override')).toEqual(['/baked', '/override']);
  });
});
