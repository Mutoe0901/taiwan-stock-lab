FROM node:22-bookworm-slim AS node
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY research_service/requirements.txt /app/research_service/requirements.txt
RUN pip install --no-cache-dir -r research_service/requirements.txt
ARG DSA_REVISION=aa7228986f0ac8fc78e9147be81dddb277ef342d
RUN git init /opt/daily-stock-analysis && cd /opt/daily-stock-analysis && git remote add origin https://github.com/ZhuLinsen/daily_stock_analysis.git && git fetch --depth 1 origin "$DSA_REVISION" && git checkout --detach FETCH_HEAD
COPY research_service/daily-requirements.txt /tmp/daily-requirements.txt
RUN python -m venv /opt/dsa-venv && /opt/dsa-venv/bin/pip install --no-cache-dir -r /tmp/daily-requirements.txt
RUN cd /opt/daily-stock-analysis && LITELLM_LOCAL_MODEL_COST_MAP=True /opt/dsa-venv/bin/python -c 'from src.analyzer import GeminiAnalyzer'
COPY research_service /app/research_service
COPY web/ab-strategies.js /app/web/ab-strategies.js
RUN useradd --create-home --uid 10001 stocklab && mkdir -p /data && chown stocklab:stocklab /data
USER stocklab
ENV RESEARCH_DB=/data/research.sqlite3
EXPOSE 8000
CMD ["uvicorn", "research_service.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
