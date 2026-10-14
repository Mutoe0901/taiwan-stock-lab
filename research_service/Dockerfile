FROM node:22-bookworm-slim AS node
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY research_service/requirements.txt /app/research_service/requirements.txt
RUN pip install --no-cache-dir -r research_service/requirements.txt
COPY research_service /app/research_service
COPY web/ab-strategies.js /app/web/ab-strategies.js
RUN useradd --create-home --uid 10001 stocklab && mkdir -p /data && chown stocklab:stocklab /data
USER stocklab
ENV RESEARCH_DB=/data/research.sqlite3
EXPOSE 8000
CMD ["uvicorn", "research_service.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
