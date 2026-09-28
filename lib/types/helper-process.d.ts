/**
 * 桌面 Helper 进程管理器 —— 拉起/守护 Electron 透明窗口进程。
 *
 * 架构：Helper 与宿主之间除了日志，还有一条 **stdin/stdout JSON 行协议**（bridge）：
 *   - 渲染端不再直接访问 DSH WebServer（DSH Desktop 2.0.3+ 的浏览器访问闸门会给插件自拉的
 *     独立进程裸 HTTP 请求回 403），改走自定义 scheme `dsh-pet-bridge://` → Electron 主进程
 *     （main.js 的 protocol.handle）→ 本模块的管道 → 宿主 handlePetRoute（与 HTTP 路由同一份逻辑）。
 *   - 协议行统一前缀 `dsh-pet-bridge:`，与普通日志行区分（main.js 的 console 输出也走 stdout）。
 *   - 素材（webm/字体/光标）不把二进制过管道：宿主返回文件绝对路径，main.js 自行读盘应答。
 * 本文件负责解析 Electron 可执行文件、以子进程方式拉起 electron-helper/main.js、
 * 守护协议通道、并在异常退出时自动重启。
 */
export declare const packageRoot: string;
export declare const defaultHelperMain: string;
/** 协议行前缀：stdout/stdin 里以此开头的整行 JSON 属于 bridge 协议，其余为日志 */
export declare const BRIDGE_PREFIX = "dsh-pet-bridge:";
/** 渲染端（经 main.js 转发）的一次请求：URL 是 /dsh-pet-7340/... 路径 + 查询串；
 *  cb = main.js 本地回调服务器地址（宿主把应答 POST 回去；Electron 主进程读不到 piped stdin，
 *  故应答不走 0 号管道 —— electron#4218） */
export interface BridgeRequest {
    id: number;
    method: string;
    url: string;
    body?: string;
    cb?: string;
}
/** 宿主对一次请求的应答：json/text 走 body；素材走 file（文件绝对路径，main.js 自行读盘） */
export interface BridgeResponse {
    id: number;
    status: number;
    contentType?: string;
    body?: string;
    file?: string;
}
/** bridge 请求处理器（宿主侧与 handlePetRoute 对接；main.js 不在收到请求时带出宿主动作） */
export type BridgeHandler = (req: BridgeRequest) => Promise<BridgeResponse>;
interface HelperOptions {
    electronPath?: string;
    helperPath?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    restartDelayMs?: number;
    /** bridge 协议处理器：renderer 的每条请求（配置/余额/碎碎念/素材等）都经它应答 */
    bridgeHandler?: BridgeHandler;
}
type Logger = {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
};
/**
 * 解析 Electron 可执行文件。
 * 优先级：
 *   1. 显式候选（用户配置）/ DSH_PET_ELECTRON_PATH 环境变量
 *   2. 本机已安装的 electron npm 包（require('electron') 返回二进制路径）
 *   3. $DSH_HOME/electron（默认 ~/.dsh/electron）—— ensureElectronDownload 的落地路径
 *   4. 都不存在时由 ensureElectronDownload() 进程内异步下载（不 spawn 子进程，
 *      避免 process.execPath 在 Electron 宿主（如 DSH Desktop）里指向宿主 exe 导致崩溃）
 */
export declare function resolveElectronPath(candidates?: Array<string | undefined>): string | undefined;
/** $DSH_HOME（默认 ~/.dsh），与 ensure-electron.mjs 的 HOME 计算一致。 */
/**
 * 判断当前环境能否真的跑起 Electron 图形窗口。
 *
 * 【为什么需要】Linux 无显示环境（服务器 / 容器 / 纯 CLI）下，Electron 能被成功
 * 下载并 spawn 拉起，但初始化图形栈时立刻崩溃。配合 Helper 的守护循环
 * （异常退出自动重启），结果是每秒反复「拉起→崩溃→重启」，每个 core dump
 * 约 14MB —— 实测几小时可堆到数十 GB 打满磁盘。必须在拉起之前判断。
 *
 * 判定口径（只拦「明确跑不起来」的情况）：
 *   - win32 / darwin：桌面系统，放行（macOS 无 DISPLAY 也走 WindowServer）；
 *   - linux：需要 DISPLAY 或 WAYLAND_DISPLAY 其一，都没有则判为无显示环境。
 *
 * 【逃生口】DSH_PET_DESKTOP_FORCE=1 强制跳过，供 Xvfb / 远程桌面等
 * 「环境变量没设但其实能显示」的场景使用。
 */
export declare function hasGraphicalDisplay(): boolean;
export declare function dshHomeDir(): string;
/** Electron 落地路径：$DSH_HOME/electron/<按平台的可执行文件>。 */
export declare function defaultElectronExe(): string;
export interface EnsureElectronOptions {
    /** Electron 版本号（默认 43.3.0，可被 DSH_PET_ELECTRON_VERSION 覆盖）。 */
    version?: string;
    /** 下载镜像（默认 npmmirror，可被 DSH_PET_ELECTRON_MIRROR 覆盖）。 */
    mirror?: string;
    /** 单次下载超时（默认 10 分钟）。 */
    timeoutMs?: number;
}
/**
 * 进程内下载并解压 Electron 到 $DSH_HOME/electron。
 * 不 spawn 子进程：在 CLI node 与 Electron 宿主（DSH Desktop）里都可用，
 * 修复原 ensure-electron.mjs 用 process.execPath 调脚本导致宿主重复拉起的问题。
 * 已存在则原样返回；失败返回 undefined（不影响 DSH 与浏览器 overlay）。
 */
export declare function ensureElectronDownload(options?: EnsureElectronOptions): Promise<string | undefined>;
export declare function defaultLaunch(options?: HelperOptions): {
    command: string;
    args: string[];
};
export declare class HelperProcess {
    readonly options: HelperOptions;
    readonly logger: Logger;
    private child?;
    private stopping;
    private restartSuppressed;
    private restartTimer?;
    /** 连续崩溃计数（稳定运行 ≥3 分钟清零；达上限触发熔断） */
    private restartFailures;
    /** 最近一次 start() 的时间戳（稳定性判定基准） */
    private lastStartAt;
    /** stdout 按行缓冲（协议行按 \n 切分）。用 declare + 构造器赋值，避免类字段降级出外部 helper */
    private stdoutBuffer;
    constructor(options?: HelperOptions, logger?: Logger);
    start(): import('node:child_process').ChildProcess | undefined;
    /** stdout 按行缓冲：`dsh-pet-bridge:` 前缀整行 = 协议请求，其余 = 日志行 */
    private onStdoutChunk;
    /** 处理一条协议请求：交给宿主 bridgeHandler，结果按 id POST 回 main.js 的回调服务器
     *  （cb 由请求行携带；不走 stdin —— Electron 主进程收不到 piped stdin） */
    private handleBridgeLine;
    /** 把应答发回 main.js：优先 POST 到请求行携带的 cb（本地回调服务器）；无 cb 时回写 stdin（低版本兼容） */
    private sendBridgeResponse;
    stop(reason?: string): void;
    private scheduleRestart;
    /** 退避基值：DSH_PET_RESTART_BASE_MS（ms，>0）可调，默认 750。 */
    private resolveRestartBaseMs;
    /** 熔断阈值：DSH_PET_RESTART_MAX_FAILURES（次，>0）可调，默认 12。 */
    private resolveMaxFailures;
}
/** 稳定运行判定阈值：Helper 连续无崩溃运行 ≥ 3 分钟后，重启失败计数清零。 */
export declare const HELPER_STABLE_MS: number;
/**
 * 指数退避：第 n 次（0 起）失败后等待 base × 2ⁿ，封顶 30s。
 * 默认 base 750ms 保持与旧版首延一致，序列：750 → 1500 → 3000 → … → 30000。
 */
export declare function restartBackoffDelayMs(consecutiveFailures: number, baseMs?: number): number;
/** 熔断判定：连续崩溃 ≥ limit（默认 12，按默认退避约 6 分钟）次后不再自动重启。 */
export declare function shouldCircuitBreak(consecutiveFailures: number, limit?: number): boolean;
/** 稳定运行判定：距上次拉起 ≥ HELPER_STABLE_MS 视为一次「成功运行」，可清零计数。 */
export declare function helperRunIsStable(elapsedMs: number): boolean;
export {};
