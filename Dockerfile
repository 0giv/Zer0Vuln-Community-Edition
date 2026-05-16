# --- Stage 1: Build the React Frontend ---
FROM node:20-slim AS frontend-builder
WORKDIR /build

# Copy frontend source
COPY frontend/package*.json ./
RUN npm install --silent
COPY frontend/ ./

# Build the frontend (creates 'dist' folder)
RUN npm run build

# --- Stage 2: Final Production Container ---
FROM python:3.10-slim
WORKDIR /app

# Install system dependencies (needed for MySQL, PostgreSQL, and LDAP)
RUN apt-get update && apt-get install -y \
    default-libmysqlclient-dev \
    libpq-dev \
    libldap2-dev \
    libsasl2-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY ./requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source
COPY . /app

# Copy the built frontend from the previous stage
# Note: Since app.py now expects ./frontend/dist
RUN mkdir -p /app/frontend/dist
COPY --from=frontend-builder /build/dist /app/frontend/dist

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV VITE_API_BASE_URL=""
ENV CORS_ORIGINS="*"

# Expose Sanic port
EXPOSE 8000

# Start command
# Default to running the main app (API + UI)
CMD ["python", "app.py"]
