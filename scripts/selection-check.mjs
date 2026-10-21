import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export async function checkSelection({ open, seed, click, text, stores, settle, scenarios, completeMrc, root }) {
  const pk = '346-fusion-platform-v1'
  const a = await open({ withTextbook: true }), page = a.page
  const base = await stores(page), proto = base.platform.general.points.find(p => !p.trainingBlocked)
  base.platform.general.points = ['一题', '二题', '概论题', '参考题'].map((title, n) => ({ ...proto, id: `selection-${n}`, title, subject: n === 2 ? '体育概论' : '运动生理学', content: '定义与作用。', checklist: ['定义'], quotaChapterOverride: '第一章', trainingBlocked: n === 3, totalReviews: 0, dueDate: Date.now() - 1000, leaks: [] }))
  base.platform.day.selectedChapters = {}
  await seed(page, base.platform, base.mrc)
  const toggle = async label => {
    await page.$eval('.subject-picker', n => { if (!n.open) n.querySelector('summary').click() })
    await page.evaluate(label => [...document.querySelectorAll('.subject-options label')].find(n => n.textContent === label).querySelector('input').click(), label)
  }
  const completeGeneral = async () => { await click(page, '提交草稿，核对原文'); await click(page, '记住'); await settle(page, () => document.body.innerText.includes('本轮已保存')) }
  const library = async () => click(page, '资料库', '.side')
  const chapter = async () => page.$eval('[aria-label="练习本节：第一章"]', n => n.click())
  await click(page, '自选科目'); await toggle('体育管理学'); await toggle('运动生理学')
  assert.deepEqual((await stores(page)).platform.day.subjects, ['体育概论'])
  assert.ok((await page.$eval('.coach-title', n => n.textContent)).includes('概论题'))
  await page.reload({ waitUntil: 'networkidle0' })
  assert.deepEqual((await stores(page)).platform.day.subjects, ['体育概论'])
  assert.equal(await page.$eval('.subject-options input:checked', n => n.disabled), true)
  for (const width of [320, 390, 768]) {
    await page.setViewport({ width, height: 880 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true)
  }
  await page.setViewport({ width: 390, height: 880 })
  await page.screenshot({ path: join(root, 'reports/subject-selection-mobile.png') })
  scenarios.push('主页自选科目支持多选且至少保留一科；刷新保留选择，320/390/768px无横向溢出，仅推荐选定科目')

  await click(page, '开始训练'); await page.type('textarea', '概论未完成稿')
  const active = await stores(page)
  await click(page, '暂停，回到今日'); await toggle('运动生理学'); await toggle('体育概论')
  assert.equal((await stores(page)).platform.active.id, active.platform.active.id)
  await click(page, '继续训练')
  assert.equal(await page.$eval('textarea', n => n.value), '概论未完成稿')
  await completeGeneral()
  assert.equal((await stores(page)).platform.general.logs.length, 1)
  assert.ok((await text(page)).includes('下一步：一题'))
  scenarios.push('有草稿时切科不覆盖任务、不重复扣预算；原任务保存后，下一题才使用新科目范围')

  const limited = structuredClone(base)
  limited.platform.day.subjects = ['体育概论']; limited.platform.day.budgetMinutes = 15
  limited.platform.settings.subjects['运动生理学'].newCap = 0
  await seed(page, limited.platform, limited.mrc)
  await library(); await chapter()
  const prior = await stores(page)
  assert.ok((await page.$eval('dialog[open]', n => n.innerText)).includes('2 道'))
  await page.keyboard.press('Escape'); assert.deepEqual(await stores(page), prior)
  await chapter(); await click(page, '确认开始练习', 'dialog[open]')
  await page.type('textarea', '第一章原稿')
  let snapshot = await stores(page)
  assert.equal(snapshot.platform.day.practice.itemIds.length, 2)
  assert.equal(snapshot.platform.day.tasks.length, 1)
  await page.reload({ waitUntil: 'networkidle0' }); await click(page, '继续训练')
  assert.equal(await page.$eval('textarea', n => n.value), '第一章原稿')
  await completeGeneral()
  assert.ok((await text(page)).includes('今日预算已用完或不足'))
  assert.deepEqual((await stores(page)).platform.day.practice.itemIds, ['selection-1'])
  scenarios.push('资料库整节练习排除参考题，显式选择可越过自动新学配额和科目筛选；预览取消无写入，刷新恢复同一草稿')

  await click(page, '本范围再练一题')
  snapshot = await stores(page)
  assert.ok((await page.$eval('dialog[open]', n => n.innerText)).includes('追加 5 分钟'))
  await click(page, '暂不开始', 'dialog[open]'); assert.deepEqual(await stores(page), snapshot)
  await click(page, '本范围再练一题'); await click(page, '追加5分钟并开始', 'dialog[open]')
  await completeGeneral()
  snapshot = await stores(page)
  assert.equal(snapshot.platform.day.budgetMinutes, 20)
  assert.equal(snapshot.platform.settings.minutes, 60)
  assert.equal(snapshot.platform.general.logs.length, 2)
  assert.ok((await text(page)).includes('本次自主练习范围已结束'))
  assert.equal(await page.$$eval('.coach-next button', ns => ns.some(n => n.textContent === '继续')), false)
  await page.reload({ waitUntil: 'networkidle0' })
  assert.ok((await text(page)).includes('本次自主练习范围已结束'))
  scenarios.push('章节续练耗尽预算时停止；追加5分钟须本人确认且不改变明天默认预算；章节完成后停止、不补入其他科目')

  await library(); await click(page, '一题'); await click(page, '练这道题')
  assert.ok((await page.$eval('dialog[open]', n => n.innerText)).includes('提前练习'))
  const beforeEarly = await stores(page)
  await click(page, '追加10分钟并开始', 'dialog[open]')
  assert.deepEqual((await stores(page)).platform.general, beforeEarly.platform.general)
  await completeGeneral()
  assert.equal((await stores(page)).platform.general.logs.length, 3)
  assert.ok((await text(page)).includes('本次自主练习范围已结束'))
  scenarios.push('单题提前练习有明确提示；开始不改dueDate，保存仅生成一条原FSRS日志，单题结束不自动接题')

  await seed(page, base.platform, base.mrc)
  const bytes = await page.evaluate(key => localStorage.getItem(key), pk)
  await page.evaluate(key => { const original = Storage.prototype.setItem; window.restoreScopeStorage = () => { Storage.prototype.setItem = original }; Storage.prototype.setItem = function(k, v) { if (k === key) throw Error('scope test storage full'); return original.call(this, k, v) } }, pk)
  await click(page, '自选科目')
  assert.equal(await page.$eval('.subject-selection button', n => n.getAttribute('aria-pressed')), 'true')
  assert.equal(await page.evaluate(key => localStorage.getItem(key), pk), bytes)
  await library(); await chapter(); await click(page, '确认开始练习', 'dialog[open]')
  assert.ok((await page.$eval('dialog[open]', n => n.innerText)).includes('保存失败'))
  assert.equal(await page.evaluate(key => localStorage.getItem(key), pk), bytes)
  await page.evaluate(() => window.restoreScopeStorage()); await click(page, '暂不开始', 'dialog[open]')
  scenarios.push('科目选择和自主练习保存失败时不显示假成功、不占预算、不创建草稿；弹窗可取消并保留原始存储')

  const contents = JSON.parse(readFileSync(join(root, 'src/data/generated/management-ultimate.json'), 'utf8'))
  const first = contents.items.find(i => i.coreA)
  // The shared legacy MRC completion helper exercises desktop pointer coordinates.
  await page.setViewport({ width: 1280, height: 900 })
  const mrcFixture = structuredClone(base)
  mrcFixture.mrc.library = { ...mrcFixture.mrc.library, source: 'A', chapterId: first.chapterId, itemId: '', pageAnchor: '', query: '' }
  await seed(page, mrcFixture.platform, mrcFixture.mrc)
  await library(); await click(page, '管理学资料'); await click(page, '练习本节')
  await click(page, '确认开始练习', 'dialog[open]')
  assert.equal((await stores(page)).platform.active.module, 'mrc')
  await completeMrc(page)
  snapshot = await stores(page)
  assert.equal(snapshot.mrc.attempts.length, 1)
  assert.equal(snapshot.mrc.attempts[0].evidenceState, 'independent')
  assert.equal(snapshot.mrc.attempts[0].dueAt - snapshot.mrc.attempts[0].finishedAt, 3 * 86400000)
  assert.equal(snapshot.platform.day.practice.itemIds.includes(snapshot.platform.active.itemId), false)
  scenarios.push('管理学章节练习复用原Recall，生成唯一Attempt和原独立证据/三天复测，完成题从自主范围移除')
  await a.context.close()
}
