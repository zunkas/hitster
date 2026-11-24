import { accessToken } from './auth';

/** Scopes the Web Playback SDK needs on top of the normal ones. */
export const BROWSER_PLAYER_SCOPES = ['streaming', 'user-read-email', 'user-read-private'];

interface SdkPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  activateElement(): Promise<void>;
  addListener(event: string, cb: (arg: { device_id?: string; message?: string }) => void): void;
}

declare global {
  interface Window {
    Spotify?: {
      Player: new (options: {
        name: string;
        getOAuthToken: (cb: (token: string) => void) => void;
        volume?: number;
      }) => SdkPlayer;
    };
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

/**
 * Spotify only supports the SDK in desktop browsers. Android Chrome has the DRM it needs
 * and may work unofficially ("experimental"); iOS browsers don't.
 */
export function browserPlaybackSupport(): 'desktop' | 'experimental' | 'none' {
  const ua = navigator.userAgent;
  if (!('requestMediaKeySystemAccess' in navigator)) return 'none';
  if (/Android/i.test(ua)) return 'experimental';
  const iPadAsMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod|Mobile/i.test(ua) || iPadAsMac) return 'none';
  return 'desktop';
}

let sdkLoaded: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  sdkLoaded ??= new Promise<void>((resolve, reject) => {
    if (window.Spotify) return resolve();
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.onerror = () => {
      sdkLoaded = null;
      reject(new Error('Couldn’t load Spotify’s web player. Check your connection or ad blocker.'));
    };
    document.head.append(script);
  });
  return sdkLoaded;
}

export interface BrowserPlayer {
  /** Spotify Connect device ID of this browser tab. */
  deviceId: string;
  /** Must be called from a click/tap so the browser allows sound. */
  activate(): Promise<void>;
  disconnect(): void;
}

/** Turn this browser tab into a Spotify Connect device. */
export async function startBrowserPlayer(name: string): Promise<BrowserPlayer> {
  await loadSdk();
  const player = new window.Spotify!.Player({
    name,
    getOAuthToken: (cb) => {
      accessToken().then(cb, () => {});
    },
    volume: 0.8,
  });
  const deviceId = await new Promise<string>((resolve, reject) => {
    const fail = (message: string) => () => reject(new Error(message));
    player.addListener('ready', ({ device_id }) => resolve(device_id!));
    player.addListener('initialization_error', fail('This browser can’t play Spotify. Try Chrome, Edge or Firefox.'));
    player.addListener('authentication_error', fail('Spotify rejected the login for browser playback. Log out and in again.'));
    player.addListener('account_error', fail('Spotify Premium is required to play in the browser.'));
    setTimeout(fail('Spotify’s web player didn’t start. Reload and try again.'), 15_000);
    player.connect().then((ok) => ok || reject(new Error('Spotify’s web player couldn’t connect.')));
  });
  return {
    deviceId,
    activate: () => player.activateElement(),
    disconnect: () => player.disconnect(),
  };
}
