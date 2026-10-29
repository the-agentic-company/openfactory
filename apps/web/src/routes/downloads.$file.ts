import { createFileRoute } from '@tanstack/react-router';
import { downloadBuild } from '../server/downloads';

export const Route = createFileRoute('/downloads/$file')({
  server: {
    handlers: {
      GET: ({ params }) => downloadBuild(params.file),
      HEAD: ({ params }) => downloadBuild(params.file, true),
    },
  },
});
