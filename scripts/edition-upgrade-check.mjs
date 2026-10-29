import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
export async function checkEditionUpgrade({ open, seed, click, text, stores, settle, scenarios, root, completeMrc }) {
  const oldMgt = JSON.parse(readFileSync(join(root,'sources/editions/management-2026-10-21.json'),'utf8'))
  const oldPhys = JSON.parse(readFileSync(join(root,'sources/editions/physiology-v1.json'),'utf8'))
  const oldPolicy = JSON.parse(readFileSync(join(root,'sources/editions/policy-six.json'),'utf8'))
  const {page,context}=await open({withTextbook:true})
  await click(page,'开始训练');await completeMrc(page)
  const old=await stores(page), now=Date.now()
  old.mrc.contentVersion=oldMgt.meta.contentVersion;old.mrc.sourceHashes=oldMgt.meta.sourceHashes;old.mrc.recall=null;old.mrc.recallQueue=[]
  old.platform.general.points=[...oldPhys.points,...oldPolicy.points]
  old.platform.general.installedTextbooks=[oldPhys.packId,oldPolicy.packId]
  const point=old.platform.general.points[0]
  point.totalReviews=5;point.dueDate=now-1000;point.privateNote='旧生理学笔记'
  const task={id:'edition-old-phys',module:'general',itemId:point.id,title:point.title,subject:point.subject,chapterKey:`${point.subject}::${point.quotaChapterOverride}`,isNew:false,reason:'旧版复习',estimatedMinutes:15,status:'in_progress',startedAt:now}
  old.platform.active=task;old.platform.day.tasks=[task]
  old.platform.session={taskId:task.id,itemId:point.id,phase:'draft',draft:'旧生理学进行中的作答',frozenDraft:null,checked:[],rating:null}
  await seed(page,old.platform,old.mrc)
  let updated=await stores(page)
  assert.equal(updated.platform.general.points.length,199)
  assert.equal(updated.platform.general.points.filter(p=>!p.retiredTextbook).length,113)
  assert.deepEqual(updated.mrc.attempts,old.mrc.attempts)
  assert.equal(updated.mrc.migrationReview.length,old.mrc.migrationReview.length)
  assert.deepEqual(updated.platform.session,old.platform.session)
  assert.deepEqual(updated.platform.day.tasks,old.platform.day.tasks)
  await click(page,'继续训练')
  assert.equal(await page.$eval('textarea',n=>n.value),'旧生理学进行中的作答')
  await click(page,'提交草稿，核对原文')
  assert.ok((await text(page)).includes(point.content))
  await click(page,'记住')
  updated=await stores(page)
  assert.equal(updated.platform.general.points.find(p=>p.id===point.id).totalReviews,6)
  assert.ok(updated.platform.general.points.filter(p=>!p.retiredTextbook).every(p=>p.totalReviews===0))
  await click(page,'资料库','.side')
  assert.equal(await page.$$eval('ul.plain > li',ns=>ns.length),73)
  await click(page,'体育概论');assert.equal(await page.$$eval('ul.plain > li',ns=>ns.length),40)
  await click(page,'旧教材档案');assert.equal(await page.$$eval('ul.plain > li',ns=>ns.length),86)
  scenarios.push('三科同时升级：管理学原证据不变，生理学旧草稿按旧答案完成；新73/40题不继承成绩，86项旧资料可查询，预算保留')
  const path=join(mkdtempSync(join(tmpdir(),'three-subject-import-')),'old-full.json')
  writeFileSync(path,JSON.stringify({format:'346-fusion',platformVersion:1,exportedAt:now,platform:old.platform,mrc:old.mrc}))
  await click(page,'设置数据','.side');await(await page.$('[data-testid="fusion-import"]')).uploadFile(path)
  await settle(page,()=>document.body.innerText.includes('导入预览'))
  await click(page,'确认整合导入')
  updated=await stores(page)
  assert.deepEqual(updated.mrc.attempts,old.mrc.attempts)
  assert.deepEqual(updated.platform.session,old.platform.session)
  assert.equal(updated.platform.general.points.length,199)
  assert.equal(updated.platform.general.points.find(p=>p.id===point.id).privateNote,'旧生理学笔记')
  await page.reload({waitUntil:'networkidle0'})
  assert.deepEqual((await stores(page)).platform.general,updated.platform.general)
  scenarios.push('真实上传上一发布版的三科整包备份：管理学成绩、旧生理学在途草稿和私人笔记保留，资料替换可重复恢复与刷新')
  await context.close()
}
