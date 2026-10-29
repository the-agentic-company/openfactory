import { docs } from '../../.source/server';
import { loader } from 'fumadocs-core/source';
import { createServerFn } from '@tanstack/react-start';
import { notFound } from '@tanstack/react-router';
import { z } from 'zod';
import { createElement, isValidElement, type ReactNode } from 'react';
import { BookOpen, FileCode2 } from 'lucide-react';

function headingText(value: ReactNode): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(headingText).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(value)) {
    return headingText(value.props.children);
  }
  return '';
}

const docsIcons = { BookOpen, FileCode2 };
const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
  icon: (name) => {
    if (name === 'BookOpen' || name === 'FileCode2') {
      return createElement(docsIcons[name]);
    }
  },
});
export const getDocsPage = createServerFn({ method: 'GET' })
  .validator(z.array(z.string()))
  .handler(async ({ data }) => {
    const page = source.getPage(data);
    if (!page) {
      throw notFound();
    }
    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      pageTree: await source.serializePageTree(source.getPageTree()),
      toc: page.data.toc.map((item) => ({
        title: headingText(item.title),
        url: item.url,
        depth: item.depth,
      })),
    };
  });
