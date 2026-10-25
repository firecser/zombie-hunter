#!/usr/bin/env node
/**
 * 一键回归：语法检查 + 全部 smoke 用例
 * 用法：node scripts/run_all_tests.js
 * 退出码：0 全绿 / 1 有失败
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GAME = path.join(ROOT, 'game.js');
const failed = [];
const rows = [];

function runNode(args, label) {
    try {
        const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { ok: true, out };
    } catch (e) {
        return { ok: false, out: (e.stdout || '') + (e.stderr || '') };
    }
}

// 1) 语法检查
const check = runNode(['--check', GAME], 'check');
if (!check.ok) {
    console.log('✗ game.js 语法错误');
    console.log(check.out.trim());
    process.exit(1);
}
console.log('✓ 语法检查通过');

// 2) 逐个 smoke
const smokeDir = path.join(ROOT, 'scripts');
const files = fs.readdirSync(smokeDir)
    .filter(f => /^smoke_.*\.js$/.test(f))
    .sort((a, b) => {
        // p1, p1_fix, p2, ..., p9 自然排序
        const na = parseInt(a.replace(/\D/g, ''), 10) || 0;
        const nb = parseInt(b.replace(/\D/g, ''), 10) || 0;
        return na - nb || a.localeCompare(b);
    });

for (const f of files) {
    const r = runNode([path.join('scripts', f)], f);
    const pass = r.ok && /OVERALL: PASS/.test(r.out);
    // 抓最后一行 PASS/FAIL 统计
    const lines = r.out.trim().split('\n');
    const fails = lines.filter(l => l.indexOf('FAIL') === 0);
    rows.push({ f, pass, fails });
    if (!pass) failed.push({ f, out: r.out, fails });
}

// 3) 汇总
console.log('\n=== 回归汇总 ===');
for (const r of rows) {
    console.log((r.pass ? '✓ ' : '✗ ') + r.f.padEnd(22) + (r.fails.length ? r.fails.join(' | ') : ''));
}
console.log(`\n通过 ${rows.filter(r => r.pass).length}/${rows.length}`);

if (failed.length) {
    console.log('\n--- 失败详情 ---');
    for (const f of failed) {
        console.log('\n[' + f.f + ']');
        console.log(f.out.trim().split('\n').slice(-12).join('\n'));
    }
    process.exit(1);
}
console.log('OVERALL: PASS');
