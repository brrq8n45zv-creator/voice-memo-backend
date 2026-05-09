const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { initDb, getOne } = require('../db');

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

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const userDir = path.join(__dirname, '..', 'uploads', req.userId.toString());
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp3';
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/ogg'];
        if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.mp3') || file.originalname.endsWith('.wav')) {
            cb(null, true);
        } else {
            cb(new Error('只支持音频文件上传'));
        }
    }
});

router.post('/audio', authMiddleware, upload.single('audio'), (req, res) => {
    try {
        if (!req.file) {
            return res.json({ code: 400, message: '请选择音频文件' });
        }
        const audioUrl = `/uploads/${req.userId}/${req.file.filename}`;
        res.json({
            code: 200,
            message: '上传成功',
            data: {
                audio_url: audioUrl,
                filename: req.file.filename,
                size: req.file.size
            }
        });
    } catch (error) {
        console.error('上传音频错误:', error);
        res.json({ code: 500, message: '上传失败', error: error.message });
    }
});

router.post('/audioBase64', authMiddleware, async (req, res) => {
    try {
        await initDb();
        const { audioData, filename, mimeType } = req.body;
        if (!audioData) {
            return res.json({ code: 400, message: '音频数据不能为空' });
        }
        const userDir = path.join(__dirname, '..', 'uploads', req.userId.toString());
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        const buffer = Buffer.from(audioData, 'base64');
        const ext = mimeType?.includes('mp3') ? '.mp3' : mimeType?.includes('wav') ? '.wav' : '.m4a';
        const newFilename = `${uuidv4()}${ext}`;
        const filePath = path.join(userDir, newFilename);
        fs.writeFileSync(filePath, buffer);
        const audioUrl = `/uploads/${req.userId}/${newFilename}`;
        res.json({
            code: 200,
            message: '上传成功',
            data: {
                audio_url: audioUrl,
                filename: newFilename,
                size: buffer.length
            }
        });
    } catch (error) {
        console.error('上传音频错误:', error);
        res.json({ code: 500, message: '上传失败', error: error.message });
    }
});

router.get('/delete', authMiddleware, (req, res) => {
    try {
        const { filename } = req.query;
        if (!filename) {
            return res.json({ code: 400, message: '文件名不能为空' });
        }
        const filePath = path.join(__dirname, '..', 'uploads', req.userId.toString(), filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        res.json({ code: 200, message: '删除成功' });
    } catch (error) {
        res.json({ code: 500, message: '删除失败', error: error.message });
    }
});

router.get('/usage', authMiddleware, async (req, res) => {
    try {
        await initDb();
        const userDir = path.join(__dirname, '..', 'uploads', req.userId.toString());
        let totalSize = 0;
        let fileCount = 0;
        if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir);
            files.forEach(file => {
                const stats = fs.statSync(path.join(userDir, file));
                totalSize += stats.size;
                fileCount++;
            });
        }
        const memoCount = getOne('SELECT COUNT(*) as count FROM memos WHERE user_id = ? AND is_deleted = 0', [req.userId]);
        res.json({
            code: 200,
            data: {
                fileCount,
                totalSize,
                memoCount: memoCount ? memoCount.count : 0,
                storageUsed: totalSize
            }
        });
    } catch (error) {
        res.json({ code: 500, message: '获取失败', error: error.message });
    }
});

module.exports = router;