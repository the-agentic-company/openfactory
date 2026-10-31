import { useSyncExternalStore } from 'react';

const sidebarPreference = 'openfactory-sidebar-collapsed';
function subscribeSidebar(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('openfactory-sidebar-change', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('openfactory-sidebar-change', listener);
  };
}
function readSidebarPreference() {
  return localStorage.getItem(sidebarPreference) === 'true';
}
function serverSidebarPreference() {
  return false;
}

export function useSidebarState() {
  const collapsed = useSyncExternalStore(
    subscribeSidebar,
    readSidebarPreference,
    serverSidebarPreference,
  );
  function toggleSidebar() {
    localStorage.setItem(sidebarPreference, String(!collapsed));
    window.dispatchEvent(new Event('openfactory-sidebar-change'));
  }
  return { collapsed, toggleSidebar };
}
