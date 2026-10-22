# Speech sidecar

A small local service that the app calls to turn Listening transcripts into audio. It runs
[Piper](https://github.com/OHF-Voice/piper1-gpl) (German TTS, six voices) and ffmpeg in a Docker container.

| Endpoint | What it does |
| --- | --- |
| `GET /health` | `{ "ok": true, "voices": [...] }` |
| `POST /render` | JSON `{ segments: [{ text, voice }], filter, pauseMs }` → `audio/ogg`. Segments are joined with `pauseMs` of silence. `filter` is `none`, `phone`, `station` or `radio`; `station` also adds a two-tone chime before the announcement and a low room-noise bed under it. |
| `POST /transcribe?model=small\|medium` | Raw audio bytes (any format ffmpeg reads) → `{ text, language, duration, words: [{ word, start, end, probability }] }`. German only (faster-whisper, `int8` on the CPU, word timestamps, voice-activity filter). |
| `POST /convert` | Raw audio bytes (any format ffmpeg reads) → `audio/ogg` |

Output is ogg/opus, mono, 24 kHz. Errors are `{ "error": "..." }`: 400 for a bad request (an unknown voice
or filter, no segments), 413 for a body over 1 MB (`/render`) or 25 MB (`/convert`), 500 when synthesis or
ffmpeg fails or an ffmpeg step runs over 120 s. `/convert` accepts common audio containers only (wav, mp3, ogg,
mp4/m4a, webm/mkv, flac, aac, caf, aiff), not playlists. Synthesis runs one request at a time.

Transcription: the model is chosen per request (`small` by default, or `medium`; the app passes its `whisper_model`
setting). The image pre-downloads `small` into `/models` (`HF_HOME`); `medium` (~1.5 GB) downloads on first use, so
the first `medium` request is slow and needs internet access. Audio over 5 minutes is a 400
(`audio longer than 5 minutes`), a body over 25 MB a 413, an empty or unreadable one a 400. One transcription runs at
a time.

The voices are listed in `voices.txt`; their names must match the voice pools in `lib/audio/transcript.ts`.

## Build, start and check

Start Docker Desktop first and wait until it says it is running. Then, from the repository root:

```bash
open -a Docker
docker compose build speech        # downloads the image, packages and voices; runs the tests
docker compose up -d speech
curl -s localhost:5002/health      # {"ok":true,"voices":["eva_k","karlsson","kerstin","pavoque","ramona","thorsten"]}
```

The build fails if any test fails; in the build the HTTP tests are required, so a missing package or voice fails it instead of being skipped. If a voice download fails (a moved URL), find the voice's current path
in `voices.json` in the `rhasspy/piper-voices` Hugging Face repository, update `voices.txt` and rebuild.

The service listens on `127.0.0.1:5002` only. The app's **Settings → Content Admin → Speech service URL**
defaults to `http://localhost:5002`.

Stop it with `docker compose stop speech`; it restarts with Docker otherwise (`restart: unless-stopped`).

## Tests without Docker

The pure parts (request parsing, voice lookup, ffmpeg arguments, resampling and joining) are in
`audio_core.py` and need only the Python standard library and ffmpeg:

```bash
cd speech && python3 -m unittest discover -v
```

`test_server.py` needs FastAPI, Piper and the voice files, so it is skipped there and runs in the Docker build.
