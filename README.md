# Song Timeline

A music timeline party game played with your own songs. You turn a Spotify playlist into printed cards (QR code on the front; year, artist and title on the back). During a game, one phone scans a card and plays the song on a Spotify speaker without showing what it is. Players place cards on their timelines on the table.

"Song Timeline" is a placeholder name. Change it in `src/config.ts` and `index.html`.

## What you need

- **Spotify Premium** for the host account. Playback goes through Spotify Connect.
- A speaker that shows up in Spotify Connect (a Connect speaker, a TV, or a computer or phone running the Spotify app).
- A duplex (double-sided) printer.

## One-time setup

### 1. Create a Spotify app

1. Go to <https://developer.spotify.com/dashboard> and click **Create app**.
2. Add these **Redirect URIs** exactly, including the trailing slash:
   - `https://<your-github-user>.github.io/hitster/`
   - `http://127.0.0.1:5173/` (for local development)
3. Under **Which API/SDKs are you planning to use?**, tick **Web API**.
4. Copy the **Client ID**. It isn't a secret, because the app uses the PKCE flow.
5. The app runs in development mode, so only users on its allowlist can log in. Add the host's Spotify account under **User Management**.

### 2. Publish to GitHub Pages

1. Create a GitHub repo called `hitster` and push this project to `main`.
2. In the repo, go to **Settings → Secrets and variables → Actions → Variables** and add a variable `SPOTIFY_CLIENT_ID` with the Client ID.
3. Go to **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Push to `main`, or run the workflow manually. The app is published at `https://<your-github-user>.github.io/hitster/`.

If you give the repo a different name, change the redirect URI to match. The build picks up the repo name automatically.

## Making a deck

1. Open the app and log in, then choose **Make a deck**.
2. Paste a Spotify playlist link and click **Load playlist**. Use one playlist per deck. The playlist name appears on the card fronts.
3. Check the **warning list**. Spotify reports the year of the *release*, so remasters, live versions and compilations often show the wrong year. Swap those tracks for the original release in Spotify, then reload.
4. The first time, print the **Alignment test page** on one sheet, double-sided. Hold it up to the light and check that the crosshairs line up with the ones on the back.
5. Click **Print**. Choose double-sided, **flip on long edge**, **100% scale / actual size** (not "fit to page"), and no headers or footers.
6. Cut along the crop marks.

If loading a playlist fails, Spotify may only allow development-mode apps to read playlists you own or collaborate on. In that case, copy the songs into a playlist of your own.

## Playing

1. Wake up the speaker by starting something on it once from the Spotify app.
2. On the host phone, open the app and choose **Play**. Pick the speaker; the app remembers it next time. If the speaker isn't listed, tap **↻**.
   - To play through the phone itself, tap **📱 This phone**. If the Spotify app isn't running, it opens. Switch back to the browser and the phone is picked automatically. The Spotify app must be logged in with the same account. If iOS puts Spotify to sleep during a long pause, the scanner offers a button to open it again.
3. Use **⚙** to choose where songs start: from the beginning, at a fixed offset, or at a random point. You can change this mid-game.
4. Pass the phone around. Each player scans a card, listens, places it on their timeline, then flips it to check.

You can also scan a card with the phone's normal camera app; the link opens the app and plays the song.

## Development

```sh
cp .env.example .env.local   # then fill in VITE_SPOTIFY_CLIENT_ID
npm install
npm run dev                  # http://127.0.0.1:5173 (use 127.0.0.1, not localhost; Spotify requires it)
npm test
npm run build
```

Cards contain a link to the app with a scrambled track ID (`src/payload.ts`). Changing `CARD_KEY` in `src/config.ts` or the app's URL breaks every card already printed.
