import { animate, useReducedMotion } from 'motion/react';
import { useLayoutEffect } from 'react';

export function useSidebarMotion(collapsed: boolean) {
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => {
    const root = document.documentElement;
    const property = '--workspace-sidebar-animated-width';
    const target = Number.parseFloat(
      getComputedStyle(root).getPropertyValue('--workspace-sidebar-width'),
    );
    const current = Number.parseFloat(root.style.getPropertyValue(property));
    if (!root.style.getPropertyValue(property) || reduceMotion) {
      root.style.setProperty(property, `${target}px`);
      return;
    }
    const animation = animate(current, target, {
      duration: 0.24,
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (width) => root.style.setProperty(property, `${width}px`),
    });
    return () => animation.stop();
  }, [collapsed, reduceMotion]);

  useLayoutEffect(
    () => () => {
      document.documentElement.style.removeProperty('--workspace-sidebar-animated-width');
    },
    [],
  );
}
