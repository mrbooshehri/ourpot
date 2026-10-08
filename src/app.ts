import type { AppConfig } from './config.js';

export type App = Readonly<{
  config: AppConfig;
}>;

export function createApp(config: AppConfig): App {
  return Object.freeze({ config });
}
