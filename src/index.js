const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const memoRoutes = require('./routes/memo');
const remindRoutes = require('./routes/remind');
const uploadRoutes = require('./routes/upload');
const categoryRoutes = require('./routes/category');
const syncRoutes = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

app.use('/api/auth', authRoutes);
app.use('/api/memo', memoRoutes);
app.use('/api/remind', remindRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/sync', syncRoutes);

app.get('/api/health', (req, res) => {
    res.json({ code: 200, message: '服务运行中', time: new Date().toISOString() });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ code: 500, message: '服务器内部错误', error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`语音备忘录后端服务已启动，端口: ${PORT}`);
    console.log(`访问地址: http://localhost:${PORT}`);
});

module.exports = app;