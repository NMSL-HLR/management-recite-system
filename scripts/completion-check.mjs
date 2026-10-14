import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import puppeteer from 'puppeteer-core'

export async function checkCompletion({ open, seed, click, text, stores, settle, scenarios, root, browser, target, executablePath, htmlPath }) {
  const pk = '346-fusion-platform-v1', mk = 'pku346-recall-v1'
  const { page, context } = await open({ withTextbook: true })
  const base = await stores(page)
  const original = base.platform.general.points[0]
  const revised = structuredClone(base)
  revised.platform.general.points[0] = { ...original, content: original.content + '\n本地笔记版本', totalReviews: 7, dueDate: Date.now() + 86400000, userNote: '保留的私人批注', leaks: [{ label: '仍需复测', due: Date.now() - 1000 }] }
  await seed(page, revised.platform, revised.mrc)
  await click(page, '设置数据', '.side')
  await click(page, '检查运动生理学教材')
  await settle(page, () => document.body.innerText.includes('导入预览'))
  assert.ok((await text(page)).includes('1 题有教材差异'))
  await click(page, '确认整合导入')
  assert.deepEqual((await stores(page)).platform.general.points[0], revised.platform.general.points[0], 'Unselected local revision must survive')
  await click(page, '设置数据', '.side'); await click(page, '检查运动生理学教材')
  await page.$eval('.warnbox[role="status"] details', n => { n.open = true })
  await page.click('.warnbox[role="status"] input[type="checkbox"]')
  await click(page, '确认整合导入')
  const updated = (await stores(page)).platform.general.points[0]
  assert.equal(updated.content, original.content)
  for (const key of ['id', 'totalReviews', 'dueDate', 'userNote', 'leaks', 'stability', 'difficulty', 'interval']) assert.deepEqual(updated[key], revised.platform.general.points[0][key])
  assert.deepEqual((await stores(page)).platform.general.logs, revised.platform.general.logs)
  scenarios.push('内置教材差异逐题确认：未选保留本地修改，选中只更新教材字段，原ID、遗漏截止、评分进度和私人批注不变')

  await click(page, '设置数据', '.side'); await click(page, '管理学详细设置')
  assert.equal(await page.$('input[type="file"]'), null)
  assert.ok((await text(page)).includes('原版日程参数（当前全科教练不使用）'))
  assert.equal(await page.$$eval('.review', lists => lists[0].querySelectorAll('li').length), 25)
  await click(page, '前往全科设置')
  assert.ok(await page.$('.file-drop input[type="file"]'))
  scenarios.push('详细设置不再重复导入入口，旧日程参数明确折叠；关系默认仅显示25条候选，全科设置保留真实文件输入与拖放区')

  const keyboardFixture = structuredClone(base)
  const keyboardTask = { id: 'keyboard-task', module: 'general', itemId: original.id, title: original.title, subject: original.subject, chapterKey: `${original.subject}::${original.quotaChapterOverride}`, isNew: true, reason: '键盘操作验证', estimatedMinutes: 10, status: 'in_progress', startedAt: Date.now() }
  keyboardFixture.platform.active = keyboardTask; keyboardFixture.platform.day.tasks = [keyboardTask]
  keyboardFixture.platform.session = { taskId: keyboardTask.id, itemId: original.id, phase: 'draft', draft: '', frozenDraft: null, checked: [], rating: null }
  await seed(page, keyboardFixture.platform, keyboardFixture.mrc)
  await click(page, '继续训练'); await page.type('textarea', '快捷键冻结稿')
  await page.keyboard.down('Control'); await page.keyboard.press('Enter'); await page.keyboard.up('Control')
  await settle(page, () => Boolean(document.querySelector('[data-rating]')))
  assert.equal((await stores(page)).platform.session.frozenDraft, '快捷键冻结稿')
  assert.ok((await text(page)).includes('已核对 0/'))
  const logCount = (await stores(page)).platform.general.logs.length
  await page.focus('#study-main'); await page.keyboard.press('2')
  assert.equal(await page.evaluate(() => document.activeElement.dataset.rating), '2')
  assert.equal((await stores(page)).platform.general.logs.length, logCount)
  await page.keyboard.press('Enter')
  await settle(page, () => document.body.innerText.includes('本轮已保存'))
  assert.equal((await stores(page)).platform.general.logs.length, logCount + 1)
  scenarios.push('Ctrl+Enter冻结通用草稿；核对计数可见；数字键只聚焦评级，Enter才生成一条原调度日志')
  await click(page, '设置数据', '.side')
  const beforeDrop = await stores(page)
  await page.$eval('.file-drop', (node, raw) => { const data = new DataTransfer(); data.items.add(new File([raw], '教材.json', { type: 'application/json' })); node.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data })) }, readFileSync(join(root, '346_Physiology_Import.json'), 'utf8'))
  await settle(page, () => document.body.innerText.includes('导入预览'))
  assert.deepEqual(await stores(page), beforeDrop)
  await click(page, '取消导入')
  assert.deepEqual(await stores(page), beforeDrop)
  scenarios.push('真实File/DataTransfer拖放进入预览，预览与取消均不写入学习数据')

  const contrast = await page.evaluate(() => {
    const root = document.documentElement, saved = { skin: root.dataset.skin, theme: root.dataset.theme }
    const probe = document.createElement('button'); probe.className = 'btn danger'; probe.textContent = '危险操作'; document.querySelector('main').append(probe)
    const rgb = value => value.match(/[\d.]+/g).map(Number)
    const luminance = c => c.slice(0,3).map(x => { x /= 255; return x <= .04045 ? x / 12.92 : ((x+.055)/1.055)**2.4 }).reduce((sum,x,i) => sum+x*[.2126,.7152,.0722][i],0)
    const results = []
    for (const skin of ['neo','hmos','gba']) for (const theme of ['light','dark']) {
      root.dataset.skin = skin; root.dataset.theme = theme
      const style = getComputedStyle(probe), foreground = rgb(style.color), background = rgb(style.backgroundColor)
      const rootColor = rgb(getComputedStyle(root).backgroundColor), alpha = background[3] ?? 1
      const bg = background.slice(0,3).map((x,i) => x*alpha + rootColor[i]*(1-alpha))
      const a = luminance(foreground), b = luminance(bg)
      results.push({ skin, theme, foreground: style.color, background: style.backgroundColor, ratio: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) })
    }
    root.dataset.skin = saved.skin; root.dataset.theme = saved.theme; probe.remove(); return results
  })
  assert.ok(contrast.every(row => row.ratio >= 4.5))
  writeFileSync(join(root, 'reports/danger-contrast.json'), JSON.stringify({ method: 'computed sRGB, translucent button background composited on root solid background; excludes gradients and other controls', results: contrast }, null, 2))
  scenarios.push('三种皮肤的明暗危险按钮文字对比均达到4.5:1；仅核验该控件的计算色，不替代整页无障碍实测')

  // Same-origin tabs must never both mount writable stores.
  const beforeSecond = await stores(page)
  const second = await context.newPage()
  await second.goto(target, { waitUntil: 'networkidle0' })
  assert.ok((await text(second)).includes('另一个窗口正在使用'))
  assert.equal(await second.$('[data-testid="start-training"]'), null)
  assert.deepEqual(await stores(page), beforeSecond)
  await page.close()
  await second.reload({ waitUntil: 'networkidle0' })
  await settle(second, () => document.body.innerText.includes('今日作战台'))
  assert.deepEqual((await stores(second)).platform.general, beforeSecond.platform.general)
  scenarios.push('同源第二窗口无法挂载写入状态，关闭第一窗口后重开可接续原数据；浏览器锁无过期抢占窗口')
  await context.close()

  // Full process restart, not just a new page. The server only serves the same standalone HTML.
  const profile = mkdtempSync(join(tmpdir(), '346-restart-profile-'))
  const launch = () => puppeteer.launch({ executablePath, userDataDir: profile, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] })
  let restartBrowser = await launch()
  let restartPage = await restartBrowser.newPage()
  await restartPage.goto(target, { waitUntil: 'networkidle0' })
  await click(restartPage, '开始训练')
  await restartPage.type('textarea', '整浏览器进程退出后仍保留的草稿')
  const beforeRestart = await stores(restartPage)
  await restartBrowser.close()
  restartBrowser = await launch()
  try {
    // Chromium may restore the previous tab automatically. Reuse it instead of opening a second writer.
    restartPage = (await restartBrowser.pages()).find(p => p.url() === target) ?? await restartBrowser.newPage()
    await restartPage.goto(target, { waitUntil: 'networkidle0' })
    await settle(restartPage, () => document.body.innerText.includes('今日作战台'))
    await click(restartPage, '继续训练')
    assert.equal(await restartPage.$eval('textarea', n => n.value), '整浏览器进程退出后仍保留的草稿')
    assert.deepEqual((await stores(restartPage)).platform.day.tasks, beforeRestart.platform.day.tasks)
  } finally { await restartBrowser.close() }
  scenarios.push('实际关闭整个Chromium进程后，使用同一磁盘配置重启，草稿、任务和预算恢复且旧锁释放')

  // Simulate a broken bundled module. Independent HTML recovery must remain usable.
  const faultContext = await browser.createBrowserContext(), broken = await faultContext.newPage()
  const syntaxErrors = []
  broken.on('pageerror', e => syntaxErrors.push(String(e)))
  await broken.setRequestInterception(true)
  const html = readFileSync(htmlPath, 'utf8').replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module">const = ;</script>')
  assert.notEqual(html, readFileSync(htmlPath, 'utf8'))
  broken.on('request', r => { if (r.isNavigationRequest()) void r.respond({ status: 200, contentType: 'text/html', body: html }); else void r.continue() })
  await broken.goto(target, { waitUntil: 'networkidle0' })
  assert.ok((await text(broken)).includes('正在打开学习程序'))
  assert.equal(syntaxErrors.length, 1)
  assert.ok(syntaxErrors[0].includes('SyntaxError'))
  await broken.evaluate(key => localStorage.setItem(key, '{broken-but-valuable'), mk)
  const downloadPath = mkdtempSync(join(tmpdir(), '346-startup-backup-'))
  await (await broken.createCDPSession()).send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath })
  await click(broken, '备份已存储的原始记录')
  let recovery
  for (let i = 0; i < 100; i++) { try { recovery = JSON.parse(readFileSync(join(downloadPath, '346-Startup-Recovery.json'), 'utf8')); break } catch {} await new Promise(r => setTimeout(r, 50)) }
  assert.equal(recovery?.raw[mk], '{broken-but-valuable')
  assert.equal(await broken.evaluate(key => localStorage.getItem(key), mk), '{broken-but-valuable')
  await faultContext.close()
  scenarios.push('模块语法损坏时React尚未启动，HTML内独立恢复入口仍可下载原始坏JSON且不改存储；预期语法错误单独核验')

  // Comparable desktop samples: baseline and current artifact, same generated history, no user data.
  const fixture = structuredClone(base)
  fixture.platform.general.points = Array.from({ length: 500 }, (_, i) => ({ ...original, id: `stress-${i}`, title: `第${i + 1}章 压力样本`, content: '测试正文与记忆原理。'.repeat(80), totalReviews: 10, state: 'review', dueDate: Date.now() - 1000 }))
  fixture.platform.general.logs = Array.from({ length: 5000 }, (_, i) => ({ id: `stress-log-${i}`, pointId: `stress-${i % 500}`, subject: original.subject, rating: 3, reviewedAt: Date.now() - (5000 - i) * 86400000 / 3, intervalBefore: 1, intervalAfter: 3, preRevealDraft: '闭卷输出样本'.repeat(10) }))
  const point = fixture.platform.general.points[0]
  const task = { id: 'stress-task', module: 'general', itemId: point.id, title: point.title, subject: point.subject, chapterKey: `${point.subject}::${point.quotaChapterOverride}`, isNew: false, reason: '压力验证', estimatedMinutes: 10, status: 'in_progress', startedAt: Date.now() }
  fixture.platform.active = task; fixture.platform.day.tasks = [task]
  fixture.platform.session = { taskId: task.id, itemId: point.id, phase: 'draft', draft: '', frozenDraft: null, checked: [], rating: null }
  const perf = { fixture: { points: 500, logs: 5000, simulatedDays: 1667, bytes: JSON.stringify(fixture.platform).length }, cpuThrottle: 4, samples: 20, units: 'milliseconds', results: {} }
  for (const [name, path] of [...(process.env.PERF_BASELINE_HTML ? [['before', process.env.PERF_BASELINE_HTML]] : []), ['after', htmlPath]]) {
    const cx = await browser.createBrowserContext(), p = await cx.newPage()
    await p.setRequestInterception(true)
    const body = readFileSync(path, 'utf8')
    p.on('request', r => { if (r.isNavigationRequest()) void r.respond({ status: 200, contentType: 'text/html', body }); else void r.continue() })
    const cdp = await p.createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const start = Date.now()
    await p.goto(target, { waitUntil: 'domcontentloaded' }); await settle(p, () => document.body.innerText.includes('今日作战台'))
    const startupMs = Date.now() - start
    await seed(p, fixture.platform, fixture.mrc)
    await click(p, '继续训练')
    const sample = await p.evaluate(async pk => {
      const times = [], writes = [], stringifies = []
      const set = Storage.prototype.setItem, stringify = JSON.stringify
      Storage.prototype.setItem = function(k, v) { const start = performance.now(); const result = set.call(this, k, v); if (k === pk) writes.push(performance.now() - start); return result }
      JSON.stringify = function(...args) { const start = performance.now(); const result = stringify.apply(JSON, args); if (args[0]?.platformVersion === 1) stringifies.push(performance.now() - start); return result }
      const input = document.querySelector('textarea')
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      for (let i = 0; i < 20; i++) {
        const start = performance.now(); setter.call(input, `第${i}次键入测试`); input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        times.push(performance.now() - start)
      }
      Storage.prototype.setItem = set; JSON.stringify = stringify
      const summary = values => { const sorted = [...values].sort((a,b) => a-b); return { count: sorted.length, median: sorted[Math.floor(sorted.length/2)], p95: sorted[Math.min(sorted.length-1, Math.ceil(sorted.length*.95)-1)], max: sorted.at(-1) } }
      return { inputToTwoFrames: summary(times), setItem: summary(writes), stringify: summary(stringifies) }
    }, pk)
    assert.equal((await stores(p)).platform.session.draft, '第19次键入测试')
    // Search the actual MRC corpus via the UI; timing includes rendering and persistence.
    await click(p, '资料库', '.side'); await click(p, '管理学 A/B 资料')
    const searchStart = Date.now()
    await p.type('[aria-label="搜索管理学原文"]', '管理')
    await settle(p, () => document.body.innerText.includes('原文页'))
    perf.results[name] = { startupMs, searchMs: Date.now() - searchStart, ...sample }
    await cx.close()
  }
  writeFileSync(join(root, 'reports/performance-audit.json'), JSON.stringify(perf, null, 2))
  scenarios.push('合成500题/5000条历史、4倍CPU限速下完成连续输入落盘；同条件测量上版与本版启动、搜索、序列化和存储延迟')
}
