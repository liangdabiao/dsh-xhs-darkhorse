import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRankDate, fallbackRankDate, resolveRankDate, shiftDate } from '../lib/dates.js'
import { matchCategory, VALID_CATEGORIES } from '../lib/categories.js'

test('defaultRankDate：17:30 分界（>=17:30 查昨天，否则查前天）', () => {
  const after = new Date(2026, 10, 12, 18, 0)
  const boundary = new Date(2026, 10, 12, 17, 30)
  const before = new Date(2026, 10, 12, 17, 29)
  assert.equal(defaultRankDate(after), '2026-11-11')
  assert.equal(defaultRankDate(boundary), '2026-11-11')
  assert.equal(defaultRankDate(before), '2026-11-10')
})

test('fallbackRankDate：固定 7 天前', () => {
  assert.equal(fallbackRankDate(new Date(2026, 10, 12, 10, 0)), '2026-11-05')
})

test('resolveRankDate：空值→默认日；模糊词→偏移', () => {
  const now = new Date(2026, 10, 12, 20, 0)
  assert.equal(resolveRankDate('', now).date, '2026-11-11')
  assert.equal(resolveRankDate('昨天', now).date, '2026-11-11')
  assert.equal(resolveRankDate('前天', now).date, '2026-11-10')
  assert.equal(resolveRankDate('一周前', now).date, '2026-11-05')
  assert.equal(resolveRankDate('半个月前', now).date, '2026-10-28')
  assert.equal(resolveRankDate('一个月前', now).date, '2026-10-13')
})

test('resolveRankDate：合法 yyyy-MM-dd 通过，非法抛错', () => {
  assert.equal(resolveRankDate('2026-09-08').date, '2026-09-08')
  assert.throws(() => resolveRankDate('2026/09/08'), /yyyy-MM-dd/)
  assert.throws(() => resolveRankDate('2026-13-01'), /yyyy-MM-dd|日期不存在/)
  assert.throws(() => resolveRankDate('2026-02-30'), /日期不存在/)
})

test('shiftDate', () => {
  assert.equal(shiftDate(new Date(2026, 10, 1), -7), '2026-10-25')
})

test('matchCategory：精确名 → 关键词双向包含 → 回退综合全部', () => {
  assert.equal(matchCategory('化妆美容'), '化妆美容')
  assert.equal(matchCategory('我想看穿搭方面的黑马'), '时尚穿搭')
  assert.equal(matchCategory('美妆'), '化妆美容')
  assert.equal(matchCategory('完全无关词'), '综合全部')
  assert.equal(matchCategory(''), '综合全部')
})

test('VALID_CATEGORIES：25 个分类', () => {
  assert.equal(VALID_CATEGORIES.length, 25)
  assert.ok(VALID_CATEGORIES.includes('综合全部'))
})
