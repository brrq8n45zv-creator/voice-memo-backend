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
        const categories = db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC').all(req.userId);
        res.json({ code: 200, data: categories });
    } catch (error) {
        res.json({ code: 500, message: '获取分类失败', error: error.message });
    }
});

router.post('/create', (req, res) => {
    try {
        const { name, color } = req.body;
        if (!name) {
            return res.json({ code: 400, message: '分类名称不能为空' });
        }
        const maxOrder = db.prepare('SELECT MAX(sort_order) as maxOrder FROM categories WHERE user_id = ?').get(req.userId).maxOrder || 0;
        const result = db.prepare('INSERT INTO categories (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(req.userId, name, color || '#1890FF', maxOrder + 1);
        const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
        res.json({ code: 200, message: '创建成功', data: newCategory });
    } catch (error) {
        res.json({ code: 500, message: '创建失败', error: error.message });
    }
});

router.post('/update/:id', (req, res) => {
    try {
        const { name, color } = req.body;
        const category = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!category) {
            return res.json({ code: 404, message: '分类不存在' });
        }
        db.prepare('UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?').run(name ?? category.name, color ?? category.color, req.params.id, req.userId);
        const updatedCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
        res.json({ code: 200, message: '更新成功', data: updatedCategory });
    } catch (error) {
        res.json({ code: 500, message: '更新失败', error: error.message });
    }
});

router.post('/delete/:id', (req, res) => {
    try {
        const category = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
        if (!category) {
            return res.json({ code: 404, message: '分类不存在' });
        }
        db.prepare('UPDATE memos SET category_id = 0 WHERE category_id = ? AND user_id = ?').run(req.params.id, req.userId);
        db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
        res.json({ code: 200, message: '删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '删除失败', error: error.message });
    }
});

router.post('/sort', (req, res) => {
    try {
        const { orders } = req.body;
        if (!orders || !Array.isArray(orders)) {
            return res.json({ code: 400, message: '参数错误' });
        }
        orders.forEach((item, index) => {
            db.prepare('UPDATE categories SET sort_order = ? WHERE id = ? AND user_id = ?').run(index, item.id, req.userId);
        });
        res.json({ code: 200, message: '排序成功' });
    } catch (error) {
        res.json({ code: 500, message: '排序失败', error: error.message });
    }
});

module.exports = router;