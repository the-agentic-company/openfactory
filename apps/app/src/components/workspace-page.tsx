import { projectName } from '../project-path';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppearanceGlyph } from './appearance-glyph';
import type { FactoryProject } from './factory-navigation-item';

export function WorkspacePage({
  project,
  title,
  actions,
  children,
  contentClassName = '',
  layout = 'standard',
}: {
  project?: FactoryProject;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  layout?: 'standard' | 'fill';
}) {
  return (
    <main className={`workspace-page workspace-page--${layout}`}>
      <header className="workspace-page-header">
        <div className="workspace-page-breadcrumb">
          {project && (
            <>
              <Link
                to="/app/projects/$project/$view"
                params={{ project: projectName(project.workspaceRoot), view: 'dashboard' }}
                className="workspace-project"
              >
                <AppearanceGlyph
                  appearance={project.icon ?? { kind: 'icon', name: 'factory', color: 'gray' }}
                  size={16}
                />
                {project.title}
              </Link>
              <ChevronRight size={13} />
            </>
          )}
          <h1 className="workspace-page-title">{title}</h1>
        </div>
        <div className="workspace-header-actions">{actions}</div>
      </header>
      <div className={`workspace-page-content ${contentClassName}`}>{children}</div>
    </main>
  );
}
