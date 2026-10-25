# -*- coding: utf-8 -*-
# v2.22：接入「场景分析」——wx.reportUserBehaviorBranchAnalytics（曝光/点击 + branchDim=关卡）
import io

PATH = 'game.js'
s = io.open(PATH, encoding='utf-8').read()

def rep(a, b, tag):
    global s
    assert a in s, tag
    s = s.replace(a, b, 1)

# ---------- 0) 状态 ----------
rep("let chestDouble = null;       // { x, y, until, kind } 宝箱翻倍提示",
    "let chestDouble = null;       // { x, y, until, kind } 宝箱翻倍提示\nlet bombAdExposed = false;    // v2.22：炸弹补弹曝光是否已上报", 'bombflag')

# ---------- 1) branchId 配置 + 上报函数 ----------
rep("""// ===== v2.21 埋点 ======""",
"""// ===== v2.22 场景分析（统计 → 场景分析）=====
// 后台「新建场景」后，点「获取代码」拿到每个行为分支的 branchId，填到这里。
// branchDim 只能传 1–100 的整数（平台限制），这里用「关卡号」当拆分维度。
// 未填 branchId 的点位不会上报，也不会报错。
const AD_BRANCH = {
    bomb:        '',   // 炸弹补弹（看广告）
    shield:      '',   // 盾兵援军
    revive:      '',   // 守将复活
    reroll:      '',   // 三选一换一批
    chest:       '',   // 宝箱 ×2
    double_gold: ''    // 结算双倍金币
};

// eventType: 1=曝光，2=点击
function reportBranch(slot, eventType) {
    try {
        const bid = AD_BRANCH[slot];
        if (!bid) return;
        if (typeof wx === 'undefined' || !wx.reportUserBehaviorBranchAnalytics) return;
        const dim = Math.max(1, Math.min(100, currentStage || 1));
        wx.reportUserBehaviorBranchAnalytics({
            branchId: bid,
            branchDim: String(dim),
            eventType: eventType
        });
    } catch (e) { /* 埋点异常不影响玩法 */ }
}

// ===== v2.21 埋点 ======""", 'cfg')

# ---------- 2) 点击：所有广告统一在 showRewardedAd 里上报 ----------
rep("""    const _slot = slot || 'unknown';
    track('ad_show', {""",
"""    const _slot = slot || 'unknown';
    reportBranch(_slot, 2);   // 场景分析：点击
    track('ad_show', {""", 'click')

# ---------- 3) 曝光：各点位出现时上报 ----------
# 盾兵出现
rep("""                    AudioSystem.playPickup();
                    vibrate('light');""",
"""                    AudioSystem.playPickup();
                    vibrate('light');
                    reportBranch('shield', 1);   // 场景分析：盾兵曝光""", 'exp-shield')

# 复活窗口出现
rep("""                if (wallLives <= 0 && !reviveUsed) {
                    reviveOfferUntil = now + REVIVE_OFFER_MS;
                    gamePaused = true;
                }""",
"""                if (wallLives <= 0 && !reviveUsed) {
                    reviveOfferUntil = now + REVIVE_OFFER_MS;
                    gamePaused = true;
                    reportBranch('revive', 1);   // 场景分析：复活曝光
                }""", 'exp-revive')

# 宝箱 ×2 提示出现
rep("""            if (chestAdUsed < CHEST_AD_MAX) {
                chestDouble = { x: c.x, y: c.y, until: now + 4000, kind: kind };
            }""",
"""            if (chestAdUsed < CHEST_AD_MAX) {
                chestDouble = { x: c.x, y: c.y, until: now + 4000, kind: kind };
                reportBranch('chest', 1);    // 场景分析：宝箱 ×2 曝光
            }""", 'exp-chest')

# 三选一面板出现（每次生成都算一次曝光）
rep("""    upgradeOptions = isSkillLab ? cards : weightedPick3(cards);
    selectedUpgrade = -1;""",
"""    upgradeOptions = isSkillLab ? cards : weightedPick3(cards);
    selectedUpgrade = -1;
    if (!isSkillLab && rerollAdUsed < REROLL_AD_MAX) reportBranch('reroll', 1);   // 场景分析：换一批曝光""", 'exp-reroll')

# 结算双倍金币曝光
rep("""    // v2.19：0 漏通关奖励""",
"""    if (!doubleGoldUsed) reportBranch('double_gold', 1);   // 场景分析：结算双倍金币曝光

    // v2.19：0 漏通关奖励""", 'exp-double')

# 炸弹补弹曝光：当炸弹为 0 且本关还有广告次数时（每次关卡开始后只报一次）
rep("""    chests = [];
    wallLivesMax = WALL_LIVES_BASE;""",
"""    chests = [];
    bombAdExposed = false;
    wallLivesMax = WALL_LIVES_BASE;""", 'reset-bombflag')

io.open(PATH, 'w', encoding='utf-8', newline='').write(s)
print('PATCH_OK v2.22')
