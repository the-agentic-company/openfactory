import { factoryConfig } from '@factory/config';
import { categorySchema, selectStack, workspacePackages } from '@factory/core';
import { createServerFn } from '@tanstack/react-start';

export const getWorkspace = createServerFn({ method: 'GET' })
  .validator(categorySchema)
  .handler(({ data }) => ({
    name: factoryConfig.name,
    stack: selectStack(data),
    packages: workspacePackages,
    sampledAt: new Date().toISOString(),
  }));
