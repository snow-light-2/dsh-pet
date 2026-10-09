# dsh-pet · snow-light-2 定制 fork

本仓库是 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 的个人定制分支（上游 MIT 许可）。
**上游源码原样保留，定制都记在下面这份清单里**（`src/` 与 `lib/` 同步修改，见文末注意事项）。

---

## 改动清单

### 1. 余额查询支持 `deepseek-modlens` 服务商

**文件**：`src/host/balance.ts`（源码）与 `lib/index.js`（构建产物），两处同步修改。

```diff
 export const BALANCE_PROVIDERS: BalanceProvider[] = [
   { ids: ['opencode-go'], ref: 'OPENCODE_GO_API_KEY', kind: 'opencode' },
-  { ids: ['deepseek-official'], ref: 'DEEPSEEK_API_KEY', kind: 'deepseek' },
+  { ids: ['deepseek-official', 'deepseek-modlens'], ref: 'DEEPSEEK_API_KEY', kind: 'deepseek' },
 ];
```

**为什么**：桌宠右键「查看余额」原本只对 `deepseek-official` / `opencode-go` 两个服务商生效。
本机默认模型由 `@liustack/modlens` 提供，服务商 id 是 `deepseek-modlens`，不在白名单里 →
插件按设计返回 `unsupported`，界面什么都不显示（它不会伪造 0 余额）。

上游只登记「有公开余额 API」的服务商，而 `deepseek-modlens` 实际上就是用
`DEEPSEEK_API_KEY` 去查官方 `https://api.deepseek.com/user/balance`，
所以并入同一项定义是安全的。

**效果**：桌宠显示该 `DEEPSEEK_API_KEY` 对应账号的官方余额（首次实测 ¥69.32，2026-09-09）。

### 2. 桌面端不再有浮空箭头，改到应用标题栏的 🐾 按钮

**背景**：桌面外壳里桌宠身上原本浮着一个 ▾（`pet-arrow`），它的作用是「隐藏桌宠后仍能唤回菜单」。
实测它既遮桌宠又因为窗口 `setIgnoreMouseEvents(true)` 而点不动（隐藏态 = 单向陷阱）。

**文件**：

- `runtime/electron-helper/index.html`：`.pet-arrow` 永久 `display:none !important`（连隐藏态也不再显示）。
- `runtime/electron-helper/sprite.js`：`onMouseMove` 的命中区只按身体矩形，不再把箭头算进去。
- `runtime/electron-helper/main.js`：新增**反向命令通道** —— 回调服务器的 `POST /command`
  （与宿主回传应答的 `POST /respond` 同一台 127.0.0.1 随机端口服务器，因为 Electron 主进程在
  Windows 收不到 piped stdin），支持 `state|show|hide|toggle|exit|home|balance|restart|restart-safe`。
- `src/host/helper-process.ts`：缓存协议行里带的 helper 回调地址，新增
  `requestCommand(command, timeoutMs)` 反向下发命令。
- `src/host/index.ts`：新增路由 `GET|POST /dsh-pet-7340/desktop`（GET 取 `{hidden,visible,pets}`，POST 下发命令）。
- `src/client/titlebar.ts`（新文件）：标题栏按钮组件 —— 🐾 按钮 + 自绘 HTML 菜单
  （显示/隐藏桌宠、退出桌宠（重开 DSH 恢复）、回到初始位置、查看余额），菜单经
  `createPortal` 挂 `document.body`（槽位 DOM 会被外壳 overflow/transform 裁切），
  取不到 `react-dom` 时退化成就地渲染。
- `src/client/app.ts`：注册到 `conversation.session.header.utilities` 槽位（id `pet-titlebar`，order 40）。
- `package.json`：`dsh.client.inject` 追加 `@deepseek-ai/dsh-client-ui-conversation`，
  `peerDependencies` 追加 `react-dom`。

**注意**：宿主侧路由改动要先构建进 `lib/index.js`；**客户端那半（lib/client.js）外壳会直接读盘**，
刷新页面即可，不必重启 DSH。

### 3. 右键菜单补上桌面动作

**文件**：`runtime/electron-helper/sprite.js`（原生菜单 tools 数组）、`preload.js`（`exitPet` / `harnessCommand`）、
`main.js`（`pet:exit` / `pet:harness-command`）、`src/shared/menu.ts`（`MenuLeaf.action` 联合类型）。

新增「隐藏桌宠 / 显示桌宠」「退出桌宠（重启 DSH 后恢复）」以及 `Harness ▸`（重启 / 安全模式重启 / 显示日志 /
检查更新 / 设置）。区别：**隐藏**写盘（`dsh-pet-helper-hidden.json`）并保留恢复入口；**退出**只 `win.hide()`，
不写盘，重启 DSH 后回来。

### 4. helper 的 cwd 不再指向插件包目录

**文件**：`src/host/helper-process.ts` —— `cwd: this.options.cwd || tmpdir()`（并 `import { tmpdir } from 'node:os'`）。

**为什么**：原来 `cwd` 落在 `node_modules/dsh-pet`，Windows 会锁住该目录，
`pnpm add/install` 里任何重建 `node_modules` 的操作都报
`[ERR_PNPM_EPERM] rename … node_modules\dsh-pet_tmp_… -> …\dsh-pet`。

### 5. 桌宠窗口出屏兜底（修「重启后桌宠不见了」）

**文件**：`runtime/electron-helper/main.js`（`ipcMain.on('pet:set-bounds')`）、
`runtime/electron-helper/sprite.js`（构造末尾订阅 `pet:harness-action`）。

**症状**：DSH 重启后桌宠从屏幕上消失，而 `/dsh-pet-7340/desktop` 返回
`{"ok":true,"hidden":false,"visible":true,"pets":1}`、`PrintWindow` 也能抓到完整的宠物画面
—— 即**渲染一直是好的，只是窗口被放到了屏幕上不该在的地方**。

**原因**：窗口 = 宠物包围盒 + 四周外扩余量（`margin = size/2 ≈ 231`），配置的
「右上角」锚点把包围盒放在 `(1221,100)`，于是窗口坐标 = `(990,-131)` —— **顶边跑到屏幕外**。
这个位置下窗口内容不会被合成到屏幕（实测把窗口挪到屏幕内就立刻可见，挪回去又消失）。

**修法**：`pet:set-bounds` 里不再只钳「包围盒」，而是**钳整个窗口** —— 用
`screen.getDisplayNearestPoint(窗口中心).workArea` 把窗口四边夹进工作区
（`EDGE_INSET = 120`），再 `win.setContentBounds({...}, false)`。宠物可见像素只占窗口的
一部分（贴图四周有透明留白，实测落在窗口右下区），所以必须钳窗口本身。

**边距为什么是 120 而不是 8**：透明浮窗贴到工作区边缘时，Windows 的软件合成会**整个丢掉
这个窗口的画面** —— 进程在、`PrintWindow` 有内容、屏幕上什么都没有。实测同一台机器、
同一个宠物：窗口落在 `(775,8)`（距右/上边 8px）屏幕上就是空白；改成 120px 后落在
`(663,120)`，宠物立刻可见（抓屏采样到底部右侧 420 个发色像素，肉眼也确认在屏上）。
复现/恢复手段对照：`(200,200)`/`(300,200)`/`(8,160)` 可见，`(990,-131)`/`(775,8)`/
`(687,96)`/`(719,64)` 不可见；同位置 `SWP_SHOWWINDOW`、hide+show、透明度抖动、
`RedrawWindow` 都救不回来，**只有大幅位移（≥160px）会触发一次真实合成** ——
`forceRepaint()` 因此按 160px 位移再做回原位，并在 `ready-to-show` 与
`showAllPetWindows()` 时各调一次。

**顺带**：渲染端此前**从未订阅** `pet:harness-action`（grep 零命中），所以主进程下发的
「回到初始位置 / 查看余额」是死通道；现在 `sprite.js` 构造末尾把它接到 `onMenuAction`
（`balance → show-balance`，其余同名转发），标题栏菜单这两项才真的生效。

**排查用**：只有真的发生夹取、且夹取目标变化时才写一行
`%TEMP%\dsh-pet-bounds-clamp.log`（上报窗口/包围盒/夹取后坐标/工作区）；
宠物漫游时每帧都会上报窗口位置，所以做了节流，正常漫游基本不写盘。

---

## 为什么要有这个 fork

上游升级会整体覆盖 `lib/`，之前手工打在
`%APPDATA%\dsh-desktop\harness\profiles\web\node_modules\dsh-pet\lib\index.js`
上的补丁每次都会被冲掉。而且该目录已退化成真实目录（不是 junction），
导致更新流程报 `Cannot switch a non-link plugin directory`。

把它放进自己的仓库后：

- 改动进入版本历史，升级不会再覆盖它；
- 以本地 tarball / `link:` 方式挂进 DSH profile，更新节奏由自己决定；
- 顺带绕开了 generation 安装路径上的 peer 校验报错。

---

## 怎么用

在 DSH 的 web profile 里把 `dsh-pet` 的依赖指向本仓库（或本地 tarball）：

```json
"dsh-pet": "link:E:/dsh-pet"
```

本机目前走本地 tarball：`E:\deep seek harness\dsh-migrate-local\tarballs\dsh-pet-0.2.6.tgz`，
重打包后要同步更新 `profiles\desktop\pnpm-lock.yaml` 里的 `resolution.integrity`（否则报
`[ERR_PNPM_TARBALL_INTEGRITY]`）。

---

## 注意事项

1. **`lib/` 是构建产物，已一并提交。** 本机没有安装 `tsdown` 等 devDependencies，
   只改 `src/` 不会生效 —— 要么同时改 `lib/`，要么自行
   `npm install && npm run bundle` 重新构建。
2. `assets/` 约 56 MB（主要是 webm 动画，以及一个 3.9 MB 的字体 `上首软糖体.ttf`），已提交。
   单文件均远小于 GitHub 的 100 MB 上限。
3. 同步上游：
   ```
   git remote add upstream https://github.com/PC2005-cloud/dsh-pet.git
   git fetch upstream
   ```
4. 上游 `package.json` 的 `_comment` 里本来就写明「fork 定制，不随包发布」，本 fork 符合其预期用法。
