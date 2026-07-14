import React, { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import SplitPane from './components/SplitPane.jsx';
import ToastHost from './components/ToastHost.jsx';
import Modal from './components/Modal.jsx';
import appIcon from '../build/icon.png';

const api = window.keepassAPI;
const PAGE_SIZE = 10;
const THEMES = [
  { key: 'light', name: '浅色' },
  { key: 'dark', name: '深色' },
  { key: 'ocean', name: '海洋' },
  { key: 'forest', name: '森林' }
];

const defaultConfig = {
  sheetLink: '',
  sheetName: 'Sheet1',
  serviceJson: '',
  outputDir: '',
  databaseName: 'KeePass数据库',
  groupName: 'Google Sheets Import',
  remember: true
};

const columns = [
  { key: 'selected', label: '选择', width: 76, min: 68, sortable: false },
  { key: 'serial', label: '序号', width: 78, min: 68, sortable: false },
  { key: 'name', label: '名称', width: 150, min: 110 },
  { key: 'title', label: '标题', width: 180, min: 120 },
  { key: 'username', label: '用户名', width: 185, min: 130 },
  { key: 'password', label: '密码', width: 128, min: 110 },
  { key: 'url', label: 'URL', width: 330, min: 190 },
  { key: 'tags', label: '标签', width: 165, min: 100 },
  { key: 'notes', label: '备注预览', width: 220, min: 130 },
  { key: 'totp', label: 'TOTP', width: 92, min: 76 }
];

function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  const show = (message, type = 'info', duration = 2400) => {
    clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), duration);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [toast, show];
}

function usePersistedConfig() {
  const [config, setConfig] = useState(() => {
    try {
      return { ...defaultConfig, ...JSON.parse(localStorage.getItem('keepass-studio-config') || '{}') };
    } catch {
      return defaultConfig;
    }
  });
  useEffect(() => {
    if (!config.remember) return;
    const safe = { ...config };
    localStorage.setItem('keepass-studio-config', JSON.stringify(safe));
  }, [config]);
  return [config, setConfig];
}

function AppLogo() {
  return <div className="app-logo"><img src={appIcon} alt="KeePass Studio" draggable="false"/></div>;
}

function Sidebar({ page, onPage, theme }) {
  const nav = [
    ['connect', '连接', '表格连接', '连接 Google 表格', 'link'],
    ['preview', '预览', '数据预览', '查看和筛选数据', 'preview'],
    ['export', '导出', '导出 KeePass', '生成 KeePass 数据库', 'export']
  ];
  return (
    <aside className="sidebar">
      <div className="brand"><AppLogo/><div><strong>KeePass Studio</strong><span>v8.4.0</span></div></div>
      <nav className="nav-list">
        {nav.map(([key, action, title, sub, icon]) => (
          <button key={key} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => onPage(key)}>
            <span className="nav-icon"><Icon name={icon} size={21}/></span>
            <span className="nav-copy"><b>{title}</b><small>{action} · {sub}</small></span>
          </button>
        ))}
      </nav>
      <div className="sidebar-spacer"/>
      <div className="sidebar-card">
        <Icon name="shield" size={20}/><div><b>本地安全处理</b><small>主密码不保存<br/>数据不上传第三方</small></div>
      </div>
      <div className="sidebar-footer"><span className="status-dot"/>就绪 <small>{theme}</small></div>
    </aside>
  );
}

function Topbar({ title, subtitle, theme, setTheme, busy, status }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="topbar-title"><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="topbar-actions">
        <button className="icon-btn" title="使用说明"><Icon name="help" size={18}/></button>
        <div className="theme-wrap">
          <button className="icon-btn" onClick={() => setOpen(v => !v)} title="切换主题"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={18}/></button>
          {open && <div className="theme-menu">{THEMES.map(t => <button key={t.key} className={theme === t.key ? 'active' : ''} onClick={() => { setTheme(t.key); setOpen(false); }}>{t.name}</button>)}</div>}
        </div>
        <div className={`status-pill ${busy ? 'busy' : ''}`}>{busy && <Icon name="spinner" className="spin" size={16}/>}<span>{status}</span></div>
      </div>
      {busy && <div className="top-progress"><span/></div>}
    </header>
  );
}

function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function ConnectionPage({ config, setConfig, email, setEmail, onRead, busy, showToast }) {
  const chooseJson = async () => {
    const path = await api?.pickServiceJson?.();
    if (!path) return;
    setConfig(c => ({ ...c, serviceJson: path }));
    try {
      const result = await api.loadServiceEmail(path);
      setEmail(result.email);
      showToast('服务账号 JSON 已加载', 'success');
    } catch (error) {
      setEmail('JSON 文件无效');
      showToast(error.message || String(error), 'error', 4200);
    }
  };

  return (
    <SplitPane storageKey="connect-split" defaultPercent={67} minLeft={520} minRight={360}>
      <div className="stack gap-lg">
        <Card>
          <div className="section-heading"><Icon name="link"/><div><h2>Google 表格链接 / Spreadsheet ID</h2><p>输入完整 Google 表格链接或 Spreadsheet ID</p></div></div>
          <Field label="表格链接">
            <input value={config.sheetLink} onChange={e => setConfig(c => ({ ...c, sheetLink: e.target.value }))} placeholder="https://docs.google.com/spreadsheets/d/..."/>
          </Field>
        </Card>
        <Card>
          <div className="section-heading"><Icon name="table"/><div><h2>Sheet 名称</h2><p>区分大小写，必须与底部标签页一致</p></div></div>
          <Field label="工作表名称"><input value={config.sheetName} onChange={e => setConfig(c => ({ ...c, sheetName: e.target.value }))} placeholder="例如：Sheet1"/></Field>
        </Card>
        <Card>
          <div className="section-heading"><Icon name="file"/><div><h2>服务账号 JSON</h2><p>从 Google Cloud 下载的服务账号密钥</p></div></div>
          <div className="input-action"><input readOnly value={config.serviceJson} placeholder="选择服务账号 JSON 文件"/><button className="btn btn-secondary" onClick={chooseJson}><Icon name="folder"/>选择文件</button></div>
        </Card>
        <Card>
          <div className="account-row"><div className="avatar">SA</div><div><b>当前服务账号</b><p>{email || '尚未选择服务账号 JSON'}</p></div><span className="badge success">已加载</span></div>
        </Card>
        <label className="check-row"><input type="checkbox" checked={config.remember} onChange={e => setConfig(c => ({ ...c, remember: e.target.checked }))}/><span>记住表格链接、Sheet 名称、JSON 路径和输出目录</span></label>
        <div className="read-footer"><span><Icon name="shield" size={16}/>读取 A:I；只向 I 列写入运行日志</span><button className="btn btn-primary btn-lg" disabled={busy} onClick={onRead}><Icon name="table"/>读取表格数据</button></div>
      </div>
      <div className="stack gap-lg">
        <Card>
          <div className="section-heading"><Icon name="shield"/><div><h2>安全说明</h2><p>最低必要权限和本地处理原则</p></div></div>
          <ul className="info-list">
            <li><Icon name="check"/><div><b>只处理指定表格</b><span>服务账号不会访问未共享给它的资源。</span></div></li>
            <li><Icon name="check"/><div><b>本地生成 KDBX</b><span>密码、备注和 TOTP 只在本机内存中处理。</span></div></li>
            <li><Icon name="check"/><div><b>I 列运行日志</b><span>生成结果只写入 I 列，不改动 A:H。</span></div></li>
          </ul>
        </Card>
        <Card>
          <div className="section-heading"><Icon name="file"/><div><h2>连接步骤</h2><p>四步完成连接</p></div></div>
          <ol className="steps"><li>打开 Google 表格并复制链接</li><li>输入 Sheet 名称</li><li>选择服务账号 JSON</li><li>把表格以编辑者权限共享给服务账号</li></ol>
        </Card>
        <Card className="accent-card">
          <div className="section-heading"><Icon name="lock"/><div><h2>主密码不会保存</h2><p>主密码仅在生成 KDBX 时使用，不写入配置文件。</p></div></div>
        </Card>
      </div>
    </SplitPane>
  );
}

function StatCard({ icon, value, title, color }) {
  return <Card className="stat-card"><div className="stat-icon" style={{ '--stat': color }}><Icon name={icon}/></div><div><strong>{value}</strong><span>{title}</span></div></Card>;
}

function PasswordCell({ value }) {
  const [show, setShow] = useState(false);
  return <div className="password-cell"><span>{show ? value : '••••••••'}</span><button title={show ? '隐藏密码' : '查看密码'} onClick={() => setShow(v => !v)}><Icon name={show ? 'eyeOff' : 'eye'} size={17}/></button></div>;
}

function ResizableDataTable({ rows, selected, toggleSelected, sort, setSort, copyCell }) {
  const tableRef = useRef(null);
  const colRefs = useRef({});
  const [widths, setWidths] = useState(() => {
    try { return { ...Object.fromEntries(columns.map(c => [c.key, c.width])), ...JSON.parse(localStorage.getItem('keepass-table-widths') || '{}') }; }
    catch { return Object.fromEntries(columns.map(c => [c.key, c.width])); }
  });

  const beginResize = (event, col) => {
    event.preventDefault(); event.stopPropagation();
    const startX = event.clientX;
    const startWidth = widths[col.key];
    const colEl = colRefs.current[col.key];
    let nextWidth = startWidth;
    let frame = 0;
    document.body.classList.add('is-resizing');
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const move = e => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        nextWidth = Math.max(col.min || 60, startWidth + e.clientX - startX);
        if (colEl) colEl.style.width = `${nextWidth}px`;
      });
    };
    const up = () => {
      cancelAnimationFrame(frame);
      const next = { ...widths, [col.key]: nextWidth };
      setWidths(next);
      localStorage.setItem('keepass-table-widths', JSON.stringify(next));
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  };

  const sortLabel = col => {
    if (sort.key !== col.key) return null;
    return <Icon name={sort.direction === 'asc' ? 'arrowUp' : 'arrowDown'} size={13}/>;
  };

  const clickSort = col => {
    if (col.sortable === false || col.key === 'password') return;
    setSort(s => s.key === col.key ? { key: col.key, direction: s.direction === 'asc' ? 'desc' : 'asc' } : { key: col.key, direction: 'asc' });
  };

  return (
    <div className="table-scroller">
      <table ref={tableRef} className="data-table">
        <colgroup>{columns.map(col => <col key={col.key} ref={el => colRefs.current[col.key] = el} style={{ width: widths[col.key] }}/>)}</colgroup>
        <thead><tr>{columns.map(col => <th key={col.key} onClick={() => clickSort(col)} className={col.sortable === false ? '' : 'sortable'}><span>{col.label}{sortLabel(col)}</span><i className="col-resizer" onPointerDown={e => beginResize(e, col)}/></th>)}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.sheetRow} className={selected.has(row.sheetRow) ? 'selected-row' : ''}>
          <td><label className="big-check"><input type="checkbox" checked={selected.has(row.sheetRow)} onChange={() => toggleSelected(row.sheetRow)}/><span/></label></td>
          <td>{row.serial}</td>
          <td title={row.name}>{row.name}</td>
          <td title={row.title}>{row.title}</td>
          <td onDoubleClick={() => copyCell(row.username, '用户名')} className="copyable" title="双击复制完整用户名">{row.username || '—'}</td>
          <td><PasswordCell value={row.password || ''}/></td>
          <td onDoubleClick={() => copyCell(row.url, 'URL')} className="copyable url-cell" title="双击复制完整 URL">{row.url || '—'}</td>
          <td title={row.tags}>{row.tags || '—'}</td>
          <td onDoubleClick={() => copyCell(row.notes, '备注')} className="copyable" title="双击复制完整备注">{row.notes || '—'}</td>
          <td><span className={row.totp ? 'value-ok' : 'muted'}>{row.totp ? '已填写' : '—'}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

function PreviewPage({ entries, selected, setSelected, onRefresh, onExport, showToast }) {
  const [search, setSearch] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [sort, setSort] = useState({ key: 'sheetRow', direction: 'asc' });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    let list = entries.filter(e => (!selectedOnly || selected.has(e.sheetRow)) && (!q || [e.name,e.title,e.username,e.url,e.tags,e.notes].join(' ').toLocaleLowerCase().includes(q)));
    const direction = sort.direction === 'asc' ? 1 : -1;
    list = [...list].sort((a,b) => {
      if (sort.key === 'selected') return ((selected.has(a.sheetRow) ? 1 : 0) - (selected.has(b.sheetRow) ? 1 : 0)) * direction;
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? '';
      return (typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'zh-CN', { numeric: true })) * direction;
    });
    return list.map((entry, index) => ({ ...entry, serial: index + 1 }));
  }, [entries, selected, selectedOnly, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => setPage(p => Math.min(p, pageCount)), [pageCount]);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const visibleIds = pageRows.map(r => r.sheetRow);
  const selectAllVisible = () => setSelected(s => new Set([...s, ...visibleIds]));
  const clearVisible = () => setSelected(s => { const n = new Set(s); visibleIds.forEach(id => n.delete(id)); return n; });
  const invertVisible = () => setSelected(s => { const n = new Set(s); visibleIds.forEach(id => n.has(id) ? n.delete(id) : n.add(id)); return n; });
  const copyCell = async (value, label) => {
    if (!value) return;
    if (api?.copyText) await api.copyText(value);
    else await navigator.clipboard.writeText(value);
    showToast(`${label}已复制`, 'success');
  };

  return <div className="stack gap-lg">
    <div className="stats-grid">
      <StatCard icon="file" value={entries.length} title="总记录数" color="#1677ff"/>
      <StatCard icon="check" value={selected.size} title="已选择" color="#16a34a"/>
      <StatCard icon="lock" value={entries.filter(e => e.password).length} title="含密码" color="#7c3aed"/>
      <StatCard icon="shield" value={entries.filter(e => e.totp).length} title="含 TOTP" color="#f59e0b"/>
    </div>
    <Card className="toolbar-card">
      <div className="search-box"><Icon name="search"/><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="搜索标题、用户名、URL、标签或备注...（Ctrl+F）"/></div>
      <label className="check-row compact"><input type="checkbox" checked={selectedOnly} onChange={e => { setSelectedOnly(e.target.checked); setPage(1); }}/><span>仅看已勾选</span></label>
      <button className="btn btn-soft" onClick={onRefresh}><Icon name="refresh"/>刷新数据</button>
      <button className="btn btn-secondary" onClick={selectAllVisible}>全选本页</button>
      <button className="btn btn-secondary" onClick={clearVisible}>全不选</button>
      <button className="btn btn-secondary" onClick={invertVisible}>反选</button>
      <button className="btn btn-danger-soft" onClick={() => { setSearch(''); setSelectedOnly(false); }}>清除筛选</button>
    </Card>
    <Card className="table-card">
      <div className="table-title"><b>Sheet 数据 · 共 {filtered.length} 条记录</b><span>拖动表头分隔线可调整列宽；双击用户名、URL、备注可复制</span></div>
      <ResizableDataTable rows={pageRows} selected={selected} toggleSelected={id => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })} sort={sort} setSort={setSort} copyCell={copyCell}/>
      <div className="table-footer"><span>已选择 {selected.size} / {entries.length} 条</span><div className="pagination"><button disabled={page <= 1} onClick={() => setPage(p => p-1)}><Icon name="chevronLeft"/></button><b>{page}</b><button disabled={page >= pageCount} onClick={() => setPage(p => p+1)}><Icon name="chevronRight"/></button><span>10 条/页</span></div><button className="btn btn-primary" onClick={onExport}>前往导出 <Icon name="chevronRight"/></button></div>
    </Card>
  </div>;
}

function ChoiceCard({ selected, title, desc, icon, onClick }) {
  return <button className={`choice-card ${selected ? 'selected' : ''}`} onClick={onClick}><span className="radio-dot"/><Icon name={icon}/><span><b>{title}</b><small>{desc}</small></span></button>;
}

function Strength({ value }) {
  const score = Math.min(4, [value.length >= 8, value.length >= 12, /[A-Z]/.test(value) && /[a-z]/.test(value), /\d/.test(value) && /[^\w]/.test(value)].filter(Boolean).length);
  const label = ['未输入','弱','一般','良好','强'][score];
  return <div className="strength"><span>密码强度：{label}</span><div>{[0,1,2,3].map(i => <i key={i} className={i < score ? 'active' : ''}/>)}</div></div>;
}

function ExportPage({ entries, selected, config, setConfig, sheetMeta, progress, setProgress, generatedFiles, setGeneratedFiles, showToast }) {
  const [mode, setMode] = useState('combined');
  const [scope, setScope] = useState('all');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const targets = scope === 'all' ? entries : entries.filter(e => selected.has(e.sheetRow));

  const chooseOutput = async () => {
    const path = await api.pickOutputDir();
    if (path) setConfig(c => ({ ...c, outputDir: path }));
  };

  const doGenerate = async (overwrite = false) => {
    if (!targets.length) return showToast('没有可导出的记录', 'error');
    if (!config.outputDir) return showToast('请选择输出目录', 'error');
    if (!password) return showToast('请输入 KeePass 主密码', 'error');
    if (password !== confirm) return showToast('两次主密码不一致', 'error');
    if (mode === 'combined' && !config.databaseName.trim()) return showToast('请输入数据库名称 / 文件名称', 'error');
    setGenerating(true); setProgress({ done: 0, total: targets.length, message: '正在准备生成…' }); setGeneratedFiles([]);
    try {
      const result = await api.generate({
        entries: targets,
        outputDir: config.outputDir,
        mode,
        combinedFilename: config.databaseName,
        masterPassword: password,
        groupName: config.groupName,
        overwrite,
        sourceName: sheetMeta.sheetName || 'GoogleSheets',
        spreadsheetId: sheetMeta.spreadsheetId,
        sheetName: sheetMeta.sheetName,
        serviceAccountJson: config.serviceJson
      });
      setGeneratedFiles(result.files || []);
      setProgress({ done: targets.length, total: targets.length, message: '生成完成' });
      setPassword(''); setConfirm('');
      showToast(`已生成 ${result.files?.length || 0} 个 KDBX 文件`, 'success', 3600);
    } catch (error) {
      const msg = error.message || String(error);
      if (!overwrite && msg.includes('同名文件')) setConfirmOverwrite(true);
      else showToast(msg, 'error', 5200);
    } finally { setGenerating(false); }
  };

  const pct = progress.total ? Math.round(progress.done / progress.total * 100) : 0;
  return <>
    <SplitPane storageKey="export-split" defaultPercent={57} minLeft={520} minRight={420}>
      <div className="stack gap-lg">
        <Card>
          <h2 className="card-title">导出模式</h2>
          <div className="choice-grid"><ChoiceCard selected={mode === 'combined'} title="整表生成一个 KDBX" desc="软件中填写的数据库名称同时作为文件名" icon="table" onClick={() => setMode('combined')}/><ChoiceCard selected={mode === 'separate'} title="每行生成一个独立 KDBX" desc="读取 A 列名称作为文件名和数据库名" icon="file" onClick={() => setMode('separate')}/></div>
        </Card>
        <Card>
          <h2 className="card-title">导出范围</h2>
          <div className="choice-grid"><ChoiceCard selected={scope === 'all'} title="全部记录" desc="导出当前加载并通过筛选的全部记录" icon="database" onClick={() => setScope('all')}/><ChoiceCard selected={scope === 'selected'} title="仅勾选记录" desc="仅导出数据预览页勾选的记录" icon="check" onClick={() => setScope('selected')}/></div>
        </Card>
        <Card className="form-card">
          <h2 className="card-title">文件设置</h2>
          <Field label="输出目录"><div className="input-action"><input readOnly value={config.outputDir} placeholder="请选择输出目录"/><button className="btn btn-secondary" onClick={chooseOutput}><Icon name="folder"/>选择</button></div></Field>
          {mode === 'combined' ? <Field label="数据库名称 / 文件名称" hint="会自动添加 .kdbx 后缀；同时用作数据库根名称"><input value={config.databaseName} onChange={e => setConfig(c => ({ ...c, databaseName: e.target.value }))} placeholder="例如：Facebook账号合集"/></Field> : <div className="notice"><Icon name="info"/><span>独立模式会读取每一行 A 列“名称”，作为 KDBX 文件名和数据库根名称。</span></div>}
          <Field label="KeePass 分组"><input value={config.groupName} onChange={e => setConfig(c => ({ ...c, groupName: e.target.value }))} placeholder="Google Sheets Import"/></Field>
          <div className="password-grid"><Field label="主密码"><div className="password-input"><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="输入主密码"/><button onClick={() => setShowPassword(v => !v)}><Icon name={showPassword ? 'eyeOff' : 'eye'}/></button></div><Strength value={password}/></Field><Field label="确认主密码"><div className="password-input"><input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="再次输入主密码"/><button onClick={() => setShowPassword(v => !v)}><Icon name={showPassword ? 'eyeOff' : 'eye'}/></button></div><small className={confirm && confirm === password ? 'match-ok' : ''}>{confirm ? (confirm === password ? '两次输入一致' : '两次输入不一致') : '请再次输入'}</small></Field></div>
        </Card>
      </div>
      <div className="stack gap-lg">
        <Card>
          <h2 className="card-title">导出摘要</h2>
          <div className="summary-list"><div><span className="summary-icon green">1</span><b>准备导出</b><strong>{targets.length} 条记录</strong></div><div><span className="summary-icon purple">2</span><b>模式</b><strong>{mode === 'combined' ? '整表生成一个 KDBX' : '每行生成一个独立 KDBX'}</strong></div><div><span className="summary-icon blue">3</span><b>预计生成</b><strong>{mode === 'combined' ? 1 : targets.length} 个文件</strong></div><div><span className="summary-icon orange">4</span><b>输出目录</b><strong title={config.outputDir}>{config.outputDir || '未选择'}</strong></div></div>
        </Card>
        <Card>
          <h2 className="card-title">导出进度</h2><p className="progress-message">{progress.message || '准备就绪'}</p><div className="progress-row"><div className="progress-track"><span style={{ width: `${pct}%` }}/></div><b>{pct}%</b></div>
        </Card>
        <Card>
          <h2 className="card-title">导出结果</h2>{generatedFiles.length ? <div className="result-files"><Icon name="check"/><div><b>生成成功</b>{generatedFiles.slice(0,4).map(f => <span key={f}>{f}</span>)}{generatedFiles.length > 4 && <span>其余 {generatedFiles.length-4} 个文件…</span>}</div></div> : <div className="empty-result"><Icon name="check"/><div><b>尚未开始导出</b><span>点击“开始生成 KDBX”按钮开始导出。</span></div></div>}
        </Card>
        <div className="two-cards"><Card><div className="section-heading"><Icon name="shield"/><div><h2>本地安全</h2><p>所有数据仅在本地处理，不上传任何服务器。</p></div></div></Card><Card><div className="section-heading"><Icon name="lock"/><div><h2>TOTP 处理</h2><p>TOTP 会同时写入兼容 KeePassXC 和 KeePass 的字段。</p></div></div></Card></div>
        <div className="export-actions"><button className="btn btn-secondary btn-lg" disabled={!config.outputDir} onClick={() => api.openPath(config.outputDir)}><Icon name="folder"/>打开输出目录</button><button className="btn btn-primary btn-lg" disabled={generating} onClick={() => doGenerate(false)}>{generating ? <Icon name="spinner" className="spin"/> : <Icon name="play"/>}开始生成 KDBX</button></div>
      </div>
    </SplitPane>
    {confirmOverwrite && <Modal title="检测到同名文件" message="输出目录中已经存在同名 KDBX。是否覆盖这些文件？" confirmText="覆盖并继续" danger onCancel={() => setConfirmOverwrite(false)} onConfirm={() => { setConfirmOverwrite(false); doGenerate(true); }}/>} 
  </>;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('keepass-theme') || 'light');
  const [page, setPage] = useState('connect');
  const [config, setConfig] = usePersistedConfig();
  const [email, setEmail] = useState('');
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [sheetMeta, setSheetMeta] = useState({ spreadsheetId: '', sheetName: '', serviceAccountEmail: '' });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('准备就绪');
  const [progress, setProgress] = useState({ done: 0, total: 0, message: '' });
  const [generatedFiles, setGeneratedFiles] = useState([]);
  const [toast, showToast] = useToast();

  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('keepass-theme', theme); }, [theme]);
  useEffect(() => api?.getVersion?.().then(v => document.title = `KeePass Studio v${v}`).catch(() => {}), []);
  useEffect(() => {
    if (!config.outputDir) api?.getDefaultOutput?.().then(path => path && setConfig(c => ({ ...c, outputDir: path }))).catch(() => {});
    if (config.serviceJson && !email) api?.loadServiceEmail?.(config.serviceJson).then(r => setEmail(r.email)).catch(() => {});
  }, []);
  useEffect(() => api?.onProgress?.(data => setProgress({ done: data.done || 0, total: data.total || 0, message: data.message || '' })), []);

  const readSheet = async () => {
    if (!config.sheetLink.trim()) return showToast('请输入 Google 表格链接', 'error');
    if (!config.sheetName.trim()) return showToast('请输入 Sheet 名称', 'error');
    if (!config.serviceJson.trim()) return showToast('请选择服务账号 JSON', 'error');
    setBusy(true); setStatus('正在读取表格…');
    try {
      const result = await api.fetchSheet({ link: config.sheetLink, sheetName: config.sheetName, serviceAccountJson: config.serviceJson });
      setEntries(result.entries || []);
      setSelected(new Set((result.entries || []).map(e => e.sheetRow)));
      setSheetMeta({ spreadsheetId: result.spreadsheetId, sheetName: result.sheetName, serviceAccountEmail: result.serviceAccountEmail });
      setEmail(result.serviceAccountEmail);
      setStatus(`读取成功：${result.entries.length} 条记录`);
      setPage('preview');
      showToast(`读取成功：${result.entries.length} 条记录`, 'success');
    } catch (error) {
      setStatus('读取失败'); showToast(error.message || String(error), 'error', 5200);
    } finally { setBusy(false); }
  };

  const pageInfo = {
    connect: ['表格连接', '连接 Google 表格并准备读取账号数据'],
    preview: ['数据预览', '检查记录、筛选和选择需要导出的行'],
    export: ['导出 KeePass', '设置导出模式并生成 KeePass 数据库文件']
  }[page];

  return <div className="app-shell">
    <Sidebar page={page} onPage={setPage} theme={THEMES.find(t => t.key === theme)?.name || theme}/>
    <main className="main-area">
      <Topbar title={pageInfo[0]} subtitle={pageInfo[1]} theme={theme} setTheme={setTheme} busy={busy} status={status}/>
      <div className="main-scroll" id="global-scroll">
        {page === 'connect' && <ConnectionPage config={config} setConfig={setConfig} email={email} setEmail={setEmail} onRead={readSheet} busy={busy} showToast={showToast}/>} 
        {page === 'preview' && <PreviewPage entries={entries} selected={selected} setSelected={setSelected} onRefresh={readSheet} onExport={() => setPage('export')} showToast={showToast}/>} 
        {page === 'export' && <ExportPage entries={entries} selected={selected} config={config} setConfig={setConfig} sheetMeta={sheetMeta} progress={progress} setProgress={setProgress} generatedFiles={generatedFiles} setGeneratedFiles={setGeneratedFiles} showToast={showToast}/>} 
      </div>
    </main>
    <ToastHost toast={toast}/>
  </div>;
}
