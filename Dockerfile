FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY packages/api ./packages/api
COPY apps/web ./apps/web

RUN groupadd --system app && useradd --system --gid app --home-dir /app app

USER app

EXPOSE 3001

CMD ["python", "packages/api/serve.py"]
