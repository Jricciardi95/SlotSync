/**
 * Types matching firmware JSON (MVP). Extend as firmware evolves.
 */

export type ShelfStatusJson = {
  ok?: boolean;
  mode?: string;
  selected_slot?: number;
  multi_count?: number;
  multi_slots?: number[];
  max_slot?: number;
  brightness?: number;
  wifi_rssi?: number;
  wifi_ip?: string;
  uptime_ms?: number;
  idle?: { r?: number; g?: number; b?: number };
  selected_color?: { r?: number; g?: number; b?: number };
  music_reactive?: boolean;
  firmware?: string;
  error?: string;
};

export type ShelfOkJson = {
  ok?: boolean;
  mode?: string;
  slot?: number;
  count?: number;
  brightness?: number;
  error?: string;
};

export class ShelfApiError extends Error {
  readonly statusCode?: number;
  readonly bodySnippet?: string;

  constructor(message: string, statusCode?: number, bodySnippet?: string) {
    super(message);
    this.name = 'ShelfApiError';
    this.statusCode = statusCode;
    this.bodySnippet = bodySnippet;
  }
}

export class ShelfNotConfiguredError extends Error {
  constructor() {
    super(
      'Shelf base URL is not set. Open Settings → Smart shelf and enter your ESP32 address (e.g. 192.168.1.50).'
    );
    this.name = 'ShelfNotConfiguredError';
  }
}
