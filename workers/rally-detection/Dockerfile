# Build from this worker directory. The ported research detector runs on CPU;
# it can run on Vast CPU or GPU hosts without requiring a CUDA toolkit.
FROM python:3.10.19-slim-bookworm AS native-builder
RUN apt-get update && apt-get install -y --no-install-recommends cmake g++ libopencv-dev \
    && rm -rf /var/lib/apt/lists/*
COPY native/court-detection /build/court-detection
RUN cmake -S /build/court-detection -B /build/output -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /build/output --parallel 2

FROM python:3.10.19-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HOME=/home/worker \
    OMP_NUM_THREADS=4

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 libgl1 \
    libopencv-core406 libopencv-imgproc406 libopencv-calib3d406 \
    libopencv-videoio406 libopencv-imgcodecs406 libopencv-highgui406 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 worker

WORKDIR /opt/mintonix
COPY --from=native-builder /build/output/mintonix-court-detect /usr/local/bin/
COPY pyproject.toml ./
COPY src ./src
RUN pip install '.[ocr]'

USER worker
WORKDIR /data
ENTRYPOINT ["mintonix-rallies"]
