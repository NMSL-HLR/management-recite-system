import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function checkManagement({ open, seed, click, text, stores, settle, scenarios, root, completeMrc }) {
  const current = JSON.parse(readFileSync(join(root, 'src/data/generated/management-ultimate.json'), 'utf8'))
  const legacy = JSON.parse(readFileSync(join(root, 'src/data/generated/content.json'), 'utf8'))
  const first = current.items[0], oldItem = legacy.items.find(i => i.coreA)
  const { page, context } = await open({ withTextbook: true })
  const baseline = await stores(page)
  await click(page, '开始训练')
  await page.type('textarea', '旧版正在写的管理学草稿')
  const started = await stores(page)
  await completeMrc(page)
  const completed = await stores(page)
  const original = structuredClone(started)
  original.mrc.contentVersion = legacy.meta.contentVersion
  original.mrc.sourceHashes = legacy.meta.sourceHashes
  original.mrc.recall.itemId = oldItem.id
  original.mrc.recallQueue = [oldItem.id]
  original.mrc.attempts = [{ ...completed.mrc.attempts[0], id: 'legacy-ultimate-upgrade', itemId: oldItem.id, startedAt: Date.now() - 100000, finishedAt: Date.now() - 90000 }]
  original.mrc.notes = [{ itemId: oldItem.id, text: '旧版笔记不能丢', updatedAt: Date.now() }]
  original.mrc.bookmarks = [oldItem.id]
  original.mrc.exam = { id: 'legacy-exam-upgrade', title: '旧版考试', itemIds: [oldItem.id], index: 0, startedAt: Date.now(), limitSeconds: null, answers: { [oldItem.id]: { text: '旧版考试答案不能丢', revealed: false } } }
  original.platform.active = { ...original.platform.active, itemId: oldItem.id, title: oldItem.title, chapterKey: `mrc::${oldItem.chapterId}` }
  original.platform.day.tasks = [original.platform.active]
  original.platform.day.selectedChapters['体育管理学'] = [`mrc::${oldItem.chapterId}`]
  original.platform.day.practice = { module: 'mrc', kind: 'chapter', title: oldItem.chapter, itemIds: [oldItem.id] }
  await seed(page, original.platform, original.mrc)
  const upgraded = await stores(page)
  assert.deepEqual(upgraded.mrc.attempts, original.mrc.attempts)
  assert.deepEqual(upgraded.mrc.notes, original.mrc.notes)
  assert.deepEqual(upgraded.mrc.bookmarks, original.mrc.bookmarks)
  assert.deepEqual(upgraded.platform.general, original.platform.general)
  assert.equal(upgraded.mrc.recall, null); assert.equal(upgraded.mrc.exam, null)
  assert.ok(JSON.stringify(upgraded.mrc.migrationReview).includes('旧版正在写的管理学草稿'))
  assert.ok(JSON.stringify(upgraded.mrc.migrationReview).includes('旧版考试答案不能丢'))
  assert.equal(upgraded.platform.day.practice, undefined)
  assert.equal(upgraded.platform.day.budgetMinutes, original.platform.day.budgetMinutes)
  assert.ok(!(upgraded.platform.day.selectedChapters['体育管理学'] ?? []).includes(`mrc::${oldItem.chapterId}`))
  assert.ok((await text(page)).includes(first.title))
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('pku346-content-before-repair-v1'))), original.mrc)
  await page.reload({ waitUntil: 'networkidle0' })
  assert.deepEqual((await stores(page)).mrc.migrationReview, upgraded.mrc.migrationReview)
  await click(page, '学习记录', '.side'); await click(page, '查看管理学记录')
  assert.ok((await text(page)).includes(oldItem.title))
  assert.ok((await text(page)).includes('旧版批注'))
  scenarios.push('旧A/B本地数据升级保留成绩、批注、书签和其他科目；草稿与考试归档，旧章节及任务不挡新题，刷新不重复归档')

  await seed(page, baseline.platform, baseline.mrc)
  const dir = mkdtempSync(join(tmpdir(), '346-management-import-'))
  const path = join(dir, 'legacy-envelope.json')
  writeFileSync(path, JSON.stringify({ format: '346-fusion', platformVersion: 1, exportedAt: Date.now(), platform: original.platform, mrc: original.mrc }))
  await click(page, '设置数据', '.side')
  await (await page.$('[data-testid="fusion-import"]')).uploadFile(path)
  await settle(page, () => document.body.innerText.includes('导入预览'))
  await click(page, '确认整合导入')
  assert.deepEqual((await stores(page)).mrc.attempts, original.mrc.attempts)
  assert.deepEqual((await stores(page)).platform.general, original.platform.general)
  assert.equal((await stores(page)).mrc.contentVersion, current.meta.contentVersion)
  scenarios.push('旧教材全科JSON实际上传恢复成功，旧成绩不改写为新题成绩，其他科目数据逐字段保持')

  await click(page, '资料库', '.side'); await click(page, '管理学资料')
  await click(page, '正文')
  await page.select('[aria-label="管理学章节"]', 'ultimate-c10')
  assert.equal(await page.$$eval('.block-link', ns => ns.length), 6)
  await click(page, `完整题 · ${current.items[55].title}`)
  assert.equal(await page.$eval('main h1', n => n.textContent), current.items[55].title)
  assert.ok(!(await text(page)).includes('PDF'))
  await click(page, '练这道题')
  await click(page, '确认开始练习', 'dialog[open]')
  assert.equal((await stores(page)).mrc.recall.itemId, current.items[55].id)
  await page.reload({ waitUntil: 'networkidle0' }); await click(page, '继续训练')
  assert.equal((await stores(page)).mrc.recall.itemId, current.items[55].id)
  await click(page, '资料库', '.side'); await click(page, '管理学资料'); await click(page, '附录')
  assert.equal(await page.$$eval('.block-link', ns => ns.length), 22)
  await click(page, `参考资料 · ${current.items.at(-1).title}`)
  assert.ok(!(await text(page)).includes('练这道题'))
  assert.ok((await text(page)).includes('举国体制'))
  await click(page, '全部')
  await page.type('[aria-label="搜索管理学原文"]', '赛事管理的全过程')
  await page.click('.library > .stack > .card ul button')
  assert.equal(await page.$eval('main h1', n => n.textContent), current.items[48].title)
  assert.ok((await text(page)).includes('练这道题'))
  await page.setViewport({ width: 390, height: 880 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: join(root, 'reports/management-ultimate-mobile.png'), fullPage: false })
  scenarios.push('新稿第十章六道论述题可选题练习并刷新续接，附录22组仅查询，搜索直达可训练题目，来源不冒充PDF，390px正文正常阅读')
  await context.close()
}
