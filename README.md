# Controversy — the app

Pass-and-play **Hot Seat** mode of Controversy (controversygame.com) for one phone, 2–8 players.
**Play it:** https://jordana25.github.io/controversy/

It's an installable web app (PWA): no build step, works offline once loaded, and goes on the home screen like a native app.

## Run it locally

```bash
python -m http.server 8642
```

Open http://localhost:8642. To try it on your phone, use your computer's LAN IP (e.g. `http://192.168.1.20:8642`) on the same Wi-Fi.
Offline mode and install only work over HTTPS or localhost.

## Put it online

Upload the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages), or to a path on controversygame.com.
On a phone: iPhone Safari → Share → **Add to Home Screen**; Android Chrome → **Install app**.
For App Store / Play Store builds, wrap the same folder with Capacitor (`npx cap init`, `webDir` = this folder).

## How a turn works

1. Pass to the Hot Seat → they pick a heat level (Green → Black) and flip a card.
2. The phone goes around: each player secretly taps Agree or Disagree.
3. Back to the Hot Seat, who predicts every vote.
4. Reveals one at a time: a correct guess is +1. A wrong guess starts a 1:00 convince timer, and the player says whether they switched (+1).
5. The Hot Seat moves left. Rounds: 1–5 (each player takes the Hot Seat once per round).

## Files

- `index.html`, `css/app.css`, `js/app.js`: the app
- `js/cards.js`: the 200 statements, **generated**. Edit `Controversy Planning Doc.txt`, then run `python tools/build_cards.py`
- `art/`: flame, wordmark, hero, and broken bridge, **cut from the official box art** in `Box Graphics/` by `python tools/extract_art.py`
- `manifest.webmanifest`, `sw.js`, `icons/`: install + offline. `python tools/make_icons.py` rebuilds the icons from `art/flame.png`
- After changing app files, bump `CACHE` in `sw.js` so installed copies update.
