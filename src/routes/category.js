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
        const categories = getAll('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC', [req.userId]);
        res.json({ code: 200, data: categories });
    } catch (error) {
        res.json({ code: 500, message: '获取分类失败', error: error.message });
    }
});

router.post('/create', async (req, res) => {
    try {
        await initDb();
        const { name, color } = req.body;
        if (!name) {
            return res.json({ code: 400, message: '分类名称不能为空' });
        }
        const maxOrder = getOne('SELECT MAX(sort_order) as maxOrder FROM categories WHERE user_id = ?', [req.userId]);
        const nextOrder = (maxOrder && maxOrder.maxOrder !== null) ? maxOrder.maxOrder + 1 : 0;
        runQuery('INSERT INTO categories (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)', [req.userId, name, color || '#1890FF', nextOrder]);
        const newId = getLastInsertId();
        const newCategory = getOne('SELECT * FROM categories WHERE id = ?', [newId]);
        res.json({ code: 200, message: '创建成功', data: newCategory });
    } catch (error) {
        res.json({ code: 500, message: '创建失败', error: error.message });
    }
});

router.post('/update/:id', async (req, res) => {
    try {
        await initDb();
        const { name, color } = req.body;
        const category = getOne('SELECT * FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!category) {
            return res.json({ code: 404, message: '分类不存在' });
        }
        runQuery('UPDATE categories SET name = ?, color = ? WHERE id = ? AND user_id = ?', [name ?? category.name, color ?? category.color, req.params.id, req.userId]);
        const updatedCategory = getOne('SELECT * FROM categories WHERE id = ?', [req.params.id]);
        res.json({ code: 200, message: '更新成功', data: updatedCategory });
    } catch (error) {
        res.json({ code: 500, message: '更新失败', error: error.message });
    }
});

router.post('/delete/:id', async (req, res) => {
    try {
        await initDb();
        const category = getOne('SELECT * FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        if (!category) {
            return res.json({ code: 404, message: '分类不存在' });
        }
        runQuery('UPDATE memos SET category_id = 0 WHERE category_id = ? AND user_id = ?', [req.params.id, req.userId]);
        runQuery('DELETE FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
        res.json({ code: 200, message: '删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '删除失败', error: error.message });
    }
});

router.post('/sort', async (req, res) => {
    try {
        await initDb();
        const { orders } = req.body;
        if (!orders || !Array.isArray(orders)) {
            return res.json({ code: 400, message: '参数错误' });
        }
        orders.forEach((item, index) => {
            runQuery('UPDATE categories SET sort_order = ? WHERE id = ? AND user_id = ?', [index, item.id, req.userId]);
        });
        res.json({ code: 200, message: '排序成功' });
    } catch (error) {
        res.json({ code: 500, message: '排序失败', error: error.message });
    }
});

module.exports = router;