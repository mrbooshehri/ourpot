export type IconName = 'layout-dashboard' | 'chart-bar' | 'user-circle' | 'settings' | 'bell-ringing' | 'wallet' | 'arrows-transfer-up-down' | 'calendar-dollar';

const bodies: Record<IconName, string> = {
  'layout-dashboard': "<path d=\"M5 4h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1\" />\n  <path d=\"M5 16h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1\" />\n  <path d=\"M15 12h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1\" />\n  <path d=\"M15 4h4a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1\" />",
  'chart-bar': "<path d=\"M3 13a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -6\" />\n  <path d=\"M15 9a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -10\" />\n  <path d=\"M9 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -14\" />\n  <path d=\"M4 20h14\" />",
  'user-circle': "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" />\n  <path d=\"M9 10a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" />\n  <path d=\"M6.168 18.849a4 4 0 0 1 3.832 -2.849h4a4 4 0 0 1 3.834 2.855\" />",
  'settings': "<path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065\" />\n  <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" />",
  'bell-ringing': "<path d=\"M10 5a2 2 0 0 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6\" />\n  <path d=\"M9 17v1a3 3 0 0 0 6 0v-1\" />\n  <path d=\"M21 6.727a11.05 11.05 0 0 0 -2.794 -3.727\" />\n  <path d=\"M3 6.727a11.05 11.05 0 0 1 2.792 -3.727\" />",
  'wallet': "<path d=\"M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12\" />\n  <path d=\"M20 12v4h-4a2 2 0 0 1 0 -4h4\" />",
  'arrows-transfer-up-down': "<path d=\"M7 21v-6\" />\n  <path d=\"M20 6l-3 -3l-3 3\" />\n  <path d=\"M10 18l-3 3l-3 -3\" />\n  <path d=\"M7 3v2\" />\n  <path d=\"M7 9v2\" />\n  <path d=\"M17 3v6\" />\n  <path d=\"M17 21v-2\" />\n  <path d=\"M17 15v-2\" />",
  'calendar-dollar': "<path d=\"M13 21h-7a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v3\" />\n  <path d=\"M16 3v4\" />\n  <path d=\"M8 3v4\" />\n  <path d=\"M4 11h12.5\" />\n  <path d=\"M21 15h-2.5a1.5 1.5 0 0 0 0 3h1a1.5 1.5 0 0 1 0 3h-2.5\" />\n  <path d=\"M19 21v1m0 -8v1\" />",
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/\"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function icon(name: IconName, label?: string): string {
  const body = bodies[name];
  const accessible = label ? ` role=\"img\" aria-label=\"${escapeAttribute(label)}\"` : ' aria-hidden=\"true\"';
  return `<svg class=\"tabler-icon\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"${accessible}>${body}</svg>`;
}
