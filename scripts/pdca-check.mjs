import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkPdca({ open, seed, click, text, stores, settle, scenarios, completeMrc }) {
  const pk='346-fusion-platform-v1', mk='pku346-recall-v1', bk='pku346-content-before-repair-v1'
  const scratch=mkdtempSync(join(tmpdir(),'346-pdca-'))
  const {page,context}=await open()
  const base=await stores(page)
  await click(page,'开始训练');await page.type('textarea','进行中的原始草稿')
  const active=await stores(page)
  await completeMrc(page)
  const attempt=(await stores(page)).mrc.attempts.at(-1)
  const removed=structuredClone(active)
  const historic={...attempt,itemId:'removed-history',preRevealDraft:{text:'迁移后必须完整保留的历史正文',createdAt:attempt.startedAt},restatementText:'历史复述',userNote:'私人批注'}
  removed.mrc.attempts=[historic]
  removed.mrc.sourceHashes.A='previous-textbook'
  removed.mrc.recall={...removed.mrc.recall,itemId:'removed-active',draft:'不可用题的完整草稿'}
  removed.mrc.recallQueue=['removed-active']
  removed.mrc.exam={id:'removed-exam',title:'旧考试',itemIds:['removed-exam-item'],index:0,startedAt:Date.now(),limitSeconds:null,answers:{'removed-exam-item':{text:'旧考试完整答案',revealed:false}}}
  removed.platform.active={...removed.platform.active,itemId:'removed-active'}
  removed.platform.day.tasks=[removed.platform.active]
  await seed(page,removed.platform,removed.mrc)
  const repaired=await stores(page)
  assert.deepEqual(repaired.mrc.attempts,[historic])
  assert.equal(repaired.mrc.recall,null);assert.equal(repaired.mrc.exam,null)
  assert.equal(repaired.platform.active,null)
  assert.deepEqual(repaired.platform.unavailableTasks,[removed.platform.active])
  assert.ok(repaired.mrc.migrationReview.some(r=>r.recovery?.recall?.draft==='不可用题的完整草稿'))
  assert.ok(repaired.mrc.migrationReview.some(r=>r.recovery?.exam?.answers['removed-exam-item'].text==='旧考试完整答案'))
  assert.equal(await page.evaluate(k=>localStorage.getItem(k),bk),JSON.stringify(removed.mrc))
  const review=structuredClone(repaired.mrc.migrationReview)
  await page.reload({waitUntil:'networkidle0'});await settle(page,()=>document.body.innerText.includes('今日作战台'))
  assert.deepEqual((await stores(page)).mrc.migrationReview,review)
  await click(page,'开始训练');assert.equal((await stores(page)).platform.day.tasks.length,1)
  await click(page,'设置数据','.side');await click(page,'管理学详细设置')
  await page.evaluate(()=>{const section=[...document.querySelectorAll('section')].find(n=>n.querySelector('h2')?.textContent.startsWith('迁移待查'));section.querySelectorAll('details').forEach(n=>{n.open=true})})
  assert.ok((await text(page)).includes('迁移后必须完整保留的历史正文'))
  assert.ok((await text(page)).includes('不可用题的完整草稿'))
  scenarios.push('教材变更后完整历史、失效草稿、整场考试与旧任务均保留；迁移前原始快照逐字一致，刷新不重复归档且可开始新题')

  // Actual exported file must carry all retained data into another browser context.
  await click(page,'前往全科设置')
  await (await page.createCDPSession()).send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:scratch})
  await click(page,'导出全科整包')
  const stamp=await page.evaluate(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`})
  const downloaded=join(scratch,`346-Fusion-${stamp}.json`)
  let exported
  for(let n=0;n<100;n++){try{exported=JSON.parse(readFileSync(downloaded,'utf8'));break}catch{}await new Promise(r=>setTimeout(r,50))}
  assert.deepEqual(exported.mrc.attempts,[historic])
  const second=await open()
  await click(second.page,'设置数据','.side');await (await second.page.$('[data-testid="fusion-import"]')).uploadFile(downloaded)
  await settle(second.page,()=>document.body.innerText.includes('导入预览'));await click(second.page,'确认整合导入')
  const imported=await stores(second.page)
  assert.deepEqual(imported.mrc.migrationReview,exported.mrc.migrationReview)
  assert.deepEqual(imported.mrc.attempts,exported.mrc.attempts)
  assert.deepEqual(imported.platform.unavailableTasks,exported.platform.unavailableTasks)
  await second.context.close()
  scenarios.push('实际导出全科JSON再在另一浏览器上下文恢复：完整待查记录、历史作答和已移出任务均不丢失')
  await context.close()

  const invalid=await open()
  await click(invalid.page,'设置数据','.side')
  const unchanged=await stores(invalid.page)
  for(const confidence of [9,1.5]) {
    const bad=structuredClone(active);bad.mrc.recall.selfConfidence=confidence
    const path=join(scratch,'invalid-confidence.json');writeFileSync(path,JSON.stringify({format:'346-fusion',platformVersion:1,platform:bad.platform,mrc:bad.mrc}))
    await (await invalid.page.$('[data-testid="fusion-import"]')).uploadFile(path)
    await settle(invalid.page,()=>document.body.innerText.includes('草稿证据不合法'))
    assert.ok(!(await text(invalid.page)).includes('导入预览'))
    assert.deepEqual(await stores(invalid.page),unchanged)
  }
  await invalid.context.close()
  scenarios.push('信心9及小数1.5的整包在预览前被拒绝，不写入任何学习状态，也不会留到下次启动才报损坏')

  const failed=await open()
  await failed.page.evaluate((pk,mk,p,m)=>{localStorage.setItem(pk,JSON.stringify(p));localStorage.setItem(mk,JSON.stringify(m))},pk,mk,removed.platform,removed.mrc)
  await failed.page.evaluateOnNewDocument(bk=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===bk)throw new DOMException('模拟备份空间不足','QuotaExceededError');return set.call(this,k,v)}},bk)
  await failed.page.reload({waitUntil:'networkidle0'})
  await settle(failed.page,()=>document.body.innerText.includes('迁移前备份失败'))
  assert.equal(await failed.page.evaluate(k=>localStorage.getItem(k),mk),JSON.stringify(removed.mrc))
  assert.equal(await failed.page.evaluate(k=>localStorage.getItem(k),pk),JSON.stringify(removed.platform))
  assert.equal(await failed.page.$eval('[data-testid="start-training"]',n=>n.disabled),true)
  await failed.context.close()
  scenarios.push('迁移前快照写入失败时停止迁移与训练，两个模块原始存储均逐字保留，不生成假成功状态')

  const wait=await open({withTextbook:true});const fixture=await stores(wait.page),point=fixture.platform.general.points.find(p=>!p.trainingBlocked)
  for(const policy of Object.values(fixture.platform.settings.subjects))policy.newCap=0
  const task={id:'pdca-forget-task',module:'general',itemId:point.id,title:point.title,subject:point.subject,chapterKey:`${point.subject}::${point.quotaChapterOverride}`,isNew:true,reason:'复测验证',estimatedMinutes:10,status:'in_progress',startedAt:Date.now()}
  fixture.platform.active=task;fixture.platform.day.tasks=[task];fixture.platform.session={taskId:task.id,itemId:point.id,phase:'draft',draft:'',frozenDraft:null,checked:[],rating:null}
  await seed(wait.page,fixture.platform,fixture.mrc);await click(wait.page,'继续训练');await click(wait.page,'提交草稿，核对原文');await click(wait.page,'忘记')
  const cooled=await stores(wait.page)
  assert.equal(cooled.platform.general.logs.length,1)
  assert.ok(cooled.platform.general.points.find(p=>p.id===point.id).dueDate<=Date.now())
  assert.ok((await text(wait.page)).includes('先休息20分钟'))
  assert.ok((await text(wait.page)).includes('当前没有立即任务'))
  await wait.page.reload({waitUntil:'networkidle0'});await settle(wait.page,()=>document.body.innerText.includes('今日作战台'))
  assert.ok((await text(wait.page)).includes('当前没有立即任务'))
  assert.equal((await stores(wait.page)).platform.day.tasks.length,1)
  await wait.context.close()
  scenarios.push('通用忘记后教练等待20分钟且刷新保持，仅产生1条日志和1次预算占用；原FSRS dueDate未修改')
}
