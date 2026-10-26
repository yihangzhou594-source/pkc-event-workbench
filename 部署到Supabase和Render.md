# 部署到 Supabase 和 Render

本文档对应私有云端模式。部署完成后，浏览器只访问 Render 的 HTTPS 地址，
赛事数据保存在 Supabase；Render 的临时文件系统不保存业务数据。

## 一、免费额度

正常内部使用可以保持免费：

- Supabase Free：500 MB 数据库、5 GB 出站、Auth；1 周无活动会暂停。
- Render Free：512 MB 内存、0.1 CPU；15 分钟无请求会休眠，下次访问约需 1 分钟冷启动。

当前赛事数据只有约 70 KB，远低于 Supabase 免费数据库额度。图片和 OCR
引擎随仓库由 Render 提供，不占用 Supabase 数据库。

Render 免费服务不适合作为必须保证直播 SLA 的生产服务。若开播前休眠，
先打开一次云端地址，登录并等待页面加载完成。

## 二、创建 Supabase 表

1. 登录 Supabase，创建一个 Free 项目。
2. 打开 **SQL Editor**。
3. 粘贴并执行
   `supabase/migrations/202610260001_pkc_cloud_workbench.sql`。
4. 在 **Table Editor** 确认存在：
   - `pkc_records`
   - `pkc_backups`
   - `pkc_audit`
5. 在 **Database > Functions** 确认存在：
   - `pkc_write_record`
   - `pkc_restore_record`

迁移会禁止浏览器角色直接访问三张业务表，只有 Render 服务端的 Service Role
可以读写。

## 三、创建工作人员账号

1. 打开 **Authentication > Users**。
2. 选择 **Add user > Create new user**。
3. 为账号所有者创建邮箱和密码，并设为已确认用户。
4. 按同样方式为少数工作人员创建账号。
5. 在 **Authentication > Providers > Email** 关闭公开注册
   （Enable sign ups / Allow new users to sign up）。

不要公开分享登录地址。虽然应用要求登录，但项目级用户注册仍在 Supabase
侧管理。

## 四、获取 Supabase 环境变量

从 Supabase 项目的 **Project Settings > API** 或 **API Keys** 页面复制：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`：浏览器登录使用的公开 key，可为 anon 或 publishable key
- `SUPABASE_SERVICE_ROLE_KEY`：仅用于 Render 服务端，绝不能放进浏览器

只在 Render 环境变量中填写这组值，不写入 GitHub 文件。

## 五、在 Render 部署

1. 把代码推送到 GitHub 仓库。
2. 在 Render 选择 **New > Blueprint**，连接
   `yihangzhou594-source/pkc-event-workbench`。
3. Render 会读取仓库根目录的 `render.yaml`。
4. 选择要部署的 GitHub 分支，并确认服务类型为 **Web Service**、
   运行环境为 **Node**、计划为 **Free**。
5. 为下列变量填写值：

```env
PKC_CLOUD=1
PKC_REMOTE=1
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<public-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<server-only-service-role-key>
PKC_ALLOWED_EMAILS=owner@example.com,staff@example.com
DEEPSEEK_API_KEY=<optional-deepseek-key>
```

`PKC_ALLOWED_EMAILS` 必须填写获授权的邮箱，逗号分隔。`DEEPSEEK_API_KEY`
为空时其他功能仍可运行，但截图 OCR 不可用。

6. 点击部署。服务启动时会自动把 Git 仓库 `数据/*.json` 中的当前赛事数据
   导入空的 Supabase 表。
7. 以后向 Render 部署的目标分支推送提交，就会自动更新服务。

## 六、上线检查

部署后依次检查：

```text
GET /healthz                         -> 200，cloud=true，auth=true
未登录打开 /                          -> 跳转到 /login
未登录请求 /api/store/library         -> 401
工作人员登录                          -> 进入工作台
修改并保存数据                        -> Supabase pkc_records 的 revision 增加
另一台设备登录                        -> 读取到同一份数据
```

在 Supabase 的 SQL Editor 可检查数据：

```sql
select key, revision, updated_at
from public.pkc_records
order by key;
```

## 七、OBS 与手机

OBS 浏览器源和手机远程页同样需要登录：

- OBS 首次可打开浏览器源互动窗口完成登录，Cookie 会保存在 OBS 中。
- 手机打开云端地址，登录后进入 `/remote`。
- 手机远程控制仍需导播台生成的一次性口令。

如果 OBS 中不方便登录，先在 OBS 浏览器源的 **Interact** 窗口输入工作人员
邮箱和密码；不要在 OBS 地址中拼接密码或 Service Role Key。

## 八、休眠与恢复

- Render 15 分钟无流量后会休眠。休眠期间数据不会丢失，因为数据在 Supabase。
- Supabase Free 连续 1 周无活动后暂停。打开 Supabase 项目并恢复即可。
- 建议在赛事开始前 10 分钟打开 `/healthz` 和登录页，完成 Render 冷启动。

## 九、本地模式

不设置 `PKC_CLOUD=1` 时，程序仍使用本地 `数据/*.json`，双击
`启动.bat` 可离线工作。不要把本地离线期间产生的重要修改直接覆盖云端；
当前版本不会自动双向合并两套独立数据库。

回退到本地模式只需关闭 Render 服务或不带 Supabase 环境变量运行
`启动.bat`。云端数据仍保留在 Supabase。
