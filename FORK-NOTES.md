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

### 5. 桌宠「看不见」的排查结论（含一次被回滚的误修）

**文件**：`runtime/electron-helper/sprite.js`（构造末尾订阅 `pet:harness-action`）。

**现象**：DSH 重启后桌宠从屏幕上消失，而 `/dsh-pet-7340/desktop` 返回
`{"ok":true,"hidden":false,"visible":true,"pets":1}`、`PrintWindow` 也能抓到完整宠物画面。

**最可能的原因：桌宠被隐藏，不是窗口跑出屏幕。** 当时的状态文件
`%APPDATA%\Electron\dsh-pet-helper-hidden.json` 是 `{"hidden":true}`
（`hideAllPetWindows()` 只隐藏窗口、进程照旧），用
`POST /dsh-pet-7340/desktop {"command":"show"}` 放回后一切恢复正常。
排查同类问题先看这个文件，**不要**先怀疑窗口坐标。

**一次被回滚的误修（留作教训）**：曾按「窗口出屏 → Windows 不合成该透明窗口」的判断，
在 `pet:set-bounds` 里把整个窗口夹进工作区（`EDGE_INSET` 先 8 后 120）并加
`forceRepaint()`（`invalidate` + 透明度 0.99→1 + 160px 位移回原位）。
于 `5165652` 全部回滚，理由两条：

1. **功能性回归**：`EDGE_INSET=120` 后窗口可落区间变成
   `x∈[120, 663]`、`y∈[120, 912-120-744=48]`（**空区间**），y 被钉死在 120，
   用户报「拖动只能左右挪一小段」。
2. **前提不成立**：所谓「贴边/出屏就不合成」来自**固定子区域采样**的假象 ——
   宠物自己会漫游，子区域假设的贴图偏移不成立。改成「整窗口区域 + 10 秒内多次采样取
   峰值/均值」后：`(990,-131)` 6331/6331、`(663,120)` 3790/3753、`(300,120)` 4538/4482、
   `(78,120)` 8262/8239 —— **四个位置宠物都被正常合成到屏幕上**。

**采样教训**：判断透明浮窗「在不在屏幕上」必须①按 `GetWindowRect` 取整窗口区域
（不能只取贴图可能出现的子区域），②多次采样（宠物会漫游/做动作），③用发色像素
（`B>120 且 B>R+25 且 B>G+15`）计数比较，别用单帧结论。

**保留的真修复**：渲染端此前**从未订阅** `pet:harness-action`（grep 零命中），主进程下发的
「回到初始位置 / 查看余额」是死通道；现在 `sprite.js` 构造末尾把它接到 `onMenuAction`
（`balance → show-balance`，其余同名转发），标题栏菜单这两项才真的生效。

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

### 6. 会话标题栏 🐾 不出现：插槽 `inject` 必须用箭头函数（不能是 generator）

**症状**：会话标题栏右侧（官方 📁 图标那一排）看不到桌宠的 🐾 按钮，桌宠本体、右键菜单都正常。

**排查证据**（客户端探针 `E:\deep seek harness\work\gui-real*.js`，走 `__dsh-local-link` 配对后
用 `executeJavaScript` 读真实 DOM；注意 cookie 是 HttpOnly，curl jar 里带 `#HttpOnly_` 前缀，解析前要剥掉）：
- 插槽 `conversation.session.header.utilities` **存在**，里面有官方 open-in-app 控件（就是那个 📁）✅；
- 但 `.dsh-pet-tb-btn` 不存在、`[class*=dsh-pet]` 计数 0 ✗；
- 控制台只有 `[dsh-pet] 系统通知未启动：connection 服务不可用`、`[dsh-pet] 命令选择框不可用：commandUi 服务缺失`
  两条降级告警 ⇒ **apply 已经跑过**，问题不在插件加载，而在插槽注册没生效。

**根因（两层，第一层曾把我带偏）**：

1. **注册写法不是问题**：`ctx.slots.inject(name, fn)` 既接受箭头函数也接受 generator ——
   app.asar 里官方自己就有
   `ctx.slots.inject("sidebar.workspaces.session.menu.item", function* () { yield ctx.slots.register({…}, PinSessionMenuItem); })`。
   先前把「generator 不被迭代」当成根因是**错的**（那笔改动无害，保留即可）。
2. **真根因：`h` 是 `react/jsx-runtime` 的 `jsx`，它不吃变参孩子。**
   `jsx(type, props, key)` 的第三参是 **key**，而 `makePetTitlebarMenu` 里全写成
   `h('div', { … }, [子节点])` ⇒ 孩子被当成 key 丢掉，组件渲染成一个**空 div**，
   `.dsh-pet-tb-btn` 自然不存在（插槽在、注册在、DOM 里就是没有按钮）。
   同文件其它 68 处用的是 `props.children`（对 `jsx` 而言才是正确写法），所以只有这个新组件中招。

**修复**：`src/client/app.ts` 与 `lib/client.js` 都把
`const { jsx: h } = require('react/jsx-runtime')` 改成 `const h = react.createElement;`
—— `createElement(type, props, …children)` 对「变参孩子」和「props.children」两种写法都兼容。
`lib/` 是构建产物，必须和 `src/` 一起改（本机没装 tsdown）。

**附带发现**：本版外壳的插槽清单里只有 `settings.launcher` / `settings.trigger`，**没有 `settings.section`**，
所以桌宠的「设置页配置区块」很可能同样不显示（未验证）。

**验收方式**：客户端 bundle 按内容哈希发版，改完 `lib/client.js` 后要在 GUI 里 **F5 刷新**（或重启 DSH）
才会拿到新 bundle；刷新后点开会话，标题栏右侧应出现 🐾。

## 7. 透明浮窗「整窗不上屏」兜底（修「桌宠没有了」）

症状：桌宠进程活着、`IsWindowVisible=true`、`PrintWindow` 能抓到宠物画面，
但屏幕上什么都没有（用户看到的「重启后桌宠直接没有了」「桌宠又没有了」）。
排查过的死胡同：同位置 `SWP_SHOWWINDOW`、hide + show 循环、`SetLayeredWindowAttributes`
alpha 抖动、`RedrawWindow(INVALIDATE|UPDATENOW|FRAME)`、`InvalidateRect/UpdateWindow`、
`webContents.invalidate()`、`setOpacity(0.99)→1`、2px/160px 位移再回原位——都没用。

有用的那一个：**`webContents.capturePage()`**。它会逼合成器产出一帧，实测这一下画面就回来
（同一份代码用 `DSH_PET_SMOKE=1` 跑时会拍图，那次就是把宠物拍出来了；外部把窗口挪到明显
不同的位置也有效，属于同类「逼一次合成」）。

落地：`runtime/electron-helper/main.js` 新增模块级 `kickComposition(win)`，调用点：
1. `win.once('ready-to-show')` 里 `win.show()` 之后；
2. `showAllPetWindows()` 内每个窗口（标题栏 🐾 →「显示桌宠」/「退出桌宠」之后再点🐾 的恢复路径）；
3. 每 60 秒兜底一次（几毫秒，不影响动画）。

注意：`kickComposition` 必须是**模块级**函数——`createPetWindows()` 在模块级，而
`showAllPetWindows()` 在 `app.whenReady()` 里，写成 whenReady 内的 `const` 会让前者 ReferenceError。

另外两处同批修掉的问题：
- 标题栏 🐾 一直不出现：`makePetTitlebarMenu` 里 `const { jsx: h } = require("react/jsx-runtime")`
  配 `h('div', {…}, [孩子])` —— `jsx(type, props, key)` 第三参是 key，孩子被丢掉，渲染成空 div。
  已改成 `react.createElement`（commit `2148aa6`）。
- 「inject 用 generator 不生效」是错的判断：外壳官方自己就用 `function*` + `yield`
  （`sidebar.workspaces.session.menu.item`）。箭头函数改动无害、保留。

### 8. Windows 合成缺陷：透明浮窗「进程在、屏幕没有」的兜底（2026-10-14）

**症状**：桌宠进程活着、`IsWindowVisible=True`、`DWMWA_CLOAKED=0`、`WS_EX_TOPMOST` 已设、
`PrintWindow` 能抓到完整宠物画面，但屏幕上**一个像素都没有**。隐藏后再 `show` 也回不来。
（触发时间点：本机跑过全屏游戏 + ReShade 覆盖层之后开始出现。）

**无效手段**（都单独试过）：同位置/小幅 `SetWindowPos`、`hide()+show()`、`SetLayeredWindowAttributes`、
`RedrawWindow`、`InvalidateRect/UpdateWindow`、`webContents.invalidate()`、`setOpacity` 抖动、
销毁窗口重建、重启 helper、去掉 `WS_EX_TRANSPARENT`、去掉 `WS_EX_LAYERED`、打开硬件加速。

**有效手段（唯一）**：**另一个进程**对这个窗口做一次**大幅位移**
`SetWindowPos(hwnd, HWND_TOPMOST, 远处坐标, SWP_NOSIZE|SWP_SHOWWINDOW)`（几十像素无效，几百像素以上有效）。

**关键第二步（本轮才补上）**：外部位移之后必须让 **renderer 认领新位置**，否则它下一帧
`sendBounds()` 就按自己的逻辑位置把窗口拽回去（实测 1.7s 内回到原位），屏幕上等于什么都没发生。

实现（`runtime/electron-helper/`）：
- `main.js` `externalNudge(win)`：`-EncodedCommand` 拉起 `powershell.exe` 做那次位移
  （落点 A `(300,150)`、落点 B `(900,400)`，两者相距过近时换落点，保证位移足够大），
  400ms 后 `webContents.send('pet:window-moved', { boxX, boxY })`；每次结果写
  `%TEMP%\dsh-pet-nudge.log` 便于事后核对。
- `preload.js` `onWindowMoved(cb)`。
- `sprite.js` 订阅后调用新增的 `adoptWindowPosition(px, py)`：`stopThrow/stopMove`
  → 写 `customPos`（宠物中心比例）→ `sendBounds(px, py)`。
- 调用时机：`ready-to-show` + `showAllPetWindows()`（各一次，`scheduleVisibilityKicks` 2s 后）。
- 实测：启动后与「隐藏 → 显示桌宠」两条路径都能把宠物放回屏幕上，且 12s 后窗口仍在落点（没被拽回）。

**其它一并留在代码里的防御**：`app.disableHardwareAcceleration()`（Win32 透明分层窗口的已知缺陷）、
`--disable-features=CalculateNativeWinOcclusion`（原生遮挡计算会误判顶层浮窗并让渲染进程停帧）、
`kickComposition(win)`（`capturePage()` 逼一帧）、`reassertTopmost(win)`。
桌宠初始落点边距改为 `marginX/Y = 240`（`E:\dsh-home\dsh-pet\main-config.json`）。
