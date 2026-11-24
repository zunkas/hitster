import QrScanner from 'qr-scanner';
import { GAME_NAME } from '../config';
import { h, show } from '../dom';
import { trackIdFromScan } from '../payload';
import {
  type Device,
  getAccountName,
  getDevices,
  getPlaybackState,
  getTrackDuration,
  pause,
  play,
  resume,
  seek,
  SpotifyError,
  transferPlayback,
} from '../spotify/api';
import { hasScopes, isLoggedIn, login, NotLoggedInError } from '../spotify/auth';
import { BROWSER_PLAYER_SCOPES, type BrowserPlayer, browserPlaybackSupport, startBrowserPlayer } from '../spotify/web-playback';
import { checkStartPosition, loadStartSettings, saveStartSettings, type StartMode, startPositionMs } from '../start-position';
import { loginPrompt } from './login-prompt';

const DEVICE_KEY = 'deviceId';
/**
 * How the host chose a speaker. "phone" and "browser" follow this device even when
 * its Spotify device ID changes; "other" sticks to the saved device ID.
 */
const MODE_KEY = 'deviceMode';
type DeviceMode = 'phone' | 'browser' | 'other';

function getMode(): DeviceMode {
  const m = localStorage.getItem(MODE_KEY);
  if (m === 'phone' || m === 'browser') return m;
  return localStorage.getItem('useThisPhone') ? 'phone' : 'other'; // setting from older versions
}

function setMode(mode: DeviceMode): void {
  localStorage.setItem(MODE_KEY, mode);
  localStorage.removeItem('useThisPhone');
}

const BROWSER_SUPPORT = browserPlaybackSupport();
const DESKTOP = BROWSER_SUPPORT === 'desktop';
const CAN_PLAY_IN_BROWSER = BROWSER_SUPPORT !== 'none';
const BROWSER_NAME = `${GAME_NAME} (this browser)`;
const WAKE_HINT = DESKTOP
  ? 'Not listed? Start something on the speaker from the Spotify app once (or click 💻 This browser), then click ↻.'
  : 'Not listed? Start something on the speaker from the Spotify app once (or tap 📱 This phone), then tap ↻.';

type State = 'scanning' | 'loading' | 'playing' | 'error';

const isPhone = (d: Device) => d.type.toLowerCase() === 'smartphone';
/** Best guess at the Spotify app on this phone: the active smartphone, else any smartphone. */
const findPhone = (devices: Device[]) => devices.find((d) => isPhone(d) && d.is_active) ?? devices.find(isPhone);

export function playView(root: HTMLElement, params: URLSearchParams): () => void {
  const header = h('header', { class: 'bar' }, h('a', { class: 'back', href: '#/' }, `← ${GAME_NAME}`));
  root.append(header);
  if (!isLoggedIn()) {
    root.append(loginPrompt());
    return () => {};
  }

  // ---- Speaker picker ----
  let devices: Device[] = [];
  let waitingForSpotifyApp = false;
  let browserPlayer: BrowserPlayer | null = null;
  let soundUnlocked = false;
  const deviceSelect = h('select', { 'aria-label': 'Speaker' });
  const deviceHint = h('p', { class: 'hint' });
  const refreshBtn = h('button', { class: 'icon', title: 'Refresh speakers', onclick: () => loadDevices() }, '↻');
  const phoneBtn = DESKTOP
    ? null
    : h('button', { title: 'Play through the Spotify app on this phone', onclick: () => useThisPhone() }, '📱 This phone');
  const browserBtn = CAN_PLAY_IN_BROWSER
    ? h(
        'button',
        { title: 'Play in this browser tab', onclick: () => useThisBrowser() },
        DESKTOP ? '💻 This browser' : '🌐 This browser (beta)',
      )
    : null;
  const accountLine = h('p', { class: 'hint account' });
  getAccountName().then(
    (name) => (accountLine.textContent = `Spotify account: ${name}. Speakers and the Spotify app must use this account.`),
    () => {},
  );
  deviceSelect.addEventListener('change', () => {
    localStorage.setItem(DEVICE_KEY, deviceSelect.value);
    const picked = devices.find((d) => d.id === deviceSelect.value);
    if (picked && picked.id === browserPlayer?.deviceId) setMode('browser');
    else if (picked && isPhone(picked)) setMode('phone');
    else setMode('other');
  });

  function selectDevice(d: Device): void {
    deviceSelect.value = d.id!;
    localStorage.setItem(DEVICE_KEY, d.id!);
    deviceHint.textContent = '';
  }

  /** Make this browser tab the speaker. Called from a click, so sound gets unlocked too. */
  async function useThisBrowser(): Promise<void> {
    setMode('browser');
    if (!hasScopes(...BROWSER_PLAYER_SCOPES)) {
      deviceHint.textContent = 'Spotify needs one more permission to play in the browser. Logging in again…';
      await login('#/play');
      return;
    }
    await startBrowser();
  }

  async function startBrowser(): Promise<void> {
    if (!browserPlayer) {
      deviceHint.textContent = 'Starting the browser player…';
      try {
        browserPlayer = await startBrowserPlayer(BROWSER_NAME);
        // If this was started by a click a moment ago, that click still counts as permission for sound.
        if ((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive) unlockSound();
      } catch (e) {
        deviceHint.textContent = (e as Error).message;
        return;
      }
    }
    await loadDevices();
    if (!soundUnlocked) deviceHint.textContent = 'Click anywhere on this page once to allow sound.';
  }

  /** Browsers only allow audio after a user gesture; the SDK needs to be told about it. */
  function unlockSound(): void {
    if (soundUnlocked || !browserPlayer) return;
    soundUnlocked = true;
    browserPlayer.activate().catch(() => {});
    if (deviceHint.textContent?.startsWith('Click anywhere')) deviceHint.textContent = '';
  }
  document.addEventListener('pointerdown', unlockSound);

  /** Select the Spotify app on this phone, opening it first if it isn't running. */
  async function useThisPhone(): Promise<void> {
    setMode('phone');
    await loadDevices();
    const phone = findPhone(devices);
    if (phone) selectDevice(phone);
    else openSpotifyApp();
  }

  /**
   * Opens the Spotify app (home screen, nothing about the song) so it registers as a
   * speaker. When the user switches back, the visibilitychange handler picks it up.
   */
  function openSpotifyApp(): void {
    waitingForSpotifyApp = true;
    deviceHint.textContent = 'Opening Spotify… then switch back here.';
    location.href = 'spotify:';
  }

  async function onVisible(): Promise<void> {
    if (document.visibilityState !== 'visible') return;
    if (!scanSection.hidden) scanner.start().catch(() => {});
    if (!waitingForSpotifyApp) return;
    for (let attempt = 0; attempt < 4; attempt++) {
      deviceHint.textContent = 'Waiting for Spotify on this phone to show up…';
      await loadDevices(true);
      const phone = findPhone(devices);
      if (phone) {
        waitingForSpotifyApp = false;
        selectDevice(phone);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    waitingForSpotifyApp = false;
    deviceHint.textContent = CAN_PLAY_IN_BROWSER
      ? 'This phone isn’t showing up in Spotify. Check that the Spotify app uses the account shown below, or try 🌐 This browser (beta).'
      : 'This phone isn’t showing up in Spotify. Check that the Spotify app uses the account shown below, then tap ↻.';
  }
  document.addEventListener('visibilitychange', onVisible);

  /** `quiet`: keep the current hint while loading and only show problems (used for retries). */
  async function loadDevices(quiet = false): Promise<void> {
    if (!quiet) deviceHint.textContent = 'Looking for speakers…';
    let restricted: Device[];
    try {
      const all = await getDevices();
      devices = all.filter((d) => !d.is_restricted);
      restricted = all.filter((d) => d.is_restricted);
    } catch (e) {
      deviceHint.textContent = errorMessage(e);
      return;
    }
    // The browser player can take a moment to show up in Spotify's list; add it ourselves.
    if (browserPlayer && !devices.some((d) => d.id === browserPlayer!.deviceId)) {
      devices.unshift({ id: browserPlayer.deviceId, name: BROWSER_NAME, type: 'Computer', is_active: false, is_restricted: false });
    }
    // Other tabs' or sessions' browser players are dead ends; hide them.
    devices = devices.filter((d) => d.name !== BROWSER_NAME || d.id === browserPlayer?.deviceId);

    let saved = localStorage.getItem(DEVICE_KEY);
    // The phone app's and browser player's device IDs change; follow them in those modes.
    const mode = getMode();
    const followed = mode === 'phone' ? findPhone(devices) : mode === 'browser' ? devices.find((d) => d.id === browserPlayer?.deviceId) : undefined;
    if (followed) {
      saved = followed.id;
      localStorage.setItem(DEVICE_KEY, saved!);
    }
    const placeholder = h('option', { value: '', disabled: true }, 'Choose a speaker…');
    deviceSelect.replaceChildren(
      placeholder,
      ...devices.map((d) => h('option', { value: d.id! }, `${d.name} (${d.type.toLowerCase()})`)),
      ...restricted.map((d) => h('option', { value: d.id!, disabled: true }, `${d.name} — not controllable by Spotify`)),
    );
    const savedPresent = devices.some((d) => d.id === saved);
    deviceSelect.value = savedPresent ? saved! : '';
    if (!savedPresent) placeholder.selected = true;
    if (quiet && !savedPresent) return;
    if (savedPresent) deviceHint.textContent = '';
    else if (mode === 'phone' && !DESKTOP)
      deviceHint.textContent = 'Spotify isn’t running on this phone. Tap 📱 This phone to open it.';
    else if (mode === 'browser' && CAN_PLAY_IN_BROWSER)
      deviceHint.textContent = `${DESKTOP ? 'Click 💻' : 'Tap 🌐'} This browser to play here.`;
    else if (!devices.length && restricted.length)
      deviceHint.textContent = DESKTOP
        ? 'Spotify won’t let apps control the speakers it found. Click 💻 This browser to play here instead.'
        : 'Spotify won’t let apps control the speakers it found. Use 📱 This phone and AirPlay or Bluetooth to the speaker.';
    else if (!devices.length) deviceHint.textContent = `No speakers found. ${WAKE_HINT}`;
    else if (saved) deviceHint.textContent = `Your last speaker isn’t available. Pick one, or: ${WAKE_HINT}`;
    else deviceHint.textContent = WAKE_HINT;
  }

  // ---- Start-point settings ----
  const settings = loadStartSettings();
  const offsetInput = h('input', { type: 'number', min: '0', max: '600', step: '5', value: String(settings.offsetSec) });
  const modeRadio = (mode: StartMode, label: string, extra?: HTMLElement) =>
    h(
      'label',
      { class: 'radio' },
      h('input', { type: 'radio', name: 'start', value: mode, checked: settings.mode === mode }),
      label,
      extra,
    );
  const settingsPanel = h(
    'fieldset',
    { class: 'panel settings', hidden: true },
    h('legend', {}, 'Where should songs start?'),
    modeRadio('start', 'Start of song'),
    modeRadio('offset', 'Fixed offset ', h('span', {}, offsetInput, ' s')),
    modeRadio('random', 'Random point'),
  );
  settingsPanel.addEventListener('change', () => {
    const checked = settingsPanel.querySelector<HTMLInputElement>('input[name=start]:checked');
    settings.mode = (checked?.value as StartMode) ?? 'start';
    settings.offsetSec = Math.max(0, Number(offsetInput.value) || 0);
    saveStartSettings(settings);
  });
  header.append(
    h('button', { class: 'icon', title: 'Start-point settings', onclick: () => show(settingsPanel, Boolean(settingsPanel.hidden)) }, '⚙'),
  );

  // ---- Game area ----
  const video = h('video', { muted: true, playsInline: true });
  const scanMsg = h('p', { class: 'hint' }, 'Point the camera at a card’s QR code.');
  const scanSection = h('section', { class: 'scan' }, h('div', { class: 'viewfinder' }, video), scanMsg);

  let paused = false;
  const pauseBtn = h('button', { class: 'huge', onclick: () => togglePause() }, '⏸');
  const playingSection = h(
    'section',
    { class: 'playing' },
    h('p', { class: 'now' }, '♪ Playing — place your card!'),
    pauseBtn,
    h('button', { class: 'big primary', onclick: () => setState('scanning') }, 'Scan next card'),
  );

  const errorMsg = h('p', {});
  const wakeBtn = h('button', { class: 'big', onclick: () => openSpotifyApp() }, '📱 Open Spotify on this phone');
  const errorSection = h(
    'section',
    { class: 'panel error' },
    errorMsg,
    wakeBtn,
    h('button', { class: 'big primary', onclick: () => setState('scanning') }, 'Scan next card'),
  );
  const loadingSection = h('section', { class: 'loading' }, h('p', {}, 'Starting song…'));

  root.append(
    settingsPanel,
    h('div', { class: 'row device' }, deviceSelect, refreshBtn, phoneBtn, browserBtn),
    deviceHint,
    accountLine,
    scanSection,
    loadingSection,
    playingSection,
    errorSection,
  );

  const scanner = new QrScanner(video, (result) => onScan(result.data), {
    preferredCamera: 'environment',
    highlightScanRegion: true,
    returnDetailedScanResult: true,
    maxScansPerSecond: 8,
  });

  function setState(state: State): void {
    show(scanSection, state === 'scanning');
    show(loadingSection, state === 'loading');
    show(playingSection, state === 'playing');
    show(errorSection, state === 'error');
    if (state === 'scanning') {
      scanMsg.textContent = 'Point the camera at a card’s QR code.';
      scanner.start().catch(() => {
        scanMsg.textContent = 'Camera unavailable. Allow camera access for this site and reload.';
      });
    } else {
      scanner.stop();
    }
  }

  function showError(message: string, offerWake = false): void {
    errorMsg.textContent = message;
    show(wakeBtn, offerWake);
    setState('error');
  }

  function onScan(text: string): void {
    const trackId = trackIdFromScan(text);
    if (!trackId) {
      scanMsg.textContent = 'That QR code isn’t one of our cards.';
      return;
    }
    playCard(trackId);
  }

  async function playCard(trackId: string): Promise<void> {
    const deviceId = deviceSelect.value;
    if (!deviceId) {
      showError('Choose a speaker first, then scan the card again.');
      return;
    }
    setState('loading');
    try {
      const duration = settings.mode === 'start' ? null : await getTrackDuration(trackId);
      const position = startPositionMs(settings, duration);
      try {
        await play(trackId, deviceId, position);
      } catch (e) {
        // Idle devices (especially a backgrounded phone app) often need to be activated first.
        if (!(e instanceof SpotifyError) || e.status !== 404) throw e;
        await transferPlayback(deviceId);
        await play(trackId, deviceId, position);
      }
      paused = false;
      pauseBtn.textContent = '⏸';
      setState('playing');
      ensureStartPosition(trackId, deviceId, position);
    } catch (e) {
      const notFound = e instanceof SpotifyError && e.status === 404;
      if (notFound) loadDevices();
      const phoneMode = getMode() === 'phone' && !DESKTOP;
      showError(
        notFound && phoneMode ? 'Spotify on this phone went to sleep. Open it, switch back, and scan the card again.' : errorMessage(e),
        notFound && phoneMode,
      );
    }
  }

  /** Seek explicitly if the device ignored the start position in the play request. */
  async function ensureStartPosition(trackId: string, deviceId: string, positionMs: number): Promise<void> {
    if (positionMs <= 0) return;
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((r) => setTimeout(r, 400));
        const check = checkStartPosition(await getPlaybackState(), trackId, positionMs);
        if (check === 'ok') return;
        if (check === 'seek') break;
      }
      await seek(positionMs, deviceId);
    } catch {
      // Best effort: the song is already playing, just from an earlier point.
    }
  }

  async function togglePause(): Promise<void> {
    const deviceId = deviceSelect.value;
    try {
      await (paused ? resume(deviceId) : pause(deviceId));
      paused = !paused;
      pauseBtn.textContent = paused ? '▶' : '⏸';
    } catch (e) {
      showError(errorMessage(e));
    }
  }

  // ---- Boot ----
  const initialCard = params.get('c') ? trackIdFromScan(location.href) : null;
  if (params.has('c')) history.replaceState(null, '', '#/play'); // don't replay on reload
  setState(initialCard ? 'loading' : 'scanning');
  const browserReady =
    CAN_PLAY_IN_BROWSER && getMode() === 'browser' && hasScopes(...BROWSER_PLAYER_SCOPES) ? startBrowser() : loadDevices();
  browserReady.then(() => {
    if (initialCard) playCard(initialCard);
    else if (params.has('c')) showError('That link isn’t a valid card.');
  });

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('pointerdown', unlockSound);
    browserPlayer?.disconnect();
    scanner.destroy();
  };
}

/** User-facing message. Never includes anything about the song. */
function errorMessage(e: unknown): string {
  if (e instanceof NotLoggedInError) return 'You’ve been logged out of Spotify. Go home and log in again.';
  if (e instanceof SpotifyError) {
    if (e.status === 404) return `Speaker not found. ${WAKE_HINT}`;
    if (e.reason === 'PREMIUM_REQUIRED') return 'Spotify Premium is required to play songs.';
    if (e.status === 403) return 'Spotify refused to play this card. The song may be unavailable in your country.';
    if (e.status === 400) return 'This card’s song couldn’t be played.';
    if (e.status === 429) return 'Spotify is rate-limiting us. Wait a few seconds and try again.';
    return `Spotify error (${e.status}). Try again.`;
  }
  return 'Network problem. Check your connection and try again.';
}
