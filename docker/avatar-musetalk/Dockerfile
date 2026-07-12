FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime

ARG MUSETALK_REV=0a89dec45a0192b824e3cf4daf96c239440c5ed8
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git libgl1 libglib2.0-0 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/TMElyralab/MuseTalk.git musetalk \
  && cd musetalk \
  && git checkout "$MUSETALK_REV" \
  && pip install --no-cache-dir -r requirements.txt \
  && pip install --no-cache-dir openmim \
  && mim install mmengine \
  && mim install "mmcv==2.0.1" \
  && mim install "mmdet==3.1.0" \
  && mim install "mmpose==1.1.0"

COPY worker.py /app/worker.py
RUN useradd --create-home --uid 10001 avatar \
  && mkdir -p /work/input /work/output /catalog \
  && chown -R avatar:avatar /app /work

USER avatar
ENV MUSETALK_HOME=/opt/musetalk
ENTRYPOINT ["python", "/app/worker.py"]
