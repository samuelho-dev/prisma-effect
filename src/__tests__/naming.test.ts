import { describe, expect, it } from 'vitest';
import { toPascalCase } from '../utils/naming';

describe('Naming Utilities', () => {
  describe('toPascalCase', () => {
    it('should convert various formats to PascalCase', () => {
      // snake_case
      expect(toPascalCase('user_profile')).toBe('UserProfile');
      expect(toPascalCase('session_model_preference')).toBe('SessionModelPreference');

      // kebab-case
      expect(toPascalCase('user-profile')).toBe('UserProfile');

      // camelCase
      expect(toPascalCase('userProfile')).toBe('UserProfile');

      // Already PascalCase
      expect(toPascalCase('UserProfile')).toBe('UserProfile');

      // Single word
      expect(toPascalCase('user')).toBe('User');

      // Empty string
      expect(toPascalCase('')).toBe('');
    });
  });
});
