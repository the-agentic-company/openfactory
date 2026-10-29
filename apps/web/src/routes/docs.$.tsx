import { createFileRoute } from '@tanstack/react-router';
import { deserializePageTree } from 'fumadocs-core/source/client';
import { ChartNoAxesCombined } from 'lucide-react';
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
  const tree = deserializePageTree(page.pageTree);
  return (
    <div className="openfactory-docs dark">
      <RootProvider search={{ enabled: false }} theme={{ enabled: false }}>
        <DocsLayout
          tree={tree}
          sidebar={{ collapsible: false }}
          nav={{
            title: (
              <span className="docs-brand">
                <img src="/openfactory.png" width={28} height={28} alt="" />
                <span className="docs-brand-text">
                  <span>OpenFactory</span>
                  <span className="docs-brand-label">Documentation</span>
                </span>
              </span>
            ),
            url: '/',
          }}
          links={[
            {
              text: import.meta.env.PUBLIC_SITE ? 'Get started' : 'Open app',
              url: import.meta.env.PUBLIC_SITE ? '/docs/quickstart' : '/app',
              icon: <ChartNoAxesCombined />,
            },
          ]}
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
