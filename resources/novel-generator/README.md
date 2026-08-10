# AI 小说创作（内置资源）

本目录是开源项目 [AI-automatically-generates-novels](https://github.com/wfcz10086/AI-automatically-generates-novels)（v5.2，MIT License）前端的静态化副本，随 Mira 安装包分发，由 `LocalMicroAppServer` 提供。

## 静态化转换（相对上游 v5.2）

- `templates/index.html` → `index.html`：去除全部 Jinja2 `{{ url_for(...) }}`，改为 `static/...` 相对路径；CDN 依赖本地化为 `vendor/`。
- 全部 `fetch('/gen'|'/gen2')`、`makeRequest('/gen')` 改为相对路径（页面挂载于 `/apps/<id>/` 下，同源代理即可命中）。
- 未 vendor `templates/api-info.html`（页面无引用）。
- 本地化第三方库：jQuery 3.6.0、jsMind 0.4.6（css/js/draggable），避免境内 CDN 不稳定。

## 后续升级

重新执行上述静态化转换并核对：`grep -rn "{{" index.html`、`grep -rn "fetch('/gen" static index.html` 应无输出；`index.html` 引用的每个资源文件必须存在。

## 协议

- 上游项目：MIT License（见本目录 LICENSE）。
- jQuery：MIT（jquery.org/license）。
- jsMind：BSD License。
