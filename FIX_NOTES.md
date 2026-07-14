# 8.4 修复说明

## Unicode 错误根因

JavaScript 字符串中偶尔可能出现孤立的 UTF-16 低代理字符，例如 `\\udca8`。JSON 可以把它表示成转义形式，但 Python 在构造 Google Sheets API URL 或输出 UTF-8 JSON 时会拒绝编码，因此出现：

```text
UnicodeEncodeError: 'utf-8' codec can't encode character '\udca8'
```

8.4 在三层修复：

1. Electron 主进程发送前递归清理请求。
2. Python 后端接收后递归清理请求和返回值。
3. 核心字符串转换函数统一保证输出是有效 Unicode。

合法 Emoji 和正常多语言文字会保留，只有无效的孤立代理字符被替换为 `�`。
