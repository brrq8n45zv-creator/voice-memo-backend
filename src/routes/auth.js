const express = require('express');
const jwt = require('jsonwebtoken');
const { db, initDefaultCategories, bcrypt } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'voice-memo-secret-key-2024';

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ code: 400, message: '用户名和密码不能为空' });
        }
        if (username.length < 3 || username.length > 20) {
            return res.json({ code: 400, message: '用户名长度需在3-20个字符之间' });
        }
        if (password.length < 6) {
            return res.json({ code: 400, message: '密码长度不能少于6位' });
        }
        const existUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
        if (existUser) {
            return res.json({ code: 400, message: '用户名已存在' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
        const userId = result.lastInsertRowid;
        initDefaultCategories(userId);
        const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            code: 200,
            message: '注册成功',
            data: { token, userId, username }
        });
    } catch (error) {
        console.error('注册错误:', error);
        res.json({ code: 500, message: '注册失败', error: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ code: 400, message: '用户名和密码不能为空' });
        }
        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        if (!user) {
            return res.json({ code: 401, message: '用户名或密码错误' });
        }
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.json({ code: 401, message: '用户名或密码错误' });
        }
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        res.json({
            code: 200,
            message: '登录成功',
            data: { token, userId: user.id, username: user.username }
        });
    } catch (error) {
        console.error('登录错误:', error);
        res.json({ code: 500, message: '登录失败', error: error.message });
    }
});

router.post('/changePassword', async (req, res) => {
    try {
        const { userId, oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.json({ code: 400, message: '旧密码和新密码不能为空' });
        }
        if (newPassword.length < 6) {
            return res.json({ code: 400, message: '新密码长度不能少于6位' });
        }
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
        if (!user) {
            return res.json({ code: 404, message: '用户不存在' });
        }
        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid) {
            return res.json({ code: 401, message: '旧密码错误' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hashedPassword, userId);
        res.json({ code: 200, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码错误:', error);
        res.json({ code: 500, message: '修改密码失败', error: error.message });
    }
});

router.get('/info', (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.json({ code: 401, message: '未登录' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const memoCount = db.prepare('SELECT COUNT(*) as count FROM memos WHERE user_id = ? AND is_deleted = 0').get(decoded.userId).count;
        const storageSize = db.prepare('SELECT SUM(LENGTH(audio_url)) as size FROM memos WHERE user_id = ? AND audio_url != ""').get(decoded.userId).size || 0;
        res.json({
            code: 200,
            data: {
                userId: decoded.userId,
                username: decoded.username,
                memoCount,
                storageUsed: storageSize
            }
        });
    } catch (error) {
        res.json({ code: 401, message: 'token无效或已过期' });
    }
});

module.exports = router;