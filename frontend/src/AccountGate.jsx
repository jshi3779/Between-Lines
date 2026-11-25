import { useState } from 'react'; // 使用状态控制登录表单。
export async function api(path, body = {}) { // 统一调用同源后端。
  const response = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); // Cookie 自动随同源请求发送。
  const result = await response.json(); // 读取服务器响应。
  if (!response.ok) throw new Error(result.error || '服务暂时不可用'); // 将错误显示给用户。
  return result; // 返回解析后的数据。
} // 结束接口函数。
export default function AccountGate({ children }) { // 登录成功后才挂载原有书架。
  const [ready, setReady] = useState(false); // 初始显示账号页面。
  const [register, setRegister] = useState(false); // 切换注册与登录。
  const [error, setError] = useState(''); // 保存可读错误信息。
  const [busy, setBusy] = useState(false); // 防止重复提交。
  async function submit(event) { // 处理表单提交。
    event.preventDefault(); // 阻止浏览器刷新。
    setBusy(true); setError(''); // 开始提交并清除旧错误。
    try { // 捕获网络和验证失败。
      const fields = Object.fromEntries(new FormData(event.currentTarget)); // 收集用户名、密码和邮箱。
      const user = await api(register ? 'register' : 'login', fields); // 注册或校验密码。
      const state = await api('state'); // 登录后加载当前账号全部笔记配置。
      window.betweenLinesUser = user.id; // 为媒体数据库提供账号命名空间。
      Object.keys(localStorage).filter(key => key.startsWith('between-lines:')).forEach(key => localStorage.removeItem(key)); // 清除上一账号缓存。
      window.betweenLinesMedia = Object.fromEntries(Object.entries(state).filter(([key])=>key.startsWith('media:'))); // 大文件保留在内存，避免 localStorage 容量限制。
      Object.entries(state).filter(([key])=>key.startsWith('between-lines:')).forEach(([key,value]) => localStorage.setItem(key,JSON.stringify(value))); // 原有页面同步读取当前用户配置。
      setReady(true); // 数据加载完成后显示书架。
    } catch (failure) { setError(failure.message); } // 提示可重试的错误。
    finally { setBusy(false); } // 恢复提交按钮。
  } // 结束提交处理。
  if (ready) return children; // 复用原有页面。
  return <main style={{maxWidth:360,margin:'80px auto',padding:24,background:'#fbfaf6',borderRadius:20}}><h1>{register ? '注册' : '登录'} · 扣指成诗</h1><form onSubmit={submit}><label>用户名<input name="username" required maxLength={50} autoComplete="username" /></label><label>密码<input name="password" type="password" required minLength={8} maxLength={256} autoComplete={register?'new-password':'current-password'} /></label>{register && <label>邮箱<input name="email" type="email" required /></label>}<p role="alert">{error}</p><button disabled={busy}>{busy?'请稍候…':register?'注册并进入书架':'登录'}</button></form><button onClick={()=>setRegister(!register)} disabled={busy}>{register?'已有账号，去登录':'没有账号，去注册'}</button></main>; // 显示注册／登录表单，不显示书架。
} // 结束账号组件。
