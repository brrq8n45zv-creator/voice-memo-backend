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

router.get('/all', (req, res) => {
    try {
        const { lastSyncTime } = req.query;
        let whereClause = 'user_id = ?';
        const params = [req.userId];
        if (lastSyncTime) {
            whereClause += ' AND updated_at > ?';
            params.push(lastSyncTime);
        }
        const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.userId);
        const memos = db.prepare(`SELECT * FROM memos WHERE ${whereClause}`).all(...params);
        const reminders = db.prepare(`SELECT * FROM reminders WHERE ${whereClause}`).all(...params);
        const trashMemos = db.prepare('SELECT * FROM memos WHERE user_id = ? AND is_deleted = 1').all(req.userId);
        res.json({
            code: 200,
            data: {
                categories,
                memos,
                reminders,
                trashMemos,
                syncTime: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('同步数据错误:', error);
        res.json({ code: 500, message: '同步失败', error: error.message });
    }
});

router.post('/pull', (req, res) => {
    try {
        const { lastSyncTime } = req.body;
        let whereClause = 'user_id = ?';
        const params = [req.userId];
        if (lastSyncTime) {
            whereClause += ' AND updated_at > ?';
            params.push(lastSyncTime);
        }
        const categories = db.prepare('SELECT * FROM categories WHERE user_id = ?').all(req.userId);
        const memos = db.prepare(`SELECT * FROM memos WHERE ${whereClause} AND is_deleted = 0`).all(...params);
        const reminders = db.prepare(`SELECT * FROM reminders WHERE ${whereClause} AND is_deleted = 0`).all(...params);
        res.json({
            code: 200,
            data: {
                categories,
                memos,
                reminders,
                syncTime: new Date().toISOString()
            }
        });
    } catch (error) {
        res.json({ code: 500, message: '拉取失败', error: error.message });
    }
});

router.post('/push', (req, res) => {
    try {
        const { categories, memos, reminders } = req.body;
        if (categories && Array.isArray(categories)) {
            categories.forEach(cat => {
                const exist = db.prepare('SELECT id FROM categories WHERE id = ? AND user_id = ?').get(cat.id, req.userId);
                if (exist) {
                    db.prepare('UPDATE categories SET name = ?, color = ?, sort_order = ? WHERE id = ? AND user_id = ?')
                        .run(cat.name, cat.color, cat.sort_order, cat.id, req.userId);
                } else {
                    db.prepare('INSERT INTO categories (id, user_id, name, color, sort_order) VALUES (?, ?, ?, ?, ?)')
                        .run(cat.id, req.userId, cat.name, cat.color, cat.sort_order);
                }
            });
        }
        if (memos && Array.isArray(memos)) {
            memos.forEach(memo => {
                const exist = db.prepare('SELECT id FROM memos WHERE id = ? AND user_id = ?').get(memo.id, req.userId);
                if (exist) {
                    db.prepare(`
                        UPDATE memos SET title = ?, content = ?, audio_url = ?, audio_duration = ?,
                        category_id = ?, is_top = ?, is_star = ?, is_deleted = ?, updated_at = ?
                        WHERE id = ? AND user_id = ?
                    `).run(memo.title, memo.content, memo.audio_url, memo.audio_duration,
                        memo.category_id, memo.is_top, memo.is_star, memo.is_deleted, memo.updated_at, memo.id, req.userId);
                } else {
                    db.prepare(`
                        INSERT INTO memos (id, user_id, title, content, audio_url, audio_duration, category_id, is_top, is_star, is_deleted, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(memo.id, req.userId, memo.title, memo.content, memo.audio_url, memo.audio_duration,
                        memo.category_id, memo.is_top, memo.is_star, memo.is_deleted, memo.created_at, memo.updated_at);
                }
            });
        }
        if (reminders && Array.isArray(reminders)) {
            reminders.forEach(remind => {
                const exist = db.prepare('SELECT id FROM reminders WHERE id = ? AND user_id = ?').get(remind.id, req.userId);
                if (exist) {
                    db.prepare(`
                        UPDATE reminders SET memo_id = ?, title = ?, content = ?, remind_time = ?,
                        repeat_type = ?, is_completed = ?, is_deleted = ?, updated_at = ?
                        WHERE id = ? AND user_id = ?
                    `).run(remind.memo_id, remind.title, remind.content, remind.remind_time,
                        remind.repeat_type, remind.is_completed, remind.is_deleted, remind.updated_at, remind.id, req.userId);
                } else {
                    db.prepare(`
                        INSERT INTO reminders (id, user_id, memo_id, title, content, remind_time, repeat_type, is_completed, is_deleted, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(remind.id, req.userId, remind.memo_id, remind.title, remind.content, remind.remind_time,
                        remind.repeat_type, remind.is_completed, remind.is_deleted, remind.created_at, remind.updated_at);
                }
            });
        }
        res.json({ code: 200, message: '推送成功', data: { syncTime: new Date().toISOString() } });
    } catch (error) {
        console.error('推送数据错误:', error);
        res.json({ code: 500, message: '推送失败', error: error.message });
    }
});

module.exports = router;