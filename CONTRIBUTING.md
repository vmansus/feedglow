# FeedGlow 开发规范与协作流程

## 📋 目录
- [Git工作流](#git工作流)
- [代码规范](#代码规范)
- [CI/CD流程](#cicd流程)
- [协作方式](#协作方式)
- [测试规范](#测试规范)
- [发布流程](#发布流程)

---

## 🌳 Git工作流

### 分支策略 (GitHub Flow 简化版)

```
main (生产分支)
  │
  ├── develop (开发分支，日常集成)
  │     │
  │     ├── feat/web-ui          # Eve: Web前端
  │     ├── feat/api-miniflux    # Chad: 后端API
  │     ├── feat/ai-summary      # Chad: AI处理
  │     └── feat/ios-app         # 共同: iOS
  │
  └── hotfix/xxx (紧急修复)
```

### 分支命名规范

| 类型 | 格式 | 示例 |
|------|------|------|
| 功能 | `feat/<模块>-<描述>` | `feat/web-feed-list` |
| 修复 | `fix/<issue-id>-<描述>` | `fix/123-feed-sync` |
| 重构 | `refactor/<描述>` | `refactor/api-client` |
| 文档 | `docs/<描述>` | `docs/api-spec` |
| 热修复 | `hotfix/<描述>` | `hotfix/login-crash` |

### Commit 规范 (Conventional Commits)

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新功能
- `fix`: 修复bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试
- `chore`: 构建/工具/依赖

**Scope:** `web`, `api`, `ios`, `shared`, `docker`, `ci`

**示例:**
```
feat(web): add feed list component with infinite scroll

- Implement virtual list for performance
- Add pull-to-refresh on mobile
- Support dark mode

Closes #12
```

### PR 规范

1. **标题**: 遵循commit规范
2. **描述**: 使用模板
3. **Review**: 至少1个approve
4. **CI**: 必须通过
5. **合并**: Squash and merge

**PR模板:**
```markdown
## 概述
简要描述这个PR做了什么

## 改动类型
- [ ] 新功能
- [ ] Bug修复
- [ ] 重构
- [ ] 文档

## 测试
- [ ] 单元测试通过
- [ ] 本地测试通过
- [ ] 截图/录屏（如有UI变更）

## 相关Issue
Closes #xxx
```

---

## 📝 代码规范

### TypeScript 配置

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### ESLint + Prettier

```json
// .eslintrc.json
{
  "extends": [
    "next/core-web-vitals",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `feed-list.tsx` |
| 组件 | PascalCase | `FeedList` |
| 函数 | camelCase | `fetchFeeds()` |
| 常量 | UPPER_SNAKE | `API_BASE_URL` |
| 类型/接口 | PascalCase | `FeedItem` |
| Hook | use前缀 | `useFeedList()` |

### 目录结构规范

```
apps/web/src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # 认证相关路由组
│   ├── (main)/            # 主应用路由组
│   ├── api/               # API Routes
│   └── layout.tsx
├── components/
│   ├── ui/                # 基础UI组件 (shadcn)
│   ├── feed/              # Feed相关组件
│   ├── article/           # 文章相关组件
│   └── layout/            # 布局组件
├── hooks/                 # 自定义hooks
├── lib/                   # 工具库
│   ├── api/              # API客户端
│   ├── utils/            # 工具函数
│   └── validators/       # 校验器
├── stores/               # Zustand stores
├── types/                # 类型定义
└── styles/               # 全局样式
```

---

## 🔄 CI/CD 流程

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build:
    runs-on: ubuntu-latest
    needs: [lint, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build

  docker:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:latest
```

### 部署流程

```
PR → CI检查 → Review → Merge to develop
                           ↓
                    自动部署到staging
                           ↓
                    手动测试验证
                           ↓
                    Merge to main
                           ↓
                    自动构建Docker镜像
                           ↓
                    推送到GHCR
                           ↓
                    (可选) 自动部署到生产
```

---

## 🤝 协作方式

### Eve & Chad 协作协议

#### 通信渠道
1. **Notion Bot交流中心** - 主要协作平台
   - 任务分配
   - 进度更新
   - 技术讨论
   - 问题求助

2. **GitHub** - 代码协作
   - PR Review
   - Issue讨论
   - Code Review

#### 消息格式
```
[时间 UTC] 发送者 → 接收者: 消息内容

示例:
[2026-02-03 08:00 UTC] Eve → Chad: API接口定义已完成，请review
```

#### 任务状态标记
- 🆕 新任务
- 🔄 进行中
- 👀 等待Review
- ✅ 已完成
- ⏸️ 暂停
- ❌ 取消

#### 每日同步 (异步)
每天至少在Notion更新一次状态:
```
## [日期] Eve 状态更新
- ✅ 完成: xxx
- 🔄 进行中: xxx
- 🚧 遇到问题: xxx
- 📋 明日计划: xxx
```

#### 代码边界
| 目录 | 负责人 | 说明 |
|------|--------|------|
| `apps/web/` | Eve | Web前端 |
| `apps/api/` | Chad | 后端API |
| `apps/mobile/` | 共同 | iOS App |
| `packages/shared/` | 共同 | 先讨论再改 |
| `packages/ui/` | Eve | UI组件 |
| `docker/` | Chad | 部署配置 |

#### API契约
1. Chad先定义API Schema (OpenAPI/TypeSpec)
2. Eve Review确认
3. 各自开发
4. 联调测试

```typescript
// packages/shared/types/api.ts
// 共同维护的API类型定义

export interface Feed {
  id: string;
  title: string;
  url: string;
  // ...
}

export interface GetFeedsResponse {
  feeds: Feed[];
  total: number;
}
```

#### 冲突解决
1. 小问题: Notion讨论解决
2. 大问题: @主人(Knobsil)仲裁

---

## 🧪 测试规范

### 测试类型

| 类型 | 覆盖率目标 | 工具 |
|------|-----------|------|
| 单元测试 | >70% | Vitest |
| 组件测试 | 关键组件 | Testing Library |
| E2E测试 | 核心流程 | Playwright |
| API测试 | 所有端点 | Vitest + supertest |

### 文件命名
```
component.tsx        # 组件
component.test.tsx   # 单元测试
component.e2e.ts     # E2E测试
```

### 测试命令
```bash
pnpm test           # 运行所有测试
pnpm test:watch     # 监听模式
pnpm test:coverage  # 覆盖率报告
pnpm test:e2e       # E2E测试
```

---

## 🚀 发布流程

### 版本号规范 (SemVer)
```
MAJOR.MINOR.PATCH
  │     │     │
  │     │     └── 向后兼容的Bug修复
  │     └──────── 向后兼容的新功能
  └────────────── 不兼容的API变更
```

### 发布步骤
1. 确保develop分支CI通过
2. 创建Release PR: develop → main
3. 更新CHANGELOG.md
4. 更新版本号
5. Merge后自动构建Docker镜像
6. 创建GitHub Release
7. 发布公告

### Changelog格式
```markdown
## [1.0.0] - 2026-02-10

### Added
- 新功能1
- 新功能2

### Changed
- 变更1

### Fixed
- 修复1
```

---

## 📁 关键文件清单

```
feedglow/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   └── release.yml
│   └── PULL_REQUEST_TEMPLATE.md
├── .husky/
│   ├── pre-commit          # lint-staged
│   └── commit-msg          # commitlint
├── .vscode/
│   └── settings.json       # 团队VSCode配置
├── packages/
│   └── shared/
│       └── types/
│           └── api.ts      # API契约类型
├── .eslintrc.json
├── .prettierrc
├── tsconfig.json
├── CONTRIBUTING.md         # 本文档
├── CHANGELOG.md
└── README.md
```

---

*文档版本: 1.0*
*创建时间: 2026-02-03*
*维护者: Eve & Chad*
