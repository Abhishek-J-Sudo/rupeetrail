# Contributing

Thanks for helping. A few things keep RupeeTrail simple to work on.

## Never share a real statement

Not in a commit, an issue, a screenshot or a pasted line, not even with parts blanked out. Use the sample data ("Try with sample data") for screenshots, and a made-up statement in the same layout for tests. See [docs/adding-a-bank.md](docs/adding-a-bank.md).

## Getting set up

You need Python 3.10–3.14 and Node.js 20.19 or newer.

```sh
python start.py --dev
```

This sets everything up the first time, then runs the API with auto-reload on port 8000 and the screens with live reload on http://localhost:5175. Your data goes in `data/`, which git ignores.

Before a pull request:

```sh
cd backend && venv/Scripts/python -m pytest   # venv/bin/python on Mac and Linux
cd frontend && npm run lint && npm run build
```

## Branches and pull requests

- `main` always works. Releases are tags on it (`v1.0.0`, `v1.1.0`, …).
- Work on a short branch named for what it does, `feature/sbi-reader` or `fix/pdf-dates`, and open a pull request into `main`.
- Keep a pull request to one change, with a line on how you checked it.

## Ground rules for the code

- **Nothing leaves the computer** unless the user presses an AI button. No analytics, no remote fonts or scripts, no calls home. The app listens on `127.0.0.1` only.
- Anything sent to an AI provider goes through `backend/app/ai/privacy.py`, and if what's sent changes, the "What the AI sees" text in Settings and `PRIVACY.md` change with it.
- In the screens, colours come from the tokens in `frontend/src/theme/tokens.css` (classes like `bg-surface`, `text-ink`, `text-accent`), never hex codes or Tailwind palette colours, so light and dark both work.
- Money is shown with Indian grouping (`₹1,34,340`) through `frontend/src/lib/money.js`.
