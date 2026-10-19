import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import { createServer } from 'node:http'
import { checkJourneys } from './ux-file-check.mjs'
import { checkPdca } from './pdca-check.mjs'
import { checkSelection } from './selection-check.mjs'
import { checkReview } from './review-check.mjs'
import { checkCompletion } from './completion-check.mjs'
import { checkAuditJourneys } from './audit-file-check.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const htmlPath = join(root, process.env.FUSION_HTML || 'dist/index.html')
// Explicit alternative for managed browsers which prohibit file://. This does not certify file://.
const transport = process.env.FUSION_TRANSPORT === 'http' ? 'http' : 'file'
const server = transport === 'http' ? createServer((req, res) => {
  if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return }
  if (req.url !== '/') { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(readFileSync(htmlPath))
}) : null
if (server) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const target = server ? `http://127.0.0.1:${server.address().port}/` : pathToFileURL(htmlPath).href
const windowsBrowsers = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).flatMap(base => ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'].map(path => join(base,path)))
const executablePath = process.env.CHROME_PATH || [...windowsBrowsers, '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync)
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
async function open({ withTextbook = false } = {}) {
  const context = await browser.createBrowserContext(); const page = await context.newPage()
  page.on('pageerror', e => errors.push(String(e)))
  page.on('request', r => {
    if (server && ((r.url() === target && r.isNavigationRequest()) || r.url() === `${target}favicon.ico`)) return
    if (!/^(file|blob|data):/.test(r.url())) external.push(r.url())
  })
  await page.setViewport({ width: 1280, height: 900 })
  await page.goto(target, { waitUntil: 'networkidle0' })
  await settle(page, (pk, mk) => document.body.innerText.includes('今日作战台') && Boolean(localStorage.getItem(pk)) && Boolean(localStorage.getItem(mk)), PK, MK)
  if (!withTextbook) {
    // Existing regression cases use an explicitly empty general-module fixture.
    // Keep the installed marker so these cases do not silently reinstall the textbook on reload.
    const fixture = await stores(page)
    fixture.platform.general.points = []
    fixture.platform.day.selectedChapters = {}
    await seed(page, fixture.platform, fixture.mrc)
  }
  return { page, context }
}
async function seed(page, platform, mrc) {
  await page.evaluate((pk, mk, p, m) => { localStorage.setItem(pk, JSON.stringify(p)); localStorage.setItem(mk, JSON.stringify(m)) }, PK, MK, platform, mrc)
  await page.reload({ waitUntil: 'networkidle0' }); await settle(page, () => document.body.innerText.includes('今日作战台'))
}
async function importFile(page, data) {
  await click(page, '设置数据', '.side')
  const filePath = join(tmpdir(), `fusion-import-${process.pid}.json`); writeFileSync(filePath, JSON.stringify(data))
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
  if (!process.env.FUSION_COMPLETION_ONLY && !process.env.FUSION_REVIEW_ONLY && !process.env.FUSION_SELECTION_ONLY) {
  const { page } = await open()
  const baseline = await stores(page)
  assert.equal(await page.$eval('.coach-title', n => n.textContent), first.title)
  assert.equal(await page.$$eval('main .btn.primary', n => n.length), 1)
  assert.equal(await page.$$eval('.side nav button', n => n.length), 4)
  scenarios.push('空通用题库夹具首先推荐 A 核心题，四个主入口，首页一个主按钮')
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
  const downloads = join(tmpdir(), `fusion-download-${process.pid}`)
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
  await click(cap, '设置数据', '.side'); await click(cap, '管理学闭卷考试')
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
  assert.ok((await text(hint)).includes('今天已收工'))
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
  await click(rollback, '确认恢复旧备份', 'dialog')
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

  // The restored V13 skins are independent of MRC reading settings and learning records.
  const { page: themed } = await open()
  const themeBaseline = await stores(themed)
  for (const skin of ['hmos', 'gba', 'neo']) {
    await themed.click('.side .theme-switch')
    await settle(themed, s => document.documentElement.dataset.skin === s, skin)
    await themed.reload({ waitUntil: 'networkidle0' })
    assert.equal(await themed.evaluate(() => document.documentElement.dataset.skin), skin)
    assert.deepEqual((await stores(themed)).mrc.attempts, themeBaseline.mrc.attempts)
    await themed.screenshot({ path: join(root, `reports/fusion-${skin}.png`), fullPage: true })
  }
  await click(themed, '设置数据', '.side'); await click(themed, '切换明暗主题')
  assert.equal(await themed.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await themed.screenshot({ path: join(root, 'reports/fusion-dark.png'), fullPage: true })
  await click(themed, '切换明暗主题')
  scenarios.push('旧版三主题切换与刷新保留、暗色阅读兼容，学习证据不变')

  await mobile.setViewport({ width: 320, height: 740 })
  for (const label of ['资料库', '学习记录', '设置数据', '今日训练']) {
    await click(mobile, label, '.mobile-nav')
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `320px overflow: ${label}`)
  }
  await click(mobile, '资料库', '.mobile-nav'); await click(mobile, '管理学 A/B 资料')
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px MRC library overflow')
  scenarios.push('320px 手机四个主页面与管理学资料库无横向溢出，底部导航可用')

  const { page: bad } = await open()
  const badBefore = await stores(bad)
  await click(bad, '设置数据', '.side')
  const badFile = join(tmpdir(), `fusion-invalid-${process.pid}.json`)
  writeFileSync(badFile, JSON.stringify({ points: [{ ...legacyPoint('broken', '运动生理学', '错误字段'), quotaChapterOverride: 123 }] }))
  await (await bad.$('[data-testid="fusion-import"]')).uploadFile(badFile)
  await settle(bad, () => document.body.innerText.includes('章节不合法'))
  assert.deepEqual(await stores(bad), badBefore)
  assert.equal(await bad.$$('.warnbox h3').then(n => n.length), 0)
  // File read failure should cancel a stale preview and remain a controlled UI error.
  await importFile(bad, old)
  await bad.evaluate(() => { File.prototype.text = async function() { throw new Error('read denied') } })
  await (await bad.$('[data-testid="fusion-import"]')).uploadFile(badFile)
  await settle(bad, () => document.body.innerText.includes('文件读取失败'))
  assert.equal(await bad.$$('.warnbox h3').then(n => n.length), 0)
  assert.deepEqual(await stores(bad), badBefore)
  scenarios.push('坏 JSON 字段与文件读取失败不写入、不崩溃，取消陈旧导入预览')

  const { page: resumeFailure } = await open()
  await seed(resumeFailure, beforeFailure.platform, beforeFailure.mrc)
  const resumeSnapshot = await stores(resumeFailure)
  await resumeFailure.evaluate(pk => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k === pk) throw new Error('quota'); return original.call(this, k, v) } }, PK)
  await click(resumeFailure, '继续训练')
  assert.ok((await text(resumeFailure)).includes('今日作战台'))
  assert.ok((await text(resumeFailure)).includes('保存失败'))
  assert.deepEqual(await stores(resumeFailure), resumeSnapshot)
  scenarios.push('恢复任务写入失败时停留作战台，不误进入训练或改写草稿')

  const { page: corrupt } = await open()
  const corruptMrc = { ...baseline.mrc, notes: [{ itemId: first.id, text: {}, updatedAt: Date.now() }] }
  await seed(corrupt, baseline.platform, corruptMrc)
  assert.ok((await text(corrupt)).includes('没有覆盖原内容'))
  assert.deepEqual((await stores(corrupt)).mrc, corruptMrc)
  assert.equal(await corrupt.$eval('[data-testid="start-training"]', n => n.disabled), true)
  scenarios.push('本地管理学记录损坏时保护原存储并禁止训练，页面仍可导出恢复数据')

  const { page: emptyRollback } = await open()
  await importFile(emptyRollback, old); await click(emptyRollback, '确认整合导入')
  await emptyRollback.evaluate((pk, mk) => localStorage.setItem('346-fusion-backup-v1', JSON.stringify({ [pk]: null, [mk]: null })), PK, MK)
  await click(emptyRollback, '设置数据', '.side'); await click(emptyRollback, '恢复整包导入前备份')
  await click(emptyRollback, '确认恢复旧备份', 'dialog')
  await settle(emptyRollback, () => document.body.innerText.includes('已恢复整包'))
  assert.deepEqual((await stores(emptyRollback)).mrc.attempts, [])
  assert.equal((await stores(emptyRollback)).platform.general.points.length, 86)
  assert.deepEqual((await stores(emptyRollback)).platform.general.logs, [])
  assert.ok((await stores(emptyRollback)).platform.general.points.every(p => p.totalReviews === 0))
  scenarios.push('导入前为空的两个模块恢复空学习记录，内置教材保留且均为未训练')

  const { page: cleanup } = await open()
  await importFile(cleanup, old)
  await cleanup.evaluate(() => { const original = Storage.prototype.removeItem; Storage.prototype.removeItem = function(k) { if (k === '346-fusion-import-journal-v1') throw new Error('cleanup failed'); return original.call(this, k) } })
  await Promise.all([cleanup.waitForNavigation({ waitUntil: 'networkidle0' }), click(cleanup, '确认整合导入')])
  assert.equal((await stores(cleanup)).platform.general.points.length, 3)
  assert.equal(await cleanup.evaluate(() => localStorage.getItem('346-fusion-import-journal-v1')), null)
  await click(cleanup, '开始训练')
  scenarios.push('导入成功但清理恢复日志失败时自动重开完成恢复，避免后续训练被旧日志覆盖')

  const { page: examAudit } = await open()
  await click(examAudit, '设置数据', '.side'); await click(examAudit, '管理学闭卷考试')
  await click(examAudit, 'A 题限时写作')
  await examAudit.type('textarea', '揭晓前闭卷作答，不能事后补写。')
  const timerBefore = await examAudit.$eval('.timer', n => n.textContent)
  await settle(examAudit, initial => document.querySelector('.timer')?.textContent !== initial, timerBefore)
  await click(examAudit, '对照原文')
  assert.equal(await examAudit.$eval('textarea', n => n.readOnly), true)
  const sealed = await stores(examAudit)
  await examAudit.type('textarea', '不能写入')
  assert.deepEqual((await stores(examAudit)).mrc.exam.answers, sealed.mrc.exam.answers)
  await examAudit.reload({ waitUntil: 'networkidle0' }); await click(examAudit, '设置数据', '.side'); await click(examAudit, '管理学闭卷考试')
  assert.equal(await examAudit.$eval('textarea', n => n.readOnly), true)
  await click(examAudit, '下一题')
  assert.equal(await examAudit.$eval('textarea', n => n.readOnly), false)
  assert.equal((await stores(examAudit)).mrc.exam.index, 1)
  scenarios.push('考试计时逐秒更新，揭晓后作答冻结且刷新保持，下一题恢复可编辑')
  await click(examAudit, '设置数据', '.side'); await click(examAudit, '管理学详细设置')
  const oldGaps = (await stores(examAudit)).mrc.settings.gaps
  await examAudit.evaluate(() => {
    const input = [...document.querySelectorAll('label')].find(n => n.textContent.includes('提示依赖分钟')).querySelector('input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '-1')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  assert.deepEqual((await stores(examAudit)).mrc.settings.gaps, oldGaps)
  await examAudit.reload({ waitUntil: 'networkidle0' })
  assert.ok(!(await text(examAudit)).includes('本地记录损坏'))
  scenarios.push('详细设置拒绝负数复测间隔，原调度设置不变且刷新可恢复')

  const { page: textbook } = await open({ withTextbook: true })
  const textbookInitial = await stores(textbook)
  const pack = JSON.parse(readFileSync(join(root, 'src/data/physiology/physiology.json'), 'utf8'))
  assert.equal(textbookInitial.platform.general.points.length, 86)
  assert.equal(textbookInitial.platform.general.points.filter(p => !p.trainingBlocked).length, 74)
  assert.equal(await textbook.$eval('.coach-title', n => n.textContent), first.title)
  await textbook.screenshot({ path: join(root, 'reports/fusion-desktop.png'), fullPage: true })
  await textbook.setViewport({ width: 375, height: 812 })
  assert.ok(await textbook.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  assert.ok(await textbook.$eval('[data-testid="start-training"]', n => n.getBoundingClientRect().bottom < innerHeight))
  await textbook.screenshot({ path: join(root, 'reports/fusion-mobile.png'), fullPage: true })
  await textbook.setViewport({ width: 1280, height: 900 })
  await click(textbook, '资料库', '.side')
  assert.equal(await textbook.$$('ul.plain > li').then(n => n.length), 60)
  await textbook.click('details summary')
  const preface = await textbook.$eval('details pre', n => n.textContent)
  assert.equal(preface, pack.preface.replace(/&gt;/g, '>'))
  assert.ok(preface.includes('> 这只是一个框架'))
  assert.ok(!preface.includes('&gt;'))
  await textbook.click('details summary')
  await textbook.select('[aria-label="资料章节"]', '第二章 血液')
  assert.equal(await textbook.$$('ul.plain > li').then(n => n.length), 5)
  await textbook.select('[aria-label="资料章节"]', '')
  await textbook.type('[aria-label="查找资料"]', '内容待补充')
  assert.equal(await textbook.$$('ul.plain > li').then(n => n.length), 4)
  await textbook.$eval('[aria-label="查找资料"]', n => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(n, ''); n.dispatchEvent(new Event('input', { bubbles: true })) })
  await settle(textbook, () => document.querySelectorAll('ul.plain > li').length === 60)
  await click(textbook, pack.points[0].title)
  assert.ok((await text(textbook)).includes(pack.points[0].content))
  await textbook.screenshot({ path: join(root, 'reports/physiology-library.png'), fullPage: true })
  scenarios.push('真实新用户自动内置8章60题，56题可训练、4题待补充；章节查询及原文完整')
  await click(textbook, '今日训练', '.side'); await click(textbook, '开始训练'); await completeMrc(textbook)
  await click(textbook, '继续')
  assert.equal((await stores(textbook)).platform.active.itemId, pack.points[0].id)
  await textbook.type('textarea', '生理学导入回归：兴奋、接头传递、分子机制。')
  const beforePackImport = await stores(textbook)
  const packFile = JSON.parse(readFileSync(join(root, '346_Physiology_Import.json'), 'utf8'))
  await importFile(textbook, packFile); await click(textbook, '确认整合导入')
  const afterPackImport = await stores(textbook)
  assert.deepEqual(afterPackImport.platform.session, beforePackImport.platform.session)
  assert.deepEqual(afterPackImport.platform.day, beforePackImport.platform.day)
  assert.deepEqual(afterPackImport.mrc.attempts, beforePackImport.mrc.attempts)
  assert.equal(afterPackImport.platform.general.points.length, 86)
  await click(textbook, '继续训练'); await click(textbook, '提交草稿，核对原文')
  assert.equal(await textbook.$$('fieldset input').then(n => n.length), pack.points[0].checklist.length)
  await click(textbook, '记住')
  const physiologyReviewed = await stores(textbook)
  assert.equal(physiologyReviewed.platform.general.logs.length, 1)
  await textbook.reload({ waitUntil: 'networkidle0' })
  assert.deepEqual((await stores(textbook)).platform.general.points, physiologyReviewed.platform.general.points)
  await importFile(textbook, packFile); await click(textbook, '确认整合导入')
  assert.deepEqual((await stores(textbook)).platform.general.points, physiologyReviewed.platform.general.points)
  assert.deepEqual((await stores(textbook)).platform.general.logs, physiologyReviewed.platform.general.logs)
  scenarios.push('管理学完成后接续原稿首道生理题；重复导入/刷新不重置评分、间隔、预算或草稿')
  const { page: upgrade } = await open({ withTextbook: true })
  const oldEnvelope = structuredClone(savedEnvelope)
  delete oldEnvelope.platform.general.installedTextbooks
  delete oldEnvelope.platform.general.policySourceRevision
  await importFile(upgrade, oldEnvelope); await click(upgrade, '确认整合导入')
  const upgraded = await stores(upgrade)
  assert.equal(upgraded.platform.general.points.length, oldEnvelope.platform.general.points.length + 86)
  for (const p of oldEnvelope.platform.general.points) assert.deepEqual(upgraded.platform.general.points.find(row => row.id === p.id), p)
  assert.deepEqual(upgraded.platform.general.logs, oldEnvelope.platform.general.logs)
  assert.deepEqual(upgraded.platform.session, oldEnvelope.platform.session)
  assert.deepEqual(upgraded.platform.day, oldEnvelope.platform.day)
  assert.deepEqual(upgraded.mrc.attempts, oldEnvelope.mrc.attempts)
  await upgrade.reload({ waitUntil: 'networkidle0' })
  assert.equal((await stores(upgrade)).platform.general.points.length, upgraded.platform.general.points.length)
  scenarios.push('恢复接入教材前的旧整包时补入80项教材资料，旧题进度、日志、预算与进行中草稿保持，刷新不重复添加')
  const { page: policyPage } = await open({ withTextbook: true })
  await click(policyPage, '资料库', '.side'); await click(policyPage, '体育概论')
  assert.equal(await policyPage.$$('ul.plain > li').then(n => n.length), 26)
  await policyPage.select('[aria-label="资料章节"]', '第一讲｜全民健身')
  assert.equal(await policyPage.$$('ul.plain > li').then(n => n.length), 4)
  const policyPack = JSON.parse(readFileSync(join(root, 'src/data/policy/policy.json'), 'utf8'))
  await click(policyPage, policyPack.points[0].title)
  assert.equal(await policyPage.$eval('article.library-detail pre', n => n.textContent), policyPack.points[0].content)
  await click(policyPage, '收起'); await click(policyPage, policyPack.points[3].title)
  assert.ok((await text(policyPage)).includes('积木查询，不自动安排训练'))
  const beforePolicyImport = await stores(policyPage)
  await importFile(policyPage, JSON.parse(readFileSync(join(root, '346_Sports_Policy_Import.json'), 'utf8')))
  await click(policyPage, '确认整合导入')
  assert.deepEqual((await stores(policyPage)).platform.general, beforePolicyImport.platform.general)
  await policyPage.reload({ waitUntil: 'networkidle0' })
  assert.equal((await stores(policyPage)).platform.general.points.filter(p => p.subject === '体育概论').length, 26)
  scenarios.push('体育概论内置六讲26项资料、18道训练题和8组积木查询，讲次查询、原文展示及重复导入刷新均正确')
  // Upgrade an installed five-lecture edition with an in-flight answer.
  const oldPolicy = structuredClone(beforePolicyImport)
  oldPolicy.platform.general.points = oldPolicy.platform.general.points.filter(p => p.subject !== '体育概论' || policyPack.points.slice(0,20).some(n => n.id === p.id))
  delete oldPolicy.platform.general.policySourceRevision
  for (const p of oldPolicy.platform.general.points.filter(p => p.subject === '体育概论')) { delete p.sourceRevision; p.content = '旧版教材正文'; p.checklist = ['旧要点']; p.leaks = [{ label:'旧要点', due:Date.now()-1000 }]; p.privateNote = '我的批注' }
  const oldFirst = oldPolicy.platform.general.points.find(p => p.id === policyPack.points[0].id)
  const task = { id:'policy-active-upgrade', module:'general', itemId:oldFirst.id, title:oldFirst.title, subject:oldFirst.subject, chapterKey:'policy-old', isNew:true, reason:'旧版训练', estimatedMinutes:15, status:'in_progress', startedAt:Date.now() }
  oldPolicy.platform.day.tasks=[task]; oldPolicy.platform.active=task
  oldPolicy.platform.session={ taskId:task.id,itemId:task.itemId,phase:'draft',draft:'未完成旧版答案',frozenDraft:null,checked:[],rating:null }
  await seed(policyPage, oldPolicy.platform, oldPolicy.mrc)
  let upgradedPolicy = await stores(policyPage)
  assert.equal(upgradedPolicy.platform.general.points.filter(p=>p.subject==='体育概论').length,26)
  assert.equal(upgradedPolicy.platform.general.points.find(p=>p.id===oldFirst.id).content,'旧版教材正文')
  assert.equal(upgradedPolicy.platform.general.points.find(p=>p.id===policyPack.points[1].id).content,policyPack.points[1].content)
  assert.equal(upgradedPolicy.platform.session.draft,'未完成旧版答案')
  assert.equal(upgradedPolicy.platform.day.tasks.length,1)
  await click(policyPage,'继续训练'); await click(policyPage,'提交草稿，核对原文'); await click(policyPage,'记住')
  const beforeReplacement=await stores(policyPage)
  await policyPage.reload({waitUntil:'networkidle0'})
  upgradedPolicy=await stores(policyPage)
  const replaced=upgradedPolicy.platform.general.points.find(p=>p.id===oldFirst.id)
  assert.equal(replaced.content,policyPack.points[0].content); assert.equal(replaced.privateNote,'我的批注')
  assert.equal(replaced.dueDate,beforeReplacement.platform.general.points.find(p=>p.id===oldFirst.id).dueDate)
  assert.deepEqual(upgradedPolicy.platform.general.logs,beforeReplacement.platform.general.logs)
  assert.equal(upgradedPolicy.platform.general.logs.at(-1).preRevealDraft,'未完成旧版答案')
  assert.equal(upgradedPolicy.platform.general.policyReplacementArchive.flatMap(a=>a.points).length,20)
  await policyPage.reload({waitUntil:'networkidle0'})
  assert.deepEqual((await stores(policyPage)).platform.general,upgradedPolicy.platform.general)
  scenarios.push('旧五讲自动替换为六讲，活动草稿延后换正文；成绩、到期时间、批注和旧原文留档，重复刷新不复制题目或档案')

  await checkJourneys({ open, seed, click, text, stores, settle, scenarios, root })
  await checkAuditJourneys({ open, seed, click, text, stores, settle, scenarios, root })
  }
  if (!process.env.FUSION_REVIEW_ONLY && !process.env.FUSION_SELECTION_ONLY) {
  await checkCompletion({ open, seed, click, text, stores, settle, scenarios, root, browser, target, executablePath, htmlPath })
  await checkPdca({ open, seed, click, text, stores, settle, scenarios, completeMrc })
  }
  if (!process.env.FUSION_SELECTION_ONLY) await checkReview({ open, seed, click, text, stores, settle, scenarios, root })
  await checkSelection({ open, seed, click, text, stores, settle, scenarios, completeMrc, root })
  assert.deepEqual(errors, []); assert.deepEqual(external, [])
  const report = { ok: true, scope: process.env.FUSION_SELECTION_ONLY ? 'selection-only' : process.env.FUSION_REVIEW_ONLY ? 'review-only' : process.env.FUSION_COMPLETION_ONLY ? 'completion-only' : 'full', html: htmlPath, transport, browser: await browser.version(), scenarios, externalRequests: external, scriptErrors: errors, limitations: [...(server ? ['当前管理策略禁止 file://，本轮通过本地 HTTP 加载同一单文件产物验证，不能替代 file:// 实机复测。'] : []), '未实测 Windows Edge、华为、Safari及屏幕阅读器；已覆盖Chromium完整进程退出重启，但不能外推其他浏览器。'] }
  writeFileSync(join(root, 'reports/fusion-file-check.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally { await browser.close(); if (server) await new Promise(resolve => server.close(resolve)) }
