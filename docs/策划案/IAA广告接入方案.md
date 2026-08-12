# IAA 广告接入方案

## 一、前置条件（微信公众平台操作）

### 1.1 开通流量主
| 条件 | 说明 |
|------|------|
| 累计独立访客（UV）≥ **500** | 游戏需积累至少500个真实用户 |
| 完成实名认证 | 小程序/小游戏管理员实名 |
| 签约广告协议 | 在线签署《流量主协议》 |

> **通过后** → 在「微信公众平台」→「流量主」→「广告管理」创建广告位

### 1.2 创建广告位
| 广告类型 | 建议位置 | 广告位ID格式 |
|---------|---------|-------------|
| **激励视频** | 体力不足弹窗、复活、双倍奖励 | `adunit-xxxxxxxxxxxxxxxx` |
| **Banner** | 主界面底部 | `adunit-xxxxxxxxxxxxxxxx` |
| **插屏** | 关卡结束/返回主菜单时 | `adunit-xxxxxxxxxxxxxxxx` |

> 广告位ID在「流量主管理后台」创建后自动生成，一串以 `adunit-` 开头的字符串。

---

## 二、广告类型与接入位置

### 2.1 激励视频广告（Rewarded Video）— 收益最高
**API：** `wx.createRewardedVideoAd(adUnitId)`

**推荐接入点：**
| 场景 | 用户触发 | 奖励 |
|------|---------|------|
| 体力不足弹窗 → "观看广告恢复体力" | 关卡选择时体力不够 | +30体力 |
| 游戏失败 → "观看广告复活" | 角色死亡时 | 原地复活继续战斗 |
| 游戏胜利 → "双倍金币" | 关卡结算时 | 本次获得金币×2 |

### 2.2 Banner 广告 — 稳定曝光
**API：** `wx.createBannerAd(adUnitId, style)`

**推荐位置：** 主界面底部导航栏上方
- 尺寸：适合 `320x50` 或自适应
- 固定在主界面底部，不影响战斗画面

### 2.3 插屏广告（Interstitial）— 填充率高
**API：** `wx.createInterstitialAd(adUnitId)`

**推荐时机：**
- 从战斗返回主菜单时（胜利/失败/暂停返回）
- 注意频率控制，避免过于频繁

---

## 三、代码接入示例

### 3.1 激励视频广告（替换现有的 watchAdRecoverEnergy）

```javascript
// ==================== IAA 广告系统 ====================

// 广告位 ID（需替换为你在后台创建的真实 ID）
const AD_UNIT_REWARD_ENERGY = 'adunit-xxxxxxxxxxxxxxxx'; // 体力恢复
const AD_UNIT_REWARD_REVIVE = 'adunit-xxxxxxxxxxxxxxxx';  // 复活
const AD_UNIT_REWARD_DOUBLE = 'adunit-xxxxxxxxxxxxxxxx';  // 双倍金币
const AD_UNIT_BANNER = 'adunit-xxxxxxxxxxxxxxxx';         // Banner
const AD_UNIT_INTERSTITIAL = 'adunit-xxxxxxxxxxxxxxxx';   // 插屏

// 创建激励视频广告实例（全局创建，复用）
let rewardedVideoAd = null;

function createRewardedVideoAd(adUnitId) {
    if (wx.createRewardedVideoAd) {
        const videoAd = wx.createRewardedVideoAd({ adUnitId });
        
        videoAd.onLoad(() => {
            console.log('激励视频广告加载成功');
        });
        
        videoAd.onError((err) => {
            console.error('激励视频广告加载失败', err);
            // err.errCode 常见值：
            // 1000: 后端接口调用失败
            // 1001: 参数错误
            // 1002: 广告单元无效
            // 1003: 内部错误
            // 1004: 无适合的广告
            // 1005: 广告组件审核中
            // 1006: 广告组件被驳回
        });
        
        return videoAd;
    }
    return null;
}

// 观看激励视频广告（带回调）
function showRewardedVideoAd(adUnitId, onRewarded) {
    const videoAd = createRewardedVideoAd(adUnitId);
    if (!videoAd) {
        wx.showToast({ title: '广告组件不可用', icon: 'none' });
        return;
    }
    
    videoAd.show().then(() => {
        // 广告展示成功
    }).catch((err) => {
        // 广告展示失败，尝试重新加载
        videoAd.load().then(() => {
            videoAd.show();
        }).catch(() => {
            wx.showToast({ title: '广告加载失败，请重试', icon: 'none' });
        });
    });
    
    videoAd.onClose((res) => {
        if (res && res.isEnded) {
            // 完整观看广告 → 发放奖励
            if (onRewarded) onRewarded();
        } else {
            // 未完整观看
            wx.showToast({ title: '请看完完整广告', icon: 'none' });
        }
    });
}

// 替换原有的 watchAdRecoverEnergy
function watchAdRecoverEnergy() {
    if (adEnergyCount >= MAX_AD_ENERGY_PER_DAY) {
        wx.showToast({ title: '今日观看次数已用完', icon: 'none' });
        return;
    }
    
    showRewardedVideoAd(AD_UNIT_REWARD_ENERGY, () => {
        adEnergyCount++;
        recoverEnergy(AD_ENERGY_RECOVER);
        wx.showToast({ title: '体力恢复 +' + AD_ENERGY_RECOVER, icon: 'none' });
        
        // 检查体力是否足够开始关卡
        const energyCost = getEnergyCost(energyModal.targetStage);
        if (playerEnergy >= energyCost) {
            energyModal.show = false;
        }
    });
}
```

### 3.2 Banner 广告（主界面底部）

```javascript
// 创建 Banner 广告
let bannerAd = null;

function createBannerAd() {
    if (!wx.createBannerAd) return;
    
    bannerAd = wx.createBannerAd({
        adUnitId: AD_UNIT_BANNER,
        style: {
            left: 0,
            top: screenHeight - 60, // 底部导航栏上方
            width: screenWidth,
            height: 50
        }
    });
    
    bannerAd.onError((err) => {
        console.error('Banner广告加载失败', err);
    });
    
    bannerAd.onResize((res) => {
        // Banner 实际加载后可能调整尺寸
        bannerAd.style.top = screenHeight - res.height;
    });
    
    return bannerAd;
}

// 显示/隐藏 Banner
function showBanner() {
    if (bannerAd) {
        bannerAd.show();
    } else {
        createBannerAd();
    }
}

function hideBanner() {
    if (bannerAd) {
        bannerAd.hide();
    }
}
```

### 3.3 插屏广告（关卡流转时）

```javascript
// 创建插屏广告
let interstitialAd = null;

function createInterstitialAd() {
    if (!wx.createInterstitialAd) return;
    
    interstitialAd = wx.createInterstitialAd({
        adUnitId: AD_UNIT_INTERSTITIAL
    });
    
    interstitialAd.onError((err) => {
        console.error('插屏广告加载失败', err);
    });
    
    interstitialAd.onClose(() => {
        // 插屏关闭后的逻辑
        console.log('插屏广告关闭');
    });
    
    return interstitialAd;
}

// 显示插屏广告
function showInterstitial() {
    if (interstitialAd) {
        interstitialAd.show().catch(() => {
            // 预加载失败，尝试重新加载再展示
            interstitialAd.load().then(() => {
                interstitialAd.show();
            }).catch(() => {
                console.log('插屏广告不可用');
            });
        });
    } else {
        createInterstitialAd();
    }
}
```

---

## 四、广告生命周期管理

### 4.1 显示/隐藏策略
| 游戏状态 | Banner | 插屏预加载 |
|---------|--------|-----------|
| 主界面 | ✅ 显示 | ✅ 预加载 |
| 战斗中 | ❌ 隐藏 | ❌ |
| 暂停 | ❌ 隐藏 | ❌ |
| 胜利/失败结算 | ❌ 隐藏 | ✅ 显示一次 |
| 返回主界面 | ✅ 显示 | ✅ 预加载 |

### 4.2 频率控制
- 插屏广告间隔建议 ≥ 60 秒
- 激励视频每人每天建议 ≤ 10 次
- Banner 不限制但不宜遮挡 UI

---

## 五、代码改动清单

| 文件 | 改动 |
|------|------|
| `game.js` | 新增广告系统代码（`IAA_AD_UNITS`、`RewardedVideo`、`Banner`、`Interstitial`） |
| `game.js` | 替换 `watchAdRecoverEnergy()` 中的 `wx.showModal` 为真实激励视频 |
| `game.js` | 主界面渲染时根据状态显示/隐藏 Banner |
| `game.js` | 关卡胜利/失败返回时触发插屏广告 |

---

## 六、注意事项

1. **广告位ID** 在流量主后台创建后不可更改，创建确认后记录下来
2. **测试阶段**：在微信开发者工具中，广告位可用测试 ID：
   - 激励视频：`adunit-xxxxxxxxxxxxxxxx`（用 `wx.createRewardedVideoAd` 测试）
   - 更多信息参考：[微信小游戏广告文档](https://developers.weixin.qq.com/minigame/dev/guide/open-ability/ad/rewarded-video.html)
3. **审核风险**：激励视频必须给足奖励，否则审核可能驳回
4. **广告填充率**：新广告位初期可能有空填充的情况，建议多做几个广告位备用
5. **上线前**：需要在微信开发者工具中关闭"不校验...域名"选项，并配置合法域名
