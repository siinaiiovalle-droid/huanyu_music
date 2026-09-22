'use strict';
/**
 * 把「每日生产流水线」注册成 Windows 计划任务。
 *
 *   node scripts/install-daily-task.js              # 每天 07:30 自动生产 3 首纯音乐 + 3 首歌曲
 *   node scripts/install-daily-task.js --at=22:00   # 换一个触发时间
 *   node scripts/install-daily-task.js --dry        # 试跑 5 分钟后执行一次（验证任务能否跑通）
 *   node scripts/install-daily-task.js --uninstall  # 删除计划任务
 *
 * 说明：以当前用户身份注册，不需要管理员权限；人声合成依赖 Windows 语音合成（需用户会话），
 *       因此采用「只在用户登录时运行」的交互式注册方式。
 */
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BAT = path.join(__dirname, 'run-daily.bat');
const TASK_NAME = '寰宇音乐台-每日作曲';

function arg(name, def) {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
}
const has = (name) => process.argv.slice(2).includes(`--${name}`);

function run(exe, args) {
  const r = spawnSync(exe, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

function query() {
  const ps = spawnSync('powershell', [
    '-NoProfile', '-NonInteractive', '-Command',
    `Get-ScheduledTask -TaskName "${TASK_NAME}" | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; "$($_.State)|$($i.NextRunTime)" }`
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  if (ps.status !== 0) return { state: '-', next: '-' };
  const [state, next] = (ps.stdout || '').trim().split('|');
  return { state: state || '-', next: next || '-' };
}

function uninstall() {
  const r = run('schtasks', ['/Delete', '/TN', TASK_NAME, '/F']);
  console.log(r.ok ? `已删除计划任务：${TASK_NAME}` : `删除失败：${r.out}`);
  process.exit(r.ok ? 0 : 1);
}

function main() {
  if (has('uninstall')) return uninstall();

  const at = arg('at', '07:30');
  if (!/^\d{2}:\d{2}$/.test(at)) {
    console.error(`时间格式应为 HH:MM，收到：${at}`);
    process.exit(1);
  }

  // /TR 整体带引号，内部路径再用一对引号包裹（cmd /c "…bat"），空格与中文路径都不会被截断
  const tr = `"cmd.exe /c ""${BAT}"""`;
  const base = ['/Create', '/TN', TASK_NAME, '/TR', tr, '/SC', 'DAILY', '/ST', at, '/RL', 'LIMITED', '/F'];

  let r = run('schtasks', has('dry') ? ['/Create', '/TN', TASK_NAME, '/TR', tr, '/SC', 'ONCE', '/ST', at, '/RL', 'LIMITED', '/F'] : base);
  if (!r.ok && /已存在|already exists/i.test(r.out)) {
    r = run('schtasks', ['/Change', '/TN', TASK_NAME, '/TR', tr, '/ST', at, ...(has('dry') ? [] : [])]);
  }
  if (!r.ok) {
    console.error('注册失败：' + r.out);
    process.exit(1);
  }
  console.log(r.out.split('\n').filter(Boolean).slice(-2).join('\n'));

  const info = query();
  {
    console.log('\n============================================');
    console.log(` 计划任务：${TASK_NAME}`);
    console.log(` 触发时间：每天 ${at}`);
    console.log(` 状态    ：${info.state}`);
    console.log(` 下次运行：${info.next}`);
    console.log(` 入口脚本：${BAT}`);
    console.log(` 工作目录：${ROOT}`);
    console.log(` 日志    ：${path.join(ROOT, 'build', 'daily.log')}`);
    console.log('============================================');
  }

  if (has('dry')) {
    // 立即试跑一次，用来验证任务能否正常启动（真正产出请用不带 --dry 的注册）
    console.log('\n正在试跑一次…');
    const t = run('schtasks', ['/Run', '/TN', TASK_NAME]);
    console.log(t.ok ? '试跑已触发，等待一分钟后查看 build/daily.log' : '试跑失败：' + t.out);
  } else {
    console.log('提示：手动试跑 → schtasks /Run /TN "' + TASK_NAME + '"');
    console.log('      查看日志 → Get-Content build\\daily.log -Tail 40（或直接用编辑器打开）');
  }
}

main();
