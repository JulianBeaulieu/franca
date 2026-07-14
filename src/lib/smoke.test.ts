import { describe, expect, it } from 'vitest';
import { appName } from './smoke';

describe('smoke', () => {
  it('reports the app name', () => {
    expect(appName()).toBe('Franca');
  });
});
