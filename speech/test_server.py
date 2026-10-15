"""HTTP tests for the sidecar. They need FastAPI, httpx, Piper and the voice files, so they run in the
Docker build (`RUN python -m pytest -q`) and are skipped elsewhere, e.g. under `python3 -m unittest`
on a machine without those packages.
"""
import importlib.util
import os
import tempfile
import unittest
import wave

HAVE_DEPS = all(importlib.util.find_spec(m) is not None for m in ("fastapi", "httpx", "piper"))
VOICE_DIR = os.environ.get("VOICE_DIR", "/voices")
HAVE_VOICES = os.path.exists(os.path.join(VOICE_DIR, "de_DE-thorsten-high.onnx"))

if HAVE_DEPS:
    from fastapi.testclient import TestClient

    import audio_core
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

    @unittest.skipUnless(HAVE_VOICES, f"no voice files in {VOICE_DIR}")
    def test_mixed_rate_voices_keep_their_duration(self):
        # S16: thorsten-high is 22.05 kHz and kerstin-low 16 kHz; joined, the length must be the sum.
        a = {"text": "Hallo, hier ist Thomas.", "voice": "thorsten"}
        b = {"text": "Guten Tag, wie geht es Ihnen?", "voice": "kerstin"}
        alone = [ogg_seconds(client.post("/render", json={"segments": [s], "pauseMs": 0}).content) for s in (a, b)]
        both = ogg_seconds(client.post("/render", json={"segments": [a, b], "pauseMs": 500}).content)
        expected = sum(alone) + 0.5
        self.assertAlmostEqual(both, expected, delta=expected * 0.1)


if __name__ == "__main__":
    unittest.main()
