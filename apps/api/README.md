# @feedglow/api

FeedGlow API Server - Backend for the lightweight AI RSS reader.

## Features

- 🔗 **Miniflux Integration** - Full Miniflux API wrapper
- 🤖 **AI Summarization** - Generate article summaries using OpenAI/Anthropic
- 🌐 **Translation** - Translate articles to any language
- 🏷️ **Auto-tagging** - AI-generated tags for articles
- 🔔 **Webhooks** - Real-time notifications for new entries

## API Endpoints

### Feeds
- `GET /api/feeds` - List all feeds
- `POST /api/feeds` - Subscribe to a new feed
- `GET /api/feeds/:id` - Get feed details
- `PATCH /api/feeds/:id` - Update feed
- `DELETE /api/feeds/:id` - Unsubscribe
- `POST /api/feeds/:id/refresh` - Refresh feed
- `POST /api/feeds/discover` - Discover feeds from URL

### Entries
- `GET /api/entries` - List entries (with filters)
- `GET /api/entries/:id` - Get single entry
- `PUT /api/entries/status` - Batch update status
- `POST /api/entries/:id/read` - Mark as read
- `POST /api/entries/:id/bookmark` - Toggle bookmark
- `POST /api/entries/:id/summarize` - Generate AI summary
- `POST /api/entries/:id/translate` - Translate article
- `POST /api/entries/:id/tags` - Generate tags

### Categories
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `PATCH /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Webhooks
- `POST /api/webhook/miniflux` - Miniflux webhook receiver

## Environment Variables

```env
PORT=3001
MINIFLUX_URL=http://localhost:8080
MINIFLUX_API_KEY=your_api_key
AI_PROVIDER=openai
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
AUTO_SUMMARIZE=false
```

## Development

```bash
pnpm install
pnpm dev
```

## Tech Stack

- **Hono** - Fast web framework
- **Vercel AI SDK** - Multi-provider AI integration
- **Zod** - Schema validation
- **TypeScript** - Type safety
