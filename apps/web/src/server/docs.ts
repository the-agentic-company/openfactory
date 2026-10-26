import { docs } from '../../.source/server';
import { loader } from 'fumadocs-core/source';
import { createServerFn } from '@tanstack/react-start';
import { notFound } from '@tanstack/react-router';
import { z } from 'zod';
import { isValidElement, type ReactNode } from 'react';

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

const source = loader({ baseUrl: '/docs', source: docs.toFumadocsSource() });
export const getDocsPage = createServerFn({ method: 'GET' })
  .validator(z.array(z.string()))
  .handler(({ data }) => {
    const page = source.getPage(data);
    if (!page) {
      throw notFound();
    }
    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      toc: page.data.toc.map((item) => ({
        title: headingText(item.title),
        url: item.url,
        depth: item.depth,
      })),
    };
  });
