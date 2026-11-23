import './style.css';
import './print.css';
import { handleRedirect } from './spotify/auth';
import { deckView } from './views/deck';
import { homeView } from './views/home';
import { playView } from './views/play';

type View = (root: HTMLElement, params: URLSearchParams) => (() => void) | void;

const routes: Record<string, View> = {
  '/': homeView,
  '/deck': deckView,
  '/play': playView,
};

const app = document.getElementById('app')!;
let cleanup: (() => void) | void;

function render(): void {
  cleanup?.();
  app.replaceChildren();
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const view = routes[path || '/'] ?? homeView;
  document.body.dataset.route = path || '/';
  cleanup = view(app, new URLSearchParams(query));
}

async function start(): Promise<void> {
  const error = await handleRedirect();
  window.addEventListener('hashchange', render);
  render();
  if (error) alert(error);
}

start();
