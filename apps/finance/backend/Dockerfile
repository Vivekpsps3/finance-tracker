FROM python:3.12-slim

WORKDIR /app

RUN mkdir -p /data

COPY requirements-prod.txt .
RUN pip install --no-cache-dir --no-compile -r requirements-prod.txt

COPY . .

ENV DATABASE_URL=sqlite:////data/finance.db
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
