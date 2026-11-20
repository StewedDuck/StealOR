const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../lib/commentThreads.ts');
const mod = new Module(filename, module);
mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { commentThreads } = mod.exports;
const row = (_id, parentId, date = '2026-11-19T00:00:00Z') => ({ _id, parentId, createdAt: date });
test('both draft audiences see replies grouped beneath their parent in chronological order', () => {
    const rows = [row('later', 'root', '2026-11-19T02:00:00Z'), row('first', 'root'), row('root'), row('other')];
    const result = commentThreads(rows);
    assert.deepEqual(result.map(item => [item.comment._id, item.depth]), [['root', 0], ['first', 1], ['later', 1], ['other', 0]]);
    assert.equal(result[1].parent._id, 'root');
});
test('replying to a reply preserves its actual parent and nesting', () => {
    const result = commentThreads([row('nested', 'reply'), row('reply', 'root'), row('root')]);
    assert.deepEqual(result.map(item => item.depth), [0, 1, 2]);
    assert.equal(result[2].parent._id, 'reply');
});
test('deleting a parent keeps its replies visible', () => {
    const result = commentThreads([row('reply', 'deleted')]);
    assert.equal(result.length, 1);
    assert.equal(result[0].comment._id, 'reply');
    assert.equal(result[0].parent, undefined);
});
test('legacy flat comments and malformed cycles are displayed without duplication', () => {
    const result = commentThreads([row('old'), row('a', 'b'), row('b', 'a'), row('self', 'self')]);
    assert.equal(result.length, 4);
    assert.equal(new Set(result.map(item => item.comment._id)).size, 4);
});

const { commentThreadGroups } = mod.exports;
test('nested reply groups belong inside the original comment and count all descendants', () => {
    const groups = commentThreadGroups([row('nested', 'reply'), row('reply', 'root'), row('other-reply', 'root'), row('root'), row('other-root')]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].comment._id, 'root');
    assert.equal(groups[0].replyCount, 3);
    assert.deepEqual(groups[0].replies.map(item => item.comment._id), ['reply', 'other-reply']);
    assert.equal(groups[0].replies[0].replies[0].comment._id, 'nested');
    assert.equal(groups[0].replies[0].replyCount, 1);
    assert.equal(groups[1].replyCount, 0);
});
test('reply count updates after adding or removing a reply', () => {
    const comments = [row('root'), row('reply', 'root')];
    assert.equal(commentThreadGroups(comments)[0].replyCount, 1);
    assert.equal(commentThreadGroups([...comments, row('second', 'root')])[0].replyCount, 2);
    assert.equal(commentThreadGroups([row('root')])[0].replyCount, 0);
});
test('deleted parents do not swallow remaining nested replies', () => {
    const groups = commentThreadGroups([row('reply', 'deleted'), row('nested', 'reply')]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].comment._id, 'reply');
    assert.equal(groups[0].replyCount, 1);
});
