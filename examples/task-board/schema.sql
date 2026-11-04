CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'done')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high')),
  owner TEXT NOT NULL DEFAULT 'You'
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
