const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'data', 'voiceMemo.db');
const dbDir = path.dirname(dbPath);

if (!require('fs').existsSync(dbDir)) {
    require('fs').mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#1890FF',
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS memos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category_id INTEGER DEFAULT 0,
        title TEXT NOT NULL DEFAULT '无标题',
        content TEXT DEFAULT '',
        audio_url TEXT DEFAULT '',
        audio_duration INTEGER DEFAULT 0,
        is_top INTEGER DEFAULT 0,
        is_star INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        deleted_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        memo_id INTEGER,
        title TEXT NOT NULL,
        content TEXT DEFAULT '',
        remind_time DATETIME NOT NULL,
        repeat_type TEXT DEFAULT 'once',
        is_completed INTEGER DEFAULT 0,
        is_deleted INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_memos_user ON memos(user_id);
    CREATE INDEX IF NOT EXISTS idx_memos_deleted ON memos(is_deleted);
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(remind_time);
`);

const defaultCategories = [
    { name: '生活', color: '#52C41A' },
    { name: '工作', color: '#1890FF' },
    { name: '学习', color: '#722ED1' },
    { name: '私事', color: '#FA8C16' }
];

function initDefaultCategories(userId) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM categories WHERE user_id = ?');
    const result = stmt.get(userId);
    if (result.count === 0) {
        const insert = db.prepare('INSERT INTO categories (user_id, name, color, sort_order) VALUES (?, ?, ?, ?)');
        defaultCategories.forEach((cat, index) => {
            insert.run(userId, cat.name, cat.color, index);
        });
    }
}

module.exports = {
    db,
    initDefaultCategories,
    bcrypt
};