"""NaDoch! speech sidecar: German TTS with Piper, and audio conversion, via ffmpeg.

POST /render joins synthesized segments with pauses and applies a situational filter.
POST /convert turns an uploaded recording into the app's audio format (ogg/opus, mono, 24 kHz).
Errors are `{"error": "..."}`: 400 for a bad request, 500 when synthesis or ffmpeg fails.

The pure parts (parsing, ffmpeg arguments, the render pipeline) are in audio_core.py.
"""
import io
import json
import os
import wave

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from piper import PiperVoice

import audio_core
from audio_core import SpeechError

VOICE_DIR = os.environ.get("VOICE_DIR", "/voices")

app = FastAPI()
_voices: dict[str, PiperVoice] = {}


@app.exception_handler(SpeechError)
async def speech_error(_request: Request, exc: SpeechError):
    return JSONResponse(status_code=exc.status, content={"error": exc.message})


def voice(name: str) -> PiperVoice:
    path = audio_core.voice_path(name, VOICE_DIR)
    if name not in _voices:
        try:
            _voices[name] = PiperVoice.load(path)
        except Exception as e:  # missing or corrupt model file
            raise SpeechError(500, f"could not load voice {name}: {e}")
    return _voices[name]


def synth_wav(text: str, name: str) -> bytes:
    v = voice(name)
    buf = io.BytesIO()
    try:
        with wave.open(buf, "wb") as wav:
            if hasattr(v, "synthesize_wav"):  # piper-tts >= 1.3
                v.synthesize_wav(text, wav)
            else:  # piper-tts 1.2
                v.synthesize(text, wav)
    except SpeechError:
        raise
    except Exception as e:
        raise SpeechError(500, f"synthesis failed: {e}")
    return buf.getvalue()


@app.get("/health")
def health():
    return {"ok": True, "voices": audio_core.voice_names()}


@app.post("/render")
async def render(request: Request):
    try:
        body = json.loads(await request.body())
    except ValueError:
        raise SpeechError(400, "body must be JSON")
    segments, filter_name, pause_ms = audio_core.parse_render_request(body)
    # Synthesis and ffmpeg block, so they run off the event loop.
    audio = await run_in_threadpool(audio_core.render, segments, filter_name, pause_ms, synth_wav)
    return Response(content=audio, media_type="audio/ogg")


@app.post("/convert")
async def convert(request: Request):
    audio = await run_in_threadpool(audio_core.convert, await request.body())
    return Response(content=audio, media_type="audio/ogg")
