import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/** Fault injection and real downloads against the delivered file:// application. */
export async function checkAuditJourneys({ open, seed, click, text, stores, settle, scenarios, root }) {
  const pk = '346-fusion-platform-v1', mk = 'pku346-recall-v1'
  const content = JSON.parse(readFileSync(join(root, 'src/data/generated/content.json'), 'utf8'))
  const first = content.items.find(i => i.coreA)
  const other = content.items.find(i => i.coreA && i.id !== first.id)
  const tableItem = content.items.find(i => i.appendixFullAnswer && i.tables.length)
  assert.ok(tableItem)
  const { page, context } = await open()
  const base = await stores(page)
  await click(page, '开始训练')
  await page.type('textarea', '尚未结束的原始草稿')
  const active = await stores(page)
  const clock = await page.$eval('[aria-label="本轮用时"]', n => n.textContent)
  await settle(page, previous => document.querySelector('[aria-label="本轮用时"]').textContent !== previous, clock)
  assert.deepEqual(await stores(page), active, 'display clock must not write learning state')
  scenarios.push('计时每秒更新，独立显示时钟不写学习记录')

  active.mrc.library = { ...active.mrc.library, source: other.source, itemId: other.id, chapterId: other.chapterId, pageAnchor: '', query: '' }
  await seed(page, active.platform, active.mrc)
  await click(page, '资料库', '.side'); await click(page, '管理学 A/B 资料')
  await click(page, '提取这题')
  await settle(page, () => Boolean(document.querySelector('dialog[open]')))
  assert.ok((await page.$eval('dialog[open]', n => n.innerText)).includes(first.title))
  assert.equal(await page.evaluate(() => document.activeElement.textContent), '留在当前页面')
  assert.deepEqual((await stores(page)).mrc.recall, active.mrc.recall)
  assert.deepEqual((await stores(page)).platform.day.tasks, active.platform.day.tasks)
  await page.keyboard.press('Escape')
  assert.equal(await page.$eval('main h1', n => n.textContent), other.title)
  await click(page, '提取这题'); await click(page, '继续未完成训练', 'dialog[open]')
  assert.equal(await page.$eval('textarea', n => n.value), '尚未结束的原始草稿')
  assert.equal((await stores(page)).platform.day.tasks.length, 1)
  scenarios.push('改选另一题先说明未完成任务；Esc 保留当前页面，确认恢复原稿且不重复扣预算')

  const tableFixture = structuredClone(base)
  tableFixture.mrc.recall = { ...active.mrc.recall, itemId: tableItem.id }
  tableFixture.mrc.recallQueue = [tableItem.id]
  await seed(page, tableFixture.platform, tableFixture.mrc)
  await click(page, '继续训练'); await click(page, '直接看完整原文')
  assert.deepEqual(await page.$$eval('.compare th', ns => ns.map(n => n.textContent.trim())), tableItem.tables.flatMap(t => t.headers.map(s => s.trim())))
  assert.ok((await text(page)).includes(`已核对 0 / ${tableItem.checkPoints.length} 项`))
  assert.ok(!(await text(page)).includes('examReady'))
  assert.ok(!(await text(page)).includes('sportsExampleMissing'))
  const extraPoint = tableItem.checkPoints.find(p => p.level !== 1 || ['sports', 'expansion'].includes(p.role))
  if (extraPoint) {
    const index = tableItem.checkPoints.indexOf(extraPoint)
    // Find by visible checkpoint text rather than relying on group order.
    await page.evaluate(label => { const el = [...document.querySelectorAll('fieldset label')].find(n => n.textContent.trim().endsWith(label)); el.querySelector('input').click() }, extraPoint.label)
    await click(page, '主体小标题都写到了')
    assert.ok((await stores(page)).mrc.recall.checkedPointIds.includes(tableItem.checkPoints[index].id))
  }
  await click(page, '进入撤提示复述')
  assert.equal(await page.$eval('.choice button[aria-pressed="true"]', n => n.textContent), '3')
  await click(page, '复述通过'); await click(page, '记下这一轮')
  const result = (await stores(page)).mrc.attempts.at(-1)
  assert.equal(result.evidenceState, 'relearned')
  assert.equal(result.selfConfidence, 3)
  assert.equal(result.dueAt - result.finishedAt, 20 * 60000)
  assert.deepEqual((await stores(page)).mrc.sourceHashes, base.mrc.sourceHashes)
  const frozenClock = await page.$eval('[aria-label="本轮用时"]', n => n.textContent)
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1200)))
  assert.equal(await page.$eval('[aria-label="本轮用时"]', n => n.textContent), frozenClock)
  scenarios.push('原文对照显示真实表头、核对数量与中文状态；默认信心明确，查看全文仍为重学并按原20分钟调度，完成后计时冻结')

  const libraryFixture = structuredClone(base)
  libraryFixture.mrc.library = { ...base.mrc.library, source: other.source, itemId: other.id, chapterId: other.chapterId, pageAnchor: '', query: '' }
  await seed(page, libraryFixture.platform, libraryFixture.mrc)
  await click(page, '资料库', '.side'); await click(page, '管理学 A/B 资料')
  await click(page, '加书签')
  await page.type('textarea', '批注切换页面后仍应保留')
  await click(page, '返回本章目录')
  await page.$eval('details.bookmarks', n => { n.open = true })
  await click(page, other.title, '.bookmarks')
  assert.equal(await page.$eval('textarea', n => n.value), '批注切换页面后仍应保留')
  assert.ok((await page.title()).includes(other.title))
  await click(page, 'B册')
  await page.type('[aria-label="搜索管理学原文"]', '管理')
  const scopeHits = await page.$$eval('.library > .stack > .card ul button', ns => ns.map(n => n.textContent))
  assert.ok(scopeHits.length > 0 && scopeHits.every(t => t.startsWith('B 第 ')))
  await click(page, '全部')
  const hitCount = content.pages.filter(p => p.markdown.includes('管理')).length
  assert.ok(hitCount > 40)
  await click(page, '显示全部搜索结果')
  assert.equal(await page.$$eval('.library > .stack > .card ul button', ns => ns.length), hitCount)
  await page.reload({ waitUntil: 'networkidle0' })
  assert.ok((await stores(page)).mrc.bookmarks.includes(other.id))
  assert.equal((await stores(page)).mrc.notes.find(n => n.itemId === other.id).text, '批注切换页面后仍应保留')
  scenarios.push('书签可列出与返回，批注切页刷新保留，题目标题更新；搜索遵循册范围并可展开40条以后的结果')

  await click(page, '资料库', '.side'); await click(page, '管理学 A/B 资料')
  await click(page, '专注阅读')
  const focusedWidth = await page.$eval('.side', n => n.getBoundingClientRect().width)
  assert.equal(Math.round(focusedWidth), 176)
  for (const width of [320, 768, 1280]) {
    await page.setViewport({ width, height: 900 })
    assert.ok(await page.evaluate(() => {
      const t = document.querySelector('.reading-toolbar'), main = document.querySelector('#study-main')
      return main.contains(t) && getComputedStyle(t).position === 'static' && t.getBoundingClientRect().bottom <= document.querySelector('.module-back').getBoundingClientRect().top && document.documentElement.scrollWidth <= innerWidth
    }), `toolbar overlaps or overflows at ${width}`)
  }
  await click(page, '退出专注阅读')
  assert.equal(Math.round(await page.$eval('.side', n => n.getBoundingClientRect().width)), 240)
  await page.focus('#study-main')
  const initialTheme = await page.evaluate(() => document.documentElement.dataset.theme)
  await page.keyboard.down('Alt'); await page.keyboard.down('Shift'); await page.keyboard.press('D'); await page.keyboard.up('Shift'); await page.keyboard.up('Alt')
  assert.notEqual(await page.evaluate(() => document.documentElement.dataset.theme), initialTheme)
  await page.screenshot({ path: join(root, 'reports/audit-reading-desktop.png'), fullPage: false })
  scenarios.push('320/768/1280px 阅读栏占用正常布局空间，专注阅读可退出且侧栏收窄；新深浅色快捷键可用')

  const examFixture = structuredClone(base)
  examFixture.mrc.exam = { id: 'audit-final-question', title: '单题验收', itemIds: [tableItem.id], index: 0, startedAt: Date.now(), questionStartedAt: Date.now(), limitSeconds: 60, answers: { [tableItem.id]: { text: '必须保留的考试作答', revealed: false } } }
  await seed(page, examFixture.platform, examFixture.mrc)
  await click(page, '设置数据', '.side'); await click(page, '管理学闭卷考试')
  await click(page, '对照原文')
  assert.ok((await page.$$eval('.compare th', ns => ns.length)) > 0)
  await click(page, '完成本次考试'); await click(page, '继续考试')
  assert.equal((await stores(page)).mrc.exam.answers[tableItem.id].text, '必须保留的考试作答')
  const downloadPath = mkdtempSync(join(tmpdir(), '346-audit-downloads-'))
  const client = await page.createCDPSession()
  await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath })
  await page.emulateTimezone('Asia/Shanghai')
  const fileDate = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })
  await click(page, '导出本次作答')
  await click(page, '返回设置与备份'); await click(page, '导出全科整包')
  await page.$eval('details', n => { n.open = true }); await click(page, '导出管理学 JSON')
  await settle(page, () => !document.querySelector('dialog[open]'))
  // Poll filesystem completion, not just the download click or browser acceptance.
  async function readDownload(name) {
    for (let i = 0; i < 100; i++) {
      if (readdirSync(downloadPath).includes(name)) return readFileSync(join(downloadPath, name), 'utf8')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error(`Download did not complete: ${name}`)
  }
  assert.ok((await readDownload(`pku346-exam-${fileDate}.txt`)).includes('必须保留的考试作答'))
  assert.equal(JSON.parse(await readDownload(`346-Fusion-${fileDate}.json`)).format, '346-fusion')
  assert.deepEqual(JSON.parse(await readDownload(`pku346-recall-${fileDate}.json`)).attempts, base.mrc.attempts)
  const beforeFailedExport = await stores(page)
  await page.evaluate(() => { window.originalCreateUrl = URL.createObjectURL; URL.createObjectURL = () => { throw new Error('audit download blocked') } })
  await click(page, '导出全科整包')
  assert.ok((await text(page)).includes('备份下载未能发起'))
  assert.deepEqual(await stores(page), beforeFailedExport)
  await page.evaluate(() => { URL.createObjectURL = window.originalCreateUrl })
  scenarios.push('考试末题提供完成入口，取消不清作答；考试、管理学、整包真实下载内容正确且按本地日期命名，下载失败显示提示不改记录')

  // Force an exception in the provider, after loadPlatform's guarded read but before commit.
  const beforeFault = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])))
  const injection = await page.evaluateOnNewDocument(key => {
    const original = Storage.prototype.getItem
    let reads = 0
    window.auditStorageFault = true
    Storage.prototype.getItem = function(k) {
      if (window.auditStorageFault && k === key && ++reads % 2 === 0) throw new Error('audit provider render failure')
      return original.call(this, k)
    }
  }, pk)
  await page.reload({ waitUntil: 'networkidle0' })
  await settle(page, () => document.body.innerText.includes('学习界面暂时无法继续'))
  await page.evaluate(() => { window.auditStorageFault = false })
  assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))), beforeFault)
  await click(page, '备份原始数据')
  const recovered = JSON.parse(await readDownload(`346-Recovery-${fileDate}.json`))
  assert.equal(recovered.raw[pk], beforeFault[pk]); assert.equal(recovered.raw[mk], beforeFault[mk])
  assert.deepEqual(recovered.readErrors, {})
  await page.removeScriptToEvaluateOnNewDocument(injection.identifier)
  await page.reload({ waitUntil: 'networkidle0' }); await settle(page, () => document.body.innerText.includes('今日作战台'))
  scenarios.push('注入 Provider 渲染异常后由外层边界接管，原始存储逐字不变，可独立下载两个模块的原始记录并重新打开')

  const blocked = await page.evaluateOnNewDocument(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('audit storage denied') } }) })
  await page.reload({ waitUntil: 'networkidle0' })
  await click(page, '备份原始数据')
  assert.ok((await text(page)).includes('未生成空备份'))
  await page.removeScriptToEvaluateOnNewDocument(blocked.identifier)
  await context.close()
  scenarios.push('启动时存储完全不可访问仍显示恢复界面；备份明确报告失败，不把空文件伪装成成功备份')
}
