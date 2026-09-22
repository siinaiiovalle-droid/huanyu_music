# 寰宇音乐台 Huanyu Music

面向世界的原创音乐网站。**所有音乐由代码实时合成**——和声、旋律、音色、鼓组、混音乃至旋律线，没有一个采样来自别处。全站为纯器乐作品，不含人声。

- 公网地址（GitHub Pages）：<https://siinaiiovalle-droid.github.io/huanyu_music/>
- 源码仓库：<https://github.com/siinaiiovalle-droid/huanyu_music>
- 本地运行：`npm start` → <http://localhost:3000/>

## 技术栈

零第三方 npm 依赖，仅需 **Node.js 18+**，无需 `npm install`；前端原生 HTML/CSS/JS，无构建步骤。

| 能力 | 实现方式 |
| --- | --- |
| 编曲 / 音色 / 鼓组 / 混音 | `scripts/lib/dsp.js` 自研 DSP（含限幅、混响、延迟、滤波） |
| 旋律线 | `scripts/lib/dsp.js` 的主奏音色按谱面演奏；原本为演唱写作的旋律由乐器完整奏出（全站无人声） |
| 歌词 | `scripts/lib/lyrics-engine.js` 生成中英对照歌词并按字对齐到旋律时间轴——用于生成旋律骨架，不对外展示 |
| 转 MP3 / 时长波形分析 | 系统 ffmpeg |
| 封面 | `scripts/make-covers.js` 按种子生成 `nebula / orbit / waves` 三种风格的 1600×1600 PNG |
| 数据存储 | `data/tracks.json`（纯 JSON，可平滑替换为数据库） |

页面：`index`（首页）、`track`（单曲详情，含波形与逐句歌词）、`about`（关于）、`admin`（后台，默认密码 `music888`，可用环境变量 `ADMIN_PASSWORD` 覆盖）。

## 常用命令

```bash
npm start                # 启动本地服务（默认 3000 端口）
npm run daily            # 每日生产：3 首纯音乐（无人声）→ 入库 → 同步线上
npm run compose          # 一次性合成两首示例作品 + 封面 + 入库
npm run add              # 命令行发布新作品（加 --server 可远程上传）
npm run test:api         # 接口冒烟自检
npm run build:static     # 导出纯静态站到 dist/（配合 static-shim.js 免后端运行）
npm run sync:pages       # 重新导出静态站并强推到 gh-pages 分支
npm run strip-vocals     # 把曲库里的旧人声作品重制为纯器乐版（同种子重渲染，只去掉人声）
npm run covers            # 重新生成示例封面（会同步出各档缩略图）
npm run thumbs            # 为所有封面补/重做 tiny/thumb/large 三档 JPEG（--force 全量重做）
npm run daily:task          # 注册 / 更新 Windows 计划任务
```

`npm run daily` 支持的参数：

```bash
npm run daily -- --instrumental=3 --songs=3   # 指定数量
npm run daily -- --no-push                    # 只入库，不推送
npm run daily -- --date=2026-09-22            # 指定批次日期
npm run daily -- --bitrate=192k               # 指定 MP3 码率
```

## 每天自动做什么

注册一次 Windows 计划任务后，系统会**每天自动合成 3 首纯音乐**（无人声），体检、转码、生成封面、入库，并自动推送到 GitHub Pages 上线：

```powershell
node scripts/install-daily-task.js              # 默认每天 07:30
node scripts/install-daily-task.js --at=22:00   # 换个时间
node scripts/install-daily-task.js --uninstall  # 删除任务
```

任务实际执行的是 `scripts/run-daily.bat`：先清空代理环境变量（本机代理会让 `git push` 稳定报 TLS 错误），再运行 `scripts/daily.js`，输出追加到 `build/daily.log`。

手动触发一次：`schtasks /Run /TN "寰宇音乐台-每日作曲"`。

任务以当前用户身份运行（`git push` 需要本机登录态），因此请保持电脑处于开机登录状态。每批 3 首约需十几分钟，运行报告写在 `build/last-daily-run.json`。

## 注意事项

- 封面必须是 `public/img/covers/*.png`；`tiny 96 / thumb 320 / large 720` 三档 JPEG 由 `npm run thumbs` 生成到同名子目录，前端 `public/js/cover.js` 按展示位置自动选档，缺档时自动回退原图。新封面由 `make-covers.js` 生成后会自动补档，无需手动执行。
- `build/`（WAV 分轨与人声切片，约 60MB）与 `dist/`（静态导出结果）已在 `.gitignore` 中忽略，不会入库。
- `data/tracks.json` 里的 `plays`、`likes`、`updatedAt` 属于运行时噪声，提交前按需取舍。
- 服务端在 `require` 时即开始监听端口，测试脚本应判断 `server.listening` 而不要重复 `listen`。
- 服务端把 `data/tracks.json` 缓存在内存，脚本改完数据后需重启服务才会生效。
