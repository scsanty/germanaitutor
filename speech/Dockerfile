FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
ENV VOICE_DIR=/voices
# Download each voice in voices.txt (<name> <path>): <path>.onnx and <path>.onnx.json.
COPY voices.txt .
RUN mkdir -p /voices && sed 's/#.*//' voices.txt | while read -r name path; do \
      [ -n "$path" ] || continue; \
      n=$(basename "$path"); \
      curl -fsSL -o "/voices/$n.onnx" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$path.onnx" || exit 1; \
      curl -fsSL -o "/voices/$n.onnx.json" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$path.onnx.json" || exit 1; \
    done
COPY audio_core.py server.py test_core.py test_server.py ./
# Runs the stdlib tests and the HTTP tests (with the real voices); the build fails if any fail.
# SPEECH_REQUIRE_FULL_TESTS turns test_server.py's "missing package / voice" skips into failures.
RUN SPEECH_REQUIRE_FULL_TESTS=1 python -m pytest -q -rs test_core.py test_server.py
EXPOSE 5002
HEALTHCHECK --interval=60s --timeout=5s --start-period=20s CMD curl -fs http://localhost:5002/health || exit 1
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5002"]
