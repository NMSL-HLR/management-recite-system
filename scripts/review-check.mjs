import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export async function checkReview({ open, seed, click, text, stores, settle, scenarios, root }) {
  const c = JSON.parse(readFileSync(join(root, 'src/data/generated/management-ultimate.json'), 'utf8'))
  const item = c.items.find(i => i.coreA), pk = '346-fusion-platform-v1'
  const put = (page, value) => page.$eval('textarea', (el, value) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, value)
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: value }))
  }, value)
  const a = await open()
  await a.page.setViewport({ width:390, height:880 })
  await click(a.page, '开始训练')
  const draft = item.checkPoints.map(p => p.sourceText).join('\n') + '\n<script>此处是原稿文字，不是可执行脚本</script>'
  await put(a.page, draft)
  assert.equal(await a.page.$('[data-testid="answer-review"]'), null)
  assert.equal((await stores(a.page)).mrc.recall.draft, draft)
  await click(a.page, '无提示交卷，去核对')
  await a.page.waitForSelector('[data-testid="answer-review"]')
  let snapshot = await stores(a.page)
  assert.equal(snapshot.mrc.recall.frozenDraft.text, draft)
  assert.deepEqual(snapshot.mrc.recall.checkedPointIds, [])
  assert.equal(snapshot.mrc.attempts.length, 0)
  assert.equal(snapshot.mrc.recall.highestHintUsed, 'none')
  const extra = item.checkPoints.find(p => p.role === 'sports')
  await a.page.evaluate(label => { const n = [...document.querySelectorAll('fieldset label')].find(n => n.textContent.trim().endsWith(label)); n.querySelector('input').click() }, extra.label)
  const beforeBatch = (await stores(a.page)).mrc.recall.checkedPointIds
  const batchButton = await a.page.$$eval('.answer-review button', ns => ns.find(n => n.textContent.startsWith('确认原文对应项'))?.textContent)
  assert.ok(batchButton)
  await click(a.page, batchButton, '.answer-review'); await click(a.page, '暂不应用', '.answer-review')
  assert.deepEqual((await stores(a.page)).mrc.recall.checkedPointIds, beforeBatch)
  await click(a.page, batchButton, '.answer-review'); await click(a.page, '我已核对，应用这些勾选', '.answer-review')
  const batchConfirmed = (await stores(a.page)).mrc.recall.checkedPointIds
  assert.ok(batchConfirmed.length > 2 && batchConfirmed.includes(extra.id))
  // Conservative alignment leaves some outline/metadata points for manual review.
  for (const checkbox of await a.page.$$('fieldset input[type=checkbox]')) if (await checkbox.evaluate(n => !n.checked)) await checkbox.click()
  const confirmed = (await stores(a.page)).mrc.recall.checkedPointIds
  assert.equal(confirmed.length, item.checkPoints.length)
  assert.equal((await stores(a.page)).mrc.attempts.length, 0)
  scenarios.push('评审只在冻结交卷后出现；自动匹配不勾选、不生成Attempt、不改变提示等级，批量确认可取消且保留已有体育核对项')

  await a.page.$eval('.review-tools', n => { n.open = true })
  await a.page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('模拟手机复制权限限制')) } }))
  await click(a.page, '复制评审报告', '.answer-review')
  await settle(a.page, () => Boolean(document.querySelector('.review-report')))
  assert.ok((await a.page.$eval('.review-report', n => n.textContent)).includes(draft))
  assert.equal(await a.page.$('.review-report script'), null)
  const dir = mkdtempSync(join(tmpdir(), '346-review-download-'))
  await (await a.page.createCDPSession()).send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir })
  await click(a.page, '下载评审报告', '.answer-review')
  const stamp = await a.page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  let report = ''
  for (let i=0; i<80; i++) { try { report = readFileSync(join(dir, `346-答题评审-${stamp}.txt`), 'utf8'); break } catch {} await new Promise(r => setTimeout(r,50)) }
  assert.ok(report.includes(draft) && report.includes('本人核对：已确认写到') && report.includes('教材对应正文：'))
  scenarios.push('手机复制权限失败时可长按报告文字复制；真实TXT下载保留原稿、教材依据与本人确认，HTML样式的输入只作为文字展示')

  await a.page.reload({ waitUntil: 'networkidle0' }); await click(a.page, '继续训练')
  snapshot = await stores(a.page)
  assert.equal(snapshot.mrc.recall.frozenDraft.text, draft)
  assert.deepEqual(snapshot.mrc.recall.checkedPointIds, confirmed)
  for (const width of [320,390,768]) {
    await a.page.setViewport({ width, height: 880 })
    assert.ok(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `review overflow ${width}`)
  }
  await a.page.setViewport({ width:390, height:880 })
  await a.page.screenshot({ path: join(root, 'reports/review-mobile.png') })
  await click(a.page, '核对完成，去撤提示复述', '.answer-review')
  assert.equal(await a.page.$('[data-testid="answer-review"]'), null)
  await put(a.page, '撤提示复述仍独立完成。')
  await click(a.page, '复述通过'); await click(a.page, '记下这一轮')
  snapshot = await stores(a.page)
  assert.equal(snapshot.mrc.attempts.length, 1)
  assert.deepEqual(snapshot.mrc.attempts[0].checkedPointIds, confirmed)
  assert.equal(snapshot.mrc.attempts[0].preRevealDraft.text, draft)
  assert.equal(snapshot.mrc.attempts[0].evidenceState, 'independent')
  assert.equal(snapshot.mrc.attempts[0].dueAt - snapshot.mrc.attempts[0].finishedAt, 3*86400000)
  await a.context.close()
  scenarios.push('320/390/768px评审无横向溢出；刷新恢复冻结稿和确认项，撤提示阶段不显示评审，最终仍由原引擎生成独立证据及三天复测')

  const b = await open({ withTextbook: true }), fixture = await stores(b.page)
  const point = fixture.platform.general.points.find(p => p.subject === '运动生理学' && p.content.includes('180次/min'))
  const task = { id: 'review-test-general', module: 'general', itemId: point.id, subject: point.subject, title: point.title, chapterKey: `${point.subject}::${point.quotaChapterOverride}`, isNew:true, reason:'评审测试', estimatedMinutes:15, status:'in_progress', startedAt:Date.now() }
  fixture.platform.active=task;fixture.platform.day.tasks=[task];fixture.platform.session={ taskId:task.id,itemId:point.id,phase:'draft',draft:'',frozenDraft:null,checked:[],rating:null }
  await seed(b.page,fixture.platform,fixture.mrc);await click(b.page,'继续训练')
  const wrong = point.content.replace('180次/min','160次/min')
  await put(b.page,wrong);await click(b.page,'提交草稿，核对原文')
  assert.ok((await text(b.page)).includes('数字或单位与原文片段不同'))
  assert.deepEqual((await stores(b.page)).platform.session.checked,[])
  assert.equal((await stores(b.page)).platform.general.logs.length,0)
  // A failed store write must not produce a fake confirmed row.
  const rawBefore = await b.page.evaluate(pk=>localStorage.getItem(pk),pk)
  await b.page.evaluate(pk=>{window.__reviewSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===pk)throw new DOMException('模拟配额不足','QuotaExceededError');return window.__reviewSet.call(this,k,v)}},pk)
  await click(b.page,'我核对过，这项写到了','.answer-review')
  assert.equal(await b.page.evaluate(pk=>localStorage.getItem(pk),pk),rawBefore)
  assert.equal(await b.page.$eval('[data-testid="review-confirmed"]',n=>n.textContent),'0')
  assert.ok((await text(b.page)).includes('保存失败'))
  await b.page.evaluate(()=>{Storage.prototype.setItem=window.__reviewSet;delete window.__reviewSet})
  await click(b.page,'我核对过，这项写到了','.answer-review')
  const chosen=(await stores(b.page)).platform.session.checked
  assert.equal(chosen.length,1)
  await b.page.reload({waitUntil:'networkidle0'});await click(b.page,'继续训练')
  assert.deepEqual((await stores(b.page)).platform.session.checked,chosen)
  await click(b.page,'核对完成，去选择回忆等级','.answer-review')
  assert.equal(await b.page.evaluate(()=>document.activeElement.id),'general-self-rating')
  await click(b.page,'记住')
  const graded=(await stores(b.page)).platform
  assert.equal(graded.general.logs.length,1);assert.equal(graded.general.logs[0].rating,3)
  assert.equal(graded.general.logs[0].preRevealDraft,wrong)
  assert.deepEqual(graded.general.logs[0].checkedLabels,chosen)
  await b.context.close()
  scenarios.push('生理学数值差异显示需检查；保存失败不产生假确认，刷新保留确认项，评分仍需本人选择并只生成一条原FSRS日志')

  const e=await open(), examBase=await stores(e.page)
  examBase.mrc.exam={id:'review-exam',title:'评审验收',itemIds:[item.id],index:0,startedAt:Date.now(),questionStartedAt:Date.now(),limitSeconds:60,answers:{[item.id]:{text:draft,revealed:false}}}
  await seed(e.page,examBase.platform,examBase.mrc)
  await click(e.page,'设置数据','.side');await click(e.page,'管理学闭卷考试')
  assert.equal(await e.page.$('[data-testid="answer-review"]'),null)
  await click(e.page,'对照原文')
  assert.ok(await e.page.$('[data-testid="answer-review"]'))
  assert.ok(!(await e.page.$eval('.answer-review',n=>n.innerText)).includes('我核对过，这项写到了'))
  const sealed=(await stores(e.page)).mrc.exam
  await click(e.page,'原文对应','.answer-review')
  assert.deepEqual((await stores(e.page)).mrc.exam,sealed)
  assert.equal((await stores(e.page)).mrc.attempts.length,0)
  assert.equal(await e.page.$eval('textarea',n=>n.readOnly),true)
  await e.context.close()
  scenarios.push('闭卷考试揭晓前不出现评审，揭晓后只读评审不改作答、冻结用时或生成学习成绩')
}
