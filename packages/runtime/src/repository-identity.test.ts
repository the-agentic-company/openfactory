import { expect, it } from 'vite-plus/test';
import { normalizeRepositoryRemote } from './repository-identity';
it('matches SSH and HTTPS remotes without including credentials', () => {
  expect(normalizeRepositoryRemote('git@github.com:Org/repo.git')).toBe('github.com/Org/repo');
  expect(normalizeRepositoryRemote('https://user:secret@github.com/Org/repo.git/')).toBe(
    'github.com/Org/repo',
  );
  expect(normalizeRepositoryRemote('ssh://git@github.com/Org/repo')).toBe('github.com/Org/repo');
  expect(normalizeRepositoryRemote('/local/repo')).toBeNull();
});
