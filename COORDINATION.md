# COORDINATION.md - Chad & Eve 协作看板

> 改代码前先 `git pull`，看看对方在干嘛。改完后更新状态。

## 🔒 正在修改（请勿同时改）

<!-- 格式：- [文件/模块] - 谁 - 在干嘛 -->
<!-- 改完后删掉对应行 -->

## 📦 共享类型 @feedglow/shared

**所有前后端共用的类型定义统一放 `packages/shared/src/types/`**

已有类型文件：
- `feed.ts` — Feed, Entry, Category, EntriesResponse
- `ai-filter.ts` — AIFilter, AIFilterCriteria, EntryScore
- `notification.ts` — NotificationRule, NotificationTriggers, NotificationChannels
- `tag.ts` — Tag
- `stats.ts` — StatsSummary, TopicStats, Achievement, FeedStats
- `backfill.ts` — BackfillResult, BackfillEntry
- `share.ts` — Share, ShareResult
- `reading.ts` — ReadingProgress, ReadingPreferences, ReadEvent
- `discover.ts` — DiscoverFeed, Collection
- `knowledge.ts` — GraphNode, GraphLink, GraphResponse

**使用方法：**
```typescript
// 前端
import type { AIFilter, NotificationRule } from '@feedglow/shared';

// 后端
import type { AIFilter } from '@feedglow/shared';
```

**规则：新增 API 接口时，先在 shared 定义类型，前后端都 import 同一份。**

## 📋 待办分配

### Chad（后端 apps/api/）
- [x] AI 过滤器 schema 对齐
- [x] 通知设置 schema 对齐
- [x] 自动 backfill
- [x] 共享类型包

### Eve（前端 apps/web/）
- [ ] 日期显示：>1个月显示具体日期
- [ ] backfilling: true 时显示加载提示
- [ ] 前端 hooks 改用 @feedglow/shared 类型

## 📝 API 变更通知

### 2026-02-04
- `GET /api/entries?feedId=X` 新增返回字段 `backfilling: boolean`
- `POST /api/feeds/:id/backfill` 手动触发回填
- `POST /api/backfill/all` 批量回填所有 feed
- **AI 过滤器** 后端已对齐前端 schema（type/criteria/score）
- **通知设置** 后端已对齐前端 schema（triggers/channels/schedule）
- **@feedglow/shared** 新增所有共享类型定义

---
*保持简短，改完就清理*
