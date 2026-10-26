import { createFileRoute } from '@tanstack/react-router';
import collections from '../../.source/browser';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsBody, DocsDescription, DocsPage, DocsTitle } from 'fumadocs-ui/page';
import { RootProvider } from 'fumadocs-ui/provider/tanstack';
import defaultComponents from 'fumadocs-ui/mdx';
import stylesheet from '../docs.css?url';
import { getDocsPage } from '../server/docs';

const content = collections.docs.createClientLoader({
  component({ default: Content }) {
    return <Content components={defaultComponents} />;
  },
});
export const Route = createFileRoute('/docs/$')({
  loader: async ({ params }) => {
    const page = await getDocsPage({ data: params._splat?.split('/').filter(Boolean) ?? [] });
    await content.preload(page.path);
    return page;
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Documentation'} · OpenFactory` }],
    links: [{ rel: 'stylesheet', href: stylesheet }],
  }),
  component: Documentation,
});
function Documentation() {
  const page = Route.useLoaderData();
  return (
    <div className="openfactory-docs dark">
      <RootProvider search={{ enabled: false }} theme={{ enabled: false }}>
        <DocsLayout
          tree={{
            name: 'Documentation',
            children: [
              {
                type: 'page',
                name: 'Factory definition syntax',
                url: '/docs',
              },
            ],
          }}
          nav={{ title: 'Back to overview', url: '/' }}
          themeSwitch={{ enabled: false }}
        >
          <DocsPage toc={page.toc}>
            <DocsTitle>{page.title}</DocsTitle>
            <DocsDescription>{page.description}</DocsDescription>
            <DocsBody>{content.useContent(page.path)}</DocsBody>
          </DocsPage>
        </DocsLayout>
      </RootProvider>
    </div>
  );
}
