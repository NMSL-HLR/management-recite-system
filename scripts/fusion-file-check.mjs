import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = pathToFileURL(join(root, process.env.FUSION_HTML || 'dist/index.html')).href
const executablePath = process.env.CHROME_PATH || ['/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync)
if (!executablePath) throw new Error('Set CHROME_PATH to a browser that supports file://.')
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] })
const PK = '346-fusion-platform-v1', MK = 'pku346-recall-v1'
const content = JSON.parse(readFileSync(join(root, 'src/data/generated/content.json'), 'utf8'))
const first = content.items.find(i => i.coreA)
const scenarios = [], errors = [], external = []

async function click(page, label, scope = 'main') {
  const did = await page.evaluate((text, selector) => {
    const node = [...document.querySelectorAll(`${selector} button`)].find(b => {
      const c = b.cloneNode(true); c.querySelectorAll('small').forEach(n => n.remove()); return c.textContent.trim() === text
    })
    if (!node || node.disabled) return false; node.click(); return true
  }, label, scope)
  assert.ok(did, `Missing enabled button: ${label}`)
}
async function text(page) { return page.$eval('main', n => n.innerText) }
async function stores(page) { return page.evaluate((pk, mk) => ({ platform: JSON.parse(localStorage.getItem(pk)), mrc: JSON.parse(localStorage.getItem(mk)) }), PK, MK) }
async function settle(page, predicate, ...args) { await page.waitForFunction(predicate, { timeout: 12000 }, ...args) }
async function open() {
  const context = await browser.createBrowserContext(); const page = await context.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  page.on('request', r => { if (!/^(file|blob|data):/.test(r.url())) external.push(r.url()) })
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(target, { waitUntil: 'networkidle0' })
  await settle(page, (pk, mk) => document.body.innerText.includes('今日作战台') && Boolean(localStorage.getItem(pk)) && Boolean(localStorage.getItem(mk)), PK, MK)
  return { page, context }
}
async function seed(page, platform, mrc) {
  await page.evaluate((pk, mk, p, m) => { localStorage.setItem(pk, JSON.stringify(p)); localStorage.setItem(mk, JSON.stringify(m)) }, PK, MK, platform, mrc)
  await page.reload({ waitUntil: 'networkidle0' }); await settle(page, () => document.body.innerText.includes('今日作战台'))
}
async function importFile(page, data) {
  await click(page, '设置数据', '.side')
  const filePath = `/tmp/fusion-import-${process.pid}.json`; writeFileSync(filePath, JSON.stringify(data))
  const input = await page.$('[data-testid="fusion-import"]'); await input.uploadFile(filePath)
  await settle(page, () => document.body.innerText.includes('导入预览'))
}
async function completeMrc(page, hint = false) {
  await page.waitForSelector('textarea'); await page.type('textarea', '闭卷输出：定义、原理、体育管理例证。')
  if (hint) { await click(page, '需要提示'); await settle(page, () => document.body.innerText.includes('想起来了，去核对')); await click(page, '想起来了，去核对') }
  else await click(page, '无提示交卷，去核对')
  await settle(page, () => document.body.innerText.includes('逐点核对'))
  const checks = await page.$$('fieldset input[type="checkbox"]')
  for (const c of checks) if (await c.evaluate(n => !n.closest('fieldset')?.querySelector('legend')?.textContent.includes('相关红线'))) await c.click()
  await click(page, '进入撤提示复述'); await settle(page, () => document.body.innerText.includes('撤掉提示后再写一遍'))
  await page.type('textarea', '撤提示后写出完整骨架。'); await click(page, '复述通过'); await click(page, '记下这一轮')
  await settle(page, () => document.body.innerText.includes('本轮记录'))
  await settle(page, pk => JSON.parse(localStorage.getItem(pk)).active?.status === 'completed', PK)
}
function legacyPoint(id, subject, title) {
  return { id, subject, title, content: `测试资料 ${title}：概念与机制。`, checklist: ['概念', '机制'], tags: [], leaks: [], createdAt: Date.now() - 10000,
    difficulty: 5, stability: 0.4, interval: 0, repetitions: 0, dueDate: Date.now() - 1000, state: 'new', totalReviews: 0, lapses: 0, extraV13: { keep: true } }
}
try {
  const { page } = await open()
  const baseline = await stores(page)
  assert.equal(await page.$eval('.coach-title', n => n.textContent), first.title)
  assert.equal(await page.$$eval('main .btn.primary', n => n.length), 1)
  assert.equal(await page.$$eval('.side nav button', n => n.length), 4)
  scenarios.push('新用户首先推荐 A 核心题，四个主入口，首页一个主按钮')
  await page.screenshot({ path: join(root, 'reports/fusion-desktop.png'), fullPage: true })
  await click(page, '开始训练'); await page.type('textarea', '刷新后仍在的管理学草稿。')
  await settle(page, mk => JSON.parse(localStorage.getItem(mk)).recall.draft.includes('刷新后'), MK)
  const unfinished = await stores(page)
  await page.reload({ waitUntil: 'networkidle0' }); await click(page, '继续训练')
  assert.equal(await page.$eval('textarea', n => n.value), unfinished.mrc.recall.draft)
  assert.equal((await stores(page)).platform.day.tasks.length, 1)
  scenarios.push('管理学暂停刷新恢复同一草稿，只占用一次预算')
  await completeMrc(page)
  const completed = await stores(page)
  const attempt = completed.mrc.attempts[0]
  assert.equal(attempt.evidenceState, 'independent'); assert.equal(attempt.highestHintUsed, 'none')
  assert.equal(attempt.dueAt - attempt.finishedAt, 3 * 86400000)
  assert.deepEqual(completed.mrc.sourceHashes, baseline.mrc.sourceHashes)
  scenarios.push('管理学仍生成原 Attempt、independent 与三天复测，hash/版本不变')

  const old = { points: [legacyPoint('phys', '运动生理学', '第一章 测试生理题'), legacyPoint('intro', '体育概论', '第一章 测试概论题'), legacyPoint('mgmt', '体育管理学', '旧管理学测试题')], logs: [], settings: { standardTargetRetention: 0.9 }, confusionSets: [{ id: 'cs-test', name: '测试易混组' }] }
  await importFile(page, old)
  assert.equal((await stores(page)).platform.general.points.length, 0)
  await click(page, '取消导入'); assert.equal((await stores(page)).platform.general.points.length, 0)
  await importFile(page, old); await click(page, '确认整合导入')
  await settle(page, pk => JSON.parse(localStorage.getItem(pk)).general.points.length === 3, PK)
  const imported = await stores(page)
  assert.deepEqual(imported.mrc.attempts, completed.mrc.attempts)
  assert.deepEqual(imported.platform.general.points[0].extraV13, { keep: true })
  assert.equal(imported.platform.day.tasks.length, 1)
  await settle(page, () => document.body.innerText.includes('今日作战台'))
  assert.ok((await text(page)).includes('运动生理学'), `${await text(page)}\n${JSON.stringify(errors)}`)
  scenarios.push('旧 JSON 预览/取消不写入，确认后合并；旧管理学隔离、扩展字段保留、预算不清零')
  await click(page, '开始训练'); await settle(page, () => document.body.innerText.includes('先闭卷输出'))
  assert.equal((await stores(page)).platform.active.itemId, 'phys')
  await page.type('textarea', '生理学草稿：概念与机制。')
  await click(page, '提交草稿，核对原文')
  assert.equal(await page.$$eval('fieldset input:checked', n => n.length), 0)
  await page.reload({ waitUntil: 'networkidle0' }); await click(page, '继续训练')
  assert.ok((await text(page)).includes('生理学草稿：概念与机制。'))
  assert.equal(await page.$$('textarea').then(n => n.length), 0)
  for (const box of await page.$$('fieldset input')) await box.click()
  await click(page, '记住'); await settle(page, () => document.body.innerText.includes('本轮已保存'))
  const physFinished = await stores(page)
  assert.equal(physFinished.platform.general.logs.length, 1)
  assert.equal(physFinished.platform.general.logs[0].rating, 3)
  assert.equal(physFinished.platform.general.logs[0].preRevealDraft, '生理学草稿：概念与机制。')
  assert.equal(physFinished.platform.general.points.find(p => p.id === 'phys').totalReviews, 1)
  scenarios.push('生理学训练恢复冻结稿、核对默认空、保存 FSRS 日志及揭晓前输出')
  await click(page, '继续'); await settle(page, () => document.body.innerText.includes('先闭卷输出'))
  assert.equal((await stores(page)).platform.active.itemId, 'intro')
  await page.type('textarea', '体育概论的暂停草稿。')
  await settle(page, pk => JSON.parse(localStorage.getItem(pk)).session.draft.includes('暂停草稿'), PK)
  scenarios.push('完成后按全科安排接续体育概论，不向旧管理学重复派题')

  const savedEnvelope = { format: '346-fusion', platformVersion: 1, ...await stores(page) }
  // Envelope expects the named fields platform and mrc; test download as well as restore.
  await click(page, '设置数据', '.side')
  const downloads = join('/tmp', `fusion-download-${process.pid}`)
  const cdp = await page.createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
  await click(page, '导出全科整包')
  const { readdirSync } = await import('node:fs')
  const until = Date.now() + 10000
  let file
  while (Date.now() < until) { try { file = readdirSync(downloads).find(x => x.endsWith('.json')); if (file) break } catch {} await new Promise(r => setTimeout(r, 100)) }
  assert.ok(file, 'Actual JSON download did not complete')
  const downloaded = JSON.parse(readFileSync(join(downloads, file), 'utf8'))
  assert.equal(downloaded.platform.session.draft, savedEnvelope.platform.session.draft)
  assert.deepEqual(downloaded.mrc.attempts, savedEnvelope.mrc.attempts)
  const fresh = await open(); await importFile(fresh.page, downloaded); await click(fresh.page, '确认整合导入')
  await settle(fresh.page, () => document.body.innerText.includes('继续未完成训练'))
  await click(fresh.page, '继续训练'); assert.equal(await fresh.page.$eval('textarea', n => n.value), savedEnvelope.platform.session.draft)
  const beforeReopen = await stores(fresh.page); await fresh.page.close()
  const reopen = await fresh.context.newPage()
  reopen.on('pageerror', e => errors.push(String(e)))
  await reopen.goto(target, { waitUntil: 'networkidle0' }); await click(reopen, '继续训练')
  assert.equal(await reopen.$eval('textarea', n => n.value), beforeReopen.platform.session.draft)
  assert.equal((await stores(reopen)).platform.day.tasks.length, beforeReopen.platform.day.tasks.length)
  scenarios.push('实际下载全科 JSON、另一个浏览器上下文恢复两模块与草稿，关闭页面重开仍可继续')

  const { page: cap } = await open()
  await cap.$eval('.coach-footer details', n => { n.open = true }); await cap.select('[aria-label="今日预算"]', '15')
  await click(cap, '开始训练'); await completeMrc(cap)
  assert.ok((await text(cap)).includes('可以收工'))
  await click(cap, '回到今日'); await cap.reload({ waitUntil: 'networkidle0' })
  assert.equal(await cap.$$('main [data-testid="start-training"]').then(n => n.length), 0)
  const capStored = await stores(cap); assert.equal(capStored.platform.day.tasks.length, 1)
  await click(cap, '设置数据', '.side'); await click(cap, '管理学详细设置'); await click(cap, '闭卷考试（原版）')
  assert.ok((await text(cap)).includes('闭卷'))
  scenarios.push('15分钟总预算完成后收工，刷新不追加；原闭卷考试仍可访问')

  const { page: legacy } = await open()
  const oldMrc = structuredClone(baseline.mrc); delete oldMrc.coachState
  oldMrc.attempts = completed.mrc.attempts
  oldMrc.recall = { ...unfinished.mrc.recall, draft: 'V2.2.2未完成稿', itemId: content.items.filter(i => i.coreA)[3].id }
  await seed(legacy, baseline.platform, oldMrc); await click(legacy, '继续训练')
  assert.equal(await legacy.$eval('textarea', n => n.value), 'V2.2.2未完成稿')
  assert.deepEqual((await stores(legacy)).mrc.attempts, oldMrc.attempts)
  scenarios.push('V2.2.2 原学习记录与未完成 Recall 无损读取')

  const { page: hint } = await open(); await click(hint, '开始训练'); await completeMrc(hint, true)
  assert.equal((await stores(hint)).mrc.attempts[0].evidenceState, 'cue_dependent')
  assert.equal((await stores(hint)).mrc.attempts[0].dueAt - (await stores(hint)).mrc.attempts[0].finishedAt, 45 * 60000)
  scenarios.push('提示后复述通过仍为 cue_dependent，原45分钟间隔不变')

  const futureMrc = structuredClone(baseline.mrc)
  futureMrc.attempts = content.items.filter(i => i.kind !== 'reference').map((i, n) => ({ ...attempt, id: `future-${n}`, itemId: i.id, dueAt: Date.now() + 45 * 60000 }))
  await seed(hint, baseline.platform, futureMrc)
  assert.ok((await text(hint)).includes('当前没有立即任务'))
  assert.ok((await text(hint)).includes('下一次复测'))
  await click(hint, '今天先到这里'); await hint.reload({ waitUntil: 'networkidle0' })
  assert.ok((await text(hint)).includes('可以收工'))
  scenarios.push('未来复测显示等待，主动收工后刷新不再追加')

  // Storage failure during general submission: both log and session must stay unchanged.
  const beforeFailure = await stores(reopen)
  await click(reopen, '提交草稿，核对原文')
  await reopen.evaluate(pk => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key === pk) throw new Error('测试：配额已满'); return original.call(this, key, value) } }, PK)
  await click(reopen, '模糊'); assert.ok((await text(reopen)).includes('保存失败'))
  const failed = await stores(reopen)
  assert.equal(failed.platform.general.logs.length, beforeFailure.platform.general.logs.length)
  assert.equal(failed.platform.session.phase, 'compare')
  scenarios.push('存储写入失败时不提交通用日志，冻结草稿保留')

  // Restore pre-import pair through the UI.
  const { page: rollback } = await open(); const prior = await stores(rollback)
  await importFile(rollback, old); await click(rollback, '确认整合导入')
  await click(rollback, '设置数据', '.side'); await click(rollback, '恢复整包导入前备份')
  await settle(rollback, () => document.body.innerText.includes('已恢复整包'))
  assert.deepEqual((await stores(rollback)).platform.general, prior.platform.general)
  assert.deepEqual((await stores(rollback)).mrc.attempts, prior.mrc.attempts)
  scenarios.push('导入前的两份模块数据可一起回滚')

  const { page: mobile } = await open(); await mobile.setViewport({ width: 375, height: 812 })
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  const startVisible = await mobile.$eval('[data-testid="start-training"]', n => { const r = n.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  assert.ok(startVisible)
  await mobile.screenshot({ path: join(root, 'reports/fusion-mobile.png'), fullPage: true })
  scenarios.push('375px 手机首屏能看见开始按钮，无横向溢出')
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  const report = { ok: true, html: target, browser: await browser.version(), scenarios, externalRequests: external, scriptErrors: errors, limitations: ['未实测 Windows Edge、华为浏览器；关闭重开测试为同一浏览器上下文的新页面。'] }
  writeFileSync(join(root, 'reports/fusion-file-check.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally { await browser.close() }
