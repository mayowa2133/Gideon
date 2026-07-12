FROM pytorch/pytorch:2.2.2-cuda12.1-cudnn8-runtime

ARG SADTALKER_REV=cd4c0465ae0b54a6f85af57f5c65fec9fe23e7f8
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg git libgl1 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
COPY constraints.txt /app/constraints.txt
RUN git clone https://github.com/OpenTalker/SadTalker.git sadtalker \
  && cd sadtalker \
  && git checkout "$SADTALKER_REV" \
  && pip install --no-cache-dir -c /app/constraints.txt -r requirements.txt \
  && sed -i 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' \
    /opt/conda/lib/python*/site-packages/basicsr/data/degradations.py

COPY worker.py /app/worker.py
RUN useradd --create-home --uid 10001 avatar \
  && mkdir -p /work/input /work/output /catalog \
  && chown -R avatar:avatar /app /work

USER avatar
ENV SADTALKER_HOME=/opt/sadtalker
ENTRYPOINT ["python", "/app/worker.py"]
