import QrScanner from 'qr-scanner';
import { GAME_NAME } from '../config';
import { h, show } from '../dom';
import { trackIdFromScan } from '../payload';
import {
  type Device,
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
import { isLoggedIn, NotLoggedInError } from '../spotify/auth';
import { checkStartPosition, loadStartSettings, saveStartSettings, type StartMode, startPositionMs } from '../start-position';
import { loginPrompt } from './login-prompt';

const DEVICE_KEY = 'deviceId';
/** Set when the host chose "This phone": follow the phone's Spotify app even if its device ID changes. */
const PHONE_KEY = 'useThisPhone';
const WAKE_HINT = 'Not listed? Start something on the speaker from the Spotify app once (or tap 📱 This phone), then tap ↻.';

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
  const deviceSelect = h('select', { 'aria-label': 'Speaker' });
  const deviceHint = h('p', { class: 'hint' });
  const refreshBtn = h('button', { class: 'icon', title: 'Refresh speakers', onclick: () => loadDevices() }, '↻');
  const phoneBtn = h('button', { title: 'Play through the Spotify app on this phone', onclick: () => useThisPhone() }, '📱 This phone');
  deviceSelect.addEventListener('change', () => {
    localStorage.setItem(DEVICE_KEY, deviceSelect.value);
    const picked = devices.find((d) => d.id === deviceSelect.value);
    if (picked && isPhone(picked)) localStorage.setItem(PHONE_KEY, '1');
    else localStorage.removeItem(PHONE_KEY);
  });

  function selectDevice(d: Device): void {
    deviceSelect.value = d.id!;
    localStorage.setItem(DEVICE_KEY, d.id!);
    deviceHint.textContent = '';
  }

  /** Select the Spotify app on this phone, opening it first if it isn't running. */
  async function useThisPhone(): Promise<void> {
    localStorage.setItem(PHONE_KEY, '1');
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
      await loadDevices();
      const phone = findPhone(devices);
      if (phone) {
        waitingForSpotifyApp = false;
        selectDevice(phone);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    waitingForSpotifyApp = false;
    deviceHint.textContent = `This phone isn’t showing up. In the Spotify app, make sure you’re logged in with the same account, then tap ↻.`;
  }
  document.addEventListener('visibilitychange', onVisible);

  async function loadDevices(): Promise<void> {
    deviceHint.textContent = 'Looking for speakers…';
    try {
      devices = await getDevices();
    } catch (e) {
      deviceHint.textContent = errorMessage(e);
      return;
    }
    let saved = localStorage.getItem(DEVICE_KEY);
    // The phone app's device ID can change; in "this phone" mode follow it.
    const phone = localStorage.getItem(PHONE_KEY) ? findPhone(devices) : undefined;
    if (phone && !devices.some((d) => d.id === saved)) {
      saved = phone.id;
      localStorage.setItem(DEVICE_KEY, saved!);
    }
    const placeholder = h('option', { value: '', disabled: true }, 'Choose a speaker…');
    deviceSelect.replaceChildren(
      placeholder,
      ...devices.map((d) => h('option', { value: d.id! }, `${d.name} (${d.type.toLowerCase()})`)),
    );
    const savedPresent = devices.some((d) => d.id === saved);
    deviceSelect.value = savedPresent ? saved! : '';
    if (!savedPresent) placeholder.selected = true;
    if (savedPresent) deviceHint.textContent = '';
    else if (localStorage.getItem(PHONE_KEY))
      deviceHint.textContent = 'Spotify isn’t running on this phone. Tap 📱 This phone to open it.';
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
    h('div', { class: 'row device' }, deviceSelect, refreshBtn, phoneBtn),
    deviceHint,
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
      const phoneMode = Boolean(localStorage.getItem(PHONE_KEY));
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
  loadDevices().then(() => {
    if (initialCard) playCard(initialCard);
    else if (params.has('c')) showError('That link isn’t a valid card.');
  });

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
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
