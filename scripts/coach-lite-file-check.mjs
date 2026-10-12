import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = pathToFileURL(join(root, process.env.MRC_HTML || 'dist/index.html')).href
const content = JSON.parse(readFileSync(join(root, 'src/data/generated/content.json'), 'utf8'))
const executablePath = process.env.CHROME_PATH || ['/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync)
if (!executablePath) throw new Error('Set CHROME_PATH to a Chromium/Chrome executable.')
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files'] })
const errors = []
const external = []
const scenarios = []
const key = 'pku346-recall-v1'

function observe(page) {
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('request', (request) => {
    if (!/^(file|data|blob):/.test(request.url())) external.push(request.url())
  })
}

async function open(context) {
  const page = await context.newPage()
  observe(page)
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(target, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('今日作战台'))
  await page.waitForFunction((storageKey) => Boolean(JSON.parse(localStorage.getItem(storageKey) || '{}').coachState), {}, key)
  return page
}

async function stored(page) {
  return page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)), key)
}

async function seed(page, state) {
  await page.evaluate((storageKey, value) => localStorage.setItem(storageKey, JSON.stringify(value)), key, state)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('今日作战台'))
}

async function click(page, label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((node) => {
      const label = node.cloneNode(true)
      label.querySelectorAll('small').forEach((shortcut) => shortcut.remove())
      return label.textContent.trim() === text
    })
    if (!button || button.disabled) return false
    button.click()
    return true
  }, label)
  assert.ok(clicked, `Missing enabled button: ${label}`)
}

async function complete(page, text = '闭卷输出：定义、过程、体育管理案例。') {
  await page.waitForSelector('textarea')
  await page.type('textarea', text)
  await click(page, '无提示交卷，去核对')
  await page.waitForFunction(() => document.body.innerText.includes('逐点核对'))
  const checkboxes = await page.$$('fieldset input[type="checkbox"]')
  for (const checkbox of checkboxes) {
    const isPoint = await checkbox.evaluate((node) => !node.closest('fieldset')?.querySelector('legend')?.textContent.includes('相关红线'))
    if (isPoint) await checkbox.click()
  }
  await click(page, '进入撤提示复述')
  await page.waitForFunction(() => document.body.innerText.includes('撤掉提示后再写一遍'))
  await page.type('textarea', '撤提示后重新写出答案骨架。')
  await click(page, '复述通过')
  await click(page, '记下这一轮')
  await page.waitForFunction(() => document.body.innerText.includes('本轮记录'))
}

try {
  const context = await browser.createBrowserContext()
  let page = await open(context)
  const baseline = await stored(page)
  assert.equal(baseline.attempts.length, 0)
  const first = content.items.find((item) => item.coreA)
  const title = await page.$eval('.coach-title', (node) => node.textContent)
  assert.equal(title, first.title)
  assert.equal(await page.$$eval('main .btn.primary', (nodes) => nodes.length), 1)
  assert.equal(await page.$$eval('.side nav button', (nodes) => nodes.length), 4)
  scenarios.push('1. 新用户自动推荐第一道 A 核心题，首页只有一个主按钮')

  await click(page, '开始训练')
  await page.type('textarea', '刷新和重新打开后保留的草稿。')
  const before = await stored(page)
  await page.reload({ waitUntil: 'networkidle0' })
  await click(page, '继续训练')
  assert.equal(await page.$eval('textarea', (node) => node.value), before.recall.draft)
  assert.equal((await stored(page)).coachState.reservedMinutes, 15)
  await page.close()
  page = await open(context)
  await click(page, '继续训练')
  assert.equal(await page.$eval('textarea', (node) => node.value), before.recall.draft)
  assert.equal((await stored(page)).coachState.tasks[0].id, before.coachState.tasks[0].id)
  scenarios.push('5. 刷新与关闭后重新打开，草稿、任务身份和预算均恢复')

  await complete(page)
  const finished = await stored(page)
  assert.equal(finished.attempts.length, 1)
  assert.equal(finished.attempts[0].evidenceState, 'independent')
  assert.equal(finished.attempts[0].highestHintUsed, 'none')
  assert.equal(finished.attempts[0].dueAt - finished.attempts[0].finishedAt, 3 * 86400000)
  assert.equal(finished.coachState.tasks[0].status, 'completed')
  assert.ok((await page.$eval('.coach-next', (node) => node.innerText)).includes('下一步：'))
  await click(page, '继续')
  assert.notEqual((await stored(page)).recall.itemId, first.id)
  assert.equal((await stored(page)).attempts.length, 1)
  scenarios.push('3. 原引擎生成独立提取和 3 天 dueAt，Coach 接续不同任务')

  const oldContext = await browser.createBrowserContext()
  const oldPage = await open(oldContext)
  const old = JSON.parse(JSON.stringify(baseline))
  delete old.coachState
  old.attempts = finished.attempts
  old.view = 'library'
  const second = content.items.filter((item) => item.coreA)[5]
  old.recall = { ...before.recall, itemId: second.id, draft: '来自 V2 的未完成草稿。' }
  old.recallQueue = [second.id]
  await seed(oldPage, old)
  assert.equal(await oldPage.$eval('.coach-title', (node) => node.textContent), second.title)
  await click(oldPage, '继续训练')
  assert.equal(await oldPage.$eval('textarea', (node) => node.value), old.recall.draft)
  const oldLoaded = await stored(oldPage)
  assert.deepEqual(oldLoaded.attempts, old.attempts)
  assert.equal(oldLoaded.schemaVersion, old.schemaVersion)
  assert.equal(oldLoaded.contentVersion, old.contentVersion)
  assert.deepEqual(oldLoaded.sourceHashes, old.sourceHashes)
  scenarios.push('2. V2 未完成 Recall 优先恢复，不被新题覆盖')
  scenarios.push('6. V2 已有证据、时间、版本、hash 原值读取，不回写评分')

  const budgetContext = await browser.createBrowserContext()
  const budgetPage = await open(budgetContext)
  await budgetPage.$eval('.coach-footer details', (node) => { node.open = true })
  await budgetPage.select('.coach-footer select', '15')
  await click(budgetPage, '开始训练')
  await complete(budgetPage)
  assert.ok((await budgetPage.$eval('.coach-next', (node) => node.innerText)).includes('可以收工'))
  await click(budgetPage, '回到今日')
  await budgetPage.reload({ waitUntil: 'networkidle0' })
  assert.ok((await budgetPage.$eval('main', (node) => node.innerText)).includes('可以收工'))
  assert.equal(await budgetPage.$$eval('main .btn.primary', (nodes) => nodes.length), 0)
  assert.equal((await stored(budgetPage)).coachState.tasks.length, 1)
  scenarios.push('4. 15 分钟预算完成后收工，刷新不追加任务')

  // A complete history leaves only future reviews: exercise the real wait UI.
  const wait = JSON.parse(JSON.stringify(baseline))
  const future = Date.now() + 45 * 60000
  wait.attempts = content.items.filter((item) => item.kind !== 'reference').map((item, index) => ({ ...finished.attempts[0], id: `old-${index}`, itemId: item.id, dueAt: future }))
  await seed(budgetPage, wait)
  assert.ok((await budgetPage.$eval('main', (node) => node.innerText)).includes('当前没有立即任务'))
  assert.ok((await budgetPage.$eval('main', (node) => node.innerText)).includes('下一次复测'))
  await click(budgetPage, '今天先到这里')
  await budgetPage.reload({ waitUntil: 'networkidle0' })
  assert.ok((await budgetPage.$eval('main', (node) => node.innerText)).includes('可以收工'))
  scenarios.push('补充：未来复测显示等待，主动收工状态可恢复')

  // Keep original JSON preview/import/rollback behavior exercised through the UI.
  await click(budgetPage, '设置数据')
  const rawBefore = await stored(budgetPage)
  const importJson = { ...old, recall: null, attempts: [finished.attempts[0]] }
  const file = await budgetPage.$('input[type="file"]')
  const importPath = join('/tmp', `mrc-lite-import-${process.pid}.json`)
  writeFileSync(importPath, JSON.stringify(importJson))
  await file.uploadFile(importPath)
  await budgetPage.waitForFunction(() => document.body.innerText.includes('确认写入'))
  assert.deepEqual((await stored(budgetPage)).attempts, rawBefore.attempts)
  await click(budgetPage, '确认写入')
  await budgetPage.waitForFunction(() => document.body.innerText.includes('导入完成'))
  assert.ok((await stored(budgetPage)).attempts.some((attempt) => attempt.id === finished.attempts[0].id))
  await click(budgetPage, '恢复到导入前备份')
  assert.deepEqual((await stored(budgetPage)).attempts, rawBefore.attempts)
  scenarios.push('补充：JSON 预览、确认导入与回滚沿用原流程')

  // Confirm existing exam UI remains reachable; its engine and timer are unchanged.
  await click(budgetPage, '闭卷考试（原版）')
  await click(budgetPage, 'A 题限时写作')
  await budgetPage.waitForSelector('.exam-page textarea')
  assert.ok(await budgetPage.$('.exam-page .timer'))
  scenarios.push('补充：原版闭卷考试与限时写作入口仍可使用')

  const screenshotContext = await browser.createBrowserContext()
  const screenshotPage = await open(screenshotContext)
  mkdirSync(join(root, 'reports'), { recursive: true })
  await screenshotPage.screenshot({ path: join(root, 'reports/alpha-lite-today.png'), fullPage: true })
  await screenshotPage.setViewport({ width: 375, height: 720 })
  const mobile = await screenshotPage.evaluate(() => ({ inner: innerWidth, scroll: document.documentElement.scrollWidth }))
  assert.ok(mobile.scroll <= mobile.inner + 2, JSON.stringify(mobile))
  await screenshotPage.screenshot({ path: join(root, 'reports/alpha-lite-mobile.png'), fullPage: true })
  assert.deepEqual(external, [])
  assert.deepEqual(errors, [])
  const report = { ok: true, target, browser: await browser.version(), scenarios, mobile, external, errors }
  writeFileSync(join(root, 'reports/alpha-lite-file-check.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
