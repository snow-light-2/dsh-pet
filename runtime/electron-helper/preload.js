// preload 桥：只暴露窗口控制原语——
//   - setBounds：宠物窗口逐帧跟随（renderer 上报包围盒的屏幕坐标，主进程 setContentBounds）。
//     x/y/width/height = 窗口内容区坐标（用于移动窗口）；boxX/boxY = 宠物包围盒左上角
//     （工作区坐标）——碰撞站场必须用包围盒坐标，不能用窗口坐标（窗口 = 包围盒 + 四周外扩 margin，
//     差半只宠物宽，会让跨窗碰撞检测整体错位）。
//     size/bottomPad = 碰撞站场登记用（静止宠物只发 set-bounds，靠它带上尺寸才能被其它
//     飞行宠物撞到）；vx/vy = 当前速度（飞行中实时值，静止/拖拽 = 0）。
//   - setInteractive：点击穿透翻转——窗口默认整窗穿透（透明像素不挡下层应用），
//     renderer 在光标进/出宠物身体命中区时上报，主进程 setIgnoreMouseEvents 翻转。
//   - 宠物间碰撞（跨窗，主进程 broker）：
//       reportFlight：飞行中每 ~30ms 上报自己的状态（位置/速度/尺寸）→ 主进程汇聚并广播；
//       onFlightStates：订阅主进程广播的全量宠物状态（碰撞检测用其它宠物的最新位置/速度）；
//       reportCollide：本窗飞行方检测到撞到 targetId → 主进程把动量结果转发给目标窗；
//       onPetHit：订阅「你被撞了」→ 用新初速 startThrow 抛出去（与浏览器 onHit 同语义）。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petBridge', {
  setBounds(x, y, width, height, boxX, boxY, size, bottomPad, vx, vy) {
    ipcRenderer.send('pet:set-bounds', { x, y, width, height, boxX, boxY, size, bottomPad, vx, vy });
  },
  setInteractive(interactive) {
    ipcRenderer.send('pet:set-interactive', !!interactive);
  },
  // 右键菜单「打开网站」：主进程用系统默认浏览器打开 DSH 网站（等效网页 Ctrl+点击链接）
  openDshSite(url) {
    ipcRenderer.send('pet:open-site', { url });
  },
  // 右上角箭头：请主进程弹出原生 Harness 菜单（重启 Harness / 安全模式 / 日志 / 检查更新 / 打开网站 / 隐藏桌宠…）
  openHarnessMenu(payload) {
    ipcRenderer.send('pet:harness-menu', payload || {});
  },
  // 隐藏/显示桌宠的状态登记（主进程据此在窗口重建后恢复隐藏态）
  setHidden(hidden) {
    ipcRenderer.send('pet:set-hidden', !!hidden);
  },
  // 右键菜单「退出桌宠（重启 DSH 后恢复）」：把全部浮窗藏起来，仅作用于本次会话
  exitPet() {
    ipcRenderer.send('pet:exit');
  },
  onHiddenState(cb) {
    ipcRenderer.on('pet:hidden-state', (e, hidden) => cb(!!hidden));
  },
  // 取一次持久化的隐藏态（窗口重建后恢复用）
  initHidden() {
    return ipcRenderer.invoke('pet:get-hidden');
  },
  // 来自原生菜单的动作（如「隐藏桌宠」由主进程回推，保证两端状态一致）
  onHarnessAction(cb) {
    ipcRenderer.on('pet:harness-action', (e, payload) => cb(payload || {}));
  },
  // ---- 宠物间碰撞（跨窗 broker）----
  reportFlight(state) {
    ipcRenderer.send('pet:report-flight', state);
  },
  onFlightStates(cb) {
    ipcRenderer.on('pet:flight-states', (e, states) => cb(states));
  },
  reportCollide(targetId, vx, vy) {
    ipcRenderer.send('pet:collide-result', { targetId, vx, vy });
  },
  onPetHit(cb) {
    ipcRenderer.on('pet:hit', (e, payload) => cb(payload));
  },
});
