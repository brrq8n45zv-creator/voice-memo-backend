const express = require('express');
const jwt = require('jsonwebtoken');
const { initDb, getOne, getAll, runQuery, getLastInsertId, initDefaultCategories, bcrypt } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'voice-memo-secret-key-2024';

router.post('/register', async (req, res) => {
    try {
        await initDb();
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
        const existUser = getOne('SELECT id FROM users WHERE username = ?', [username]);
        if (existUser) {
            return res.json({ code: 400, message: '用户名已存在' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        runQuery('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        const userId = getLastInsertId();
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
        await initDb();
        const { username, password } = req.body;
        if (!username || !password) {
            return res.json({ code: 400, message: '用户名和密码不能为空' });
        }
        const user = getOne('SELECT * FROM users WHERE username = ?', [username]);
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
        await initDb();
        const { userId, oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return res.json({ code: 400, message: '旧密码和新密码不能为空' });
        }
        if (newPassword.length < 6) {
            return res.json({ code: 400, message: '新密码长度不能少于6位' });
        }
        const user = getOne('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            return res.json({ code: 404, message: '用户不存在' });
        }
        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid) {
            return res.json({ code: 401, message: '旧密码错误' });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        runQuery('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hashedPassword, userId]);
        res.json({ code: 200, message: '密码修改成功' });
    } catch (error) {
        console.error('修改密码错误:', error);
        res.json({ code: 500, message: '修改密码失败', error: error.message });
    }
});

router.get('/info', async (req, res) => {
    try {
        await initDb();
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.json({ code: 401, message: '未登录' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const memoCount = getOne('SELECT COUNT(*) as count FROM memos WHERE user_id = ? AND is_deleted = 0', [decoded.userId]);
        const storageSize = getOne('SELECT SUM(LENGTH(audio_url)) as size FROM memos WHERE user_id = ? AND audio_url != ""', [decoded.userId]);
        res.json({
            code: 200,
            data: {
                userId: decoded.userId,
                username: decoded.username,
                memoCount: memoCount ? memoCount.count : 0,
                storageUsed: storageSize ? (storageSize.size || 0) : 0
            }
        });
    } catch (error) {
        res.json({ code: 401, message: 'token无效或已过期' });
    }
});

module.exports = router;