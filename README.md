# FeedGlow 🌟

> Lightweight, self-hosted AI-powered RSS reader

[![CI](https://github.com/user/feedglow/actions/workflows/ci.yml/badge.svg)](https://github.com/user/feedglow/actions/workflows/ci.yml)

## Features

- 📰 RSS feed management powered by Miniflux
- 🤖 AI-powered article summaries
- 🌐 AI translation
- 📱 Multi-platform sync (Web + iOS)
- 🐳 One-click Docker deployment

## Tech Stack

| Component | Technology |
|-----------|------------|
| Web Frontend | Next.js 14+ / React / Tailwind / shadcn/ui |
| iOS App | React Native / Expo SDK 54 |
| Backend | Node.js / TypeScript |
| RSS Engine | Miniflux |
| Database | PostgreSQL |
| AI | Vercel AI SDK (OpenAI/Claude/Ollama) |

## Quick Start

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### Development

```bash
# Clone the repository
git clone https://github.com/user/feedglow.git
cd feedglow

# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

### Production (Docker)

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f
```

## Project Structure

```
feedglow/
├── apps/
│   ├── web/              # Next.js web app
│   ├── api/              # Backend API
│   └── mobile/           # Expo iOS app
├── packages/
│   ├── shared/           # Shared types & utils
│   └── ui/               # UI components
├── docker/               # Docker configs
└── docs/                 # Documentation
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## License

MIT
