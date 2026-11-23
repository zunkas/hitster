import QrScanner from 'qr-scanner';
import { GAME_NAME } from '../config';
import { h, show } from '../dom';
import { trackIdFromScan } from '../payload';
import { type Device, getDevices, getTrackDuration, pause, play, resume, SpotifyError } from '../spotify/api';
import { isLoggedIn, NotLoggedInError } from '../spotify/auth';
import { loadStartSettings, saveStartSettings, type StartMode, startPositionMs } from '../start-position';
import { loginPrompt } from './login-prompt';

const DEVICE_KEY = 'deviceId';
const WAKE_HINT = 'Not listed? Start something on the speaker from the Spotify app once, then tap ↻.';

type State = 'scanning' | 'loading' | 'playing' | 'error';

export function playView(root: HTMLElement, params: URLSearchParams): () => void {
  const header = h('header', { class: 'bar' }, h('a', { class: 'back', href: '#/' }, `← ${GAME_NAME}`));
  root.append(header);
  if (!isLoggedIn()) {
    root.append(loginPrompt());
    return () => {};
  }

  // ---- Speaker picker ----
  const deviceSelect = h('select', { 'aria-label': 'Speaker' });
  const deviceHint = h('p', { class: 'hint' });
  const refreshBtn = h('button', { class: 'icon', title: 'Refresh speakers', onclick: () => loadDevices() }, '↻');
  deviceSelect.addEventListener('change', () => localStorage.setItem(DEVICE_KEY, deviceSelect.value));

  async function loadDevices(): Promise<void> {
    deviceHint.textContent = 'Looking for speakers…';
    let devices: Device[];
    try {
      devices = await getDevices();
    } catch (e) {
      deviceHint.textContent = errorMessage(e);
      return;
    }
    const saved = localStorage.getItem(DEVICE_KEY);
    const placeholder = h('option', { value: '', disabled: true }, 'Choose a speaker…');
    deviceSelect.replaceChildren(
      placeholder,
      ...devices.map((d) => h('option', { value: d.id! }, `${d.name} (${d.type.toLowerCase()})`)),
    );
    const savedPresent = devices.some((d) => d.id === saved);
    deviceSelect.value = savedPresent ? saved! : '';
    if (!savedPresent) placeholder.selected = true;
    deviceHint.textContent = !devices.length
      ? `No speakers found. ${WAKE_HINT}`
      : saved && !savedPresent
        ? `Your last speaker isn’t available. Pick one, or: ${WAKE_HINT}`
        : savedPresent
          ? ''
          : WAKE_HINT;
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
  const errorSection = h(
    'section',
    { class: 'panel error' },
    errorMsg,
    h('button', { class: 'big primary', onclick: () => setState('scanning') }, 'Scan next card'),
  );
  const loadingSection = h('section', { class: 'loading' }, h('p', {}, 'Starting song…'));

  root.append(
    settingsPanel,
    h('div', { class: 'row device' }, deviceSelect, refreshBtn),
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

  function showError(message: string): void {
    errorMsg.textContent = message;
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
      await play(trackId, deviceId, startPositionMs(settings, duration));
      paused = false;
      pauseBtn.textContent = '⏸';
      setState('playing');
    } catch (e) {
      if (e instanceof SpotifyError && e.status === 404) loadDevices();
      showError(errorMessage(e));
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

  return () => scanner.destroy();
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
