export const CSS = `
:root { --accent: #f0c040; --accent2: #7dff9a; --ink: #e9eef2; --panel: rgba(12,15,18,.82); }
* { box-sizing: border-box; }
.ae-layer { position: fixed; inset: 0; z-index: 20; display: none; font-family: "Segoe UI", system-ui, Arial, sans-serif; color: var(--ink); user-select: none; }
.ae-layer.on { display: flex; }
#ae-menu { align-items: center; justify-content: center; background: radial-gradient(ellipse at 30% 40%, rgba(10,14,18,.45), rgba(5,7,9,.88)); }
.ae-card { width: min(94vw, 960px); display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; padding: 34px 38px; background: var(--panel); border: 1px solid rgba(255,255,255,.12); border-radius: 10px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
@media (max-width: 760px) { .ae-card { grid-template-columns: 1fr; padding: 22px; } }
.ae-logo { font-size: clamp(34px, 6vw, 58px); font-weight: 900; letter-spacing: 4px; line-height: .95; text-transform: uppercase; }
.ae-logo b { color: var(--accent); display: block; }
.ae-sub { margin: 10px 0 22px; opacity: .65; letter-spacing: 1px; font-size: 13px; text-transform: uppercase; }
.ae-btns { display: flex; flex-direction: column; gap: 9px; }
.ae-btn { font: 700 15px/1 inherit; letter-spacing: 1.5px; text-transform: uppercase; text-align: left; padding: 14px 18px; color: var(--ink); background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); border-radius: 6px; cursor: pointer; transition: background .12s, border-color .12s; }
.ae-btn:hover:not(:disabled) { background: rgba(240,192,64,.16); border-color: var(--accent); }
.ae-btn.primary { background: linear-gradient(180deg, #ffe28a, #f0c040); color: #1a1a1a; border-color: #a87e10; }
.ae-btn.primary:hover { background: linear-gradient(180deg, #fff0b0, #ffd863); }
.ae-btn:disabled { opacity: .4; cursor: default; }
.ae-btn small { display: block; font-weight: 400; letter-spacing: .5px; text-transform: none; opacity: .7; margin-top: 4px; font-size: 12px; }
.ae-keys { font-size: 13px; line-height: 1.9; }
.ae-keys h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: var(--accent); }
.ae-keys div { display: flex; gap: 10px; align-items: center; }
.ae-keys kbd { flex: 0 0 112px; text-align: center; padding: 1px 6px; font: 700 11px/1.6 inherit; background: #1d1f20; border: 1px solid #666; border-radius: 3px; }
.ae-ver { position: fixed; left: 0; right: 0; bottom: 10px; text-align: center; font-size: 11px; letter-spacing: 2px; opacity: .5; z-index: 25; pointer-events: none; font-family: monospace; }
#ae-pause { align-items: center; justify-content: center; background: rgba(0,0,0,.55); }
#ae-pause .ae-card { grid-template-columns: 1fr; width: min(92vw, 420px); }
#ae-settings { align-items: center; justify-content: center; background: rgba(0,0,0,.7); z-index: 30; }
#ae-settings .ae-card { grid-template-columns: 1fr; width: min(92vw, 460px); gap: 14px; }
.ae-row { display: grid; grid-template-columns: 130px 1fr 48px; align-items: center; gap: 12px; font-size: 14px; }
.ae-row input[type=range] { width: 100%; accent-color: var(--accent); }
.ae-row output { text-align: right; font-family: monospace; opacity: .8; }
.ae-row select { grid-column: 2 / 4; background: #1d1f20; color: var(--ink); border: 1px solid #666; padding: 5px; border-radius: 4px; }
.ae-row label.sw { grid-column: 2 / 4; display: flex; gap: 8px; align-items: center; }
#ae-hud { pointer-events: none; z-index: 10; }
#ae-hud.on { display: block; }
#ae-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
#ae-cross i { position: absolute; background: var(--ch, #7dff9a); box-shadow: 0 0 2px #000; }
#ae-cross .t { width: 2px; height: 9px; left: -1px; } #ae-cross .b { width: 2px; height: 9px; left: -1px; }
#ae-cross .l { height: 2px; width: 9px; top: -1px; } #ae-cross .r { height: 2px; width: 9px; top: -1px; }
#ae-cross .d { width: 2px; height: 2px; left: -1px; top: -1px; }
#ae-hitm { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; opacity: 0; transition: opacity .25s; }
#ae-hitm.on { opacity: 1; transition: none; }
#ae-hitm i { position: absolute; left: 50%; top: 50%; width: 11px; height: 2px; background: #fff; transform-origin: 0 50%; }
#ae-hitm i:nth-child(1) { transform: rotate(45deg) translate(5px, -1px); } #ae-hitm i:nth-child(2) { transform: rotate(135deg) translate(5px, -1px); }
#ae-hitm i:nth-child(3) { transform: rotate(225deg) translate(5px, -1px); } #ae-hitm i:nth-child(4) { transform: rotate(315deg) translate(5px, -1px); }
#ae-hitm.head i { background: #ff4a4a; } #ae-hitm.kill i { background: #ff4a4a; width: 15px; }
.ae-hp { position: absolute; left: 26px; bottom: 26px; width: 260px; }
.ae-hp .num { font: 900 40px/1 "Segoe UI", system-ui, sans-serif; text-shadow: 0 2px 6px #000; } .ae-hp .num small { font-size: 14px; opacity: .7; margin-left: 4px; }
.ae-hp .bar { height: 8px; margin-top: 6px; background: rgba(0,0,0,.55); border: 1px solid rgba(255,255,255,.25); } .ae-hp .bar i { display: block; height: 100%; background: linear-gradient(90deg, #4cff6a, #9dff6a); }
.ae-ammo { position: absolute; right: 26px; bottom: 26px; text-align: right; text-shadow: 0 2px 6px #000; }
.ae-ammo .name { font-size: 13px; letter-spacing: 2px; text-transform: uppercase; opacity: .85; }
.ae-ammo .n { font: 900 46px/1 "Segoe UI", system-ui, sans-serif; } .ae-ammo .n small { font-size: 20px; opacity: .65; margin-left: 4px; }
.ae-ammo .rl { height: 4px; width: 160px; margin: 6px 0 0 auto; background: rgba(0,0,0,.5); display: none; } .ae-ammo .rl i { display: block; height: 100%; background: var(--accent); }
.ae-slots { display: flex; gap: 6px; justify-content: flex-end; margin-bottom: 10px; }
.ae-slots span { min-width: 34px; padding: 4px 6px; text-align: center; font: 700 11px/1.3 "Segoe UI", sans-serif; background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.2); opacity: .7; }
.ae-slots span.on { background: rgba(240,192,64,.85); color: #1a1a1a; opacity: 1; border-color: #a87e10; }
.ae-stats { position: absolute; left: 22px; top: 18px; font-size: 13px; line-height: 1.55; text-shadow: 0 1px 4px #000; background: rgba(0,0,0,.35); padding: 8px 12px; border-left: 3px solid var(--accent); }
.ae-stats b { display: inline-block; min-width: 86px; opacity: .75; font-weight: 600; }
.ae-feed { position: absolute; right: 22px; top: 18px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.ae-feed div { padding: 4px 10px; background: rgba(0,0,0,.55); border-right: 3px solid var(--accent); font-size: 13px; animation: aefeed 4s forwards; } .ae-feed div.head { border-color: #ff4a4a; }
@keyframes aefeed { 0%, 80% { opacity: 1; } 100% { opacity: 0; } }
.ae-pop { position: absolute; font: 800 18px/1 "Segoe UI", sans-serif; color: #fff; text-shadow: 0 1px 3px #000, 0 0 6px #000; transform: translate(-50%, -50%); animation: aepop .7s ease-out forwards; }
.ae-pop.head { color: #ff6a5a; font-size: 24px; }
@keyframes aepop { from { opacity: 1; margin-top: 0; } to { opacity: 0; margin-top: -46px; } }
.ae-msg { position: absolute; left: 50%; top: 62%; transform: translateX(-50%); font-size: 15px; letter-spacing: 2px; text-transform: uppercase; text-shadow: 0 2px 6px #000; opacity: .9; }
#ae-scope { position: absolute; inset: 0; display: none; background: radial-gradient(circle at 50% 50%, transparent 0, transparent 30vmin, #000 30.3vmin); }
#ae-scope i { position: absolute; background: #000; } #ae-scope .h { left: 0; right: 0; top: 50%; height: 1px; } #ae-scope .v { top: 0; bottom: 0; left: 50%; width: 1px; }
.ae-fps { position: absolute; right: 22px; bottom: 120px; font: 11px monospace; opacity: .5; }
`;
