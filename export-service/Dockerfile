FROM python:3.12-slim

# matplotlib + fpdf2 need Liberation fonts to render text
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Mirror the project layout so app.py's relative path
#   os.path.dirname(__file__) + '../scripts/pdf'
# resolves to /app/scripts/pdf without modification.
WORKDIR /app

# Install Python deps first (better Docker layer caching)
COPY export-service/requirements.txt ./export-service/requirements.txt
RUN pip install --no-cache-dir -r export-service/requirements.txt

# Copy the Flask app and the Python generators it imports
COPY export-service/app.py ./export-service/app.py
COPY scripts/pdf ./scripts/pdf

WORKDIR /app/export-service

ENV PORT=8000
EXPOSE 8000

# 2 workers, 120s timeout (PDF generation can take ~30s for full-story)
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:$PORT --workers 2 --timeout 120"]
