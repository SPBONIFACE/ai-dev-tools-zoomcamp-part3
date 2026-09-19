FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Enable bytecode compilation
ENV UV_COMPILE_BYTECODE=1

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies into project virtual environment
RUN uv sync --frozen

# Copy project files
COPY . .

# Expose default API port
EXPOSE 8000

# Run uvicorn listening on 0.0.0.0 so published ports work
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
