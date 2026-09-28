/**
 * host 侧工作状态联动核心（自包含，不 import src/shared —— DSH 单文件加载约束）。
 *
 * 职责：监听 DSH `session/event`，把 6 类会话事件压缩成"当前活动工作状态"，供
 * `/dsh-pet-7340/work-status` 端点给浏览器轮询（与 balance/whisper 轮询同族）。
 * 只做聚合与去重：状态无变化不产生新输出（签名比对防刷屏）；不调用任何模型。
 *
 * 档位与 animations.events.workStatus 数组索引严格一致（顺序勿在中间插入）：
 *   0 thinking / 1 working / 2 result / 3 waiting / 4 success / 5 error
 */
/** 工作状态档位（数组索引 = events.workStatus 档位） */
export type HostWorkStatusState = 'thinking' | 'working' | 'result' | 'waiting' | 'success' | 'error';
/** 从会话事件压缩出工作状态；无变化/不关心返回 null */
export declare function reduceWorkStatus(event: {
    type?: string;
    data?: Record<string, unknown> & {
        reason?: {
            kind?: string;
        };
    };
}): HostWorkStatusState | null;
/** todo/write 的 in_progress/pending 项文本 → 任务详情；null = 无 */
export declare function currentTaskFromTodo(event: {
    data?: {
        todos?: Array<{
            status?: string;
            content?: string;
        }>;
    };
}): string | null;
/** 工作状态快照（/work-status 端点响应体）：state 为主状态；task 为 todo 详情（可 null） */
export interface WorkStatusSnapshot {
    state: HostWorkStatusState | null;
    task: string | null;
    ts: number;
}
