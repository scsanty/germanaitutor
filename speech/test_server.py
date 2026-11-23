"""HTTP tests for the sidecar. They need FastAPI, httpx, Piper and the voice files, so they run in the
Docker build (`RUN python -m pytest -q`) and are skipped elsewhere, e.g. under `python3 -m unittest`
on a machine without those packages.

The Dockerfile sets SPEECH_REQUIRE_FULL_TESTS=1: then nothing here is skipped, so a missing package,
a wrong import or a missing voice file fails the image build instead of passing it silently.
"""
import importlib.util
import os
import tempfile
import unittest
import wave

REQUIRE_FULL = os.environ.get("SPEECH_REQUIRE_FULL_TESTS") == "1"
HAVE_DEPS = REQUIRE_FULL or all(importlib.util.find_spec(m) is not None for m in ("fastapi", "httpx", "piper"))
VOICE_DIR = os.environ.get("VOICE_DIR", "/voices")
# aecho's longest delay (station's 60|120 ms taps): ffmpeg flushes this tail after the input ends.
ECHO_TAIL_SECONDS = 0.12
HAVE_VOICES = REQUIRE_FULL or os.path.exists(os.path.join(VOICE_DIR, "de_DE-thorsten-high.onnx"))

if HAVE_DEPS:
    from fastapi.testclient import TestClient

    import audio_core
    import server
    from server import app

    client = TestClient(app)


def ogg_seconds(ogg: bytes) -> float:
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "a.ogg")
        with open(src, "wb") as f:
            f.write(ogg)
        out = os.path.join(tmp, "a.wav")  # a real file: a piped WAV has no length in its header
        audio_core.run_ffmpeg(["-i", src, "-c:a", "pcm_s16le", out])
        with wave.open(out) as w:
            return w.getnframes() / w.getframerate()


@unittest.skipUnless(HAVE_DEPS, "fastapi, httpx or piper is not installed (runs in the Docker build)")
class ServerTest(unittest.TestCase):
    def test_health_lists_voices(self):
        body = client.get("/health").json()
        self.assertIs(body["ok"], True)
        self.assertIn("thorsten", body["voices"])
        self.assertIn("kerstin", body["voices"])

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_render_each_filter_returns_ogg(self):
        for name in ["none", "phone", "station", "radio"]:
            res = client.post("/render", json={
                "segments": [{"text": "Hallo, hier ist Thomas.", "voice": "thorsten"}, {"text": "Guten Tag.", "voice": "kerstin"}],
                "filter": name,
                "pauseMs": 300,
            })
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(res.headers["content-type"], "audio/ogg")
            self.assertEqual(res.content[:4], b"OggS")

    def test_render_rejects_unknown_voice_and_filter(self):
        res = client.post("/render", json={"segments": [{"text": "x", "voice": "nope"}]})
        self.assertEqual((res.status_code, res.json()), (400, {"error": "unknown voice nope"}))
        res = client.post("/render", json={"segments": [{"text": "x", "voice": "thorsten"}], "filter": "echo"})
        self.assertEqual((res.status_code, res.json()), (400, {"error": "unknown filter echo"}))
        self.assertEqual(client.post("/render", json={"segments": []}).status_code, 400)
        self.assertEqual(client.post("/render", content=b"not json").status_code, 400)

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_convert_turns_a_recording_into_ogg(self):
        ogg = client.post("/render", json={"segments": [{"text": "Test.", "voice": "thorsten"}]}).content
        res = client.post("/convert", content=ogg)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.content[:4], b"OggS")
        self.assertEqual(client.post("/convert", content=b"").status_code, 400)

    def test_oversized_bodies_are_413(self):
        res = client.post("/render", content=b"{" + b" " * audio_core.MAX_RENDER_BYTES + b"}")
        self.assertEqual((res.status_code, res.json()), (413, {"error": f"request body is larger than {audio_core.MAX_RENDER_BYTES} bytes"}))
        self.assertEqual(client.post("/convert", content=b"\0" * (audio_core.MAX_CONVERT_BYTES + 1)).status_code, 413)

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_station_adds_the_chime(self):
        # Piper's phoneme lengths are randomized (noise_w), so the same text varies by about +-0.15 s
        # between syntheses. Synthesize once and render that same audio both ways.
        wav = server.synth_wav("Gleis drei, bitte einsteigen.", "kerstin")
        same = lambda _text, _voice: wav
        plain = ogg_seconds(audio_core.render([("x", "kerstin")], "none", 0, same))
        station_ogg = audio_core.render([("x", "kerstin")], "station", 0, same)
        # The chime, plus aecho's 120 ms delay tail, which ffmpeg (5.1 in the image) flushes at the end.
        self.assertAlmostEqual(ogg_seconds(station_ogg) - plain, audio_core.CHIME_SECONDS + ECHO_TAIL_SECONDS, delta=0.05)
        self.assertEqual(station_ogg[:4], b"OggS")

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_mixed_rate_voices_keep_their_duration(self):
        # S16: thorsten-high is 22.05 kHz and kerstin-low 16 kHz; joined, the length must be the sum.
        # Each line is synthesized once (Piper's lengths vary per synthesis) and reused for every render.
        wavs = {
            "Hallo, hier ist Thomas.": server.synth_wav("Hallo, hier ist Thomas.", "thorsten"),
            "Guten Tag, wie geht es Ihnen?": server.synth_wav("Guten Tag, wie geht es Ihnen?", "kerstin"),
        }
        same = lambda text, _voice: wavs[text]
        segs = [("Hallo, hier ist Thomas.", "thorsten"), ("Guten Tag, wie geht es Ihnen?", "kerstin")]
        alone = [ogg_seconds(audio_core.render([seg], "none", 0, same)) for seg in segs]
        both = ogg_seconds(audio_core.render(segs, "none", 500, same))
        expected = sum(alone) + 0.5
        self.assertAlmostEqual(both, expected, delta=expected * 0.1)

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_transcribe_returns_text_and_word_probabilities(self):
        audio = client.post("/render", json={"segments": [{"text": "Ich wohne seit drei Jahren in Berlin.", "voice": "thorsten"}]}).content
        res = client.post("/transcribe?model=small", content=audio)
        self.assertEqual(res.status_code, 200, res.text)
        body = res.json()
        self.assertIn("berlin", body["text"].lower())
        self.assertEqual(body["language"], "de")
        self.assertGreater(body["duration"], 1)
        self.assertTrue(body["words"])
        for w in body["words"]:
            self.assertEqual(sorted(w), ["end", "probability", "start", "word"])
            self.assertTrue(0 <= w["probability"] <= 1)

    def _roundtrip(self, out_args: list[str]) -> None:
        """Render German speech, re-encode it as a browser would record it, and transcribe that."""
        ogg = client.post("/render", json={"segments": [{"text": "Ich wohne seit drei Jahren in Berlin.", "voice": "thorsten"}]}).content
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "in.ogg")
            with open(src, "wb") as f:
                f.write(ogg)
            dst = os.path.join(tmp, "out")
            audio_core.run_ffmpeg(["-i", src, *out_args, dst])
            with open(dst, "rb") as f:
                audio = f.read()
        res = client.post("/transcribe?model=small", content=audio)
        self.assertEqual(res.status_code, 200, res.text)
        self.assertIn("berlin", res.json()["text"].lower())

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_transcribe_reads_webm_opus(self):
        # What Chrome and Firefox record (audio/webm;codecs=opus).
        self._roundtrip(["-c:a", "libopus", "-b:a", "32k", "-f", "webm"])

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_transcribe_reads_mp4_aac(self):
        # What Safari records (audio/mp4), with the moov atom at the end as a seekable file has it.
        self._roundtrip(["-c:a", "aac", "-b:a", "64k", "-f", "mp4"])

    def test_transcribe_rejects_a_playlist(self):
        # hls is not on the allow-list, so a playlist can't make ffmpeg open other files.
        res = client.post("/transcribe", content=b"#EXTM3U\n#EXTINF:1,\n/etc/passwd\n")
        self.assertEqual((res.status_code, res.json()), (400, {"error": "could not read the audio"}))

    def test_transcribe_rejects_empty_unknown_model_and_garbage(self):
        res = client.post("/transcribe", content=b"")
        self.assertEqual((res.status_code, res.json()), (400, {"error": "empty audio"}))
        res = client.post("/transcribe?model=huge", content=b"x")
        self.assertEqual((res.status_code, res.json()), (400, {"error": "unknown model huge"}))
        res = client.post("/transcribe", content=b"this is not audio")
        self.assertEqual((res.status_code, res.json()), (400, {"error": "could not read the audio"}))

    def test_transcribe_oversized_body_is_413(self):
        res = client.post("/transcribe", content=b"\0" * (audio_core.MAX_TRANSCRIBE_BYTES + 1))
        self.assertEqual(res.status_code, 413)

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_transcribe_rejects_audio_over_five_minutes(self):
        # Longer than the 302 s decode cap: decoding stops at the cap, which is still refused.
        silence = audio_core.run_ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", "310", "-c:a", "libopus", "-b:a", "16k", "-f", "ogg", "pipe:1"])
        res = client.post("/transcribe", content=silence)
        self.assertEqual((res.status_code, res.json()), (400, {"error": "audio longer than 5 minutes"}))


if __name__ == "__main__":
    unittest.main()
