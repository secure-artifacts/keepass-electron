import React from 'react';

const paths = {
  link: <><path d="M10.5 13.5l3-3"/><path d="M7.5 16.5l-1.2 1.2a3 3 0 0 1-4.2-4.2l3.6-3.6a3 3 0 0 1 4.2 0"/><path d="M16.5 7.5l1.2-1.2a3 3 0 0 0-4.2-4.2L9.9 5.7a3 3 0 0 0 0 4.2"/></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16M15 4v16"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></>,
  preview: <><rect x="3" y="4" width="13" height="16" rx="2"/><path d="M6 8h7M6 12h4"/><circle cx="17" cy="16" r="4"/><path d="M20 19l2 2"/></>,
  export: <><path d="M5 3h9l4 4v14H5z"/><path d="M14 3v5h5"/><path d="M9 14h8M14 11l3 3-3 3"/></>,
  shield: <><path d="M12 3l7 3v5c0 4.8-3 8.4-7 10-4-1.6-7-5.2-7-10V6l7-3z"/><path d="M9 12l2 2 4-4"/></>,
  file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></>,
  folder: <><path d="M3 6h7l2 2h9v11H3z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.5-6 8-6s7.2 2 8 6"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeOff: <><path d="M3 3l18 18"/><path d="M10.7 6.2A10.5 10.5 0 0 1 12 6c6.5 0 10 6 10 6a15 15 0 0 1-3 3.8"/><path d="M6.5 6.5C3.6 8.3 2 12 2 12s3.5 6 10 6c1.8 0 3.4-.5 4.7-1.2"/></>,
  check: <path d="M5 12l4 4L19 6"/>,
  chevronLeft: <path d="M15 18l-6-6 6-6"/>,
  chevronRight: <path d="M9 18l6-6-6-6"/>,
  refresh: <><path d="M20 11a8 8 0 1 0 1 4"/><path d="M20 4v7h-7"/></>,
  trash: <><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M7 7l1 14h8l1-14"/></>,
  copy: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M5 16H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1"/></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  moon: <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.5 9a2.7 2.7 0 1 1 4.5 2c-1.2.8-2 1.3-2 3"/><path d="M12 18h.01"/></>,
  play: <path d="M8 5l11 7-11 7z"/>,
  spinner: <><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M18 2v5h5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21h-4v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3v-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3h4v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>,
  info: <><circle cx="12" cy="12" r="10"/><path d="M12 10v7M12 7h.01"/></>,
  arrowUp: <path d="M12 19V5M6 11l6-6 6 6"/>,
  arrowDown: <path d="M12 5v14M18 13l-6 6-6-6"/>
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.info}
    </svg>
  );
}
