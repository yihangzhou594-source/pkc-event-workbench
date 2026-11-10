# PKC 逐局数据 API

接入网站在自己的服务器上请求 PKC，使用 HTTPS，并在请求头传入 `Authorization: Bearer <API_KEY>`。每个网站使用一把独立密钥，密钥存放在接入方服务器的环境变量中。

| 方法与路径 | 返回值 |
| --- | --- |
| `GET /api/v1/series` | `series` 数组，每项含 `id`、`name` |
| `GET /api/v1/series/{seriesId}/games` | `games`、`total`、`offset`、`limit`、`nextOffset` |
| `GET /api/v1/series/{seriesId}/games/{gameId}` | `game`，含小局数据及 `chartsUrl` |
| `GET /api/v1/series/{seriesId}/games/{gameId}/charts` | `publishedAt` 和 `charts`，每张图含 `name`、`url` |
| `GET /api/v1/series/{seriesId}/games/{gameId}/charts/{name}.png` | `image/png` |

列表沿用工作台存储顺序。默认每页 50 局，`limit` 可取 1–100，`offset` 从 0 开始。按 `matchKey` 精确筛选。小局保存后可读取，包括仍在录入的小局。

小局字段有 `id`、`seriesId`、`matchKey`、`label`、`date`、`duration`、`winner`、`blue` 和 `red`。`winner` 按保存的胜负选项映射为 `blue` 或 `red`。每方含 `teamId`、`teamName`、`score`（击杀比分）、`totalDamageWan`（万）。详情额外含 `players`，每项有原始录入行号 `slot`、`name`、`hero`、`lane` 和 `metrics`。

| 指标 | 单位 |
| --- | --- |
| `k`、`d`、`a`、`cs` | 击杀、死亡、助攻、补刀次数 |
| `gold`、`gpm` | 金币、每分钟金币 |
| `goldShare`、`dmgPct`、`tankPct`、`kp` | 经济占比、伤害占比、承伤占比、参团率，均为百分比 |
| `rating` | 局内评分 |
| `dmgRaw`、`tankRaw` | 输出伤害、承受伤害，单位为点 |
| `dmgPerGold` | 每金币对应输出伤害点数 |
| `dmgWan` | 输出伤害，单位为万 |

数据值使用字符串保留存储精度及百分号等原有表示。`"0"` 是已录入的零，`null` 是空值。历史记录只有舍入后的万单位或比例时，相应绝对值仍为 `null`。日期和时长沿用录入格式。

导播台把数据图推送到直播后，系统会同步保存该次推送的五路对位图和五路总览。图名依次为 `top`、`jungle`、`mid`、`bottom`、`support`、`overview`。首次推送前，图片列表为空且 `publishedAt` 为 `null`。再次推送同一局会替换该组图片。小局数据继续随保存更新，图片以最近一次成功同步的推送为准。

```sh
curl -H "Authorization: Bearer $PKC_API_KEY" \
  'https://live.pkchku.com/api/v1/series'
# {"series":[{"id":"season-1","name":"PKC 秋季赛"}]}
```

```sh
curl -H "Authorization: Bearer $PKC_API_KEY" \
  'https://live.pkchku.com/api/v1/series/season-1/games/game-1/charts/overview.png' \
  -o overview.png
```

缺失或失效密钥返回 401，其他 HTTP 方法返回 405，未知小局或图片返回 404，未配置密钥或图片存储不可用时返回 503。

部署时在服务端设置 `PKC_MATCH_API_KEY_HASHES`，填写以逗号分隔的密钥 SHA-256 十六进制摘要。每把原始密钥建议使用 32 字节随机值。轮换时增加新摘要，接入方切换后删除旧摘要，再重启服务使配置生效。云端图片需要 Supabase Storage 私有桶 `pkc-game-charts`，允许 `application/json` 且对象上限至少 24 MiB。可用 `PKC_CHART_STORAGE_BUCKET` 指定桶名。本机模式将图片保存在数据目录的 `published-charts`。
