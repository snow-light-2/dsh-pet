// 应用标题栏的「桌宠按钮」：取代桌宠身上那个常驻小箭头。
//
// 位置：`conversation.session.header.utilities` —— 会话右上角那排工具按钮（📁 / ⋯ / ⧉ 同一排，
// 窗口控件正下方）。这是**会话内**槽位：欢迎页（hero）不渲染会话头，此时看不到按钮。
//
// 交互：点按钮弹出**自绘 HTML 菜单**（浮层经 createPortal 挂 document.body —— 槽位 DOM 会被
// 外壳的 overflow/拖拽区裁切，挂 body 才不会被挡）。菜单项：
//   显示桌宠 / 隐藏桌宠（按当前状态取反）、退出桌宠（重开 DSH 恢复）、回到初始位置、查看余额。
//
// 落地：菜单只把一条命令 POST 给宿主 `/dsh-pet-7340/desktop`，宿主转发给 Electron helper 的
// 回调服务器 —— 窗口显隐与「隐藏态是否写盘」只有 helper 主进程做得到（渲染端只画本体）。
/* eslint-disable @typescript-eslint/no-explicit-any -- DSH 注入的 h/React 钩子与 createPortal 无静态类型 */
type AnyFn = (...args: any[]) => any;

/** 宿主路由：GET 取状态，POST 下发命令（host 侧见 src/host/index.ts 的 rest === 'desktop'） */
export const TITLEBAR_ROUTE = '/dsh-pet-7340/desktop';

const CSS_ID = 'dsh-pet-titlebar-css';

/** 样式只注入一次（外壳里可能有多个会话头同时挂载） */
const CSS = [
  '.dsh-pet-tb{position:relative;display:inline-flex;align-items:center;-webkit-app-region:no-drag;app-region:no-drag}',
  '.dsh-pet-tb-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;font-size:15px;line-height:1;cursor:pointer;opacity:.85;transition:background .15s ease,opacity .15s ease}',
  '.dsh-pet-tb-btn:hover{background:rgba(255,255,255,.14);opacity:1}',
  '.dsh-pet-tb-btn[data-open="1"]{background:rgba(255,255,255,.18);opacity:1}',
  // 桌宠被隐藏时按钮变灰，避免「点完隐藏就找不到桌宠、也看不出按钮状态」
  '.dsh-pet-tb-btn[data-hidden="1"]{opacity:.45;filter:grayscale(1)}',
  '.dsh-pet-tb-menu{position:fixed;z-index:2147483000;min-width:210px;padding:6px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(26,31,48,.98);color:#eef1ff;box-shadow:0 16px 40px rgba(0,0,0,.45);-webkit-app-region:no-drag}',
  '.dsh-pet-tb-item{display:block;width:100%;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;text-align:left;cursor:pointer}',
  '.dsh-pet-tb-item:hover{background:rgba(255,255,255,.14)}',
  '.dsh-pet-tb-sep{height:1px;margin:5px 8px;background:rgba(255,255,255,.14)}',
  '.dsh-pet-tb-note{padding:6px 10px;font-size:12px;line-height:1.5;color:#ffd8a0}',
].join('');

function injectCss(): void {
  if (typeof document === 'undefined' || document.getElementById(CSS_ID)) return;
  const style = document.createElement('style');
  style.id = CSS_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export interface TitlebarDeps {
  h: AnyFn;
  useState: AnyFn;
  useEffect: AnyFn;
  useRef: AnyFn;
  /** react-dom 的 createPortal（浮层挂 body，避开槽位裁切）；外壳没提供时为 null，退化成就地渲染 */
  createPortal: AnyFn | null;
}

/**
 * 返回标题栏按钮组件。状态来自宿主 GET（helper 真实隐藏态），命令走宿主 POST ——
 * 前端不猜状态：隐藏/显示后立刻回读，按钮文案永远与桌宠实际显隐一致。
 */
export function makePetTitlebarMenu({ h, useState, useEffect, useRef, createPortal }: TitlebarDeps): AnyFn {
  return function PetTitlebarMenu() {
    const [open, setOpen] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [helperOk, setHelperOk] = useState(true);
    const [pos, setPos] = useState({ top: 0, right: 12 });
    const btnRef = useRef<any>(null);

    const refresh = async (): Promise<void> => {
      try {
        const res = await fetch(TITLEBAR_ROUTE, { headers: { accept: 'application/json' } });
        const data = await res.json();
        setHidden(data?.hidden === true);
        setHelperOk(data?.ok !== false);
      } catch {
        setHelperOk(false);
      }
    };

    useEffect(() => {
      injectCss();
      void refresh();
    }, []);

    // 打开期间：定位到按钮正下方、点外部/Esc 关掉、每次打开都回读一次状态
    useEffect(() => {
      if (!open) return undefined;
      const el = btnRef.current;
      if (el && typeof el.getBoundingClientRect === 'function') {
        const r = el.getBoundingClientRect();
        setPos({ top: Math.round(r.bottom + 6), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
      }
      const onDown = (event: any): void => {
        const host = btnRef.current;
        if (host && event.target instanceof Node && host.contains(event.target)) return;
        setOpen(false);
      };
      const onKey = (event: any): void => {
        if (event.key === 'Escape') setOpen(false);
      };
      document.addEventListener('mousedown', onDown, true);
      document.addEventListener('keydown', onKey, true);
      void refresh();
      return () => {
        document.removeEventListener('mousedown', onDown, true);
        document.removeEventListener('keydown', onKey, true);
      };
    }, [open]);

    const send = async (command: string): Promise<void> => {
      setOpen(false);
      try {
        const res = await fetch(TITLEBAR_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ command }),
        });
        const data = await res.json();
        if (typeof data?.hidden === 'boolean') setHidden(data.hidden);
        setHelperOk(data?.ok !== false);
      } catch {
        setHelperOk(false);
      }
    };

    const items: Array<Record<string, unknown>> = [
      { label: hidden ? '显示桌宠' : '隐藏桌宠', command: hidden ? 'show' : 'hide' },
      { label: '退出桌宠（重开 DSH 恢复）', command: 'exit' },
      { separator: true },
      { label: '回到初始位置', command: 'home' },
      { label: '查看余额', command: 'balance' },
    ];

    const menu = h(
      'div',
      { className: 'dsh-pet-tb-menu', role: 'menu', style: { top: pos.top + 'px', right: pos.right + 'px' } },
      [
        ...items.map((item, index) =>
          item.separator
            ? h('div', { key: 'sep' + index, className: 'dsh-pet-tb-sep' })
            : h(
                'button',
                {
                  key: String(item.command),
                  type: 'button',
                  role: 'menuitem',
                  className: 'dsh-pet-tb-item',
                  onClick: () => {
                    void send(String(item.command));
                  },
                },
                String(item.label),
              ),
        ),
        helperOk ? null : h('div', { key: 'note', className: 'dsh-pet-tb-note' }, '桌宠桌面端没在跑（设置 → 桌宠配置里可重新拉起）'),
      ].filter(Boolean),
    );

    return h('div', { className: 'dsh-pet-tb', ref: btnRef }, [
      h(
        'button',
        {
          key: 'btn',
          type: 'button',
          className: 'dsh-pet-tb-btn',
          title: hidden ? '桌宠已隐藏 — 点击可显示' : '桌宠（显示 / 隐藏 / 退出）',
          'data-open': open ? '1' : '0',
          'data-hidden': hidden ? '1' : '0',
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          onClick: () => setOpen(!open),
        },
        '🐾',
      ),
      open ? (typeof document !== 'undefined' && createPortal ? createPortal(menu, document.body) : menu) : null,
    ]);
  };
}
