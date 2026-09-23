# bird_web — Birding Checklist 网站

把 Notion 里的观鸟记录变成一个静态网站。Notion 是 single source of truth，
网站 build 时抓取数据，运行时不依赖 Notion。

## 数据源（Notion MCP）

Notion 页面 "Birding Checklist (⊙△⊙)"，三个 data source：

| 名称 | collection URL | 内容 |
|---|---|---|
| Birds | `collection://22818733-8e82-812f-a716-000ba4f39903` | 281 条（238 spotted） |
| Our photos | `collection://22818733-8e82-80e4-b683-000b7f34eebc` | 237 条 |
| My birding Locations | `collection://22818733-8e82-8149-bfcc-000bd53f17d6` | 37 条 |

### ⚠️ 查询必须用 view mode，不要用 SQL

`notion-query-data-sources` 的 **sql mode 在这个 workspace 已经被配额锁死**
（"Your workspace has reached the usage limit for Query Data Source"，需要
Business plan）。2026-09-18 用掉了仅有的额度，之后连最简单的 SQL 都报错，
且没有恢复。跨库 JOIN 更是从一开始就不允许。

**用 view mode**，所有 plan 都免费无限：

| 库 | view URL | page_size 上限 |
|---|---|---|
| Birds | `view://23418733-8e82-8065-ad31-000cbca84dcf`（Data Entry，全字段无筛选） | **25** |
| Photos | `view://22818733-8e82-80d5-8ca5-000cba4cf178`（Table） | 25 |
| Locations | `view://22818733-8e82-81d1-9523-000ce7014c27` | **10** |

超过这个 page_size 会触发 tool result 体积上限报错。

### 关键数据事实

- 238 spotted / 43 未拍到 / 10 favorite
- `Type` 实际单值，9 类用到：Perching 109、Water 59、Wading & Shorebirds 28、
  Raptors 13、Tree-Climbers 9、Landfowls 6、Doves & Pigeons 6、
  Swifts & Hummingbirds 5、Specialists 3
- `Tags` Notion schema 里定义了 63 个选项，但**实际只用到 43 个**（spotted 里 40 个）。
  建 chip 词表要从数据里数，不要用 schema 的选项数 → **只做筛选，不进导航**
- 238 只全部有 `First spotted`，范围 2024-09-07 → 2026-08-08
- 110 只鸟出现在 2 个以上地点，最多一只 13 个
- 37 个地点分两层：Triangle 本地 **18** 个 + 旅行 19 个
- `Hide` checkbox = 不发布（目前实际 0 条被隐藏）
- 上面 9 类的数字是**只算 spotted** 的。若不筛选，Perching 110 / Water 60
  ——有 2 只未 spotted 的鸟也填了 Type

### Notion 里的数据小问题（未修改，你自己决定要不要动）

- **4 组重复卡片**：Greater Yellowlegs、Brown Creeper、Swainson's Thrush、
  Pied-billed Grebe 各有一张 spotted 和一张未 spotted 的重复条目
- **Fish Crow（鱼鸦）** spotted 但没有照片，唯一一只
- **Northern Rough-winged Swallow** 标了未 spotted，却有日期、Type 和地点

### ⚠️ 图片会过期

照片不是 file property，是**页面正文里的 image block**，S3 签名 URL
`X-Amz-Expires=300`（**5 分钟**）。必须抓到就立刻下载，不能存 URL。

几个实战教训：

- 签名**每次 fetch 都轮换**（`X-Amz-Credential` 变，同页不同图 `X-Amz-Date`
  甚至差 1 秒），所以每个 URL 必须配自己的签名，不能共用
- 一个页面最多有 13 张图，串行下载大图会撞上 5 分钟窗口——**同页内并行下载**
- 下载中途的文件看起来像损坏（1.3KB），**别急着判定失败**，等它下完再验
- 多 agent 并行时**每个 agent 必须用独立的 scratch 子目录**，否则
  helper 脚本会互相覆盖（这次就被坑了一次）

## 设计：一群会变队形的鸟

238 只鸟是一个鸟群，换视角 = 鸟群重新排队形。**不要 nav bar。**

| 视图 | 队形 | 数据来源 |
|---|---|---|
| Home | 盘旋的鸟群 | favorites |
| 在哪儿 | 落地 → 两级卡通地图 | Locations |
| 什么时候 | 排成一条线 → 时间轴 | First spotted |
| 哪一类 | 抱团 → 泡泡 | Type |
| 全部 | 排整齐 → masonry | 全部 |

导航是左下角一个小罗盘（4 个小图标）+ 键盘 `M`/`T`/`G`/`L`，`Esc` 后退。

### 时间轴（第一个做）

- 横向滚动，2024-09 → 2026-08
- 一根轴，每只鸟一个点，位置 = First spotted；hover 放大成缩略图
- 点的颜色 = Type（9 类）
- 背景按季节铺色带：春绿 / 夏暖 / 秋琥珀 / 冬灰蓝
- **一条累计曲线从 0 爬到 238**
- 旅行自动成密集簇，点簇 → "Seattle · 50 species"
- 点单个点 → 鸟的浮层，`Esc` 回到原位置

### 单只鸟

浮层，不跳页。大图 + field-guide 侧栏（学名斜体 serif、日期、小地图、
体长、颜色、行为、保护等级）。关掉回到原来的滚动位置。

### 其他视图要点

- **地图**：pin 用那地点最好看的鸟的圆形照片，不用图钉；大小 = 鸟种数。
  金玉公寓用小房子图标。hover 一只鸟 → 它出现过的其他 pin 一起发光。
  坐标手摆在 `src/data/locations.json`，**不要写回 Notion**。
- **泡泡**：9 个 group 按数量做成大小不同的泡泡团，轻微漂浮碰撞。
- **全部**：最后面 43 只未拍到的画成**空心线框**，只有名字和学名。

## 数据契约

### `src/data/birds.json`

```json
[{
  "id": "228187338e82...",
  "slug": "brown-creeper",
  "name": "Brown Creeper",
  "genus": "Certhia americana",
  "description": "...",
  "type": "Tree-Climbers",
  "tags": ["Nuthatches"],
  "colors": ["Brown", "Tan"],
  "behavior": ["Flitter"],
  "wingShape": ["Rounded"],
  "tailShape": ["Pointed"],
  "conservation": "Low concern",
  "sizeInches": 5.1,
  "population": 9200000,
  "migratory": false,
  "spotted": true,
  "wishlist": false,
  "favorite": false,
  "firstSpotted": "2026-08-15",
  "locationIds": ["366187338e82..."],
  "photoIds": ["3be187338e82..."]
}]
```

### `src/data/locations.json`

```json
[{
  "id": "366187338e82...",
  "slug": "sandy-creek-park",
  "name": "Sandy Creek Park",
  "scope": "local",
  "birdCount": 45,
  "x": null,
  "y": null
}]
```

`scope` 是 `local`（Triangle 18 个，与上面「关键数据事实」一致）或 `travel`。`x`/`y` 是卡通地图上的
百分比坐标，先留 `null`，做地图时手填。

### `src/data/photos.json`

```json
[{
  "id": "3be187338e82...",
  "birdId": "3be187338e82...",
  "locationIds": ["366187338e82..."],
  "camera": "iPhone 17 Pro",
  "files": ["3be187338e82-0.jpg", "3be187338e82-1.jpg"]
}]
```

`files` 是 `src/assets/photos/` 下的文件名，顺序同页面里的 image block。
扩展名跟 Notion 原图走，**实际大部分是 `.png`**（很多是截图），别假设 `.jpg`。

## 技术栈

Astro（static）+ 原生 SVG 做时间轴，动画优先用 CSS transform 和
View Transitions API。尽量少依赖。

## 约定

- **内容只在 Notion 改**，不要直接改 `src/data/*.json`——下次 sync 会覆盖
- `x`/`y` 坐标是例外，只存在仓库里
- 图片进 `src/assets/photos/`，Astro 负责生成 WebP
- dev server 固定 **port 8888**

## ⚠️ Dropbox

项目在 Dropbox 里，三个目录必须标记为不同步，否则会拖垮 Dropbox
（`src/assets/photos` 是 6.5GB 原图，原件在 Notion 里是安全的）：

```bash
xattr -w com.dropbox.ignored 1 node_modules
xattr -w com.dropbox.ignored 1 dist
xattr -w com.dropbox.ignored 1 src/assets/photos
```

⚠️ **`rm -rf dist` 会连 xattr 一起删掉**，clean build 之后要重新打标记。

## ⚠️ Astro 会把原图塞进 dist

Astro 把 ESM import 的图片复制到 `dist/_astro/`，只有被 transform 过的才删原件。
195 张原图 = **825MB**。`src/integrations/prune-originals.mjs` 用
`astro:build:done` hook 扫描产物里实际引用的文件名，删掉没被引用的图。
加了之后 `dist/` 是 44KB。**不要删这个 integration。**
