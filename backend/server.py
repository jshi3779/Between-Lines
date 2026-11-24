import json, sqlite3, hashlib, secrets, time  # 使用 Python 标准库处理 JSON、数据库、密码和会话。
from pathlib import Path  # 用绝对路径定位数据库。
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler  # 提供本地 HTTP 接口。
ROOT = Path(__file__).resolve().parent  # 后端文件所在目录。
DB = ROOT / 'data.sqlite3'  # 数据只保存在本地，不提交 GitHub。
SESSIONS = {}  # 会话保存在内存，服务重启后需重新登录。
def connect():  # 每个请求独立连接，避免线程共享连接。
    db = sqlite3.connect(DB)  # 打开或创建数据库。
    db.row_factory = sqlite3.Row  # 查询结果可按列名访问。
    db.execute('PRAGMA foreign_keys=ON')  # 开启外键检查。
    return db  # 返回连接。
with connect() as db:  # 初始化数据库结构。
    db.executescript('''
    -- 用户名唯一，password 列存储加盐密码哈希。
    CREATE TABLE IF NOT EXISTS user(id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, email TEXT NOT NULL);
    -- 按用户保存原有书架和笔记本完整 JSON，避免跨账号读写。
    CREATE TABLE IF NOT EXISTS user_state(user_id INTEGER NOT NULL REFERENCES user(id), key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(user_id,key));
    -- 卡片配置指纹用于精确找回同一配置的对话。
    CREATE TABLE IF NOT EXISTS chat_history(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES user(id), notebook_id TEXT NOT NULL, config_hash TEXT NOT NULL, config_json TEXT NOT NULL, question TEXT NOT NULL, answer TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    -- 加速历史查询。
    CREATE INDEX IF NOT EXISTS history_lookup ON chat_history(user_id,notebook_id,config_hash,id);
    ''')  # 执行幂等建表语句。
def password_hash(password, salt):  # 使用慢哈希保护密码。
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()  # 每次使用独立随机盐。
class Handler(BaseHTTPRequestHandler):  # 处理 API 请求。
    def send(self, status, body, cookie=None):  # 统一返回 JSON。
        self.send_response(status)  # 设置状态码。
        self.send_header('Content-Type', 'application/json; charset=utf-8')  # 声明中文 JSON。
        self.send_header('Cache-Control', 'no-store')  # 不缓存账号数据。
        if cookie: self.send_header('Set-Cookie', cookie)  # 登录时设置不可被 JS 读取的 Cookie。
        self.end_headers()  # 结束响应头。
        self.wfile.write(json.dumps(body, ensure_ascii=False).encode())  # 写出响应。
    def do_POST(self):  # 所有操作采用 POST，认证信息只来自会话。
        try:  # 将输入错误转成可理解的响应。
            length = int(self.headers.get('Content-Length', '0'))  # 获取正文大小。
            if length > 10000000: return self.send(413, {'error':'数据过大'})  # 限制单次请求。
            data = json.loads(self.rfile.read(length) or b'{}')  # 解析请求。
            with connect() as db:  # 事务结束后自动提交或回滚。
                if self.path in ('/api/register', '/api/login'):  # 未登录可访问的两个接口。
                    name = str(data.get('username','')).strip()  # 清理用户名两端空格。
                    password = str(data.get('password',''))  # 密码不裁剪。
                    if not name or len(name)>50 or not 8<=len(password)<=256: return self.send(400, {'error':'用户名必填，密码须为 8–256 位'})  # 基础校验。
                    if self.path == '/api/register':  # 创建新用户。
                        email = str(data.get('email','')).strip()  # 读取邮箱。
                        if '@' not in email or len(email)>254: return self.send(400, {'error':'请输入有效邮箱'})  # 校验邮箱。
                        salt = secrets.token_hex(16)  # 为用户生成随机盐。
                        db.execute('INSERT INTO user(username,password,email) VALUES(?,?,?)', (name,salt+':'+password_hash(password,salt),email))  # 参数化写入，禁止 SQL 拼接。
                    user = db.execute('SELECT * FROM user WHERE username=?',(name,)).fetchone()  # 查找账号。
                    if not user: return self.send(401, {'error':'账号或密码错误'})  # 不泄露用户名是否存在。
                    salt, digest = user['password'].split(':')  # 分离盐和哈希。
                    if not secrets.compare_digest(digest,password_hash(password,salt)): return self.send(401, {'error':'账号或密码错误'})  # 常量时间比较。
                    token = secrets.token_urlsafe(32)  # 生成不可预测的会话标识。
                    SESSIONS[token] = (user['id'],time.time()+86400)  # 会话有效一天。
                    return self.send(200, {'id':user['id'],'username':name}, 'session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400')  # 本地 HTTP 使用 Cookie。
                cookies = dict(item.strip().split('=',1) for item in self.headers.get('Cookie','').split(';') if '=' in item)  # 读取 Cookie。
                session = SESSIONS.get(cookies.get('session',''))  # 查询服务端会话。
                if not session or session[1]<time.time(): return self.send(401, {'error':'请先登录'})  # 拒绝未认证访问。
                uid = session[0]  # 用户 ID 绝不接受前端指定。
                if self.path == '/api/state':  # 获取当前用户所有配置。
                    return self.send(200, dict((row['key'],json.loads(row['value'])) for row in db.execute('SELECT key,value FROM user_state WHERE user_id=?',(uid,))))  # 隔离账号数据。
                if self.path == '/api/save':  # 保存已有页面的数据。
                    db.execute('INSERT INTO user_state VALUES(?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value',(uid,data['key'],json.dumps(data['value'])))  # 原子更新。
                    return self.send(200, {'ok':True})  # 告知保存成功。
                if self.path == '/api/delete':  # 删除账号下的一项配置。
                    db.execute('DELETE FROM user_state WHERE user_id=? AND key=?',(uid,data['key']))  # 防止删除后重新加载旧笔记。
                    return self.send(200, {'ok':True})  # 返回删除成功。
                config = json.dumps(data.get('config',{}),sort_keys=True,ensure_ascii=False,separators=(',',':'))  # 对象键排序使配置指纹稳定。
                digest = hashlib.sha256(config.encode()).hexdigest()  # 完整卡片配置对应唯一指纹。
                notebook = str(data.get('notebook',''))  # 区分不同笔记本。
                if self.path == '/api/chat':  # 保存一轮演示 AI 对话。
                    db.execute('INSERT INTO chat_history(user_id,notebook_id,config_hash,config_json,question,answer) VALUES(?,?,?,?,?,?)',(uid,notebook,digest,config,str(data['question']),str(data['answer'])))  # 同时保存提问和回答。
                elif self.path != '/api/history': return self.send(404, {'error':'接口不存在'})  # 拒绝未知路径。
                rows = db.execute('SELECT id,question,answer,created_at FROM chat_history WHERE user_id=? AND notebook_id=? AND config_hash=? ORDER BY id',(uid,notebook,digest)).fetchall()  # 按用户及配置查询全部历史。
                return self.send(200, [dict(row) for row in rows])  # 返回有序对话。
        except sqlite3.IntegrityError: self.send(409, {'error':'用户名已存在'})  # 提示重复注册。
        except (ValueError,KeyError,TypeError): self.send(400, {'error':'请求数据格式不正确'})  # 拦截无效输入。
if __name__ == '__main__':  # 直接运行文件即可启动。
    print('SQLite API: http://127.0.0.1:8765')  # 显示服务地址。
    ThreadingHTTPServer(('127.0.0.1',8765),Handler).serve_forever()  # 仅本机监听。
