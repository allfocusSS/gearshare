export function Icon({ name, className = '' }: { name: 'compass' | 'calendar' | 'desk' | 'box' | 'arrow' | 'camera' | 'check'; className?: string }) {
  const paths = {
    compass: <><circle cx="12" cy="12" r="9" /><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 10h18m-13 5h2m4 0h2" /></>,
    desk: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M8 5v14m4-9h5m-5 4h3" /></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v9M7.5 5.5l9 5" /></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6" /></>,
    camera: <><rect x="3" y="6" width="18" height="14" rx="3" /><path d="m7 6 2-3h6l2 3" /><circle cx="12" cy="13" r="4" /></>,
    check: <path d="m5 12 4 4L19 6" />,
  }
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}
