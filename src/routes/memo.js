const express = require('express');
const jwt = require('jsonwebtoken');
const { initDb, getOne, getAll, runQuery, getLastInsertId } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'voice-memo-secret-key-2024';

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.json({ code: 401, message: '请先登录' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        return res.json({ code: 401, message: 'token无效或已过期' });
    }
}

router.use(authMiddleware);

router.get('/list', async (req, res) => {
    try {
        await initDb();
        const { category_id, is_top, is_star, keyword, page = 1, pageSize = 50 } = req.query;
        let sql = 'SELECT * FROM memos WHERE user_id = ? AND is_deleted = 0';
        const params = [req.userId];
        if (category_id) {
            sql += ' AND category_id = ?';
            params.push(category_id);
        }
        if (is_top === '1') {
            sql += ' AND is_top = 1';
        }
        if (is_star === '1') {
            sql += ' AND is_star = 1';
        }
        if (keyword) {
            sql += ' AND (title LIKE ? OR content LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        sql += ' ORDER BY is_top DESC, created_at DESC';
        const offset = (page - 1) * pageSize;
        sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;
        const memos = getAll(sql, params);
        const total = getOne('SELECT COUNT(*) as count FROM memos WHERE user_id = ? AND is_deleted = 0', [req.userId]);
        res.json({ code: 200, data: { list: memos, total: total ? total.count : 0 } });
    } catch (error) {
        console.error('获取备忘录列表错误:', error);
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

router.get('/detail/:id', async (req, res) => {
    try {
        await initDb();
        const memo = getOne('SELECT * FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!memo) {
            return res.json({ code: 404, message: '备忘录不存在' });
        }
        res.json({ code: 200, data: memo });
    } catch (error) {
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

router.post('/create', async (req, res) => {
    try {
        await initDb();
        const { title, content, audio_url, audio_duration, category_id, is_top, is_star } = req.body;
        runQuery(`
            INSERT INTO memos (user_id, title, content, audio_url, audio_duration, category_id, is_top, is_star)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [req.userId, title || '无标题', content || '', audio_url || '', audio_duration || 0, category_id || 0, is_top || 0, is_star || 0]);
        const newId = getLastInsertId();
        const newMemo = getOne('SELECT * FROM memos WHERE id = ?', [newId]);
        res.json({ code: 200, message: '创建成功', data: newMemo });
    } catch (error) {
        console.error('创建备忘录错误:', error);
        res.json({ code: 500, message: '创建失败', error: error.message });
    }
});

router.post('/update/:id', async (req, res) => {
    try {
        await initDb();
        const { title, content, audio_url, audio_duration, category_id, is_top, is_star } = req.body;
        const memo = getOne('SELECT * FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!memo) {
            return res.json({ code: 404, message: '备忘录不存在' });
        }
        runQuery(`
            UPDATE memos SET title = ?, content = ?, audio_url = ?, audio_duration = ?,
            category_id = ?, is_top = ?, is_star = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `, [
            title ?? memo.title,
            content ?? memo.content,
            audio_url ?? memo.audio_url,
            audio_duration ?? memo.audio_duration,
            category_id ?? memo.category_id,
            is_top ?? memo.is_top,
            is_star ?? memo.is_star,
            req.params.id,
            req.userId
        ]);
        const updatedMemo = getOne('SELECT * FROM memos WHERE id = ?', [req.params.id]);
        res.json({ code: 200, message: '更新成功', data: updatedMemo });
    } catch (error) {
        console.error('更新备忘录错误:', error);
        res.json({ code: 500, message: '更新失败', error: error.message });
    }
});

router.post('/delete/:id', async (req, res) => {
    try {
        await initDb();
        runQuery('UPDATE memos SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json({ code: 200, message: '删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '删除失败', error: error.message });
    }
});

router.post('/batchDelete', async (req, res) => {
    try {
        await initDb();
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.json({ code: 400, message: '请选择要删除的备忘录' });
        }
        ids.forEach(id => {
            runQuery('UPDATE memos SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [id, req.userId]);
        });
        res.json({ code: 200, message: '批量删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '批量删除失败', error: error.message });
    }
});

router.post('/batchTop', async (req, res) => {
    try {
        await initDb();
        const { ids, is_top } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.json({ code: 400, message: '参数错误' });
        }
        ids.forEach(id => {
            runQuery('UPDATE memos SET is_top = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?', [is_top ? 1 : 0, id, req.userId]);
        });
        res.json({ code: 200, message: '批量置顶成功' });
    } catch (error) {
        res.json({ code: 500, message: '操作失败', error: error.message });
    }
});

router.get('/trash', async (req, res) => {
    try {
        await initDb();
        const memos = getAll('SELECT * FROM memos WHERE user_id = ? AND is_deleted = 1 ORDER BY deleted_at DESC', [req.userId]);
        res.json({ code: 200, data: memos });
    } catch (error) {
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

router.post('/restore/:id', async (req, res) => {
    try {
        await initDb();
        runQuery('UPDATE memos SET is_deleted = 0, deleted_at = NULL WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json({ code: 200, message: '恢复成功' });
    } catch (error) {
        res.json({ code: 500, message: '恢复失败', error: error.message });
    }
});

router.post('/permanentDelete/:id', async (req, res) => {
    try {
        await initDb();
        runQuery('DELETE FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json({ code: 200, message: '永久删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '删除失败', error: error.message });
    }
});

router.post('/emptyTrash', async (req, res) => {
    try {
        await initDb();
        runQuery('DELETE FROM memos WHERE user_id = ? AND is_deleted = 1', [req.userId]);
        res.json({ code: 200, message: '清空回收站成功' });
    } catch (error) {
        res.json({ code: 500, message: '清空失败', error: error.message });
    }
});

module.exports = router;