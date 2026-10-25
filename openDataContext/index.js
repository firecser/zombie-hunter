/**
 * 微信小游戏 · 开放数据域（子域）
 * 职责：读取好友云存储成绩 → 渲染成一张图（sharedCanvas）交给主域绘制。
 * 隐私要求：好友数据只在本域内使用，不得外传、不得落库。
 */
const sharedCanvas = wx.getSharedCanvas();
const sctx = sharedCanvas.getContext('2d');

let lastRenderKey = '';
let cache = { list: [], at: 0, error: null };

function fmtPower(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    return String(n);
}

function parseBest(kv) {
    try {
        const o = JSON.parse(kv.value || '{}');
        return {
            lv: Number(o.lv) || 0,
            cleared: Number(o.cleared) || 0,
            power: Number(o.power) || 0,
            ts: Number(o.ts) || 0
        };
    } catch (e) {
        return { lv: 0, cleared: 0, power: 0, ts: 0 };
    }
}

function draw(width, height, data) {
    sharedCanvas.width = width;
    sharedCanvas.height = height;

    sctx.clearRect(0, 0, width, height);

    if (!data || !data.length) {
        sctx.fillStyle = '#9fb0c4';
        sctx.font = 'bold 15px sans-serif';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText('还没有好友上榜', width / 2, height / 2 - 12);
        sctx.fillStyle = 'rgba(160,180,200,0.8)';
        sctx.font = '12px sans-serif';
        sctx.fillText('分享给好友，一起冲榜', width / 2, height / 2 + 14);
        return;
    }

    const rowH = 46;
    const gap = 4;
    data.slice(0, 10).forEach((item, i) => {
        const y = i * (rowH + gap);
        if (y > height - rowH) return;

        // 行底
        sctx.fillStyle = i < 3 ? 'rgba(255, 210, 74, 0.10)' : 'rgba(255,255,255,0.05)';
        sctx.beginPath();
        const r = 9;
        const w = width - 4;
        sctx.moveTo(2 + r, y);
        sctx.arcTo(2 + w, y, 2 + w, y + rowH, r);
        sctx.arcTo(2 + w, y + rowH, 2, y + rowH, r);
        sctx.arcTo(2, y + rowH, 2, y, r);
        sctx.arcTo(2, y, 2 + w, y, r);
        sctx.closePath();
        sctx.fill();

        // 名次
        sctx.textAlign = 'left';
        sctx.textBaseline = 'middle';
        sctx.fillStyle = i < 3 ? '#ffd23a' : '#7f93a8';
        sctx.font = 'bold 14px sans-serif';
        sctx.fillText(String(i + 1), 14, y + rowH / 2);

        // 头像（有则画，没有用圆底 + 首字）
        const ax = 44, ay = y + rowH / 2, ar = 14;
        sctx.save();
        sctx.beginPath();
        sctx.arc(ax, ay, ar, 0, Math.PI * 2);
        sctx.fillStyle = 'rgba(120,150,180,0.35)';
        sctx.fill();
        sctx.clip();
        if (item.avatarUrl) {
            try {
                const img = wx.createImage();
                img.onload = () => { try { sctx.drawImage(img, ax - ar, ay - ar, ar * 2, ar * 2); } catch (e) {} };
                img.src = item.avatarUrl;
            } catch (e) {}
        }
        sctx.restore();

        // 昵称
        sctx.fillStyle = '#e6f0fa';
        sctx.font = 'bold 13px sans-serif';
        const name = String(item.nickname || '好友').slice(0, 8);
        sctx.fillText(name, 66, y + rowH / 2 - 6);

        // 进度
        sctx.fillStyle = '#7f93a8';
        sctx.font = '10px sans-serif';
        sctx.fillText('第 ' + item.lv + ' 关 · 通关 ' + item.cleared, 66, y + rowH / 2 + 10);

        // 战力
        sctx.textAlign = 'right';
        sctx.fillStyle = '#ffd23a';
        sctx.font = 'bold 12px sans-serif';
        sctx.fillText(fmtPower(item.power), width - 16, y + rowH / 2);
    });
}

function fetchAndDraw(width, height) {
    wx.getFriendCloudStorage({
        keyList: ['best'],
        success(res) {
            const list = (res.data || [])
                .map(d => {
                    const nick = d.nickname || (d.WXContext && d.WXContext.nickname) || '好友';
                    const avatar = d.avatarUrl || (d.WXContext && d.WXContext.avatarUrl) || '';
                    const kv = (d.KVDataList || [])[0];
                    const b = kv ? parseBest(kv) : { lv: 0, cleared: 0, power: 0, ts: 0 };
                    return { nickname: nick, avatarUrl: avatar, lv: b.lv, cleared: b.cleared, power: b.power, ts: b.ts };
                })
                .filter(x => x.power > 0 || x.cleared > 0)
                .sort((a, b) => (b.power - a.power) || (b.cleared - a.cleared) || (b.ts - a.ts));

            cache = { list, at: Date.now(), error: null };
            draw(width, height, list);
        },
        fail(err) {
            cache = { list: [], at: Date.now(), error: err };
            draw(width, height, []);
        }
    });
}

wx.onMessage((msg) => {
    if (!msg) return;
    if (msg.type === 'render') {
        const w = Math.max(1, Math.round(msg.width || 300));
        const h = Math.max(1, Math.round(msg.height || 400));
        const key = w + 'x' + h;
        // 1.5s 内同一尺寸不重复拉取，避免频繁请求云存储
        if (key === lastRenderKey && Date.now() - cache.at < 1500) {
            draw(w, h, cache.list);
            return;
        }
        lastRenderKey = key;
        fetchAndDraw(w, h);
    }
});
