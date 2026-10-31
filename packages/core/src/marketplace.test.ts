import { expect, it } from 'vite-plus/test';
import { marketplaceSourceSchema } from './marketplace';

it('normalizes full GitHub repository URLs and keeps short and pinned sources', () => {
  expect(marketplaceSourceSchema.parse('https://github.com/vercel-labs/skills')).toBe(
    'vercel-labs/skills',
  );
  expect(marketplaceSourceSchema.parse('https://github.com/example/reviewers.git/')).toBe(
    'example/reviewers',
  );
  expect(marketplaceSourceSchema.parse('example/reviewers')).toBe('example/reviewers');
  expect(marketplaceSourceSchema.parse('openfactory/code-review')).toBe('openfactory/code-review');
  const sha = 'a'.repeat(40);
  expect(marketplaceSourceSchema.parse(`https://github.com/example/reviewers/tree/${sha}`)).toBe(
    `example/reviewers@${sha}`,
  );
  expect(marketplaceSourceSchema.parse(`example/reviewers@${sha}`)).toBe(
    `example/reviewers@${sha}`,
  );
});
it('rejects other hosts, credentials, query strings and non-repository URLs', () => {
  for (const source of [
    'https://example.com/owner/repo',
    'https://github.com.evil.test/owner/repo',
    'https://user:secret@github.com/owner/repo',
    'https://github.com/owner',
    'https://github.com/owner/repo?query=1',
    'https://github.com/owner/repo/tree/main',
  ]) {
    expect(marketplaceSourceSchema.safeParse(source).success).toBe(false);
  }
});
