# FeedGlow iOS App 开发技术方案

> 研究日期: 2026-02-03

## 目录
1. [React Native + Expo 技术栈](#1-react-native--expo-技术栈)
2. [RSS阅读器相关库](#2-rss阅读器相关库)
3. [离线存储方案](#3-离线存储方案)
4. [推送通知实现](#4-推送通知实现)
5. [优秀RSS App UI/UX参考](#5-优秀rss-app-uiux参考)
6. [Web代码共享策略](#6-web代码共享策略)
7. [App Store上架注意事项](#7-app-store上架注意事项)
8. [推荐技术架构](#8-推荐技术架构)

---

## 1. React Native + Expo 技术栈

### 最新版本 (2026年2月)

| 技术 | 版本 | 说明 |
|------|------|------|
| **React Native** | 0.83 | 最新稳定版，React 19.2支持 |
| **Expo SDK** | 54 | React Native 0.81 支持 |
| **React** | 19.2 | 最新版本 |
| **Hermes** | V1 (实验性) | 新版JS引擎，性能提升 |

### 重要特性更新

#### React Native 0.82+ "新时代"
- ✅ **完全基于New Architecture** - 不再支持Legacy Architecture
- ✅ **React 19支持** - Suspense, Transitions, useLayoutEffect 完整支持
- ✅ **DOM Node APIs** - 更接近Web的API
- ✅ **Swift模板** - iOS原生部分使用Swift
- ✅ **Android 16KB页面支持** - 兼容新Android设备

#### Expo SDK 54 特性
- React Native 0.81 支持
- iOS 15.1+ / Android 7+ 最低要求
- Xcode 16.1+ 编译
- EAS Build 缓存加速 30%
- Workflow insights 监控

### 推荐配置

```json
{
  "expo": {
    "sdkVersion": "54.0.0",
    "platforms": ["ios", "android", "web"],
    "ios": {
      "bundleIdentifier": "com.feedglow.app",
      "supportsTablet": true
    }
  }
}
```

---

## 2. RSS阅读器相关库

### RSS解析

| 库名 | 推荐度 | 说明 |
|------|--------|------|
| **rss-parser** | ⭐⭐⭐⭐⭐ | 纯JS实现，支持RSS 2.0/Atom，无原生依赖 |
| **fast-xml-parser** | ⭐⭐⭐⭐ | 快速XML解析，可自定义RSS解析逻辑 |
| **xml2js** | ⭐⭐⭐ | 通用XML解析 |

### 推荐方案: rss-parser

```typescript
import Parser from 'rss-parser';

const parser = new Parser({
  customFields: {
    item: ['media:content', 'content:encoded']
  }
});

async function parseFeed(url: string) {
  const feed = await parser.parseURL(url);
  return {
    title: feed.title,
    items: feed.items.map(item => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      content: item['content:encoded'] || item.content,
      thumbnail: item['media:content']?.$.url
    }))
  };
}
```

### HTML内容渲染

| 库名 | 用途 |
|------|------|
| **react-native-render-html** | 渲染RSS文章HTML内容 |
| **@expo/html-elements** | 基础HTML元素 |
| **react-native-webview** | 完整网页渲染 (阅读原文) |

---

## 3. 离线存储方案

### 方案对比

| 方案 | 性能 | 复杂度 | 推荐场景 |
|------|------|--------|----------|
| **expo-sqlite** | ⭐⭐⭐⭐⭐ | 中 | 结构化数据，复杂查询 |
| **react-native-mmkv** | ⭐⭐⭐⭐⭐ | 低 | 配置、缓存、简单KV |
| **WatermelonDB** | ⭐⭐⭐⭐ | 高 | 大量数据，响应式 |
| **AsyncStorage** | ⭐⭐ | 低 | 简单数据 (不推荐) |

### 推荐组合方案

```
┌─────────────────────────────────────────────────────────────┐
│                    FeedGlow Storage Layer                    │
├─────────────────────────────────────────────────────────────┤
│  react-native-mmkv          │  expo-sqlite                  │
│  ─────────────────────────  │  ─────────────────────────    │
│  • 用户设置/偏好             │  • Feed订阅列表              │
│  • 阅读位置                  │  • 文章内容缓存              │
│  • 主题配置                  │  • 已读状态                  │
│  • 登录Token                │  • 收藏/书签                 │
│  • 缓存元数据               │  • 全文搜索 (FTS5)           │
└─────────────────────────────────────────────────────────────┘
```

### expo-sqlite 配置

```json
{
  "expo": {
    "plugins": [
      [
        "expo-sqlite",
        {
          "enableFTS": true,
          "useSQLCipher": false
        }
      ]
    ]
  }
}
```

### 数据库Schema设计

```sql
-- 订阅源
CREATE TABLE feeds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT UNIQUE NOT NULL,
  siteUrl TEXT,
  iconUrl TEXT,
  category TEXT,
  lastFetchedAt INTEGER,
  createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);

-- 文章
CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  feedId TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT UNIQUE,
  content TEXT,
  summary TEXT,
  author TEXT,
  publishedAt INTEGER,
  isRead INTEGER DEFAULT 0,
  isStarred INTEGER DEFAULT 0,
  readAt INTEGER,
  createdAt INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (feedId) REFERENCES feeds(id)
);

-- 全文搜索
CREATE VIRTUAL TABLE articles_fts USING fts5(
  title, content, summary,
  content='articles',
  content_rowid='rowid'
);
```

### react-native-mmkv 使用

```typescript
import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV({
  id: 'feedglow-storage',
  encryptionKey: 'your-secret-key' // 可选加密
});

// 用户设置
interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  markAsReadOnScroll: boolean;
  defaultView: 'list' | 'card';
}

export const settingsStorage = {
  get: (): UserSettings => {
    const json = storage.getString('settings');
    return json ? JSON.parse(json) : defaultSettings;
  },
  set: (settings: UserSettings) => {
    storage.set('settings', JSON.stringify(settings));
  }
};

// Hooks
import { useMMKVString, useMMKVBoolean } from 'react-native-mmkv';

export function useTheme() {
  const [theme, setTheme] = useMMKVString('theme');
  return [theme || 'system', setTheme] as const;
}
```

---

## 4. 推送通知实现

### 方案选择

| 方案 | 说明 | 推荐 |
|------|------|------|
| **expo-notifications** | Expo官方，简单易用 | ✅ 推荐 |
| **本地通知** | 定时提醒检查更新 | ✅ RSS场景适用 |
| **远程推送** | 服务端触发 | 需要后端支持 |

### 实现策略

对于RSS阅读器，推荐**本地通知 + 后台刷新**组合:

```
┌─────────────────────────────────────────────────────────────┐
│                    通知策略                                  │
├─────────────────────────────────────────────────────────────┤
│  1. Background Fetch (后台刷新)                              │
│     └─ 定期检查订阅源更新                                    │
│                                                             │
│  2. Local Notification (本地通知)                           │
│     └─ 有新文章时发送通知                                    │
│                                                             │
│  3. (可选) Remote Push                                       │
│     └─ 服务端检测更新后推送                                  │
└─────────────────────────────────────────────────────────────┘
```

### 代码实现

```typescript
import * as Notifications from 'expo-notifications';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const BACKGROUND_FETCH_TASK = 'feedglow-background-fetch';

// 1. 定义后台任务
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const newArticles = await checkForNewArticles();
    
    if (newArticles.length > 0) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📰 新文章',
          body: `${newArticles.length} 篇新文章等待阅读`,
          data: { screen: 'unread' }
        },
        trigger: null // 立即发送
      });
    }
    
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

// 2. 注册后台任务
async function registerBackgroundFetch() {
  await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 60 * 30, // 30分钟
    stopOnTerminate: false,
    startOnBoot: true
  });
}

// 3. 设置通知处理
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true
  })
});

// 4. 处理通知点击
function useNotificationObserver() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      response => {
        const screen = response.notification.request.content.data?.screen;
        if (screen) {
          router.push(screen);
        }
      }
    );
    return () => subscription.remove();
  }, []);
}
```

### 配置要求

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#4F46E5"
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["fetch", "remote-notification"]
      }
    }
  }
}
```

---

## 5. 优秀RSS App UI/UX参考

### Reeder (reederapp.com)

**核心理念**: "从未读计数到时间线同步"

| 特性 | 设计亮点 |
|------|----------|
| **统一时间线** | RSS/播客/视频/社交媒体整合 |
| **无未读计数** | 位置同步替代传统计数 |
| **共享Feed** | 标签可转为公开JSON Feed |
| **过滤器** | 按关键词/媒体类型/来源过滤 |
| **iCloud同步** | 仅同步关键数据，秒级推送 |

**设计启示**:
- 🎯 简化 = 去掉焦虑性的未读计数
- 📱 统一 = 一个时间线，多种内容类型
- ☁️ 轻量 = 同步位置，不同步全部内容

### NetNewsWire (netnewswire.com)

**核心理念**: "免费、开源、原生体验"

| 特性 | 设计亮点 |
|------|----------|
| **原生性能** | Swift原生，极速启动 |
| **多账户** | iCloud/Feedbin/Feedly等 |
| **Reader View** | 清爽阅读模式 |
| **快捷键** | 单键导航 |
| **Safari扩展** | 一键订阅 |

**功能清单**:
- ✅ OPML导入/导出
- ✅ 智能文件夹 (全部未读/今日)
- ✅ 自定义主题
- ✅ 后台刷新
- ✅ 搜索
- ✅ 收藏
- ✅ 暗色模式

### Unread

**核心理念**: "阅读优先的极简设计"

| 特性 | 设计亮点 |
|------|----------|
| **Typography** | 大字号，舒适阅读 |
| **手势导航** | 滑动切换文章 |
| **全屏阅读** | 无干扰模式 |
| **配色** | 温暖的背景色 |

### UI设计建议总结

```
┌─────────────────────────────────────────────────────────────┐
│                    FeedGlow UI 设计原则                      │
├─────────────────────────────────────────────────────────────┤
│  1. 阅读优先                                                │
│     • 大字号、舒适行高                                       │
│     • 清晰的层级 (标题 > 来源 > 时间)                        │
│     • 足够的留白                                            │
│                                                             │
│  2. 减少焦虑                                                │
│     • 可选的未读计数 (或用位置同步替代)                       │
│     • 批量标记已读                                          │
│     • 无打断的阅读流程                                       │
│                                                             │
│  3. 手势友好                                                │
│     • 滑动切换文章                                          │
│     • 长按预览                                              │
│     • 下拉刷新                                              │
│                                                             │
│  4. 个性化                                                  │
│     • 主题选择 (亮/暗/跟随系统)                              │
│     • 字号调节                                              │
│     • 视图模式 (列表/卡片/杂志)                              │
└─────────────────────────────────────────────────────────────┘
```

### 推荐UI组件库

| 库名 | 用途 |
|------|------|
| **Tamagui** | 跨平台UI组件 (已在Web使用) |
| **React Native Reanimated** | 流畅动画 |
| **React Native Gesture Handler** | 手势处理 |
| **expo-haptics** | 触觉反馈 |

---

## 6. Web代码共享策略

### Expo Web 原生支持

Expo已内置React Native Web支持，配置简单:

```bash
# 安装web依赖
npx expo install react-dom react-native-web @expo/metro-runtime

# 启动web开发
npx expo start --web

# 导出静态网站
npx expo export --platform web
```

### 共享层级

```
┌─────────────────────────────────────────────────────────────┐
│                    代码共享架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌───────────────────────────────────────────────────┐    │
│   │              Shared (100% 共享)                    │    │
│   │  • Types / Interfaces                             │    │
│   │  • API clients                                    │    │
│   │  • RSS parsing logic                              │    │
│   │  • Business logic / hooks                         │    │
│   │  • State management (Zustand)                     │    │
│   │  • Validation (Zod)                               │    │
│   └───────────────────────────────────────────────────┘    │
│                          ▲                                  │
│                          │                                  │
│   ┌───────────────────────────────────────────────────┐    │
│   │              Components (80-90% 共享)              │    │
│   │  • Tamagui components                             │    │
│   │  • Layout components                              │    │
│   │  • Article renderer                               │    │
│   └───────────────────────────────────────────────────┘    │
│                          ▲                                  │
│          ┌───────────────┴───────────────┐                 │
│          ▼                               ▼                  │
│   ┌─────────────────┐           ┌─────────────────┐        │
│   │    Web Only     │           │   Native Only   │        │
│   │  • Next.js API  │           │  • expo-sqlite  │        │
│   │  • SEO/Meta     │           │  • Notifications│        │
│   │  • SSR/SSG      │           │  • Background   │        │
│   │  • Web storage  │           │  • Haptics      │        │
│   └─────────────────┘           └─────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 平台特定模块

使用文件命名约定处理平台差异:

```
src/
├── storage/
│   ├── index.ts          # 统一导出
│   ├── storage.ts         # 共享接口
│   ├── storage.native.ts  # Native实现 (SQLite + MMKV)
│   └── storage.web.ts     # Web实现 (IndexedDB)
├── notifications/
│   ├── index.ts
│   ├── notifications.native.ts  # expo-notifications
│   └── notifications.web.ts     # Web Notifications API
```

### 共享组件示例

```typescript
// components/ArticleCard.tsx - 100% 共享
import { Card, H4, Paragraph, XStack, YStack } from 'tamagui';
import { formatDistanceToNow } from 'date-fns';

interface ArticleCardProps {
  title: string;
  summary: string;
  source: string;
  publishedAt: Date;
  isRead: boolean;
  onPress: () => void;
}

export function ArticleCard({
  title, summary, source, publishedAt, isRead, onPress
}: ArticleCardProps) {
  return (
    <Card
      pressable
      onPress={onPress}
      opacity={isRead ? 0.6 : 1}
      padding="$4"
      marginVertical="$2"
    >
      <YStack gap="$2">
        <XStack justifyContent="space-between">
          <Paragraph size="$2" color="$gray10">{source}</Paragraph>
          <Paragraph size="$2" color="$gray9">
            {formatDistanceToNow(publishedAt, { addSuffix: true })}
          </Paragraph>
        </XStack>
        <H4 numberOfLines={2}>{title}</H4>
        <Paragraph numberOfLines={3} color="$gray11">
          {summary}
        </Paragraph>
      </YStack>
    </Card>
  );
}
```

### 共享Hooks示例

```typescript
// hooks/useFeeds.ts - 100% 共享
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storage } from '../storage'; // 平台特定实现

export function useFeeds() {
  return useQuery({
    queryKey: ['feeds'],
    queryFn: () => storage.getFeeds()
  });
}

export function useAddFeed() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (url: string) => {
      const feed = await parseFeed(url);
      await storage.addFeed(feed);
      return feed;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feeds'] });
    }
  });
}
```

### 推荐项目结构

```
feedglow/
├── apps/
│   ├── web/                 # Next.js Web应用 (现有)
│   │   ├── app/
│   │   └── package.json
│   └── mobile/              # Expo移动应用 (新建)
│       ├── app/             # Expo Router
│       ├── app.json
│       └── package.json
├── packages/
│   ├── shared/              # 共享代码
│   │   ├── types/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── api/
│   └── ui/                  # 共享UI组件
│       ├── components/
│       └── theme/
├── package.json             # Monorepo根配置
└── turbo.json              # Turborepo配置
```

---

## 7. App Store上架注意事项

### 审核关键要求

#### 基础要求
- ✅ **iOS 15.1+** 最低支持版本
- ✅ **Xcode 16.1+** 编译
- ✅ **完整功能测试** - 无崩溃、无Bug
- ✅ **准确的元数据** - 描述、截图、预览视频
- ✅ **隐私政策** - 必须提供链接
- ✅ **联系方式** - 可供App Review联系

#### RSS阅读器特定要求

1. **内容过滤**
   - 如果显示外部内容，需要有内容过滤机制
   - 考虑添加举报功能

2. **后台刷新声明**
   - 在app.json中正确声明 `UIBackgroundModes`
   - 说明后台活动用途

3. **推送通知说明**
   - 在审核备注中说明通知用途
   - 仅用于新文章提醒

4. **数据收集声明**
   - 在App Store Connect填写隐私标签
   - 声明是否收集/追踪用户数据

### App隐私声明

RSS阅读器通常需要声明:

| 数据类型 | 是否收集 | 用途 |
|----------|----------|------|
| 使用数据 | 是 | 分析 (可选) |
| 诊断数据 | 是 | 崩溃报告 |
| 标识符 | 否 | - |
| 位置 | 否 | - |
| 联系人 | 否 | - |

### 必要功能清单

```
┌─────────────────────────────────────────────────────────────┐
│                    App Store 必要功能                        │
├─────────────────────────────────────────────────────────────┤
│  ✅ 核心功能完整 (添加Feed、阅读文章、管理订阅)              │
│  ✅ 离线访问 (缓存文章内容)                                  │
│  ✅ 深色模式支持                                            │
│  ✅ Dynamic Type (系统字号)                                 │
│  ✅ VoiceOver 无障碍支持                                    │
│  ✅ iPad适配 (如声明支持)                                   │
│  ✅ 引导/教程 (首次使用)                                    │
│  ✅ 设置页面                                                │
│  ✅ 隐私政策链接                                            │
│  ✅ 使用条款链接                                            │
└─────────────────────────────────────────────────────────────┘
```

### 常见拒绝原因及规避

| 拒绝原因 | 解决方案 |
|----------|----------|
| 4.2 最低功能 | 确保核心阅读体验完整 |
| 2.1 崩溃 | 充分测试，使用Sentry监控 |
| 5.1.1 隐私 | 清晰的隐私政策 |
| 4.0 设计 | 遵循iOS设计规范 |
| 3.1.1 内购 | 如有付费功能必须用IAP |

### 审核技巧

1. **详细的审核备注**
   ```
   This is an RSS reader app. Users can:
   1. Add RSS/Atom feeds by URL
   2. Read articles offline
   3. Organize feeds into folders
   
   Background fetch is used to check for new articles.
   Push notifications are local only, triggered when new articles are found.
   
   No login required. No user data collected.
   ```

2. **提供测试Feed**
   - 在备注中提供几个测试用的RSS链接

3. **截图要求**
   - 6.5" iPhone (必须)
   - 5.5" iPhone (推荐)
   - iPad Pro 12.9" (如支持iPad)

---

## 8. 推荐技术架构

### 完整技术栈

```
┌─────────────────────────────────────────────────────────────┐
│                    FeedGlow Mobile 技术栈                    │
├─────────────────────────────────────────────────────────────┤
│  Framework     │  Expo SDK 54 + React Native 0.81           │
│  UI            │  Tamagui (与Web共享)                       │
│  Navigation    │  Expo Router                               │
│  State         │  Zustand + React Query                     │
│  Storage       │  expo-sqlite + react-native-mmkv           │
│  RSS Parser    │  rss-parser                                │
│  Notifications │  expo-notifications                        │
│  Background    │  expo-background-task (新版)               │
│  Analytics     │  (可选) Posthog / Amplitude                │
│  Crash Report  │  Sentry                                    │
└─────────────────────────────────────────────────────────────┘
```

### 项目初始化

```bash
# 创建Expo项目
npx create-expo-app feedglow-mobile -t tabs

# 安装核心依赖
cd feedglow-mobile
npx expo install expo-sqlite react-native-mmkv react-native-nitro-modules
npx expo install expo-notifications expo-background-fetch expo-task-manager
npx expo install rss-parser react-native-render-html
npx expo install @tanstack/react-query zustand

# Web支持 (Expo Router已内置)
npx expo install react-dom react-native-web @expo/metro-runtime

# UI库 (与Web共享)
npx expo install tamagui @tamagui/config
```

### 开发路线图

```
Phase 1: 基础功能 (2-3周)
├── Feed订阅管理
├── 文章列表/详情
├── 本地存储 (SQLite)
└── 基础UI

Phase 2: 离线 & 同步 (1-2周)
├── 文章内容缓存
├── 后台刷新
├── 本地通知
└── 已读状态同步

Phase 3: 优化 & 发布 (1-2周)
├── 性能优化
├── 无障碍支持
├── App Store准备
└── 测试 & 提交

Phase 4: Web共享 (可选)
├── 提取共享代码到packages/
├── Monorepo配置
└── 统一组件库
```

---

## 附录: UI参考图集

### 推荐参考App下载

1. **Reeder** - App Store (付费)
2. **NetNewsWire** - App Store (免费/开源)
3. **Feedly** - App Store (免费)
4. **Inoreader** - App Store (免费)
5. **Unread** - App Store (付费)

### 设计资源

- [Apple Human Interface Guidelines - iOS](https://developer.apple.com/design/human-interface-guidelines/ios)
- [Tamagui Components](https://tamagui.dev/docs/components/intro)
- [Expo Router Navigation Patterns](https://docs.expo.dev/router/basics/core-concepts)

---

*文档版本: 1.0 | 更新日期: 2026-02-03*
