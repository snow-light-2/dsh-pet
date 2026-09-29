/**
 * 重启 Harness 的官方通道（随桌宠助手一起分发）。
 *
 * 桌面宿主通过 IPC 子进程方式启动 harness（process.send/on('message')），并监听
 * `{ type: 'shutdown' }`：收到后执行 application.shutdown.shutdown(0)——会话落盘、
 * 服务优雅退出。宿主退出后由 DSH 桌面应用（Electron 外壳）重新拉起一个新的 Harness。
 *
 * 本脚本以 ELECTRON_RUN_AS_NODE=1 运行在同一 Electron 可执行文件下，因此它能继承
 * 那条 IPC 通道并把 shutdown 消息送给宿主。桌宠助手用它对「重启 Harness / 安全模式重启」。
 *
 * 退出码：0 = 已送出；2 = 没有 IPC 通道（说明不是宿主启动的环境）。
 */
'use strict';

if (typeof process.send === 'function') {
  process.send({ type: 'shutdown' }, (error) => {
    if (error) {
      console.error('[pet-restart] send failed: ' + error.message);
      process.exitCode = 1;
    } else {
      console.log('[pet-restart] shutdown requested');
    }
    setTimeout(() => process.exit(process.exitCode || 0), 200);
  });
} else {
  console.error('[pet-restart] no IPC channel to the desktop host');
  process.exitCode = 2;
}
