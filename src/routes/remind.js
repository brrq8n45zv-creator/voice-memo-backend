const express = require('express');
const jwt = require('jsonwebtoken');
const { db } = require('../db');

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

router.get('/list', (req, res) => {
    try {
        const { is_completed, repeat_type, page = 1, pageSize = 50 } = req.query;
        let sql = 'SELECT r.*, m.title as memo_title FROM reminders r LEFT JOIN memos m ON r.memo_id = m.id WHERE r.user_id = ? AND r.is_deleted = 0';
        const params = [req.userId];
        if (is_completed !== undefined) {
            sql += ' AND r.is_completed = ?';
            params.push(is_completed);
        }
        if (repeat_type) {
            sql += ' AND r.repeat_type = ?';
            params.push(repeat_type);
        }
        sql += ' ORDER BY r.remind_time ASC';
        const offset = (page - 1) * pageSize;
        sql += ` LIMIT ${parseInt(pageSize)} OFFSET ${offset}`;
        const reminders = db.prepare(sql).all(...params);
        const total = db.prepare('SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND is_deleted = 0').get(req.userId).count;
        res.json({ code: 200, data: { list: reminders, total } });
    } catch (error) {
        console.error('获取提醒列表错误:', error);
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

router.get('/upcoming', (req, res) => {
    try {
        const reminders = db.prepare(`
            SELECT r.*, m.title as memo_title 
            FROM reminders r 
            LEFT JOIN memos m ON r.memo_id = m.id 
            WHERE r.user_id = ? AND r.is_deleted = 0 AND r.is_completed = 0 AND r.remind_time >= datetime('now')
            ORDER BY r.remind_time ASC
            LIMIT 10
        `).all(req.userId);
        res.json({ code: 200, data: reminders });
    } catch (error) {
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

router.get('/detail/:id', (req, res) => {
    try {
        const reminder = db.prepare('SELECT r.*, m.title as memo_title FROM reminders r LEFT JOIN memos m ON r.memo_id = m.id WHERE r.id = ? AND r.user_id = ?').get(req.params.id, req.userId);
        if (!reminder) {
            return res.json({ code: 404, message: '提醒不存在' });
        }
        res.json({ code: 200, data: reminder });
    } catch (error) {
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

router.post('/create', (req, res) => {
    try {
        const { memo_id, title, content, remind_time, repeat_type } = req.body;
        if (!title || !remind_time) {
            return res.json({ code: 400, message: '标题和提醒时间不能为空' });
        }
        const result = db.prepare(`
            INSERT INTO reminders (user_id, memo_id, title, content, remind_time, repeat_type)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(req.userId, memo_id || null, title, content || '', remind_time, repeat_type || 'once');
        const newReminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: newReminder });
    } catch (error) {
        console.error('创建提醒错误:', error);
        res.json({ code: 500, message: '创建失败', error: error.message });
    }
});

router.post('/update/:id', (req, res) => {
    try {
        const { memo_id, title, content, remind_time, repeat_type, is_completed } = req.body;
        const reminder = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!reminder) {
            return res.json({ code: 404, message: '提醒不存在' });
        }
        db.prepare(`
            UPDATE reminders SET memo_id = ?, title = ?, content = ?, remind_time = ?,
            repeat_type = ?, is_completed = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
        `).run(
            memo_id ?? reminder.memo_id,
            title ?? reminder.title,
            content ?? reminder.content,
            remind_time ?? reminder.remind_time,
            repeat_type ?? reminder.repeat_type,
            is_completed ?? reminder.is_completed,
            req.params.id,
            req.userId
        );
        const updatedReminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(req.params.id);
        res.json({ code: 200, message: '更新成功', data: updatedReminder });
    } catch (error) {
        console.error('更新提醒错误:', error);
        res.json({ code: 500, message: '更新失败', error: error.message });
    }
});

router.post('/complete/:id', (req, res) => {
    try {
        const reminder = db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!reminder) {
            return res.json({ code: 404, message: '提醒不存在' });
        }
        const newStatus = reminder.is_completed ? 0 : 1;
        db.prepare('UPDATE reminders SET is_completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, req.params.id);
        res.json({ code: 200, message: newStatus ? '已完成' : '已取消完成' });
    } catch (error) {
        res.json({ code: 500, message: '操作失败', error: error.message });
    }
});

router.post('/delete/:id', (req, res) => {
    try {
        const result = db.prepare('UPDATE reminders SET is_deleted = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        if (result.changes === 0) {
            return res.json({ code: 404, message: '提醒不存在' });
        }
        res.json({ code: 200, message: '删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '删除失败', error: error.message });
    }
});

router.post('/batchDelete', (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.json({ code: 400, message: '请选择要删除的提醒' });
        }
        const placeholders = ids.map(() => '?').join(',');
        db.prepare(`UPDATE reminders SET is_deleted = 1 WHERE id IN (${placeholders}) AND user_id = ?`).run(...ids, req.userId);
        res.json({ code: 200, message: '批量删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '批量删除失败', error: error.message });
    }
});

module.exports = router;