"""Pure parts of the NaDoch! speech sidecar, standard library only.

Request parsing, voice lookup, the ffmpeg argument builders and the render pipeline live here so
they can be tested with `python3 -m unittest` on a machine without FastAPI or Piper. `server.py`
wires them to FastAPI and Piper.

Every segment and the pause are resampled to one format (24 kHz, mono, s16 WAV) before the concat
demuxer joins them: the Piper voices differ in sample rate (thorsten-high is 22.05 kHz, the low and
x_low voices are 16 kHz), and the concat demuxer needs identical stream parameters.
"""
import os
import subprocess
import tempfile
from typing import Callable

HERE = os.path.dirname(os.path.abspath(__file__))
MANIFEST_PATH = os.path.join(HERE, "voices.txt")

SAMPLE_RATE = 24000
DEFAULT_FILTER = "none"
DEFAULT_PAUSE_MS = 600
MAX_PAUSE_MS = 10000
MAX_SEGMENTS = 200
MAX_TEXT_CHARS = 2000

FILTERS = {
    "none": None,
    "phone": "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3",
    "station": "aecho=0.8:0.7:60|120:0.35|0.2,highpass=f=120",
    "radio": "highpass=f=150,lowpass=f=6000,acompressor=threshold=-20dB:ratio=2.5",
}

# Output format shared by /render and /convert: ogg/opus, mono, 24 kHz.
OGG_OUT = ["-ac", "1", "-ar", str(SAMPLE_RATE), "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"]
# Intermediate format every segment and the pause are resampled to before concat.
PCM_OUT = ["-ac", "1", "-ar", str(SAMPLE_RATE), "-sample_fmt", "s16", "-c:a", "pcm_s16le", "-f", "wav"]


class SpeechError(Exception):
    """An error the server returns as `{"error": message}` with this HTTP status."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


# ---------- voices ----------

def parse_voice_manifest(text: str) -> dict[str, str]:
    """Parse `voices.txt`: one `<name> <huggingface path without extension>` per line.

    Returns {name: model file name}, e.g. {"thorsten": "de_DE-thorsten-high.onnx"}.
    """
    voices: dict[str, str] = {}
    for n, raw in enumerate(text.splitlines(), start=1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        if len(parts) != 2:
            raise ValueError(f"voices.txt line {n}: expected '<name> <path>'")
        name, path = parts
        if name in voices:
            raise ValueError(f"voices.txt line {n}: duplicate voice {name}")
        voices[name] = os.path.basename(path) + ".onnx"
    return voices


def load_voice_manifest(path: str = MANIFEST_PATH) -> dict[str, str]:
    with open(path, encoding="utf-8") as f:
        return parse_voice_manifest(f.read())


VOICE_FILES = load_voice_manifest()


def voice_names() -> list[str]:
    return sorted(VOICE_FILES)


def voice_path(name: str, voice_dir: str) -> str:
    """The model file for a voice name; 400 for a name the manifest doesn't list."""
    if name not in VOICE_FILES:
        raise SpeechError(400, f"unknown voice {name}")
    return os.path.join(voice_dir, VOICE_FILES[name])


# ---------- request ----------

def parse_render_request(body: object) -> tuple[list[tuple[str, str]], str, int]:
    """Validate a /render body `{ segments: [{ text, voice }], filter?, pauseMs? }`.

    Returns (segments as (text, voice) pairs, filter, pauseMs). Raises SpeechError(400) otherwise.
    """
    if not isinstance(body, dict):
        raise SpeechError(400, "body must be a JSON object")
    segments = body.get("segments")
    if not isinstance(segments, list) or not segments:
        raise SpeechError(400, "no segments")
    if len(segments) > MAX_SEGMENTS:
        raise SpeechError(400, f"too many segments (max {MAX_SEGMENTS})")
    parsed: list[tuple[str, str]] = []
    for i, seg in enumerate(segments):
        if not isinstance(seg, dict):
            raise SpeechError(400, f"segment {i} must be an object")
        text, voice = seg.get("text"), seg.get("voice")
        if not isinstance(text, str) or not text.strip():
            raise SpeechError(400, f"segment {i} has no text")
        if len(text) > MAX_TEXT_CHARS:
            raise SpeechError(400, f"segment {i} is too long (max {MAX_TEXT_CHARS} characters)")
        if not isinstance(voice, str) or voice not in VOICE_FILES:
            raise SpeechError(400, f"unknown voice {voice}")
        parsed.append((text.strip(), voice))
    filter_name = body.get("filter", DEFAULT_FILTER)
    if not isinstance(filter_name, str) or filter_name not in FILTERS:
        raise SpeechError(400, f"unknown filter {filter_name}")
    pause_ms = body.get("pauseMs", DEFAULT_PAUSE_MS)
    if isinstance(pause_ms, bool) or not isinstance(pause_ms, int) or not 0 <= pause_ms <= MAX_PAUSE_MS:
        raise SpeechError(400, f"pauseMs must be an integer from 0 to {MAX_PAUSE_MS}")
    return parsed, filter_name, pause_ms


# ---------- ffmpeg arguments ----------

def filter_args(name: str) -> list[str]:
    """The `-af` arguments for a situational filter; none for "none"."""
    if name not in FILTERS:
        raise SpeechError(400, f"unknown filter {name}")
    chain = FILTERS[name]
    return ["-af", chain] if chain else []


def resample_args(src: str, dst: str) -> list[str]:
    """Bring one synthesized segment (any rate) to the common 24 kHz mono s16 WAV."""
    return ["-y", "-i", src, *PCM_OUT, dst]


def silence_args(pause_ms: int, dst: str) -> list[str]:
    """A pause of `pause_ms` in the common format."""
    return ["-y", "-f", "lavfi", "-i", f"anullsrc=r={SAMPLE_RATE}:cl=mono", "-t", f"{pause_ms / 1000:.3f}", *PCM_OUT, dst]


def concat_list(paths: list[str]) -> str:
    """The concat demuxer's list file. Single quotes in paths are escaped as '\\''."""
    return "".join("file '" + p.replace("'", "'\\''") + "'\n" for p in paths)


def interleave_pauses(parts: list[str], silence: str | None) -> list[str]:
    """parts joined by the silence file, with no trailing pause."""
    out: list[str] = []
    for i, p in enumerate(parts):
        if i and silence:
            out.append(silence)
        out.append(p)
    return out


def encode_args(listing: str, filter_name: str) -> list[str]:
    """Join the concat list, apply the filter and encode to ogg/opus on stdout."""
    return ["-f", "concat", "-safe", "0", "-i", listing, *filter_args(filter_name), *OGG_OUT]


def convert_args(src: str) -> list[str]:
    """Turn an uploaded recording (any format ffmpeg reads) into the app's ogg/opus."""
    return ["-i", src, *OGG_OUT]


# ---------- running ffmpeg ----------

def run_ffmpeg(args: list[str], data: bytes | None = None, binary: str = "ffmpeg") -> bytes:
    result = subprocess.run([binary, "-hide_banner", "-loglevel", "error", *args], input=data, capture_output=True)
    if result.returncode != 0:
        raise SpeechError(500, "ffmpeg failed: " + result.stderr.decode(errors="replace")[:500])
    return result.stdout


Synth = Callable[[str, str], bytes]
Ffmpeg = Callable[[list[str]], bytes]


def render(segments: list[tuple[str, str]], filter_name: str, pause_ms: int, synth: Synth, ffmpeg: Ffmpeg = run_ffmpeg) -> bytes:
    """Synthesize each (text, voice) to WAV, resample all to 24 kHz, join with pauses, filter, encode."""
    with tempfile.TemporaryDirectory() as tmp:
        parts = []
        for i, (text, voice) in enumerate(segments):
            raw = os.path.join(tmp, f"raw{i}.wav")
            with open(raw, "wb") as f:
                f.write(synth(text, voice))
            norm = os.path.join(tmp, f"seg{i}.wav")
            ffmpeg(resample_args(raw, norm))
            parts.append(norm)
        silence = None
        if pause_ms > 0 and len(parts) > 1:
            silence = os.path.join(tmp, "silence.wav")
            ffmpeg(silence_args(pause_ms, silence))
        listing = os.path.join(tmp, "list.txt")
        with open(listing, "w", encoding="utf-8") as f:
            f.write(concat_list(interleave_pauses(parts, silence)))
        return ffmpeg(encode_args(listing, filter_name))


def convert(data: bytes, ffmpeg: Ffmpeg = run_ffmpeg) -> bytes:
    """Convert an upload. It goes through a temp file, not a pipe, so formats that need seeking (mp4/m4a) work."""
    if not data:
        raise SpeechError(400, "empty upload")
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "upload")
        with open(src, "wb") as f:
            f.write(data)
        return ffmpeg(convert_args(src))
