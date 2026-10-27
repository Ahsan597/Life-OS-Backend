-- Runs once, when the MySQL volume is first created.
-- Integration tests use their own database so they never touch dev data.
CREATE DATABASE IF NOT EXISTS lifeos_test;
GRANT ALL PRIVILEGES ON lifeos_test.* TO 'lifeos_user'@'%';
FLUSH PRIVILEGES;
