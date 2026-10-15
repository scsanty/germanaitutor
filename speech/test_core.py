"""Standard-library tests for audio_core: run with `cd speech && python3 -m unittest`.

The pipeline tests use a real ffmpeg (skipped when it is missing) and stand-in "voices" that
generate sine tones at Piper's two sample rates, so the resample-before-concat logic is checked
without Piper.
"""
import io
import os
import re
import shutil
import struct
import tempfile
import unittest
import wave

import audio_core
from audio_core import SpeechError

HAVE_FFMPEG = shutil.which("ffmpeg") is not None
TRANSCRIPT_TS = os.path.join(audio_core.HERE, "..", "lib", "audio", "transcript.ts")

# Stand-ins for the real voices' native rates: thorsten-high 22.05 kHz, the low voices 16 kHz.
FAKE_RATES = {"thorsten": 22050, "kerstin": 16000, "karlsson": 16000}


def tone_wav(seconds: float, rate: int, freq: int = 440) -> bytes:
    """A mono s16 sine tone as WAV bytes, built with ffmpeg so it has the given native rate."""
    return to_wav(["-f", "lavfi", "-i", f"sine=frequency={freq}:sample_rate={rate}", "-t", f"{seconds}"])


def to_wav(input_args: list[str]) -> bytes:
    """Run ffmpeg into a real WAV file (a piped WAV has no length in its header) and return its bytes."""
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out.wav")
        audio_core.run_ffmpeg([*input_args, "-ac", "1", "-c:a", "pcm_s16le", out])
        with open(out, "rb") as f:
            return f.read()


def fake_synth(text: str, voice: str) -> bytes:
    # One second of tone per segment; the text length only picks the pitch.
    return tone_wav(1.0, FAKE_RATES[voice], 300 + 10 * len(text))


def wav_seconds(data: bytes) -> float:
    with wave.open(io.BytesIO(data)) as w:
        return w.getnframes() / w.getframerate()


def ogg_seconds(ogg: bytes) -> float:
    """Decode ogg back to WAV with ffmpeg and measure it with the wave module."""
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "a.ogg")
        with open(src, "wb") as f:
            f.write(ogg)
        return wav_seconds(to_wav(["-i", src]))


def opus_head(ogg: bytes) -> tuple[int, int]:
    """(channels, input sample rate) from the OpusHead packet. Opus always decodes at 48 kHz,
    so the encoder's rate is read from the header instead."""
    i = ogg.index(b"OpusHead")
    channels = ogg[i + 9]
    (rate,) = struct.unpack("<I", ogg[i + 12 : i + 16])
    return channels, rate


class VoiceManifestTest(unittest.TestCase):
    def test_parses_names_to_model_files(self):
        voices = audio_core.parse_voice_manifest("# c\nthorsten de/de_DE/thorsten/high/de_DE-thorsten-high\n\neva_k a/b/de_DE-eva_k-x_low # x\n")
        self.assertEqual(voices, {"thorsten": "de_DE-thorsten-high.onnx", "eva_k": "de_DE-eva_k-x_low.onnx"})

    def test_rejects_bad_and_duplicate_lines(self):
        with self.assertRaises(ValueError):
            audio_core.parse_voice_manifest("thorsten\n")
        with self.assertRaises(ValueError):
            audio_core.parse_voice_manifest("a x/y\na x/z\n")

    def test_shipped_manifest_has_the_six_voices(self):
        self.assertEqual(audio_core.voice_names(), ["eva_k", "karlsson", "kerstin", "pavoque", "ramona", "thorsten"])
        self.assertEqual(audio_core.VOICE_FILES["thorsten"], "de_DE-thorsten-high.onnx")
        self.assertEqual(audio_core.VOICE_FILES["eva_k"], "de_DE-eva_k-x_low.onnx")

    @unittest.skipUnless(os.path.exists(TRANSCRIPT_TS), "lib/audio/transcript.ts is not next to the sidecar (e.g. in the image)")
    def test_manifest_matches_the_app_voice_pools(self):
        with open(TRANSCRIPT_TS, encoding="utf-8") as f:
            src = f.read()
        pools = re.search(r"const VOICES = \{(.*?)\} as const", src, re.S)
        self.assertIsNotNone(pools)
        app_voices = sorted(re.findall(r"'([a-z_]+)'", pools.group(1)))
        self.assertEqual(app_voices, audio_core.voice_names())

    def test_voice_path_and_unknown_voice(self):
        self.assertEqual(audio_core.voice_path("kerstin", "/voices"), "/voices/de_DE-kerstin-low.onnx")
        with self.assertRaises(SpeechError) as ctx:
            audio_core.voice_path("nope", "/voices")
        self.assertEqual((ctx.exception.status, ctx.exception.message), (400, "unknown voice nope"))


class ParseRenderRequestTest(unittest.TestCase):
    def assert400(self, body, message=None):
        with self.assertRaises(SpeechError) as ctx:
            audio_core.parse_render_request(body)
        self.assertEqual(ctx.exception.status, 400)
        if message:
            self.assertEqual(ctx.exception.message, message)

    def test_full_request(self):
        body = {"segments": [{"text": " Hallo. ", "voice": "thorsten"}, {"text": "Tag.", "voice": "kerstin"}], "filter": "phone", "pauseMs": 300}
        self.assertEqual(audio_core.parse_render_request(body), ([("Hallo.", "thorsten"), ("Tag.", "kerstin")], "phone", 300))

    def test_defaults_match_the_app(self):
        # lib/audio/transcript.ts: filter defaults to none, PAUSE_MS = 600.
        self.assertEqual(audio_core.parse_render_request({"segments": [{"text": "x", "voice": "ramona"}]}), ([("x", "ramona")], "none", 600))

    def test_rejects_empty_segments(self):
        self.assert400({"segments": []}, "no segments")
        self.assert400({}, "no segments")
        self.assert400([], "body must be a JSON object")

    def test_rejects_unknown_voice_and_filter(self):
        self.assert400({"segments": [{"text": "x", "voice": "nope"}]}, "unknown voice nope")
        self.assert400({"segments": [{"text": "x", "voice": "thorsten"}], "filter": "echo"}, "unknown filter echo")

    def test_rejects_bad_segments_and_pause(self):
        self.assert400({"segments": ["x"]})
        self.assert400({"segments": [{"text": "  ", "voice": "thorsten"}]})
        self.assert400({"segments": [{"text": "x" * (audio_core.MAX_TEXT_CHARS + 1), "voice": "thorsten"}]})
        self.assert400({"segments": [{"text": "x", "voice": "thorsten"}] * (audio_core.MAX_SEGMENTS + 1)})
        for pause in [-1, audio_core.MAX_PAUSE_MS + 1, 1.5, "600", True]:
            self.assert400({"segments": [{"text": "x", "voice": "thorsten"}], "pauseMs": pause})
        self.assertEqual(audio_core.parse_render_request({"segments": [{"text": "x", "voice": "thorsten"}], "pauseMs": 0})[2], 0)


class FfmpegArgsTest(unittest.TestCase):
    def test_filter_args_per_filter(self):
        self.assertEqual(audio_core.filter_args("none"), [])
        self.assertEqual(audio_core.filter_args("phone"), ["-af", "highpass=f=300,lowpass=f=3400,acompressor=threshold=-18dB:ratio=3"])
        self.assertEqual(audio_core.filter_args("station"), ["-af", "aecho=0.8:0.7:60|120:0.35|0.2,highpass=f=120"])
        self.assertEqual(audio_core.filter_args("radio"), ["-af", "highpass=f=150,lowpass=f=6000,acompressor=threshold=-20dB:ratio=2.5"])
        with self.assertRaises(SpeechError):
            audio_core.filter_args("echo")

    def test_filters_match_the_app(self):
        self.assertEqual(sorted(audio_core.FILTERS), ["none", "phone", "radio", "station"])

    def test_resample_and_silence_use_one_format(self):
        common = ["-ac", "1", "-ar", "24000", "-sample_fmt", "s16", "-c:a", "pcm_s16le", "-f", "wav"]
        self.assertEqual(audio_core.resample_args("in.wav", "out.wav"), ["-y", "-i", "in.wav", *common, "out.wav"])
        self.assertEqual(audio_core.silence_args(600, "s.wav"), ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.600", *common, "s.wav"])

    def test_concat_list_and_pauses(self):
        self.assertEqual(audio_core.interleave_pauses(["a", "b", "c"], "s"), ["a", "s", "b", "s", "c"])
        self.assertEqual(audio_core.interleave_pauses(["a", "b"], None), ["a", "b"])
        self.assertEqual(audio_core.interleave_pauses(["a"], "s"), ["a"])
        self.assertEqual(audio_core.concat_list(["/t/a.wav", "/t/it's.wav"]), "file '/t/a.wav'\nfile '/t/it'\\''s.wav'\n")

    def test_encode_and_convert_args(self):
        ogg = ["-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"]
        self.assertEqual(audio_core.encode_args("l.txt", "none"), ["-f", "concat", "-safe", "0", "-i", "l.txt", *ogg])
        self.assertEqual(audio_core.encode_args("l.txt", "radio")[6:8], ["-af", audio_core.FILTERS["radio"]])
        self.assertEqual(audio_core.convert_args("up"), ["-i", "up", *ogg])


class RenderWithFakeFfmpegTest(unittest.TestCase):
    """The pipeline's ffmpeg calls, recorded without running ffmpeg."""

    def test_resamples_every_segment_then_concats(self):
        calls, listings = [], []

        def ffmpeg(args):
            calls.append(args)
            if "concat" in args:
                with open(args[args.index("-i") + 1]) as f:
                    listings.append(f.read())
            return b"OggS"

        out = audio_core.render([("a", "thorsten"), ("b", "kerstin")], "station", 250, lambda t, v: b"RIFF", ffmpeg)
        self.assertEqual(out, b"OggS")
        self.assertEqual(len(calls), 4)  # two resamples, one silence, one encode
        for args in calls[:3]:
            self.assertEqual(args[args.index("-ar") + 1], "24000")
            self.assertIn("pcm_s16le", args)
        self.assertIn("-af", calls[3])
        names = [os.path.basename(line.split("'")[1]) for line in listings[0].splitlines()]
        self.assertEqual(names, ["seg0.wav", "silence.wav", "seg1.wav"])

    def test_single_segment_has_no_pause(self):
        calls = []
        audio_core.render([("a", "thorsten")], "none", 600, lambda t, v: b"RIFF", lambda a: calls.append(a) or b"")
        self.assertEqual(len(calls), 2)
        self.assertFalse(any("anullsrc=r=24000:cl=mono" in a for a in calls))

    def test_convert_rejects_empty_upload(self):
        with self.assertRaises(SpeechError) as ctx:
            audio_core.convert(b"", lambda a: b"")
        self.assertEqual(ctx.exception.status, 400)

    def test_ffmpeg_failure_is_a_500(self):
        with self.assertRaises(SpeechError) as ctx:
            audio_core.run_ffmpeg(["-i", "/nonexistent/input.wav", "-f", "null", "-"], binary=shutil.which("ffmpeg") or "false")
        self.assertEqual(ctx.exception.status, 500)


@unittest.skipUnless(HAVE_FFMPEG, "ffmpeg is not on PATH")
class RenderWithRealFfmpegTest(unittest.TestCase):
    """S16: mixed 22.05 kHz and 16 kHz voices must join at the right speed."""

    def test_mixed_rates_keep_the_summed_duration(self):
        segs = [("Hallo, hier ist Thomas.", "thorsten"), ("Guten Tag.", "kerstin"), ("Ja.", "karlsson")]
        ogg = audio_core.render(segs, "none", 300, fake_synth)
        self.assertEqual(ogg[:4], b"OggS")
        expected = 3 * 1.0 + 2 * 0.3
        self.assertAlmostEqual(ogg_seconds(ogg), expected, delta=expected * 0.1)

    def test_each_filter_renders_ogg(self):
        for name in audio_core.FILTERS:
            with self.subTest(filter=name):
                ogg = audio_core.render([("a", "thorsten"), ("b", "kerstin")], name, 300, fake_synth)
                self.assertEqual(ogg[:4], b"OggS")
                self.assertAlmostEqual(ogg_seconds(ogg), 2.3, delta=0.23)

    def test_output_is_mono_24k(self):
        ogg = audio_core.render([("a", "kerstin")], "phone", 600, fake_synth)
        self.assertEqual(opus_head(ogg), (1, 24000))
        self.assertEqual(opus_head(audio_core.convert(tone_wav(0.2, 44100))), (1, 24000))

    def test_convert_turns_a_recording_into_ogg(self):
        ogg = audio_core.convert(tone_wav(0.5, 44100))
        self.assertEqual(ogg[:4], b"OggS")
        self.assertAlmostEqual(ogg_seconds(ogg), 0.5, delta=0.05)

    def test_convert_garbage_is_a_500(self):
        with self.assertRaises(SpeechError) as ctx:
            audio_core.convert(b"not audio at all")
        self.assertEqual(ctx.exception.status, 500)


if __name__ == "__main__":
    unittest.main()
